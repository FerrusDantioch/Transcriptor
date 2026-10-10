// ==========================================================
// Carte « Modèle de reconnaissance vocale » :
// affiche l'état du modèle (absent, téléchargement, prêt…)
// et la barre de progression.
// ==========================================================

import { QUALITES, TAILLE_MOTEUR_MO } from "../config.js";
import { formaterTaille } from "../outils/format.js";
import { texteErreur, afficherMessage, cacherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

export function creerCarteModele({ surTelecharger, surPause }) {
  const texte = $("modele-texte");
  const zoneProgression = $("modele-progression");
  const barre = $("modele-barre");
  const detail = $("modele-detail");
  const boutonTelecharger = $("bouton-telecharger");
  const boutonPause = $("bouton-pause");
  const message = $("modele-message");

  boutonTelecharger.addEventListener("click", () => surTelecharger());
  boutonPause.addEventListener("click", () => surPause());

  // Remet la carte dans un état neutre avant chaque affichage
  function reinitialiser() {
    zoneProgression.hidden = true;
    boutonTelecharger.hidden = true;
    boutonPause.hidden = true;
    cacherMessage(message);
  }

  function libelleTaille(qualite, device) {
    const taille = QUALITES[qualite].tailleMo;
    return device === "webgpu"
      ? `environ ${taille * 2}–${taille * 3} Mo avec la carte graphique`
      : `environ ${taille} Mo`;
  }

  // Barre de progression : « 12,3 Mo sur 107 Mo (11 %) »
  function majBarre(recu, total) {
    zoneProgression.hidden = false;
    if (total > 0) {
      const pourcentage = Math.min(100, Math.floor((recu / total) * 100));
      barre.value = pourcentage;
      detail.textContent = `${formaterTaille(recu)} sur ${formaterTaille(total)} (${pourcentage} %)`;
    } else {
      barre.removeAttribute("value"); // barre « en attente » (sans pourcentage)
      detail.textContent = `${formaterTaille(recu)} téléchargés`;
    }
  }

  return {
    afficherVerification() {
      reinitialiser();
      texte.textContent = "Vérification du modèle…";
    },

    afficherAbsent({ qualite, device, dejaTelecharge }) {
      reinitialiser();
      const nom = QUALITES[qualite].nom;
      texte.textContent =
        `Pour transcrire, l'application a besoin du modèle « ${nom} » (${libelleTaille(qualite, device)}, ` +
        `plus ${TAILLE_MOTEUR_MO} Mo de moteur la première fois). Il se télécharge une seule fois, ` +
        "puis tout fonctionne hors ligne. Conseil : utilisez le Wi-Fi.";
      boutonTelecharger.hidden = false;
      boutonTelecharger.textContent = dejaTelecharge > 0
        ? `▶️ Reprendre le téléchargement (${formaterTaille(dejaTelecharge)} déjà reçus)`
        : "⬇️ Télécharger le modèle";
      if (!navigator.onLine) afficherMessage(message, texteErreur("hors-ligne"), "info");
    },

    afficherTelechargement(recu, total) {
      if (boutonPause.hidden) {
        reinitialiser();
        boutonPause.hidden = false;
        texte.textContent =
          "Téléchargement en cours. Si la connexion coupe, il reprendra là où il s'est arrêté.";
      }
      majBarre(recu, total);
    },

    afficherPause(recu, total) {
      reinitialiser();
      texte.textContent = "Téléchargement en pause. Ce qui est déjà téléchargé est conservé.";
      if (recu > 0) majBarre(recu, total);
      boutonTelecharger.hidden = false;
      boutonTelecharger.textContent = "▶️ Reprendre le téléchargement";
    },

    afficherConnexionPerdue(recu, total) {
      reinitialiser();
      texte.textContent = texteErreur("connexion");
      if (recu > 0) majBarre(recu, total);
      boutonTelecharger.hidden = false;
      boutonTelecharger.textContent = "🔄 Réessayer maintenant";
      afficherMessage(
        message,
        "Le téléchargement repartira tout seul dès le retour de la connexion.",
        "info"
      );
    },

    afficherChargement() {
      reinitialiser();
      texte.textContent = "Préparation du modèle en mémoire… (quelques secondes, parfois plus)";
      zoneProgression.hidden = false;
      barre.removeAttribute("value");
      detail.textContent = "";
    },

    afficherPret({ qualite, device, coeurs }) {
      reinitialiser();
      const moteur = device === "webgpu"
        ? "carte graphique"
        : `processeur, ${coeurs > 1 ? `${coeurs} cœurs` : "1 cœur"}`;
      texte.textContent = `✓ Modèle « ${QUALITES[qualite].nom} » prêt (${moteur}). Fonctionne hors ligne.`;
    },

    afficherErreur(code) {
      reinitialiser();
      texte.textContent = "Le modèle n'est pas prêt.";
      afficherMessage(message, texteErreur(code), "erreur");
      boutonTelecharger.hidden = false;
      boutonTelecharger.textContent = "🔄 Réessayer";
    },

    afficherInfo(texteInfo) {
      afficherMessage(message, texteInfo, "info");
    },
  };
}
