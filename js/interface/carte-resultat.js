// ==========================================================
// Carte « Résultat » : texte horodaté, boutons Copier,
// Télécharger (.txt) et Effacer. Si les intervenants ont été reconnus,
// le texte est présenté par blocs : un bloc par prise de parole, et
// on peut renommer les intervenants ou corriger qui parle.
// ==========================================================

import { LANGUES, QUALITES } from "../config.js";
import { formaterHorodatage, formaterDuree, formaterDate, nomDeFichier } from "../outils/format.js";
import { afficherMessage, cacherMessage } from "./messages.js";
import {
  nomIntervenant,
  couleurIntervenant,
  creerPastille,
  creerLegende,
  creerLigneCorrigible,
  demanderNom,
  changerIntervenant,
} from "./edition-intervenants.js";

const $ = (id) => document.getElementById(id);

/**
 * @param {object} options
 * @param {(transcription:object) => Promise<void>} options.surModification
 *        appelée après un renommage ou une correction (pour l'enregistrer)
 */
export function creerCarteResultat({ surModification }) {
  const carte = $("carte-resultat");
  const titre = $("resultat-titre");
  const infos = $("resultat-infos");
  const zoneIntervenants = $("resultat-intervenants");
  const zoneTexte = $("resultat-texte");
  const boutonCopier = $("bouton-copier");
  const boutonTelecharger = $("bouton-telecharger-txt");
  const boutonEffacer = $("bouton-effacer");
  const message = $("resultat-message");

  let transcriptionAffichee = null;
  let enCorrection = false; // mode « Corriger qui parle »

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
    enCorrection = false;
    zoneTexte.replaceChildren();
    zoneIntervenants.replaceChildren();
    carte.hidden = true;
  }

  /**
   * Affiche une transcription (en cours ou terminée)
   * @param {object} transcription voir js/stockage/historique.js
   * @param {{enCours?: boolean}} options
   */
  function afficher(transcription, { enCours = false } = {}) {
    if (transcription !== transcriptionAffichee) enCorrection = false;
    transcriptionAffichee = transcription;
    carte.hidden = false;
    titre.textContent = transcription.titre;
    infos.textContent = decrire(transcription) + (enCours ? " · transcription en cours…" : "");

    // Liste des intervenants (renommer, corriger) : seulement une fois le texte terminé
    const modifiable = avecIntervenants(transcription) && !enCours;
    zoneIntervenants.hidden = !modifiable;
    zoneIntervenants.replaceChildren(
      ...(modifiable ? [creerLegende(transcription, { enCorrection, surRenommer: renommer, surBasculerCorrection: basculerCorrection })] : [])
    );

    // Une ligne par phrase : [00:12] Texte de la phrase
    let lignes;
    if (modifiable && enCorrection) {
      lignes = transcription.phrases.map((p) => creerLigneCorrigible(transcription, p, (choix) => corriger(p, choix)));
    } else if (avecIntervenants(transcription)) {
      lignes = creerBlocs(transcription);
    } else {
      lignes = transcription.phrases.map(creerLigne);
    }
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
  }

  // Renomme un intervenant : le nom change partout (il n'est rangé qu'à un endroit)
  async function renommer(numero) {
    const t = transcriptionAffichee;
    const nouveau = demanderNom(nomIntervenant(t, numero));
    if (!nouveau) return;
    t.intervenants[numero] = { ...t.intervenants[numero], nom: nouveau };
    afficher(t);
    await enregistrer("✓ Nom changé partout dans ce texte.");
  }

  function basculerCorrection() {
    enCorrection = !enCorrection;
    afficher(transcriptionAffichee);
    if (!enCorrection) afficherMessage(message, "✓ Corrections terminées.", "succes");
  }

  // Attribue une phrase à un autre intervenant
  async function corriger(phrase, choix) {
    const t = transcriptionAffichee;
    // On garde la position de l'écran : la liste est redessinée
    const defilement = zoneTexte.scrollTop;
    changerIntervenant(t, phrase, choix);
    afficher(t);
    zoneTexte.scrollTop = defilement;
    await enregistrer(`✓ Phrase attribuée à « ${nomIntervenant(t, phrase.intervenant)} ».`);
  }

  // Enregistre la modification dans l'historique et prévient l'utilisateur
  async function enregistrer(texteSucces) {
    try {
      await surModification(transcriptionAffichee);
      afficherMessage(message, texteSucces, "succes");
    } catch (erreur) {
      console.error(erreur);
      afficherMessage(message, "Le changement est affiché mais n'a pas pu être enregistré dans l'historique.", "erreur");
    }
  }

  return {
    afficher,

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
      bloc.style.setProperty("--couleur-voix", couleurIntervenant(phrase.intervenant));
      const nom = document.createElement("p");
      nom.className = "bloc-voix__nom";
      nom.append(creerPastille(), nomIntervenant(t, phrase.intervenant ?? 0));
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
    // On ne compte que les intervenants qui ont au moins une phrase
    const n = new Set(t.phrases.map((p) => p.intervenant ?? 0)).size;
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
