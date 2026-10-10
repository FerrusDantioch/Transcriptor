// ==========================================================
// Regroupement des « empreintes vocales » par ressemblance.
//
// Chaque passage de parole a une empreinte : une liste de 256 nombres.
// Deux passages de la même personne ont des empreintes proches.
// On part d'un groupe par passage, puis on réunit pas à pas les deux
// groupes les plus proches (« regroupement hiérarchique ») :
//   - nombre de voix choisi : on s'arrête quand il reste ce nombre de groupes ;
//   - « Automatique » : on s'arrête quand les groupes restants sont trop
//     différents (seuil repris de pyannote 3.1), avec 6 groupes au maximum.
//
// Ce fichier ne contient que des calculs (pas d'affichage) : il est
// utilisé dans le Web Worker.
// ==========================================================

// Seuil de pyannote 3.1 (distance entre centres de groupes d'empreintes normalisées)
const SEUIL_AUTOMATIQUE = 0.7045654963945799;
export const VOIX_MAX = 6;
// Au-delà de ce nombre de passages, on fait d'abord un pré-regroupement rapide
const TAILLE_MAX_DIRECTE = 300;

/**
 * @param {Array<{empreinte: Float32Array|null, duree: number}>} elements
 *        une entrée par passage de parole ; « duree » = secondes de parole
 *        « propre » (sans chevauchement) ayant servi à calculer l'empreinte
 * @param {number|null} nombreVoix nombre de voix voulu (2 à 6), ou null = automatique
 * @returns {number[]} numéro de groupe (0, 1, 2…) pour chaque élément,
 *          numérotés dans l'ordre d'apparition
 */
export function regrouperEmpreintes(elements, nombreVoix = null) {
  // Seules les empreintes calculées sur au moins 1 s de parole sont fiables :
  // elles forment les groupes. Les autres sont rattachées ensuite au groupe le plus proche.
  const fiables = [];
  elements.forEach((e, i) => {
    if (e.empreinte && e.duree >= 1) fiables.push(i);
  });
  if (fiables.length === 0) return elements.map(() => 0);

  // Long enregistrement (séance de JDR…) : le regroupement fin se fait sur un
  // échantillon de passages répartis sur toute la durée (calcul rapide), puis
  // chaque passage est rangé dans le groupe dont il est le plus proche.
  const echantillon = fiables.length > TAILLE_MAX_DIRECTE ? repartir(fiables, TAILLE_MAX_DIRECTE) : fiables;

  // Chaque groupe garde la somme de ses empreintes (normalisées) et leur nombre
  let groupes = echantillon.map((i) => ({
    somme: normaliser(elements[i].empreinte),
    nombre: 1,
    duree: elements[i].duree,
    actif: true,
  }));

  const objectif = nombreVoix ? Math.min(nombreVoix, VOIX_MAX) : null;
  fusionnerJusqua(groupes, (nbActifs, distanceMin) => {
    if (objectif) return nbActifs > objectif;
    return nbActifs > VOIX_MAX || distanceMin < SEUIL_AUTOMATIQUE;
  });
  groupes = groupes.filter((g) => g.actif);

  // Mode automatique : un groupe minuscule (moins de 3 s et moins de 5 % de
  // la parole) est souvent un bruit ou un rire : on le rattache au plus proche
  if (!objectif && groupes.length > 1) {
    const paroleTotale = groupes.reduce((s, g) => s + g.duree, 0);
    const petit = (g) => g.duree < 3 && g.duree < 0.05 * paroleTotale;
    const grands = groupes.filter((g) => !petit(g));
    if (grands.length > 0) groupes = grands;
  }

  // Chaque élément rejoint le groupe dont le centre est le plus proche.
  // Deux passages : le second utilise des centres recalculés avec tous les éléments.
  let centres = groupes.map((g) => centre(g));
  let etiquettes = elements.map(() => -1);
  for (let passage = 0; passage < 2; passage++) {
    etiquettes = elements.map((e) => (e.empreinte ? indexPlusProche(normaliser(e.empreinte), centres) : -1));
    const sommes = centres.map((c) => new Float32Array(c.length));
    const nombres = centres.map(() => 0);
    fiables.forEach((i) => {
      const g = etiquettes[i];
      const v = normaliser(elements[i].empreinte);
      for (let k = 0; k < v.length; k++) sommes[g][k] += v[k];
      nombres[g] += 1;
    });
    centres = centres.map((c, g) => (nombres[g] > 0 ? centre({ somme: sommes[g], nombre: nombres[g] }) : c));
  }

  return renumeroterParApparition(etiquettes);
}

