// ==========================================================
// Découpage des audios longs en morceaux.
//
// Whisper ne sait traiter que 30 secondes à la fois. On découpe donc
// l'audio en morceaux d'environ 28 s, en coupant de préférence dans
// un silence (pour ne pas couper un mot en deux), avec un léger
// chevauchement d'1 seconde entre deux morceaux.
//
// Un seul morceau est envoyé au modèle à la fois : la mémoire du
// téléphone n'a jamais à contenir tout le travail d'un coup.
// ==========================================================

import { extraireMono } from "./decoder-audio.js";

const DUREE_MAX = 28;          // longueur maximale d'un morceau (s)
const DEBUT_RECHERCHE = 20;    // on cherche un silence entre 20 s…
const CHEVAUCHEMENT = 1;       // … et 28 s ; chevauchement d'1 s
const TRAME = 0.1;             // on mesure le volume par tranches de 0,1 s

/**
 * Calcule les morceaux à transcrire.
 * Chaque morceau : { debut, fin, debutLecture }
 *   - debut / fin : la partie « officielle » du morceau
 *   - debutLecture : un peu avant « debut » (le chevauchement)
 * @param {AudioBuffer} audio
 * @returns {Array<{debut:number, fin:number, debutLecture:number}>}
 */
export function decouperEnMorceaux(audio) {
  const dureeTotale = audio.duration;
  const morceaux = [];
  let debut = 0;

  while (debut < dureeTotale) {
    const debutLecture = Math.max(0, debut - CHEVAUCHEMENT);
    let fin;
    if (dureeTotale - debutLecture <= DUREE_MAX + 0.5) {
      fin = dureeTotale; // dernier morceau
    } else {
      fin = trouverSilence(audio, debut + (DEBUT_RECHERCHE - CHEVAUCHEMENT), debutLecture + DUREE_MAX);
    }
    morceaux.push({ debut, fin, debutLecture });
    debut = fin;
  }
  return morceaux;
}

// Renvoie le moment le plus calme entre « de » et « a » (en secondes)
function trouverSilence(audio, de, a) {
  const passage = extraireMono(audio, de, a);
  const taille = Math.round(TRAME * audio.sampleRate);
  let meilleur = a;
  let volumeMin = Infinity;
  for (let i = 0; i + taille <= passage.length; i += taille) {
    const volume = volumeMoyen(passage.subarray(i, i + taille));
    if (volume < volumeMin) {
      volumeMin = volume;
      meilleur = de + (i + taille / 2) / audio.sampleRate;
    }
  }
  return meilleur;
}

// Volume moyen d'une série d'échantillons (« RMS »)
export function volumeMoyen(echantillons) {
  let somme = 0;
  for (let i = 0; i < echantillons.length; i++) somme += echantillons[i] * echantillons[i];
  return Math.sqrt(somme / Math.max(1, echantillons.length));
}

// Un morceau presque muet ? On l'ignore : Whisper a tendance à
// « inventer » des phrases quand on lui donne du silence.
export function estSilencieux(echantillons) {
  let pic = 0;
  for (let i = 0; i < echantillons.length; i++) {
    const v = Math.abs(echantillons[i]);
    if (v > pic) pic = v;
  }
  return pic < 0.02 && volumeMoyen(echantillons) < 0.002;
}
