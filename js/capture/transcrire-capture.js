// ==========================================================
// Transcription d'une capture en direct (Mode JDR), APRÈS la session :
//   1. ma piste (mon micro) → tout ce texte est à mon nom ;
//   2. la piste des autres joueurs → texte ;
//   3. reconnaissance des intervenants sur la piste des autres seulement
//      (« Intervenant 1 », « Intervenant 2 »…) ;
//   4. fusion des deux textes dans l'ordre chronologique.
//
// L'avancement est sauvegardé après chaque morceau dans la fiche de la
// capture : si la page est fermée, la transcription reprendra là où
// elle s'était arrêtée.
// ==========================================================

import { chargerPiste } from "./piste-audio.js";
import { mettreAJourCapture } from "../stockage/captures.js";
import { transcrireAudio } from "../transcription/transcrire-audio.js";
import { regrouperEnPhrases } from "../transcription/assemblage.js";
import { diariserAudio } from "../voix/diariser-audio.js";
import { attribuerIntervenants } from "../voix/attribution.js";
import { codeErreur } from "../transcription/erreurs.js";
import { texteEchecVoix } from "../interface/messages.js";

/**
 * @param {object} fiche fiche de la capture (voir js/stockage/captures.js)
 * @param {object} options
 * @param {import("../transcription/client-moteur.js").MoteurTranscription} options.moteur
 * @param {string} options.langue
 * @param {string} options.qualite
 * @param {() => boolean} options.doitArreter
 * @param {(phrases:Array, intervenants:Array) => void} options.surTexte  texte provisoire
 * @param {(piste:"micro"|"autres", numero:number, total:number, resteEstime:number|null) => void} options.surAvancement
 * @param {(numero:number, total:number) => void} options.surDiarisation
 * @returns {Promise<{phrases:Array, intervenants:Array, interrompue:boolean, infoVoix:string|null}>}
 */
export async function transcrireCapture(fiche, { moteur, langue, qualite, doitArreter, surTexte, surAvancement, surDiarisation }) {
  // Reprise possible seulement avec la même langue et la même qualité
  const memeReglages = fiche.avancement?.langue === langue && fiche.avancement?.qualite === qualite;
  const av = memeReglages
    ? fiche.avancement
    : { langue, qualite, micro: { morceau: 0, segments: [], fini: false }, autres: { morceau: 0, segments: [], fini: false } };
  fiche.avancement = av;

  const nomAutres = fiche.nombreAutres === "1" ? "Intervenant 1" : "Autres joueurs";
  const intervenantsProvisoires = [{ nom: fiche.nomJoueur }, { nom: nomAutres }];
  const afficherProvisoire = () => surTexte(fusionner(av.micro.segments, av.autres.segments.map((s) => ({ ...s, intervenant: 0 }))), intervenantsProvisoires);

  // 1 et 2) Les deux pistes, l'une après l'autre (une seule en mémoire à la fois)
  for (const piste of ["micro", "autres"]) {
    if (av[piste].fini) continue;
    const audio = await chargerPiste(fiche.id, piste);
    const { interrompue } = await transcrireAudio(audio, {
      moteur,
      langue,
      doitArreter,
      reprise: av[piste],
      surAvancement: (segments, numero, total, resteEstime) => {
        av[piste].segments = segments;
        afficherProvisoire();
        surAvancement(piste, numero, total, resteEstime);
      },
      surMorceauFini: async (segments, morceauSuivant) => {
        av[piste] = { morceau: morceauSuivant, segments: [...segments], fini: false };
        await mettreAJourCapture(fiche);
      },
    });
    if (interrompue) return { phrases: [], intervenants: [], interrompue: true, infoVoix: null };
    av[piste].fini = true;
    await mettreAJourCapture(fiche);
  }

  // 3) Qui parle parmi les autres joueurs ?
  let autres = av.autres.segments.map((s) => ({ ...s, intervenant: 0 }));
  let nomsAutres = [nomAutres];
  let infoVoix = null;
  if (fiche.nombreAutres !== "1" && autres.length > 0) {
    try {
      const pisteAutres = await chargerPiste(fiche.id, "autres");
      const tours = await diariserAudio(pisteAutres, {
        moteur,
        nombreVoix: fiche.nombreAutres === "auto" ? null : Number(fiche.nombreAutres),
        doitArreter,
        surAvancement: surDiarisation,
      });
      if (tours === null) {
        infoVoix = "Reconnaissance des intervenants arrêtée : les autres joueurs sont regroupés sous « Autres joueurs ».";
      } else {
        const { segments, nombre } = attribuerIntervenants(av.autres.segments, tours);
        if (nombre > 0) {
          autres = segments;
          nomsAutres = Array.from({ length: nombre }, (_, i) => `Intervenant ${i + 1}`);
        }
      }
    } catch (erreur) {
      console.warn("Reconnaissance des intervenants impossible :", erreur);
      infoVoix = texteEchecVoix(erreur.code ?? codeErreur(erreur)).replace(
        "sans distinction de voix",
        "les autres joueurs sont regroupés sous « Autres joueurs »"
      );
    }
  }

  // 4) Fusion : moi = intervenant 0, les autres à partir de 1
  return {
    phrases: fusionner(av.micro.segments, autres),
    intervenants: [{ nom: fiche.nomJoueur }, ...nomsAutres.map((nom) => ({ nom }))],
    interrompue: false,
    infoVoix,
  };
}

// Regroupe chaque piste en phrases, puis mélange le tout dans l'ordre du temps.
// Mes phrases portent l'intervenant 0 ; celles des autres, leur numéro + 1.
function fusionner(segmentsMoi, segmentsAutres) {
  const moi = regrouperEnPhrases(segmentsMoi.map((s) => ({ ...s, intervenant: 0 })));
  const autres = regrouperEnPhrases(segmentsAutres.map((s) => ({ ...s, intervenant: (s.intervenant ?? 0) + 1 })));
  return [...moi, ...autres].sort((a, b) => a.debut - b.debut);
}
