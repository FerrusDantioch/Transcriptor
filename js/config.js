// ==========================================================
// Réglages fixes de l'application (les « constantes »).
// Tout ce qui pourrait changer un jour est rassemblé ici.
// ==========================================================

// Les niveaux de qualité proposés dans les réglages.
// - « tailleMo » : estimation du téléchargement avec le moteur « processeur »
//   (la taille exacte s'affiche pendant le téléchargement) ;
// - « encodeur » : compression de la première moitié du modèle (l'« encodeur »,
//   qui « écoute » l'audio). « q8 » = compressé (léger), « fp32 » = non
//   compressé (plus lourd, mais il entend mieux). La seconde moitié
//   (le « décodeur », qui écrit le texte) reste compressée.
export const QUALITES = {
  rapide: {
    nom: "Rapide",
    modele: "onnx-community/whisper-tiny",
    encodeur: "q8",
    tailleMo: 45,
    description: "Le plus léger. Bon pour un premier essai, mais fait plus d'erreurs en français.",
  },
  equilibre: {
    nom: "Équilibré",
    modele: "onnx-community/whisper-base",
    encodeur: "q8",
    tailleMo: 80,
    description: "Bon compromis entre vitesse et justesse sur un téléphone.",
  },
  equilibrePlus: {
    nom: "Équilibré +",
    modele: "onnx-community/whisper-base",
    encodeur: "fp32",
    tailleMo: 140,
    description:
      "Le même modèle, moins compressé : devrait faire moins d'erreurs, un peu plus lent. " +
      "Si « Équilibré » est déjà téléchargé, seuls ≈ 80 Mo de plus sont nécessaires.",
  },
  precis: {
    nom: "Précis",
    modele: "onnx-community/whisper-small",
    encodeur: "q8",
    tailleMo: 250,
    description:
      "Le plus juste (nettement moins d'erreurs). Lent : mesuré sur un Redmi Note 15, " +
      "environ 2 à 3 minutes de calcul pour 30 secondes d'audio. Idéal pour des audios courts.",
  },
};

export const QUALITE_PAR_DEFAUT = "equilibre";

// Taille du moteur de calcul, téléchargé une seule fois pour toutes les qualités
export const TAILLE_MOTEUR_MO = 27;

// Choix du moteur de calcul
export const MOTEURS = {
  wasm: {
    nom: "Processeur (recommandé)",
    description: "Fonctionne partout. Le plus fiable, et le téléphone reste utilisable.",
  },
  auto: {
    nom: "Automatique",
    description:
      "Utilise la carte graphique si le téléphone le permet. Déconseillé : l'écran peut devenir saccadé.",
  },
  webgpu: {
    nom: "Carte graphique (WebGPU)",
    description:
      "Expérimental. La carte graphique sert aussi à afficher l'écran : le téléphone peut presque se figer. " +
      "Téléchargement 2 à 3 fois plus lourd.",
  },
};

export const MOTEUR_PAR_DEFAUT = "wasm";

// Nombre de cœurs du processeur utilisés pour le calcul.
// Le téléphone en a souvent 8 : en laisser assez libres garde l'écran fluide.
export const VITESSES = {
  douce: {
    nom: "Douce (recommandée)",
    description: "2 cœurs : un peu plus lent, mais le téléphone reste utilisable pendant le calcul.",
  },
  maximale: {
    nom: "Maximale",
    description: "Jusqu'à 4 cœurs : plus rapide, mais le téléphone peut ralentir fortement, voire se figer.",
  },
};

export const VITESSE_PAR_DEFAUT = "douce";

// Calcule le nombre de cœurs à utiliser selon la vitesse choisie
export function nombreDeCoeurs(vitesse) {
  const coeurs = navigator.hardwareConcurrency || 2;
  if (vitesse === "maximale") return Math.min(4, Math.ceil(coeurs / 2));
  return coeurs >= 4 ? 2 : 1;
}

// Langues proposées. Le code (« fr », « en »…) est celui qu'attend Whisper.
// Remarque : Whisper ne détecte pas la langue tout seul dans cette
// bibliothèque, il faut donc toujours la choisir.
export const LANGUES = [
  { code: "fr", nom: "Français" },
  { code: "en", nom: "Anglais" },
  { code: "es", nom: "Espagnol" },
  { code: "de", nom: "Allemand" },
  { code: "it", nom: "Italien" },
  { code: "pt", nom: "Portugais" },
  { code: "nl", nom: "Néerlandais" },
  { code: "pl", nom: "Polonais" },
  { code: "ro", nom: "Roumain" },
  { code: "tr", nom: "Turc" },
  { code: "ar", nom: "Arabe" },
  { code: "ru", nom: "Russe" },
  { code: "uk", nom: "Ukrainien" },
  { code: "zh", nom: "Chinois" },
  { code: "ja", nom: "Japonais" },
];

export const LANGUE_PAR_DEFAUT = "fr";

// Formats audio acceptés à l'import (affichés dans les messages)
export const FORMATS_ACCEPTES = "MP3, WAV, M4A, OGG";

// Whisper travaille sur de l'audio à 16 000 échantillons par seconde
export const FREQUENCE_AUDIO = 16000;
