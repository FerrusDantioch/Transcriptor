// ==========================================================
// Historique des transcriptions, rangé dans IndexedDB.
// Une transcription ressemble à :
// {
//   id: 3,                       (numéro attribué automatiquement)
//   titre: "Réunion du lundi",
//   creeLe: 1760000000000,       (date, en millisecondes)
//   duree: 125.4,                (durée de l'audio, en secondes)
//   source: "micro" | "fichier",
//   langue: "fr",
//   qualite: "equilibre",
//   phrases: [{ debut: 0, fin: 4.2, texte: "Bonjour à tous." }, …],
//   interrompue: false
// }
// ==========================================================

import {
  ouvrirBase,
  attendre,
  finDeTransaction,
  TIROIR_TRANSCRIPTIONS,
} from "./base-de-donnees.js";

// Ajoute une transcription et renvoie son numéro
export async function ajouterTranscription(transcription) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readwrite");
  const id = await attendre(transaction.objectStore(TIROIR_TRANSCRIPTIONS).add(transcription));
  await finDeTransaction(transaction);
  return id;
}

// Renvoie toutes les transcriptions, de la plus récente à la plus ancienne
export async function listerTranscriptions() {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readonly");
  const toutes = await attendre(transaction.objectStore(TIROIR_TRANSCRIPTIONS).getAll());
  return toutes.sort((a, b) => b.creeLe - a.creeLe);
}

// Renvoie une transcription d'après son numéro
export async function lireTranscription(id) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readonly");
  return attendre(transaction.objectStore(TIROIR_TRANSCRIPTIONS).get(id));
}

// Change le titre d'une transcription
export async function renommerTranscription(id, nouveauTitre) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readwrite");
  const tiroir = transaction.objectStore(TIROIR_TRANSCRIPTIONS);
  const transcription = await attendre(tiroir.get(id));
  if (transcription) {
    transcription.titre = nouveauTitre;
    tiroir.put(transcription);
  }
  await finDeTransaction(transaction);
}

// Supprime définitivement une transcription
export async function supprimerTranscription(id) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TRANSCRIPTIONS, "readwrite");
  transaction.objectStore(TIROIR_TRANSCRIPTIONS).delete(id);
  await finDeTransaction(transaction);
}
