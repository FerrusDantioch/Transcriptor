// ==========================================================
// Transcription d'un audio complet, morceau par morceau.
// ==========================================================

import { extraireMono } from "../audio/decoder-audio.js";
import { decouperEnMorceaux, estSilencieux } from "../audio/decoupage.js";
import { placerSegments } from "./assemblage.js";

// Courte pause entre deux morceaux : laisse le téléphone « respirer »
// (affichage, autres applications). Négligeable face aux ~28 s d'un morceau.
const PAUSE_ENTRE_MORCEAUX = 300; // millisecondes

/**
 * @param {AudioBuffer} audio audio décodé à 16 kHz
 * @param {object} options
 * @param {import("./client-moteur.js").MoteurTranscription} options.moteur
 * @param {string} options.langue
 * @param {(segments:Array, numero:number, total:number, resteEstime:number|null) => void} options.surAvancement
 *        appelée après chaque morceau (resteEstime en secondes)
 * @param {() => boolean} options.doitArreter renvoie vrai si l'utilisateur a demandé l'arrêt
 * @param {{morceau:number, segments:Array}} [options.reprise] reprendre un travail commencé
 *        (à partir du morceau « morceau », avec les segments déjà obtenus)
 * @param {(segments:Array, morceauSuivant:number) => Promise<void>} [options.surMorceauFini]
 *        appelée après chaque morceau (pour sauvegarder l'avancement)
 * @returns {Promise<{segments:Array, interrompue:boolean}>}
 */
export async function transcrireAudio(audio, { moteur, langue, surAvancement, doitArreter, reprise, surMorceauFini }) {
  const morceaux = decouperEnMorceaux(audio);
  const segments = [...(reprise?.segments ?? [])];
  const depart = Math.min(reprise?.morceau ?? 0, morceaux.length);
  let tempsCalcul = 0;   // temps passé à calculer (ms)
  let audioTraite = 0;   // durée d'audio déjà calculée (s)

  surAvancement(segments, depart, morceaux.length, null);

  for (let i = depart; i < morceaux.length; i++) {
    if (doitArreter()) return { segments, interrompue: true };

    const morceau = morceaux[i];
    const echantillons = extraireMono(audio, morceau.debutLecture, morceau.fin);

    if (!estSilencieux(echantillons)) {
      const depart = performance.now();
      const { segments: bruts } = await moteur.transcrire(echantillons, langue);
      tempsCalcul += performance.now() - depart;
      audioTraite += morceau.fin - morceau.debutLecture;
      segments.push(...placerSegments(bruts, morceau, segments.at(-1)));
    }

    // Estimation du temps restant d'après la vitesse observée
    const audioRestant = audio.duration - morceau.fin;
    const resteEstime = audioTraite > 0 ? (tempsCalcul / 1000 / audioTraite) * audioRestant : null;
    surAvancement(segments, i + 1, morceaux.length, resteEstime);
    await surMorceauFini?.(segments, i + 1);
    if (i < morceaux.length - 1) await new Promise((r) => setTimeout(r, PAUSE_ENTRE_MORCEAUX));
  }

  return { segments, interrompue: false };
}
