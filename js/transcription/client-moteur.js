// ==========================================================
// Côté page : pilote le Web Worker de transcription.
// Ce fichier cache les échanges de messages derrière des
// fonctions simples : verifier(), preparer(), transcrire()…
// ==========================================================

export class MoteurTranscription {
  /**
   * @param {object} rappels fonctions appelées quand le worker donne des nouvelles
   * @param {(etat:object) => void} rappels.surEtat
   * @param {(recu:number, total:number, cible:string) => void} rappels.surProgression
   * @param {(code:string, detail:string, operation:string) => void} rappels.surErreur
   * @param {(code:string) => void} rappels.surInfo
   */
  constructor(rappels) {
    this.rappels = rappels;
    this.demandesEnAttente = new Map(); // transcriptions en cours, par numéro
    this.prochainId = 1;
    this.worker = null;
  }

  // Crée le worker s'il n'existe pas encore (ou plus)
  assurerWorker() {
    if (this.worker) return;
    // type: "module" permet d'utiliser « import » dans le worker
    this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (e) => this.recevoir(e.data));
    // Le worker a planté (souvent : plus de mémoire). On prévient ;
    // un worker neuf sera créé à la prochaine demande.
    this.worker.addEventListener("error", (e) => {
      console.error("Le worker s'est arrêté :", e.message);
      e.preventDefault();
      this.arreter();
      this.rappels.surErreur("plantage", e.message || "Worker arrêté", "plantage");
    });
  }

  // Arrête le worker (le modèle devra être rechargé ensuite)
  arreter() {
    this.worker?.terminate();
    this.worker = null;
    for (const { rejeter } of this.demandesEnAttente.values()) {
      rejeter(Object.assign(new Error("Le calcul a été interrompu."), { code: "plantage" }));
    }
    this.demandesEnAttente.clear();
  }

  recevoir(message) {
    switch (message.type) {
      case "verification":
      case "etat":
        this.rappels.surEtat(message);
        break;
      case "progression":
        this.rappels.surProgression(message.recu, message.total, message.cible ?? "modele");
        break;
      case "info":
        this.rappels.surInfo(message.code);
        break;
      case "resultat": {
        const demande = this.demandesEnAttente.get(message.id);
        this.demandesEnAttente.delete(message.id);
        demande?.resoudre(message);
        break;
      }
      case "erreur": {
        // Erreur liée à une transcription précise ?
        const demande = this.demandesEnAttente.get(message.id);
        if (demande) {
          this.demandesEnAttente.delete(message.id);
          demande.rejeter(Object.assign(new Error(message.detail), { code: message.code }));
        } else {
          this.rappels.surErreur(message.code, message.detail, message.operation);
        }
        break;
      }
    }
  }

  // Le modèle est-il déjà téléchargé ? (réponse via surEtat, type « verification »)
  // « qualite » : un élément de QUALITES (js/config.js)
  verifier(qualite, moteur) {
    this.assurerWorker();
    this.worker.postMessage({ type: "verifier", modele: qualite.modele, encodeur: qualite.encodeur, moteur });
  }

  // Télécharge (si besoin) puis charge le modèle en mémoire
  // « coeurs » : nombre de cœurs du processeur à utiliser
  preparer(qualite, moteur, coeurs) {
    this.assurerWorker();
    this.worker.postMessage({
      type: "preparer",
      modele: qualite.modele,
      encodeur: qualite.encodeur,
      moteur,
      coeurs,
    });
  }

  // Met le téléchargement en pause
  pause() {
    this.worker?.postMessage({ type: "pause" });
  }

  /**
   * Envoie une demande au worker et attend sa réponse.
   * @param {string} type type de demande (« transcrire », « analyserVoix »…)
   * @param {object} donnees données de la demande
   * @param {Transferable[]} transferts données « transférées » sans copie
   * @returns {Promise<object>} la réponse du worker
   */
  demander(type, donnees = {}, transferts = []) {
    const id = this.prochainId++;
    this.assurerWorker();
    return new Promise((resoudre, rejeter) => {
      this.demandesEnAttente.set(id, { resoudre, rejeter });
      this.worker.postMessage({ type, id, ...donnees }, transferts);
    });
  }

  /**
   * Transcrit un morceau d'audio.
   * @param {Float32Array} audio échantillons à 16 kHz (30 s maximum)
   * @param {string} langue code de langue, ex. « fr »
   * @returns {Promise<{segments: Array<{debut:number|null, fin:number|null, texte:string}>}>}
   */
  transcrire(audio, langue) {
    // Le 3e argument « transfère » l'audio au worker au lieu de le copier
    // (plus rapide et économise la mémoire)
    return this.demander("transcrire", { audio, langue }, [audio.buffer]);
  }
}
