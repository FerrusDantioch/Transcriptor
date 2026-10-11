// ==========================================================
// Captures de sessions en direct (Mode JDR), rangées dans IndexedDB.
//
// Une capture = une fiche + le son, découpé en blocs de 5 secondes.
// Fiche :
// {
//   id: 2,
//   titre: "Partie du 11 oct. 2026 à 20:30",
//   creeLe, majLe,               (dates, en millisecondes)
//   etat: "en-cours" | "terminee" | "interrompue",
//   echantillons: 1440000,       (nombre d'échantillons par piste : 16 000 par seconde)
//   blocs: 18,                   (nombre de blocs enregistrés par piste)
//   nomJoueur: "Moi", nombreAutres: "auto" | "1"…"6",
//   consentementLe,              (date à laquelle le rappel de consentement a été validé)
// }
// Bloc : { capture: 2, piste: "micro" | "autres", index: 0, donnees: Int16Array }
//
// Les blocs d'un même instant (micro + autres) sont écrits en une seule
// fois avec la fiche : après un plantage, tout reste cohérent.
// ==========================================================

import {
  ouvrirBase,
  attendre,
  finDeTransaction,
  TIROIR_CAPTURES,
  TIROIR_BLOCS_CAPTURE,
} from "./base-de-donnees.js";

// Pendant une capture, la page tient un « verrou » à son nom (API Web Locks).
// Le navigateur le libère tout seul si la page se ferme ou plante : une
// capture « en cours » sans verrou a donc été interrompue.
export function nomVerrou(id) {
  return `transcriptor-capture-${id}`;
}

// Navigateur sans verrous : au-delà de ce délai sans nouvelle sauvegarde,
// une capture « en cours » est considérée comme interrompue
const DELAI_ABANDON = 20000; // millisecondes

async function verrousTenus() {
  try {
    const { held } = await navigator.locks.query();
    return new Set(held.map((v) => v.name));
  } catch {
    return null; // API indisponible
  }
}

// Crée la fiche d'une nouvelle capture et renvoie son numéro
export async function creerCapture(fiche) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_CAPTURES, "readwrite");
  const id = await attendre(transaction.objectStore(TIROIR_CAPTURES).add(fiche));
  await finDeTransaction(transaction);
  return id;
}

/**
 * Ajoute un bloc de son pour chaque piste et met la fiche à jour,
 * le tout en une seule opération (tout ou rien).
 * @param {object} fiche fiche à jour (echantillons, blocs, majLe…)
 * @param {{micro: Int16Array, autres: Int16Array}} pistes
 * @param {number} index numéro du bloc
 */
export async function ajouterBloc(fiche, pistes, index) {
  const base = await ouvrirBase();
  const transaction = base.transaction([TIROIR_CAPTURES, TIROIR_BLOCS_CAPTURE], "readwrite");
  const blocs = transaction.objectStore(TIROIR_BLOCS_CAPTURE);
  for (const [piste, donnees] of Object.entries(pistes)) {
    blocs.put({ capture: fiche.id, piste, index, donnees });
  }
  transaction.objectStore(TIROIR_CAPTURES).put(fiche);
  await finDeTransaction(transaction);
}

// Met à jour une fiche (état, titre, avancement de la transcription…)
export async function mettreAJourCapture(fiche) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_CAPTURES, "readwrite");
  transaction.objectStore(TIROIR_CAPTURES).put(fiche);
  await finDeTransaction(transaction);
}

export async function lireCapture(id) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_CAPTURES, "readonly");
  return attendre(transaction.objectStore(TIROIR_CAPTURES).get(id));
}

/**
 * Liste les captures, de la plus récente à la plus ancienne.
 * Les captures restées « en cours » sans nouvelle depuis un moment
 * (plantage, onglet fermé) passent à l'état « interrompue ».
 */
export async function listerCaptures() {
  const tenus = await verrousTenus();
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_CAPTURES, "readwrite");
  const tiroir = transaction.objectStore(TIROIR_CAPTURES);
  const toutes = await attendre(tiroir.getAll());
  for (const fiche of toutes) {
    const vivante = tenus ? tenus.has(nomVerrou(fiche.id)) : Date.now() - fiche.majLe < DELAI_ABANDON;
    if (fiche.etat === "en-cours" && !vivante) {
      fiche.etat = "interrompue";
      tiroir.put(fiche);
    }
  }
  await finDeTransaction(transaction);
  return toutes.sort((a, b) => b.creeLe - a.creeLe);
}

/**
 * Lit tous les blocs d'une piste, dans l'ordre.
 * @returns {Promise<Int16Array[]>}
 */
export async function lirePiste(id, piste) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_BLOCS_CAPTURE, "readonly");
  const plage = IDBKeyRange.bound([id, piste, 0], [id, piste, Infinity]);
  const blocs = await attendre(transaction.objectStore(TIROIR_BLOCS_CAPTURE).getAll(plage));
  return blocs.map((b) => b.donnees);
}

// Supprime une capture et tout son son
export async function supprimerCapture(id) {
  const base = await ouvrirBase();
  const transaction = base.transaction([TIROIR_CAPTURES, TIROIR_BLOCS_CAPTURE], "readwrite");
  transaction.objectStore(TIROIR_CAPTURES).delete(id);
  transaction.objectStore(TIROIR_BLOCS_CAPTURE).delete(IDBKeyRange.bound([id], [id, []]));
  await finDeTransaction(transaction);
}
