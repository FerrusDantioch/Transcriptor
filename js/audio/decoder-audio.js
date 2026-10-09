// ==========================================================
// Lecture d'un fichier audio (MP3, WAV, M4A, OGG…) ou d'un
// enregistrement du micro.
//
// Le navigateur « décode » le fichier compressé en une suite de
// nombres (les échantillons), directement à 16 000 par seconde,
// la cadence qu'attend Whisper.
// ==========================================================

import { FREQUENCE_AUDIO } from "../config.js";

/**
 * @param {Blob} fichier fichier audio ou enregistrement
 * @returns {Promise<AudioBuffer>} audio décodé à 16 kHz
 */
export async function decoderAudio(fichier) {
  const donnees = await fichier.arrayBuffer();
  // Un « OfflineAudioContext » décode sans rien jouer sur le haut-parleur.
  // Il convertit automatiquement l'audio à sa propre cadence (16 kHz).
  const contexte = new OfflineAudioContext(1, 1, FREQUENCE_AUDIO);
  try {
    return await contexte.decodeAudioData(donnees);
  } catch (erreur) {
    // Le navigateur ne sait pas lire ce fichier : on renvoie une erreur claire
    if (erreur?.name === "RangeError") throw erreur; // manque de mémoire
    const illisible = new Error("Fichier audio illisible");
    illisible.name = "EncodingError";
    throw illisible;
  }
}

/**
 * Extrait un passage de l'audio, en mono (une seule voie),
 * sans copier tout le fichier : on ne lit que le passage demandé.
 * @param {AudioBuffer} audio
 * @param {number} debut en secondes
 * @param {number} fin en secondes
 * @returns {Float32Array}
 */
export function extraireMono(audio, debut, fin) {
  const premier = Math.max(0, Math.floor(debut * audio.sampleRate));
  const dernier = Math.min(audio.length, Math.ceil(fin * audio.sampleRate));
  const resultat = new Float32Array(Math.max(0, dernier - premier));
  const nbVoies = audio.numberOfChannels;

  for (let voie = 0; voie < nbVoies; voie++) {
    // subarray ne copie pas : c'est une « fenêtre » sur les données
    const echantillons = audio.getChannelData(voie).subarray(premier, dernier);
    for (let i = 0; i < echantillons.length; i++) {
      resultat[i] += echantillons[i] / nbVoies; // moyenne des voies (stéréo → mono)
    }
  }
  return resultat;
}
