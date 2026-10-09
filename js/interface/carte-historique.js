// ==========================================================
// Carte « Historique » : liste des transcriptions enregistrées,
// avec Ouvrir / Renommer / Supprimer.
// ==========================================================

import {
  listerTranscriptions,
  lireTranscription,
  renommerTranscription,
  supprimerTranscription,
} from "../stockage/historique.js";
import { formaterDate, formaterDuree } from "../outils/format.js";
import { afficherMessage, cacherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

export function creerCarteHistorique({ surOuvrir, surSuppression }) {
  const liste = $("historique-liste");
  const vide = $("historique-vide");
  const message = $("historique-message");

  async function rafraichir() {
    let transcriptions = [];
    try {
      transcriptions = await listerTranscriptions();
    } catch (erreur) {
      console.error(erreur);
      afficherMessage(message, "L'historique n'a pas pu être lu sur cet appareil.", "erreur");
    }
    vide.hidden = transcriptions.length > 0;
    liste.replaceChildren(...transcriptions.map(creerElement));
  }

  function creerElement(t) {
    const element = document.createElement("li");
    element.className = "element-historique";

    const titre = document.createElement("p");
    titre.className = "element-historique__titre";
    titre.textContent = t.titre;

    const details = document.createElement("p");
    details.className = "petit";
    const nbPhrases = t.phrases.length;
    details.textContent =
      `${formaterDate(t.creeLe)} · ${formaterDuree(t.duree)} · ` +
      `${nbPhrases} phrase${nbPhrases > 1 ? "s" : ""}`;

    const boutons = document.createElement("div");
    boutons.className = "boutons boutons--ligne";
    boutons.append(
      creerBouton("Ouvrir", `Ouvrir « ${t.titre} »`, async () => {
        cacherMessage(message);
        const complete = await lireTranscription(t.id);
        if (complete) surOuvrir(complete);
      }),
      creerBouton("Renommer", `Renommer « ${t.titre} »`, async () => {
        const nouveau = prompt("Nouveau nom :", t.titre);
        if (nouveau === null || !nouveau.trim()) return; // annulé
        await renommerTranscription(t.id, nouveau.trim());
        await rafraichir();
        afficherMessage(message, "✓ Transcription renommée.", "succes");
      }),
      creerBouton("Supprimer", `Supprimer « ${t.titre} »`, async () => {
        if (!confirm(`Supprimer définitivement « ${t.titre} » ?`)) return;
        await supprimerTranscription(t.id);
        surSuppression(t.id);
        await rafraichir();
        afficherMessage(message, "Transcription supprimée.", "info");
      })
    );

    element.append(titre, details, boutons);
    return element;
  }

  function creerBouton(texte, description, action) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "bouton bouton--petit";
    bouton.textContent = texte;
    bouton.setAttribute("aria-label", description);
    bouton.addEventListener("click", () => {
      action().catch((erreur) => {
        console.error(erreur);
        afficherMessage(message, "L'opération n'a pas pu être faite. Réessayez.", "erreur");
      });
    });
    return bouton;
  }

  return { rafraichir };
}
