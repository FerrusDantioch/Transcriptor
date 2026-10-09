// ==========================================================
// Textes affichés à l'utilisateur pour chaque type d'erreur,
// et fonctions pour afficher / cacher un message.
// ==========================================================

import { FORMATS_ACCEPTES } from "../config.js";

const TEXTES_ERREUR = {
  "micro-refuse":
    "L'accès au micro a été refusé. Pour l'autoriser : touchez l'icône à gauche de l'adresse " +
    "(ou ⋮ → Paramètres → Paramètres des sites → Micro), autorisez le micro, puis réessayez.",
  "micro-absent": "Aucun micro n'a été trouvé sur cet appareil.",
  "micro-occupe":
    "Le micro est déjà utilisé par une autre application (appel, dictaphone…). Fermez-la puis réessayez.",
  "micro-indisponible":
    "Ce navigateur ne permet pas d'enregistrer. Essayez avec Chrome, ou importez un fichier audio.",
  "fichier-illisible":
    `Ce fichier n'a pas pu être lu. Formats acceptés : ${FORMATS_ACCEPTES}. ` +
    "Essayez un autre fichier, ou convertissez-le en MP3.",
  "fichier-vide": "Ce fichier ne contient pas de son.",
  memoire:
    "Le téléphone manque de mémoire pour ce traitement. Fermez les autres applications, " +
    "choisissez la qualité « Rapide » dans les réglages, ou essayez un audio plus court.",
  plantage:
    "Le moteur de transcription s'est arrêté brutalement, souvent par manque de mémoire. " +
    "Fermez les autres applications puis réessayez. Si cela recommence, choisissez la qualité « Rapide ».",
  connexion:
    "La connexion internet a été perdue. Pas d'inquiétude : ce qui est déjà téléchargé est conservé. " +
    "Le téléchargement reprendra là où il s'est arrêté.",
  "hors-ligne":
    "Vous êtes hors ligne. Le modèle doit être téléchargé une première fois avec internet " +
    "(de préférence en Wi-Fi). Ensuite, tout fonctionnera sans connexion.",
  espace:
    "Il n'y a plus assez d'espace de stockage sur le téléphone pour enregistrer le modèle. " +
    "Libérez de la place (photos, vidéos, applications) puis réessayez.",
  introuvable:
    "Le modèle est introuvable sur le serveur pour le moment. Réessayez plus tard, " +
    "ou choisissez une autre qualité dans les réglages.",
  inconnue: "Un problème inattendu est survenu. Réessayez ; si cela recommence, rechargez la page.",
};

export function texteErreur(code) {
  return TEXTES_ERREUR[code] ?? TEXTES_ERREUR.inconnue;
}

// Affiche un message dans une zone ; type = "info" | "succes" | "erreur"
export function afficherMessage(zone, texte, type = "info") {
  zone.textContent = texte;
  zone.dataset.type = type;
  zone.hidden = false;
}

export function cacherMessage(zone) {
  zone.hidden = true;
  zone.textContent = "";
}
