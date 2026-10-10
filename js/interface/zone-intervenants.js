// ==========================================================
// Zone « Reconnaître les intervenants » (dans la carte
// « Nouvelle transcription ») : interrupteur, nombre de voix,
// état des modèles de voix et avertissements.
// ==========================================================

import { formaterTaille } from "../outils/format.js";
import { texteErreur, afficherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

// En dessous de cette mémoire (en Go), la reconnaissance des voix risque d'échouer
const MEMOIRE_CONSEILLEE = 4;

export function creerZoneIntervenants({ intervenants, nombreVoix, surChangement, surTelecharger }) {
  const interrupteur = $("choix-intervenants");
  const zone = $("zone-intervenants");
  const choixNombre = $("nombre-voix");
  const etat = $("voix-etat");
  const barre = $("voix-barre");
  const boutonTelecharger = $("bouton-telecharger-voix");
  const avertissement = $("voix-avertissement");

  interrupteur.checked = intervenants;
  choixNombre.value = nombreVoix;
  zone.hidden = !intervenants;

  interrupteur.addEventListener("change", () => {
    zone.hidden = !interrupteur.checked;
    surChangement({ intervenants: interrupteur.checked });
  });
  choixNombre.addEventListener("change", () => surChangement({ nombreVoix: choixNombre.value }));
  boutonTelecharger.addEventListener("click", () => surTelecharger());

  // Téléphone avec peu de mémoire : on prévient (la fonction reste possible)
  const memoire = navigator.deviceMemory; // en Go, approximatif (Chrome seulement)
  if (memoire && memoire < MEMOIRE_CONSEILLEE) {
    afficherMessage(
      avertissement,
      `Ce téléphone a peu de mémoire (environ ${memoire} Go) : la reconnaissance des intervenants ` +
        "risque d'échouer sur les longs enregistrements. En cas de problème, désactivez-la : " +
        "la transcription fonctionnera normalement, sans distinction de voix.",
      "erreur"
    );
  }

  return {
    get actif() {
      return interrupteur.checked;
    },

    // null = automatique, sinon 2 à 6
    get nombreVoix() {
      return choixNombre.value === "auto" ? null : Number(choixNombre.value);
    },

    // Les modèles de voix sont-ils déjà sur l'appareil ?
    afficherEtat({ present }) {
      barre.hidden = true;
      if (present) {
        etat.textContent = "✓ Modèles des voix téléchargés : fonctionne hors ligne.";
        boutonTelecharger.hidden = true;
      } else {
        etat.textContent =
          "Les modèles des voix (≈ 32 Mo) seront téléchargés à la première utilisation, " +
          "ou dès maintenant avec le bouton ci-dessous.";
        boutonTelecharger.hidden = false;
        boutonTelecharger.disabled = false;
      }
    },

    afficherTelechargement(recu, total) {
      boutonTelecharger.disabled = true;
      barre.hidden = false;
      const pourcentage = total > 0 ? Math.min(100, Math.floor((recu / total) * 100)) : 0;
      barre.value = pourcentage;
      etat.textContent = `Téléchargement des modèles des voix : ${formaterTaille(recu)} sur ${formaterTaille(total)} (${pourcentage} %)`;
    },

    afficherErreur(code) {
      barre.hidden = true;
      boutonTelecharger.hidden = false;
      boutonTelecharger.disabled = false;
      etat.textContent = texteErreur(code);
    },

    // Grise les choix pendant un enregistrement ou une transcription
    activer(actif) {
      interrupteur.disabled = !actif;
      choixNombre.disabled = !actif;
      if (!actif) boutonTelecharger.disabled = true;
      else if (barre.hidden) boutonTelecharger.disabled = false;
    },
  };
}
