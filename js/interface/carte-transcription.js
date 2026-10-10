// ==========================================================
// Carte « Nouvelle transcription » : choix de la langue,
// boutons micro / fichier, chronomètre et avancement.
// ==========================================================

import { LANGUES } from "../config.js";
import { formaterHorodatage, formaterDuree } from "../outils/format.js";
import { texteErreur, afficherMessage, cacherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

export function creerCarteTranscription({
  langueInitiale,
  surChangementLangue,
  surMicro,
  surFichier,
  surArreterEnregistrement,
  surAnnulerEnregistrement,
  surArreterTranscription,
}) {
  const zoneDepart = $("zone-depart");
  const zoneEnregistrement = $("zone-enregistrement");
  const zoneTraitement = $("zone-traitement");
  const choixLangue = $("choix-langue");
  const boutonMicro = $("bouton-micro");
  const boutonFichier = $("bouton-fichier");
  const champFichier = $("champ-fichier");
  const aide = $("aide-transcription");
  const chrono = $("chrono");
  const traitementTexte = $("traitement-texte");
  const traitementBarre = $("traitement-barre");
  const traitementDetail = $("traitement-detail");
  const boutonArreterTranscription = $("bouton-arreter-transcription");
  const message = $("transcription-message");

  // Remplit la liste des langues
  for (const langue of LANGUES) {
    choixLangue.add(new Option(langue.nom, langue.code));
  }
  choixLangue.value = langueInitiale;
  choixLangue.addEventListener("change", () => surChangementLangue(choixLangue.value));

  boutonMicro.addEventListener("click", () => surMicro());
  boutonFichier.addEventListener("click", () => champFichier.click());
  champFichier.addEventListener("change", () => {
    const fichier = champFichier.files[0];
    champFichier.value = ""; // permet de rechoisir le même fichier ensuite
    if (fichier) surFichier(fichier);
  });
  $("bouton-arreter-enregistrement").addEventListener("click", () => surArreterEnregistrement());
  $("bouton-annuler-enregistrement").addEventListener("click", () => surAnnulerEnregistrement());
  boutonArreterTranscription.addEventListener("click", () => {
    boutonArreterTranscription.disabled = true;
    traitementDetail.textContent = "Arrêt après le morceau en cours…";
    surArreterTranscription();
  });

  function montrer(zone) {
    zoneDepart.hidden = zone !== "depart";
    zoneEnregistrement.hidden = zone !== "enregistrement";
    zoneTraitement.hidden = zone !== "traitement";
  }

  return {
    get langue() {
      return choixLangue.value;
    },

    // Active ou désactive les boutons selon que le modèle est prêt
    activer(pret) {
      boutonMicro.disabled = !pret;
      boutonFichier.disabled = !pret;
      aide.hidden = pret;
    },

    afficherDepart() {
      montrer("depart");
    },

    afficherEnregistrement() {
      cacherMessage(message);
      chrono.textContent = "00:00";
      montrer("enregistrement");
    },

    majChrono(secondes) {
      chrono.textContent = formaterHorodatage(secondes);
    },

    afficherLecture() {
      cacherMessage(message);
      montrer("traitement");
      traitementTexte.textContent = "Lecture de l'audio…";
      traitementBarre.removeAttribute("value");
      traitementDetail.textContent = "";
      boutonArreterTranscription.hidden = true;
    },

    // Le modèle se charge encore en mémoire
    afficherPreparation() {
      traitementTexte.textContent = "Préparation du modèle… (quelques secondes, parfois plus)";
      traitementBarre.removeAttribute("value");
      traitementDetail.textContent = "";
    },

    // Téléchargement des modèles de voix pendant un traitement
    afficherTelechargementVoix(recu, total) {
      traitementTexte.textContent = "Téléchargement des modèles des voix (une seule fois)…";
      traitementBarre.value = total > 0 ? Math.min(100, Math.floor((recu / total) * 100)) : 0;
      traitementDetail.textContent = "";
    },

    // Reconnaissance des intervenants : fenêtre « numero » sur « total »
    majDiarisation(numero, total) {
      traitementTexte.textContent = "Reconnaissance des intervenants…";
      traitementBarre.value = total > 0 ? Math.round((numero / total) * 100) : 0;
      if (!boutonArreterTranscription.disabled) {
        traitementDetail.textContent = total > 0 ? `Analyse des voix : ${Math.round((numero / total) * 100)} %` : "";
      }
    },

    majAvancement(numero, total, resteEstime) {
      boutonArreterTranscription.hidden = false;
      if (numero === 0) boutonArreterTranscription.disabled = false;
      traitementTexte.textContent = "Transcription en cours…";
      traitementBarre.value = total > 0 ? Math.round((numero / total) * 100) : 0;
      let texte = `Morceau ${numero} sur ${total}`;
      if (numero === 0) texte = `${total} morceau${total > 1 ? "x" : ""} à traiter`;
      if (resteEstime !== null && numero < total) texte += ` · encore environ ${formaterDuree(resteEstime)}`;
      if (!boutonArreterTranscription.disabled) traitementDetail.textContent = texte;
    },

    afficherErreur(code) {
      montrer("depart");
      afficherMessage(message, texteErreur(code), "erreur");
    },

    afficherInfo(texte) {
      montrer("depart");
      afficherMessage(message, texte, "info");
    },

    cacherMessage() {
      cacherMessage(message);
    },
  };
}
