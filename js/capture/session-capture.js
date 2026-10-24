// ==========================================================
// Une session de capture en direct (Mode JDR, sur ordinateur).
//
// Deux sources de son :
//   - « micro »  : mon micro (getUserMedia) ;
//   - « autres » : le son de l'ordinateur ou d'un onglet, partagé avec
//     getDisplayMedia (= les autres joueurs sur Discord).
// Les deux passent par le même « AudioContext » réglé à 16 kHz : ils
// suivent la même horloge et restent donc parfaitement synchronisés.
// Le son brut est sauvegardé toutes les 5 secondes dans IndexedDB :
// en cas de plantage, on perd au plus les 5 dernières secondes.
// ==========================================================

import { FREQUENCE_AUDIO } from "../config.js";
import { codeErreur } from "../transcription/erreurs.js";
import {
  creerCapture,
  ajouterBloc,
  mettreAJourCapture,
  supprimerCapture,
  nomVerrou,
} from "../stockage/captures.js";

const TAILLE_BLOC = 5 * FREQUENCE_AUDIO; // 5 secondes d'échantillons par bloc
const SEUIL_SON = 0.01;                  // en dessous : considéré comme du silence (≈ -40 dB)
export const OCTETS_PAR_SECONDE = 2 * 2 * FREQUENCE_AUDIO; // 2 pistes × 2 octets × 16 000

/**
 * Demande le partage du son de l'ordinateur (doit être appelé juste
 * après un clic : le navigateur l'exige).
 * @param {"application"|"onglet"} source où tourne Discord
 * @returns {Promise<MediaStream>}
 */
export async function demanderPartage(source) {
  let flux;
  try {
    flux = await navigator.mediaDevices.getDisplayMedia({
      // Chrome impose de partager aussi l'image : elle est ignorée (jamais enregistrée)
      video: {
        displaySurface: source === "onglet" ? "browser" : "monitor", // onglet proposé en premier
        frameRate: 1,
      },
      audio: {
        // Le son des autres joueurs est gardé tel quel
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false, // vous continuez à entendre Discord
      },
      systemAudio: "include",         // propose « Partager l'audio du système » (Windows)
      selfBrowserSurface: "exclude",  // empêche de partager l'onglet d'Omni-Transcripteur lui-même
      surfaceSwitching: "exclude",
    });
  } catch (erreur) {
    console.warn("Partage refusé :", erreur);
    throw avecCode(erreur, erreur?.name === "NotAllowedError" ? "partage-annule" : "partage-impossible");
  }
  if (flux.getAudioTracks().length === 0) {
    arreterFlux(flux);
    throw avecCode(new Error("Partage sans son"), "partage-sans-son");
  }
  return flux;
}

// Demande l'accès au micro
export async function demanderMicro() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (erreur) {
    throw avecCode(erreur, codeErreur(erreur));
  }
}

export function arreterFlux(flux) {
  flux?.getTracks().forEach((piste) => piste.stop());
}

function avecCode(erreur, code) {
  return Object.assign(erreur instanceof Error ? erreur : new Error(String(erreur)), { code });
}

export class SessionCapture {
  /**
   * @param {object} rappels
   * @param {(etat: {duree:number, niveaux:number[], silences:number[], octets:number}) => void} rappels.surMiseAJour
   *        environ 4 fois par seconde : durée (s), niveaux (0 à 1), secondes sans son par piste
   * @param {(piste: "micro"|"autres") => void} rappels.surCoupure  une source s'est arrêtée
   * @param {(code: string) => void} rappels.surErreur  la sauvegarde a échoué (capture arrêtée)
   */
  constructor({ surMiseAJour, surCoupure, surErreur }) {
    this.rappels = { surMiseAJour, surCoupure, surErreur };
    this.fiche = null;
    this.contexte = null;
    this.noeud = null;
    this.entrees = {};   // nœuds d'entrée (mono) de chaque piste
    this.sources = {};   // { micro: {flux, noeud}, autres: {flux, noeud} }
    this.echantillons = 0;        // échantillons reçus (par piste)
    this.echantillonsSauves = 0;  // échantillons confiés à la sauvegarde
    this.dernierSon = [0, 0];
    this.nouveauBloc();
    this.ecritures = Promise.resolve(); // les sauvegardes se font l'une après l'autre
    this.enErreur = false;
  }

  get duree() {
    return this.echantillons / FREQUENCE_AUDIO;
  }

  /**
   * Démarre la capture.
   * @param {{micro: MediaStream, partage: MediaStream, fiche: object}} options
   *        fiche : informations de départ (titre, nom du joueur…)
   * @returns {Promise<number>} numéro de la capture
   */
  async demarrer({ micro, partage, fiche }) {
    // 1) La fiche d'abord : les sauvegardes en ont besoin
    const maintenant = Date.now();
    this.fiche = { ...fiche, creeLe: maintenant, majLe: maintenant, etat: "en-cours", echantillons: 0, blocs: 0 };
    this.fiche.id = await creerCapture(this.fiche);
    // Verrou tenu pendant toute la capture (libéré tout seul si la page plante)
    navigator.locks
      ?.request(nomVerrou(this.fiche.id), () => new Promise((liberer) => (this.libererVerrou = liberer)))
      .catch(() => {});

    // 2) Le circuit audio : sources → mono → AudioWorklet (qui enregistre)
    try {
      await this.construireCircuit(micro, partage);
    } catch (erreur) {
      await this.contexte?.close().catch(() => {});
      await supprimerCapture(this.fiche.id).catch(() => {});
      this.libererVerrou?.();
      throw erreur;
    }
    return this.fiche.id;
  }

