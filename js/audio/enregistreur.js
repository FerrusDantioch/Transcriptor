// ==========================================================
// Enregistrement avec le micro.
// On utilise « MediaRecorder », l'enregistreur intégré au navigateur.
// L'enregistrement reste dans la mémoire du téléphone : rien n'est envoyé.
// ==========================================================

export class Enregistreur {
  constructor() {
    this.flux = null;       // le « flux » audio venant du micro
    this.recorder = null;
    this.morceaux = [];
    this.heureDebut = 0;
  }

  // Le navigateur sait-il enregistrer ?
  static estDisponible() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  // Demande l'accès au micro puis démarre l'enregistrement
  async demarrer() {
    this.flux = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,  // limite l'écho
        noiseSuppression: true,  // réduit les bruits de fond
        autoGainControl: true,   // ajuste le volume automatiquement
      },
    });
    this.morceaux = [];
    this.recorder = new MediaRecorder(this.flux);
    this.recorder.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) this.morceaux.push(e.data);
    });
    // Un petit paquet de données chaque seconde (rien n'est perdu si ça coupe)
    this.recorder.start(1000);
    this.heureDebut = Date.now();
  }

  // Durée écoulée depuis le début, en secondes
  get duree() {
    return this.heureDebut ? (Date.now() - this.heureDebut) / 1000 : 0;
  }

  // Arrête et renvoie l'enregistrement complet
  arreter() {
    return new Promise((resoudre) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        resoudre(null);
        return;
      }
      this.recorder.addEventListener(
        "stop",
        () => {
          const type = this.recorder.mimeType || "audio/webm";
          const enregistrement = new Blob(this.morceaux, { type });
          this.liberer();
          resoudre(enregistrement);
        },
        { once: true }
      );
      this.recorder.stop();
    });
  }

  // Abandonne l'enregistrement en cours
  annuler() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.liberer();
  }

  // Coupe le micro (le voyant d'enregistrement du téléphone s'éteint)
  liberer() {
    this.flux?.getTracks().forEach((piste) => piste.stop());
    this.flux = null;
    this.recorder = null;
    this.morceaux = [];
    this.heureDebut = 0;
  }
}