// Réunit les deux groupes les plus proches tant que « continuer » le permet.
// Pour aller vite, chaque groupe mémorise son plus proche voisin.
function fusionnerJusqua(groupes, continuer) {
  const n = groupes.length;
  const centres = groupes.map((g) => centre(g));
  const voisin = new Int32Array(n).fill(-1);
  const distanceVoisin = new Float64Array(n).fill(Infinity);

  const recalculerVoisin = (i) => {
    voisin[i] = -1;
    distanceVoisin[i] = Infinity;
    for (let k = 0; k < n; k++) {
      if (k === i || !groupes[k].actif) continue;
      const d = distance(centres[i], centres[k]);
      if (d < distanceVoisin[i]) {
        distanceVoisin[i] = d;
        voisin[i] = k;
      }
    }
  };
  for (let i = 0; i < n; i++) recalculerVoisin(i);

  let nbActifs = n;
  while (nbActifs > 1) {
    // Les deux groupes les plus proches
    let a = -1;
    for (let i = 0; i < n; i++) {
      if (groupes[i].actif && (a === -1 || distanceVoisin[i] < distanceVoisin[a])) a = i;
    }
    const b = voisin[a];
    if (b === -1 || !continuer(nbActifs, distanceVoisin[a])) break;

    // Fusion de b dans a
    groupes[a].somme = ajouter(groupes[a].somme, groupes[b].somme);
    groupes[a].nombre += groupes[b].nombre;
    groupes[a].duree += groupes[b].duree;
    groupes[b].actif = false;
    nbActifs -= 1;
    centres[a] = centre(groupes[a]);

    // Mise à jour des voisins touchés par la fusion.
    // Astuce : si le groupe fusionné « a » est au moins aussi proche que
    // l'ancien voisin, il devient le voisin (les autres distances n'ont pas changé).
    for (let k = 0; k < n; k++) {
      if (!groupes[k].actif || k === a) continue;
      const d = distance(centres[k], centres[a]);
      if (d <= distanceVoisin[k]) {
        distanceVoisin[k] = d;
        voisin[k] = a;
      } else if (voisin[k] === a || voisin[k] === b) {
        recalculerVoisin(k); // l'ancien voisin a changé ou disparu : on cherche à nouveau
      }
    }
    recalculerVoisin(a);
  }
}

// Choisit « combien » éléments régulièrement espacés dans la liste
function repartir(liste, combien) {
  const pas = liste.length / combien;
  return Array.from({ length: combien }, (_, k) => liste[Math.floor(k * pas)]);
}

// Renumérote les groupes dans l'ordre où ils apparaissent (0 = premier à parler)
function renumeroterParApparition(etiquettes) {
  const correspondance = new Map();
  return etiquettes.map((e) => {
    if (e < 0) return e;
    if (!correspondance.has(e)) correspondance.set(e, correspondance.size);
    return correspondance.get(e);
  });
}

// --- Petits calculs sur les vecteurs (listes de nombres) ---

function normaliser(v) {
  let norme = 0;
  for (let i = 0; i < v.length; i++) norme += v[i] * v[i];
  norme = Math.sqrt(norme) || 1;
  const r = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) r[i] = v[i] / norme;
  return r;
}

function ajouter(a, b) {
  const r = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) r[i] = a[i] + b[i];
  return r;
}

function centre(groupe) {
  const r = new Float32Array(groupe.somme.length);
  for (let i = 0; i < r.length; i++) r[i] = groupe.somme[i] / groupe.nombre;
  return r;
}

function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function indexPlusProche(vecteur, centres) {
  let meilleur = 0;
  let dMin = Infinity;
  centres.forEach((c, i) => {
    const d = distance(vecteur, c);
    if (d < dMin) {
      dMin = d;
      meilleur = i;
    }
  });
  return meilleur;
}
