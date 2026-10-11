// ==========================================================
// Export d'une piste de capture en fichier .wav (son non compressé),
// lisible par n'importe quel lecteur : pratique pour vérifier que la
// capture a bien fonctionné, ou pour garder l'enregistrement.
// ==========================================================

import { FREQUENCE_AUDIO } from "../config.js";
import { lirePiste } from "../stockage/captures.js";

/**
 * @param {number} id numéro de la capture
 * @param {"micro"|"autres"} piste
 * @returns {Promise<Blob>} fichier .wav
 */
export async function pisteEnWav(id, piste) {
  const blocs = await lirePiste(id, piste);
  const octets = blocs.reduce((total, b) => total + b.byteLength, 0);
  return new Blob([enteteWav(octets), ...blocs], { type: "audio/wav" });
}

// En-tête d'un fichier WAV : mono, 16 bits, 16 000 échantillons par seconde
function enteteWav(octetsSon) {
  const entete = new DataView(new ArrayBuffer(44));
  const texte = (position, mot) => [...mot].forEach((c, i) => entete.setUint8(position + i, c.charCodeAt(0)));
  texte(0, "RIFF");
  entete.setUint32(4, 36 + octetsSon, true);
  texte(8, "WAVE");
  texte(12, "fmt ");
  entete.setUint32(16, 16, true);                  // taille de la partie « fmt »
  entete.setUint16(20, 1, true);                   // format : PCM (non compressé)
  entete.setUint16(22, 1, true);                   // 1 voie (mono)
  entete.setUint32(24, FREQUENCE_AUDIO, true);     // échantillons par seconde
  entete.setUint32(28, FREQUENCE_AUDIO * 2, true); // octets par seconde
  entete.setUint16(32, 2, true);                   // octets par échantillon
  entete.setUint16(34, 16, true);                  // bits par échantillon
  texte(36, "data");
  entete.setUint32(40, octetsSon, true);
  return entete.buffer;
}
