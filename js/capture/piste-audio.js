// ==========================================================
// Une piste de capture, prête à être transcrite.
//
// Elle imite un « AudioBuffer » (ce que donne le décodage d'un fichier) :
// duration, sampleRate, length… Mais le son reste découpé en blocs de
// 5 s de nombres entiers (2 octets par échantillon au lieu de 4) et n'est
// converti qu'au moment de lire un passage : une séance de 3 h tient ainsi
// dans environ 350 Mo de mémoire au lieu de 700 Mo, sans aucun décodage.
// ==========================================================

import { FREQUENCE_AUDIO } from "../config.js";
import { lirePiste } from "../stockage/captures.js";

export class PisteAudio {
  /** @param {Int16Array[]} blocs */
  constructor(blocs) {
    this.blocs = blocs;
    this.sampleRate = FREQUENCE_AUDIO;
    this.numberOfChannels = 1;
    // Position de départ de chaque bloc (en échantillons)
    this.debuts = [];
    let total = 0;
    for (const bloc of blocs) {
      this.debuts.push(total);
      total += bloc.length;
    }
    this.length = total;
  }

  get duration() {
    return this.length / this.sampleRate;
  }

  /**
   * Renvoie les échantillons de « premier » (inclus) à « dernier » (exclu),
   * en nombres à virgule entre -1 et 1 (le format qu'attend Whisper).
   * @returns {Float32Array}
   */
  extraire(premier, dernier) {
    const resultat = new Float32Array(Math.max(0, dernier - premier));
    for (let b = this.blocDe(premier); b < this.blocs.length && this.debuts[b] < dernier; b++) {
      const bloc = this.blocs[b];
      const debutBloc = this.debuts[b];
      const de = Math.max(premier, debutBloc);
      const a = Math.min(dernier, debutBloc + bloc.length);
      for (let i = de; i < a; i++) resultat[i - premier] = bloc[i - debutBloc] / 32768;
    }
    return resultat;
  }

  // Numéro du bloc qui contient l'échantillon « position » (recherche par dichotomie)
  blocDe(position) {
    let bas = 0;
    let haut = this.blocs.length - 1;
    while (bas < haut) {
      const milieu = Math.ceil((bas + haut) / 2);
      if (this.debuts[milieu] <= position) bas = milieu;
      else haut = milieu - 1;
    }
    return bas;
  }
}

/**
 * Charge une piste d'une capture depuis IndexedDB.
 * @param {number} id numéro de la capture
 * @param {"micro"|"autres"} piste
 */
export async function chargerPiste(id, piste) {
  return new PisteAudio(await lirePiste(id, piste));
}
