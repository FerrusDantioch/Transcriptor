// ==========================================================
// Reconnaissance des intervenants sur un audio complet (côté page).
// L'audio est envoyé au Web Worker fenêtre par fenêtre (10 s), pour
// économiser la mémoire du téléphone, puis les voix sont regroupées.
// ==========================================================

import { extraireMono } from "../audio/decoder-audio.js";
import { estSilencieux } from "../audio/decoupage.js";

const DUREE_FENETRE = 10; // secondes (taille d'entrée du modèle pyannote)

/**
 * @param {AudioBuffer} audio audio décodé à 16 kHz
 * @param {object} options
 * @param {import("../transcription/client-moteur.js").MoteurTranscription} options.moteur
 * @param {number|null} options.nombreVoix 2 à 6, ou null = automatique
 * @param {(numero:number, total:number) => void} options.surAvancement
 * @param {() => boolean} options.doitArreter
 * @returns {Promise<Array<{debut:number, fin:number, intervenant:number}>|null>}
 *          chronologie des voix, ou null si l'utilisateur a arrêté
 */
export async function diariserAudio(audio, { moteur, nombreVoix, surAvancement, doitArreter }) {
  await moteur.demander("preparerVoix");

  const total = Math.ceil(audio.duration / DUREE_FENETRE);
  const elements = [];
  surAvancement(0, total);

  for (let f = 0; f < total; f++) {
    if (doitArreter()) return null;
    const debut = f * DUREE_FENETRE;
    const echantillons = extraireMono(audio, debut, Math.min(audio.duration, debut + DUREE_FENETRE));
    // Fenêtre trop courte (moins d'une demi-seconde) ou silencieuse : rien à analyser
    if (echantillons.length >= 8000 && !estSilencieux(echantillons)) {
      const reponse = await moteur.demander(
        "analyserVoix",
        { audio: echantillons, decalage: debut },
        [echantillons.buffer]
      );
      elements.push(...reponse.elements);
    }
    surAvancement(f + 1, total);
  }

  // Regroupement des voix (dans le worker, pour ne pas figer l'écran)
  const { etiquettes } = await moteur.demander("regrouperVoix", {
    elements: elements.map((e) => ({ empreinte: e.empreinte, duree: e.duree })),
    nombreVoix,
  });

  const tours = [];
  elements.forEach((e, i) => {
    for (const s of e.segments) tours.push({ ...s, intervenant: etiquettes[i] });
  });
  return tours.sort((a, b) => a.debut - b.debut);
}
