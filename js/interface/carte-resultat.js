// ==========================================================
// Carte « Résultat » : texte horodaté, boutons Copier,
// Télécharger (.txt) et Effacer. Si les intervenants ont été reconnus,
// le texte est présenté par blocs : un bloc par prise de parole.
// ==========================================================

import { LANGUES, QUALITES } from "../config.js";
import { formaterHorodatage, formaterDuree, formaterDate, nomDeFichier } from "../outils/format.js";
import { afficherMessage, cacherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

export function creerCarteResultat() {
  const carte = $("carte-resultat");
  const titre = $("resultat-titre");
  const infos = $("resultat-infos");
  const zoneTexte = $("resultat-texte");
  const boutonCopier = $("bouton-copier");
  const boutonTelecharger = $("bouton-telecharger-txt");
  const boutonEffacer = $("bouton-effacer");
  const message = $("resultat-message");

  let transcriptionAffichee = null;

  boutonCopier.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(enTexteBrut(transcriptionAffichee, false));
      afficherMessage(message, "✓ Texte copié. Vous pouvez le coller où vous voulez.", "succes");
    } catch {
      afficherMessage(message, "La copie n'a pas fonctionné. Sélectionnez le texte à la main.", "erreur");
    }
  });

  boutonTelecharger.addEventListener("click", () => {
    const contenu = enTexteBrut(transcriptionAffichee, true);
    const fichier = new Blob([contenu], { type: "text/plain;charset=utf-8" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(fichier);
    lien.download = nomDeFichier(transcriptionAffichee.titre, "txt");
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
    afficherMessage(message, "✓ Fichier enregistré dans vos téléchargements.", "succes");
  });

  boutonEffacer.addEventListener("click", () => {
    const etaitEnregistree = transcriptionAffichee?.id !== undefined;
    effacer();
    if (etaitEnregistree) {
      // Le message de la carte disparaît avec elle : on prévient via l'historique
      afficherMessage(
        $("historique-message"),
        "Le texte a été retiré de l'écran. Il reste disponible dans l'historique.",
        "info"
      );
    }
  });

  function effacer() {
    transcriptionAffichee = null;
    zoneTexte.replaceChildren();
    carte.hidden = true;
  }

  return {
    /**
     * Affiche une transcription (en cours ou terminée)
     * @param {object} transcription voir js/stockage/historique.js
     * @param {{enCours?: boolean}} options
     */
    afficher(transcription, { enCours = false } = {}) {
      transcriptionAffichee = transcription;
      carte.hidden = false;
      titre.textContent = transcription.titre;
      infos.textContent = decrire(transcription) + (enCours ? " · transcription en cours…" : "");

      // Une ligne par phrase : [00:12] Texte de la phrase
      const lignes = avecIntervenants(transcription)
        ? creerBlocs(transcription)
        : transcription.phrases.map(creerLigne);
      if (lignes.length === 0) {
        const vide = document.createElement("p");
        vide.className = "note";
        vide.textContent = enCours ? "Le texte apparaîtra ici au fur et à mesure…" : "Aucune parole détectée.";
        lignes.push(vide);
      }
      zoneTexte.replaceChildren(...lignes);

      const desactive = enCours || transcription.phrases.length === 0;
      boutonCopier.disabled = desactive;
      boutonTelecharger.disabled = desactive;
      boutonEffacer.disabled = enCours;
      cacherMessage(message);
    },

    // Fait défiler l'écran jusqu'au résultat
    montrer() {
      // Défilement doux, sauf si le téléphone demande de réduire les animations
      const reduire = matchMedia("(prefers-reduced-motion: reduce)").matches;
      carte.scrollIntoView({ behavior: reduire ? "auto" : "smooth", block: "start" });
    },

    // Numéro dans l'historique de la transcription affichée
    get idAffiche() {
      return transcriptionAffichee?.id;
    },

    effacer,
  };
}

// Les intervenants ont-ils été reconnus pour cette transcription ?
function avecIntervenants(t) {
  return Array.isArray(t.intervenants) && t.intervenants.length > 0;
}

// Nom affiché d'un intervenant (« Intervenant 1 » par défaut)
export function nomIntervenant(t, numero) {
  return t.intervenants?.[numero]?.nom || `Intervenant ${numero + 1}`;
}

// Une phrase : [00:12] Texte
function creerLigne(phrase) {
  const ligne = document.createElement("p");
  const heure = document.createElement("time");
  heure.textContent = formaterHorodatage(phrase.debut);
  ligne.append(heure, " ", phrase.texte);
  return ligne;
}

// Regroupe les phrases consécutives d'un même intervenant dans un bloc.
// Chaque bloc a une couleur ET le nom écrit (pour ne pas dépendre de la couleur seule).
function creerBlocs(t) {
  const blocs = [];
  let courant = null;
  for (const phrase of t.phrases) {
    if (!courant || courant.intervenant !== phrase.intervenant) {
      const bloc = document.createElement("div");
      bloc.className = "bloc-voix";
      bloc.style.setProperty("--couleur-voix", `var(--voix-${(phrase.intervenant ?? 0) % 6})`);
      const nom = document.createElement("p");
      nom.className = "bloc-voix__nom";
      const pastille = document.createElement("span");
      pastille.className = "pastille";
      pastille.setAttribute("aria-hidden", "true");
      nom.append(pastille, nomIntervenant(t, phrase.intervenant ?? 0));
      bloc.append(nom);
      blocs.push(bloc);
      courant = { intervenant: phrase.intervenant, bloc };
    }
    courant.bloc.append(creerLigne(phrase));
  }
  return blocs;
}

// Ligne d'informations : date · durée · langue · qualité · intervenants
function decrire(t) {
  const langue = LANGUES.find((l) => l.code === t.langue)?.nom ?? t.langue;
  const parties = [formaterDate(t.creeLe), formaterDuree(t.duree), langue];
  if (QUALITES[t.qualite]) parties.push(`qualité ${QUALITES[t.qualite].nom}`);
  if (avecIntervenants(t)) {
    const n = t.intervenants.length;
    parties.push(`${n} intervenant${n > 1 ? "s" : ""}`);
  }
  if (t.interrompue) parties.push("interrompue");
  return parties.join(" · ");
}

// Version texte simple (pour copier ou télécharger)
function enTexteBrut(transcription, avecEntete) {
  const voix = avecIntervenants(transcription);
  const lignes = transcription.phrases.map((p) =>
    voix
      ? `[${formaterHorodatage(p.debut)}] ${nomIntervenant(transcription, p.intervenant ?? 0)} : ${p.texte}`
      : `[${formaterHorodatage(p.debut)}] ${p.texte}`
  );
  if (!avecEntete) return lignes.join("\n");
  return [transcription.titre, decrire(transcription), "", ...lignes, ""].join("\n");
}
