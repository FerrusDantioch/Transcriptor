// ==========================================================
// Réglages de l'utilisateur (qualité, moteur, vitesse, langue).
// Ils sont gardés dans le « localStorage » du navigateur :
// un petit espace de stockage simple, qui reste sur l'appareil.
// ==========================================================

import {
  QUALITES,
  QUALITE_PAR_DEFAUT,
  MOTEURS,
  MOTEUR_PAR_DEFAUT,
  VITESSES,
  VITESSE_PAR_DEFAUT,
  LANGUES,
  LANGUE_PAR_DEFAUT,
} from "../config.js";

const CLE = "transcriptor-reglages";

// Numéro de version des réglages. Version 2 : le moteur par défaut passe de
// « Automatique » à « Processeur » (la carte graphique figeait le téléphone).
const VERSION_REGLAGES = 2;

// Lit les réglages enregistrés (ou les valeurs par défaut)
export function lireReglages() {
  let enregistres = {};
  try {
    enregistres = JSON.parse(localStorage.getItem(CLE)) || {};
  } catch {
    // Stockage indisponible (navigation privée…) : on garde les valeurs par défaut
  }
  // Anciens réglages : « Automatique » était seulement la valeur par défaut,
  // on passe donc au nouveau défaut « Processeur »
  if ((enregistres.version ?? 1) < 2 && enregistres.moteur === "auto") {
    delete enregistres.moteur;
  }
  return {
    qualite: enregistres.qualite in QUALITES ? enregistres.qualite : QUALITE_PAR_DEFAUT,
    moteur: enregistres.moteur in MOTEURS ? enregistres.moteur : MOTEUR_PAR_DEFAUT,
    vitesse: enregistres.vitesse in VITESSES ? enregistres.vitesse : VITESSE_PAR_DEFAUT,
    langue: LANGUES.some((l) => l.code === enregistres.langue)
      ? enregistres.langue
      : LANGUE_PAR_DEFAUT,
  };
}

// Enregistre une partie des réglages, par exemple { langue: "en" }
export function enregistrerReglages(modifications) {
  const reglages = { ...lireReglages(), ...modifications };
  try {
    localStorage.setItem(CLE, JSON.stringify({ ...reglages, version: VERSION_REGLAGES }));
  } catch {
    // Pas grave : le réglage s'appliquera seulement jusqu'à la fermeture
  }
  return reglages;
}
