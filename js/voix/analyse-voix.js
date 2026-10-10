// ==========================================================
// Analyse des voix (dans le Web Worker).
//
// Pour chaque fenêtre de 10 secondes d'audio :
//   1. le modèle « pyannote » dit, trame par trame (toutes les 17 ms),
//      qui parle parmi 3 voix « locales » A, B, C (ou personne, ou deux à la fois) ;
//   2. pour chaque voix locale, on rassemble ses passages où elle parle seule,
//      et le modèle « WeSpeaker » en calcule l'empreinte vocale.
// Les voix locales de fenêtres différentes sont ensuite reliées entre elles
// par le regroupement des empreintes (voir regroupement.js).
// ==========================================================

import {
  env,
  Tensor,
  PyAnnoteModel,
  WeSpeakerResNetModel,
  WeSpeakerFeatureExtractor,
} from "../../vendor/transformers/transformers.min.js";

// Les modèles de voix sont hébergés avec l'application, dans le dossier « modeles/ »
const BASE_MODELES = new URL("../../modeles/", import.meta.url).href;
const MODELES_VOIX = {
  segmentation: "voix/pyannote-segmentation-3.0",
  empreinte: "voix/wespeaker-resnet34-LM",
};
const FICHIERS = ["config.json", "onnx/model.onnx"];

// Caractéristiques du modèle pyannote
const FREQUENCE = 16000;
const PAS_TRAME = 270;          // échantillons entre deux trames
const CHAMP_TRAME = 991;        // échantillons « vus » par une trame
// Classes de sortie : 0 = silence, 1 = A, 2 = B, 3 = C, 4 = A+B, 5 = A+C, 6 = B+C
const CLASSES_ACTIVES = [[1, 4, 5], [2, 4, 6], [3, 5, 6]]; // voix A, B, C présentes
const DUREE_EMPREINTE_MIN = 0.5;  // secondes de parole seule pour calculer une empreinte
const DUREE_EMPREINTE_MAX = 5;    // au-delà, inutile (et plus lent)
const ECART_FUSION = 0.3;         // deux passages séparés de moins de 0,3 s sont réunis

let segmenteur = null;   // modèle pyannote chargé
let empreinteur = null;  // modèle WeSpeaker chargé
let extracteur = null;   // calcul des « fbank » pour WeSpeaker

// Adresses des fichiers à télécharger (elles servent aussi de clés dans le cache)
export function fichiersModelesVoix() {
  return Object.values(MODELES_VOIX).flatMap((id) => FICHIERS.map((f) => `${BASE_MODELES}${id}/${f}`));
}

export function modelesVoixCharges() {
  return Boolean(segmenteur && empreinteur);
}

// Charge les deux modèles en mémoire (ils doivent déjà être dans le cache)
export async function chargerModelesVoix() {
  if (modelesVoixCharges()) return;
  // Transformers.js va chercher les fichiers à l'adresse « hôte + modèle » :
  // le temps du chargement, l'hôte devient notre propre site.
  const hote = env.remoteHost;
  const modeleChemin = env.remotePathTemplate;
  env.remoteHost = BASE_MODELES;
  env.remotePathTemplate = "{model}/";
  try {
    const options = { dtype: "fp32", device: "wasm" };
    segmenteur = await PyAnnoteModel.from_pretrained(MODELES_VOIX.segmentation, options);
    empreinteur = await WeSpeakerResNetModel.from_pretrained(MODELES_VOIX.empreinte, options);
  } finally {
    env.remoteHost = hote;
    env.remotePathTemplate = modeleChemin;
  }
  extracteur = new WeSpeakerFeatureExtractor({
    num_mel_bins: 80,
    sampling_rate: FREQUENCE,
    fbank_centering_span: null, // on retire la moyenne de toute la fenêtre
    min_num_frames: null,
  });
}

/**
 * Analyse une fenêtre d'audio (10 s au plus).
 * @param {Float32Array} audio échantillons à 16 kHz
 * @param {number} decalage début de la fenêtre dans l'audio complet (secondes)
 * @returns {Promise<Array<{empreinte: Float32Array|null, duree: number, segments: Array<{debut:number, fin:number}>}>>}
 *          une entrée par voix locale entendue dans la fenêtre
 */
export async function analyserFenetre(audio, decalage) {
  const { y } = await segmenteur({ x: new Tensor("float32", audio, [1, 1, audio.length]) });
  const [, nbTrames, nbClasses] = y.dims;
  const donnees = /** @type {Float32Array} */ (y.data);

  // Classe la plus probable pour chaque trame
  const classes = new Uint8Array(nbTrames);
  for (let t = 0; t < nbTrames; t++) {
    let meilleure = 0;
    for (let c = 1; c < nbClasses; c++) {
      if (donnees[t * nbClasses + c] > donnees[t * nbClasses + meilleure]) meilleure = c;
    }
    classes[t] = meilleure;
  }

  const resultats = [];
  for (let voix = 0; voix < 3; voix++) {
    const actives = CLASSES_ACTIVES[voix];
    // 1) Passages où cette voix parle (seule ou non) : pour la chronologie
    const segments = passages(classes, (c) => actives.includes(c), decalage);
    if (segments.length === 0) continue;
    // 2) Audio où elle parle seule : pour l'empreinte vocale
    const seule = audioSeul(audio, classes, voix + 1);
    const duree = seule.length / FREQUENCE;
    let empreinte = null;
    if (duree >= DUREE_EMPREINTE_MIN) empreinte = await calculerEmpreinte(seule);
    resultats.push({ empreinte, duree, segments });
  }
  return resultats;
}

// Moment (en secondes, dans la fenêtre) couvert par une trame
function debutTrame(t) {
  return (t * PAS_TRAME + (CHAMP_TRAME - PAS_TRAME) / 2) / FREQUENCE;
}

// Regroupe les trames consécutives où « estActive » est vrai en passages {debut, fin}
function passages(classes, estActive, decalage) {
  const liste = [];
  let debut = -1;
  for (let t = 0; t <= classes.length; t++) {
    const active = t < classes.length && estActive(classes[t]);
    if (active && debut === -1) debut = t;
    if (!active && debut !== -1) {
      const p = { debut: decalage + debutTrame(debut), fin: decalage + debutTrame(t) };
      const precedent = liste.at(-1);
      if (precedent && p.debut - precedent.fin < ECART_FUSION) precedent.fin = p.fin;
      else liste.push(p);
      debut = -1;
    }
  }
  return liste;
}

// Rassemble les échantillons des trames où seule la classe « classe » est présente
function audioSeul(audio, classes, classe) {
  const morceaux = [];
  let total = 0;
  const max = DUREE_EMPREINTE_MAX * FREQUENCE;
  for (let t = 0; t < classes.length && total < max; t++) {
    if (classes[t] !== classe) continue;
    const debut = Math.round(debutTrame(t) * FREQUENCE);
    const fin = Math.min(audio.length, debut + PAS_TRAME);
    if (fin > debut) {
      morceaux.push(audio.subarray(debut, fin));
      total += fin - debut;
    }
  }
  const resultat = new Float32Array(Math.min(total, max));
  let position = 0;
  for (const m of morceaux) {
    const n = Math.min(m.length, resultat.length - position);
    resultat.set(m.subarray(0, n), position);
    position += n;
    if (position >= resultat.length) break;
  }
  return resultat;
}

async function calculerEmpreinte(audio) {
  const { input_features } = await extracteur(audio);
  const { embs } = await empreinteur({ feats: input_features });
  return new Float32Array(embs.data);
}
