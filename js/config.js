// ==========================================================
// Réglages fixes de l'application (les « constantes »).
// Tout ce qui pourrait changer un jour est rassemblé ici.
// ==========================================================

// Les trois niveaux de qualité proposés dans les réglages.
// « tailleMo » est une estimation du téléchargement avec le moteur
// « processeur » (la taille exacte s'affiche pendant le téléchargement).
export const QUALITES = {
  rapide: {
    nom: "Rapide",
    modele: "onnx-community/whisper-tiny",
    tailleMo: 45,
    description: "Le plus léger. Bon pour un premier essai, mais fait plus d'erreurs en français.",
  },
  equilibre: {
    nom: "Équilibré",
    modele: "onnx-community/whisper-base",
    tailleMo: 80,
    description: "Le meilleur compromis entre vitesse et justesse sur un téléphone.",
  },
  precis: {
    nom: "Précis",
    modele: "onnx-community/whisper-small",
    tailleMo: 250,
    description: "Le plus juste, mais lent sur un téléphone (plusieurs minutes par minute d'audio).",
  },
};

export const QUALITE_PAR_DEFAUT = "equilibre";

// Taille du moteur de calcul, téléchargé une seule fois pour toutes les qualités
export const TAILLE_MOTEUR_MO = 27;

// Choix du moteur de calcul
export const MOTEURS = {
  auto: {
    nom: "Automatique",
    description: "Utilise la carte graphique si le téléphone le permet, sinon le processeur.",
  },
  wasm: {
    nom: "Processeur",
    description: "Fonctionne partout. Le plus fiable.",
  },
  webgpu: {
    nom: "Carte graphique (WebGPU)",
    description: "Peut être plus rapide, mais expérimental sur téléphone. Téléchargement 2 à 3 fois plus lourd.",
  },
};

export const MOTEUR_PAR_DEFAUT = "auto";

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
