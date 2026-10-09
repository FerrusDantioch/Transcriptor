// ==========================================================
// Section « Réglages » : qualité, moteur de calcul, stockage.
// ==========================================================

import { QUALITES, MOTEURS } from "../config.js";
import { formaterTaille } from "../outils/format.js";
import { afficherMessage, cacherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

export function creerReglages({ reglages, surChangement, surSupprimerModeles }) {
  const message = $("reglages-message");

  remplirChoix(
    $("choix-qualite"),
    "qualite",
    Object.entries(QUALITES).map(([cle, q]) => ({
      valeur: cle,
      titre: `${q.nom} — environ ${q.tailleMo} Mo`,
      description: q.description,
    })),
    reglages.qualite,
    (valeur) => surChangement({ qualite: valeur })
  );

  remplirChoix(
    $("choix-moteur"),
    "moteur",
    Object.entries(MOTEURS).map(([cle, m]) => ({ valeur: cle, titre: m.nom, description: m.description })),
    reglages.moteur,
    (valeur) => surChangement({ moteur: valeur })
  );

  $("bouton-supprimer-modeles").addEventListener("click", async () => {
    const ok = confirm(
      "Supprimer les modèles téléchargés ? Il faudra les retélécharger (avec internet) pour transcrire. " +
        "L'historique des transcriptions est conservé."
    );
    if (!ok) return;
    await surSupprimerModeles();
    afficherMessage(message, "✓ Modèles supprimés.", "succes");
    afficherStockage();
  });

  // Ouvrir les réglages = mettre à jour l'espace utilisé
  $("reglages").addEventListener("toggle", (e) => {
    if (e.target.open) {
      cacherMessage(message);
      afficherStockage();
    }
  });

  async function afficherStockage() {
    const info = $("stockage-info");
    if (!navigator.storage?.estimate) {
      info.textContent = "L'espace utilisé n'est pas connu sur ce navigateur.";
      return;
    }
    const { usage } = await navigator.storage.estimate();
    const protege = await navigator.storage.persisted?.();
    info.textContent =
      `Espace utilisé par l'application : ${formaterTaille(usage)}.` +
      (protege ? " Les données sont protégées contre l'effacement automatique." : "");
  }

  return {
    // Grise les choix pendant un traitement
    activer(actif) {
      for (const champ of document.querySelectorAll("#reglages input, #bouton-supprimer-modeles")) {
        champ.disabled = !actif;
      }
    },
  };
}

// Crée une liste de boutons radio (un seul choix possible)
function remplirChoix(conteneur, nom, options, valeurActuelle, surChoix) {
  for (const option of options) {
    const id = `${nom}-${option.valeur}`;
    const ligne = document.createElement("div");
    ligne.className = "choix";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = nom;
    radio.id = id;
    radio.value = option.valeur;
    radio.checked = option.valeur === valeurActuelle;
    radio.addEventListener("change", () => surChoix(option.valeur));

    const etiquette = document.createElement("label");
    etiquette.htmlFor = id;
    const titre = document.createElement("strong");
    titre.textContent = option.titre;
    const description = document.createElement("span");
    description.className = "petit";
    description.textContent = option.description;
    etiquette.append(titre, description);

    ligne.append(radio, etiquette);
    conteneur.append(ligne);
  }
}
