// ==========================================================
// Assemblage du texte.
// Whisper renvoie, pour chaque morceau, des « segments » de texte
// avec leur heure de début et de fin. Ce fichier :
//   1. replace ces heures dans le temps de l'audio complet ;
//   2. supprime ce qui a été entendu deux fois (le chevauchement) ;
//   3. retire les phrases « inventées » connues de Whisper ;
//   4. regroupe le tout en phrases, chacune avec son horodatage.
// ==========================================================

// Phrases que Whisper invente parfois sur du silence ou de la musique
// (il les a apprises dans des sous-titres de vidéos).
const PHRASES_INVENTEES = [
  /amara\.org/i,
  /sous-titr(age|es|é).{0,40}(amara|radio-canada|st'? ?\d+|soustitreur)/i,
  /^\s*\[?(musique|music|applaudissements|rires)\]?\s*$/i,
];

/**
 * Replace les segments d'un morceau dans le temps de l'audio complet
 * et retire ceux qui ne font que répéter la fin du morceau précédent.
 * @param {Array<{debut:number|null, fin:number|null, texte:string}>} segmentsBruts
 * @param {{debut:number, fin:number, debutLecture:number}} morceau
 * @param {{texte:string}|undefined} segmentPrecedent dernier segment déjà gardé
 */
export function placerSegments(segmentsBruts, morceau, segmentPrecedent) {
  const resultat = [];
  for (const brut of segmentsBruts) {
    let texte = retirerBoucles((brut.texte || "").trim());
    if (!texte || PHRASES_INVENTEES.some((motif) => motif.test(texte))) continue;

    const debut = morceau.debutLecture + (brut.debut ?? 0);
    const fin = Math.min(
      morceau.fin,
      morceau.debutLecture + (brut.fin ?? morceau.fin - morceau.debutLecture)
    );

    // Segment entièrement dans la zone de chevauchement : déjà transcrit avant
    if (morceau.debutLecture < morceau.debut && fin <= morceau.debut + 0.1) continue;

    // Premier segment gardé : on retire les mots répétés à la jonction
    const precedent = resultat.at(-1) ?? segmentPrecedent;
    if (resultat.length === 0 && precedent) {
      texte = retirerRepetition(precedent.texte, texte);
      if (!texte) continue;
    }

    // Whisper « bégaie » parfois : on ignore un segment identique au précédent
    if (precedent && normaliser(precedent.texte) === normaliser(texte)) continue;

    resultat.push({ debut: Math.max(debut, morceau.debutLecture), fin, texte });
  }
  return resultat;
}

/**
 * Regroupe les segments en phrases complètes (qui finissent par . ! ? …)
 * et découpe les segments qui contiennent plusieurs phrases.
 * L'heure de chaque phrase à l'intérieur d'un segment est estimée
 * d'après la longueur du texte.
 * @returns {Array<{debut:number, fin:number, texte:string}>}
 */
export function regrouperEnPhrases(segments) {
  // 1) Découper les segments contenant plusieurs phrases
  const morceauxDePhrases = [];
  for (const segment of segments) {
    const parties = segment.texte.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const longueurTotale = parties.reduce((s, p) => s + p.length, 0) || 1;
    let instant = segment.debut;
    for (const partie of parties) {
      const duree = ((segment.fin - segment.debut) * partie.length) / longueurTotale;
      morceauxDePhrases.push({ debut: instant, fin: instant + duree, texte: partie });
      instant += duree;
    }
  }

  // 2) Recoller les bouts de phrase qui ne se terminent pas par une ponctuation
  //    (sans dépasser 20 s, au cas où le modèle oublie la ponctuation)
  const phrases = [];
  for (const bout of morceauxDePhrases) {
    const derniere = phrases.at(-1);
    const derniereIncomplete = derniere && !/[.!?…]["»”)]?$/.test(derniere.texte);
    if (derniereIncomplete && bout.fin - derniere.debut <= 20) {
      derniere.texte += " " + bout.texte;
      derniere.fin = bout.fin;
    } else {
      phrases.push({ ...bout });
    }
  }
  return phrases;
}

// Retire du début de « texte » les mots qui terminent déjà « precedent »
// (au moins 2 mots identiques, ou 1 mot long), jusqu'à 8 mots.
function retirerRepetition(precedent, texte) {
  const motsPrecedents = precedent.split(/\s+/);
  const mots = texte.split(/\s+/);
  for (let n = Math.min(8, mots.length, motsPrecedents.length); n >= 1; n--) {
    const fin = motsPrecedents.slice(-n).map(normaliser).join(" ");
    const debut = mots.slice(0, n).map(normaliser).join(" ");
    const assezSur = n >= 2 || debut.length >= 5;
    if (fin && fin === debut && assezSur) return mots.slice(n).join(" ");
  }
  return texte;
}

// Remplace un mot ou un petit groupe de mots répété plus de 3 fois
// d'affilée par une seule occurrence (« bon, bon, bon, bon » → « bon »)
export function retirerBoucles(texte) {
  const mot = "[\\p{L}\\p{N}'’-]+";
  const motif = new RegExp(`(${mot}(?:\\s+${mot}){0,3}?)(?:[\\s,.;:…!?-]+\\1){3,}`, "giu");
  return texte.replace(motif, "$1");
}

// Met un texte en minuscules sans ponctuation, pour comparer
function normaliser(texte) {
  return texte
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
