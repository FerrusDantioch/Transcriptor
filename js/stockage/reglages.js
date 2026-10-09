// ==========================================================
// Réglages de l'utilisateur (qualité, moteur, langue).
// Ils sont gardés dans le « localStorage » du navigateur :
// un petit espace de stockage simple, qui reste sur l'appareil.
// ==========================================================

import {
  QUALITES,
  QUALITE_PAR_DEFAUT,
  MOTEURS,
  MOTEUR_PAR_DEFAUT,
  LANGUES,
  LANGUE_PAR_DEFAUT,
} from "../config.js";

const CLE = "transcriptor-reglages";

// Lit les réglages enregistrés (ou les valeurs par défaut)
export function lireReglages() {
  let enregistres = {};
  try {
    enregistres = JSON.parse(localStorage.getItem(CLE)) || {};
  } catch {
    // Stockage indisponible (navigation privée…) : on garde les valeurs par défaut
  }
  return {
    qualite: enregistres.qualite in QUALITES ? enregistres.qualite : QUALITE_PAR_DEFAUT,
    moteur: enregistres.moteur in MOTEURS ? enregistres.moteur : MOTEUR_PAR_DEFAUT,
    langue: LANGUES.some((l) => l.code === enregistres.langue)
      ? enregistres.langue
      : LANGUE_PAR_DEFAUT,
  };
}

// Enregistre une partie des réglages, par exemple { langue: "en" }
export function enregistrerReglages(modifications) {
  const reglages = { ...lireReglages(), ...modifications };
  try {
    localStorage.setItem(CLE, JSON.stringify(reglages));
  } catch {
    // Pas grave : le réglage s'appliquera seulement jusqu'à la fermeture
  }
  return reglages;
}
