// ==========================================================
// Liste des captures enregistrées (Mode JDR) : transcrire,
// écouter les pistes (.wav), supprimer.
// ==========================================================

import { listerCaptures, supprimerCapture } from "../stockage/captures.js";
import { pisteEnWav } from "../capture/export-wav.js";
import { OCTETS_PAR_SECONDE } from "../capture/session-capture.js";
import { FREQUENCE_AUDIO } from "../config.js";
import { formaterDate, formaterDuree, formaterTaille, nomDeFichier } from "../outils/format.js";
import { afficherMessage, cacherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

/**
 * @param {object} options
 * @param {((fiche:object) => void)|null} options.surTranscrire  null = bouton caché
 */
export function creerListeCaptures({ surTranscrire }) {
  const zone = $("zone-captures");
  const liste = $("liste-captures");
  const message = $("captures-message");
  let actif = true;

  async function rafraichir() {
    let captures = [];
    try {
      // La capture en cours est affichée à part (avec ses indicateurs)
      captures = (await listerCaptures()).filter((c) => c.etat !== "en-cours");
    } catch (erreur) {
      console.error(erreur);
    }
    zone.hidden = captures.length === 0;
    liste.replaceChildren(...captures.map(creerElement));
  }

  function creerElement(fiche) {
    const element = document.createElement("li");
    element.className = "element-historique";

    const titre = document.createElement("p");
    titre.className = "element-historique__titre";
    titre.textContent = fiche.titre;

    const duree = fiche.echantillons / FREQUENCE_AUDIO;
    const details = document.createElement("p");
    details.className = "petit";
    details.textContent =
      `${formaterDate(fiche.creeLe)} · ${formaterDuree(duree)} · ` +
      `${formaterTaille((fiche.echantillons / FREQUENCE_AUDIO) * OCTETS_PAR_SECONDE)}`;
    element.append(titre, details);

    if (fiche.etat === "interrompue") {
      const alerte = document.createElement("p");
      alerte.className = "petit";
      alerte.textContent =
        "⚠️ Capture interrompue (page fermée ou plantage) : tout ce qui a été enregistré " +
        "jusque-là est conservé et peut être transcrit.";
      element.append(alerte);
    }
    if (fiche.transcription?.id) {
      const info = document.createElement("p");
      info.className = "petit";
      info.textContent = "✓ Déjà transcrite (voir l'historique).";
      element.append(info);
    }

    const boutons = document.createElement("div");
    boutons.className = "boutons boutons--ligne";
    if (surTranscrire) {
      boutons.append(
        creerBouton("📝 Transcrire", `Transcrire « ${fiche.titre} »`, async () => surTranscrire(fiche), true)
      );
    }
    boutons.append(
      creerBouton("🎧 Ma piste (.wav)", `Télécharger ma piste de « ${fiche.titre} »`, () =>
        telecharger(fiche, "micro", "ma piste")
      ),
      creerBouton("🎧 Autres joueurs (.wav)", `Télécharger la piste des autres joueurs de « ${fiche.titre} »`, () =>
        telecharger(fiche, "autres", "autres joueurs")
      ),
      creerBouton("🗑️ Supprimer", `Supprimer « ${fiche.titre} »`, async () => {
        if (!confirm(`Supprimer définitivement l'enregistrement « ${fiche.titre} » ? (Les textes déjà transcrits restent dans l'historique.)`)) return;
        await supprimerCapture(fiche.id);
        await rafraichir();
        afficherMessage(message, "Enregistrement supprimé : l'espace est libéré.", "info");
      })
    );
    element.append(boutons);
    return element;
  }

  // Enregistre une piste en .wav dans les téléchargements
  async function telecharger(fiche, piste, nom) {
    afficherMessage(message, "Préparation du fichier…", "info");
    const fichier = await pisteEnWav(fiche.id, piste);
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(fichier);
    lien.download = nomDeFichier(`${fiche.titre} - ${nom}`, "wav");
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
    afficherMessage(message, `✓ Fichier enregistré dans vos téléchargements (${formaterTaille(fichier.size)}).`, "succes");
  }

  function creerBouton(texte, description, action, principal = false) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = principal ? "bouton bouton--petit bouton--principal" : "bouton bouton--petit";
    bouton.textContent = texte;
    bouton.setAttribute("aria-label", description);
    bouton.disabled = !actif;
    bouton.addEventListener("click", () => {
      cacherMessage(message);
      action().catch((erreur) => {
        console.error(erreur);
        afficherMessage(message, "L'opération n'a pas pu être faite. Réessayez.", "erreur");
      });
    });
    return bouton;
  }

  return {
    rafraichir,
    // Grise les boutons pendant une capture ou une transcription
    activer(etat) {
      actif = etat;
      liste.querySelectorAll("button").forEach((b) => (b.disabled = !etat));
    },
  };
}