  async construireCircuit(micro, partage) {
    this.contexte = new AudioContext({ sampleRate: FREQUENCE_AUDIO, latencyHint: "playback" });
    await this.contexte.audioWorklet.addModule(new URL("./processeur-capture.js", import.meta.url));
    this.noeud = new AudioWorkletNode(this.contexte, "processeur-capture", {
      numberOfInputs: 2,
      numberOfOutputs: 0,
    });
    this.noeud.port.onmessage = (e) => this.recevoir(e.data);

    // Chaque piste passe par un nœud qui la ramène en mono (stéréo → moyenne des voies)
    ["micro", "autres"].forEach((piste, numero) => {
      this.entrees[piste] = new GainNode(this.contexte, {
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
      });
      this.entrees[piste].connect(this.noeud, 0, numero);
    });
    this.brancher("micro", micro);
    this.brancher("autres", partage);
    await this.contexte.resume();
  }

  // Branche (ou rebranche) une source de son sur sa piste
  brancher(piste, flux) {
    const ancienne = this.sources[piste];
    if (ancienne) {
      ancienne.noeud.disconnect();
      arreterFlux(ancienne.flux);
    }
    const noeud = this.contexte.createMediaStreamSource(flux);
    noeud.connect(this.entrees[piste]);
    this.sources[piste] = { flux, noeud };
    // L'utilisateur clique « Arrêter le partage », débranche son casque… :
    // la piste continue en silence (la synchronisation est gardée) et on prévient
    for (const p of flux.getAudioTracks()) {
      p.addEventListener("ended", () => {
        if (this.sources[piste]?.flux === flux) this.rappels.surCoupure(piste);
      });
    }
  }

  // Remplace une source coupée (nouveau partage, micro rebranché)
  reprendre(piste, flux) {
    this.brancher(piste, flux);
  }

  // Reçoit 0,25 s de son de l'AudioWorklet
  recevoir({ micro, autres, pics, fin }) {
    if (micro.length > 0) {
      let lu = 0;
      while (lu < micro.length) {
        const n = Math.min(micro.length - lu, TAILLE_BLOC - this.position);
        this.bloc.micro.set(micro.subarray(lu, lu + n), this.position);
        this.bloc.autres.set(autres.subarray(lu, lu + n), this.position);
        this.position += n;
        lu += n;
        if (this.position === TAILLE_BLOC) this.sauvegarderBloc();
      }
      this.echantillons += micro.length;
      pics.forEach((pic, p) => {
        if (pic >= SEUIL_SON) this.dernierSon[p] = this.echantillons;
      });
      this.rappels.surMiseAJour({
        duree: this.duree,
        niveaux: pics,
        silences: this.dernierSon.map((e) => (this.echantillons - e) / FREQUENCE_AUDIO),
        octets: this.echantillons * 4,
      });
    }
    if (fin) this.resoudreFin?.();
  }

  nouveauBloc() {
    this.bloc = { micro: new Int16Array(TAILLE_BLOC), autres: new Int16Array(TAILLE_BLOC) };
    this.position = 0;
  }

  // Met le bloc courant dans la file des sauvegardes
  sauvegarderBloc() {
    const pistes = {
      micro: this.bloc.micro.slice(0, this.position),
      autres: this.bloc.autres.slice(0, this.position),
    };
    this.echantillonsSauves += this.position;
    const total = this.echantillonsSauves;
    this.nouveauBloc();
    this.ecritures = this.ecritures.then(async () => {
      if (this.enErreur) return;
      const index = this.fiche.blocs;
      Object.assign(this.fiche, { echantillons: total, blocs: index + 1, majLe: Date.now() });
      try {
        await ajouterBloc(this.fiche, pistes, index);
      } catch (erreur) {
        console.error("Sauvegarde de la capture impossible :", erreur);
        this.enErreur = true;
        this.rappels.surErreur(codeErreur(erreur));
      }
    });
  }

  /**
   * Arrête la capture et sauvegarde ce qui reste.
   * @returns {Promise<object>} la fiche de la capture
   */
  async arreter() {
    // L'AudioWorklet envoie ce qu'il a encore en réserve
    const finRecue = new Promise((resoudre) => {
      this.resoudreFin = resoudre;
      setTimeout(resoudre, 1500); // au cas où il ne répondrait pas
    });
    this.noeud?.port.postMessage("vider");
    await finRecue;
    if (this.position > 0) this.sauvegarderBloc();
    await this.ecritures;

    for (const { flux } of Object.values(this.sources)) arreterFlux(flux);
    await this.contexte?.close().catch(() => {});
    if (this.fiche) {
      this.fiche.etat = "terminee";
      this.fiche.majLe = Date.now();
      await mettreAJourCapture(this.fiche).catch((e) => console.error(e));
    }
    this.libererVerrou?.();
    return this.fiche;
  }
}
