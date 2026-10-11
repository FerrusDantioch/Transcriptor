// ==========================================================
// « AudioWorklet » de la capture : un petit programme qui tourne
// dans le fil audio du navigateur (il n'est jamais ralenti, même si
// l'onglet est en arrière-plan).
//
// Il reçoit deux entrées, déjà en mono et à 16 000 échantillons par
// seconde : 0 = mon micro, 1 = le son des autres joueurs.
// Toutes les 0,25 s, il envoie à la page les échantillons des deux
// pistes (en nombres entiers 16 bits, deux fois plus compacts) et le
// niveau sonore le plus fort de chaque piste (pour les indicateurs).
// ==========================================================

const TAILLE_ENVOI = 4000; // échantillons par envoi (0,25 s à 16 kHz)

class ProcesseurCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.nouveauxTampons();
    this.vider = false;
    this.arrete = false;
    // La page demande d'envoyer tout de suite ce qui reste (fin de capture)
    this.port.onmessage = (e) => {
      if (e.data === "vider") this.vider = true;
    };
  }

  nouveauxTampons() {
    this.micro = new Int16Array(TAILLE_ENVOI);
    this.autres = new Int16Array(TAILLE_ENVOI);
    this.position = 0;
    this.pics = [0, 0];
  }

  process(entrees) {
    if (this.arrete) return false;
    const voies = [entrees[0]?.[0], entrees[1]?.[0]]; // une entrée sans son = silence
    const taille = voies[0]?.length || voies[1]?.length || 128;
    let micro = this.micro;
    let autres = this.autres;

    for (let i = 0; i < taille; i++) {
      const vMicro = voies[0] ? voies[0][i] : 0;
      const vAutres = voies[1] ? voies[1][i] : 0;
      this.pics[0] = Math.max(this.pics[0], Math.abs(vMicro));
      this.pics[1] = Math.max(this.pics[1], Math.abs(vAutres));
      micro[this.position] = enEntier(vMicro);
      autres[this.position] = enEntier(vAutres);
      this.position++;
      if (this.position === TAILLE_ENVOI) {
        this.envoyer(false);
        micro = this.micro; // nouveaux tampons après l'envoi
        autres = this.autres;
      }
    }

    if (this.vider) {
      this.envoyer(true);
      this.arrete = true;
      return false;
    }
    return true; // continuer
  }

  envoyer(fin) {
    const micro = this.micro.slice(0, this.position);
    const autres = this.autres.slice(0, this.position);
    this.port.postMessage({ micro, autres, pics: this.pics, fin }, [micro.buffer, autres.buffer]);
    this.nouveauxTampons();
  }
}

// -1…1 → -32767…32767 (en limitant les dépassements)
function enEntier(v) {
  return Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
}

registerProcessor("processeur-capture", ProcesseurCapture);
