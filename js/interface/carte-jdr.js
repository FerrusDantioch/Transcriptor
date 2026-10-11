// ==========================================================
// Carte « Mode JDR » :
//   1. « Importer l'enregistrement d'une partie » (renvoie vers l'import) ;
//   2. « Capturer une session en direct (ordinateur) » : mon micro sur
//      une piste, le son de Discord (les autres joueurs) sur une autre.
// ==========================================================

import { FREQUENCE_AUDIO } from "../config.js";
import { verifierCompatibilite } from "../capture/compatibilite.js";
import {
  SessionCapture,
  demanderPartage,
  demanderMicro,
  arreterFlux,
  OCTETS_PAR_SECONDE,
} from "../capture/session-capture.js";
import { demanderConsentement } from "./fenetre-consentement.js";
import { formaterHorodatage, formaterTaille, formaterDate, formaterDuree } from "../outils/format.js";
import { texteErreur, afficherMessage, cacherMessage } from "./messages.js";

const $ = (id) => document.getElementById(id);

const SILENCE_ALERTE = 30; // secondes sans aucun son avant de prévenir

// Étapes à suivre, selon l'endroit où Discord est ouvert
const ETAPES = {
  application: [
    "Mettez votre casque et rejoignez le salon vocal dans l'application Discord.",
    "Appuyez sur « Démarrer la capture » et lisez le rappel de consentement.",
    "Dans la fenêtre de partage de Chrome : choisissez « Écran entier », cliquez sur l'écran, " +
      "cochez la case « Partager aussi l'audio du système » (en bas), puis « Partager ».",
    "Vérifiez que les deux indicateurs bougent quand vous parlez et quand les autres parlent.",
  ],
  onglet: [
    "Mettez votre casque et rejoignez le salon vocal dans l'onglet Discord.",
    "Appuyez sur « Démarrer la capture » et lisez le rappel de consentement.",
    "Dans la fenêtre de partage de Chrome : choisissez l'onglet Discord, laissez cochée la case " +
      "« Partager aussi l'audio de l'onglet », puis « Partager ».",
    "Vérifiez que les deux indicateurs bougent quand vous parlez et quand les autres parlent.",
  ],
};

/**
 * @param {object} options
 * @param {object} options.reglages réglages actuels (nomJoueur, nombreAutres, sourceDiscord)
 * @param {(modifications:object) => void} options.surReglage
 * @param {() => void} options.surImporter      « Importer l'enregistrement d'une partie »
 * @param {() => void} options.surDebutCapture  une capture commence (l'appli est occupée)
 * @param {(fiche:object|null) => void} options.surFinCapture  la capture est terminée
 */
export function creerCarteJdr({ reglages, surReglage, surImporter, surDebutCapture, surFinCapture }) {
  const boutonImporter = $("bouton-jdr-importer");
  const boutonCapturer = $("bouton-jdr-capturer");
  const zoneCapture = $("zone-capture");
  const zoneIncompatible = $("capture-incompatible");
  const zonePreparation = $("capture-preparation");
  const zoneEnCours = $("capture-en-cours");
  const champNom = $("capture-nom");
  const choixAutres = $("capture-autres");
  const choixSource = $("capture-source");
  const etapes = $("capture-etapes");
  const espace = $("capture-espace");
  const boutonDemarrer = $("bouton-capture-demarrer");
  const chrono = $("capture-chrono");
  const niveaux = { micro: $("niveau-micro"), autres: $("niveau-autres") };
  const etatsNiveaux = { micro: $("niveau-micro-etat"), autres: $("niveau-autres-etat") };
  const taille = $("capture-taille");
  const alerte = $("capture-alerte");
  const boutonsReprendre = { autres: $("bouton-reprendre-partage"), micro: $("bouton-reprendre-micro") };
  const boutonArreter = $("bouton-capture-arreter");
  const message = $("capture-message");

  const compatibilite = verifierCompatibilite();
  let session = null;
  const coupures = { micro: false, autres: false };

  // ----- Réglages mémorisés -----
  champNom.value = reglages.nomJoueur;
  choixAutres.value = reglages.nombreAutres;
  choixSource.value = reglages.sourceDiscord;
  champNom.addEventListener("change", () => {
    const nom = champNom.value.replace(/\s+/g, " ").trim().slice(0, 40) || "Moi";
    champNom.value = nom;
    surReglage({ nomJoueur: nom });
  });
  choixAutres.addEventListener("change", () => surReglage({ nombreAutres: choixAutres.value }));
  choixSource.addEventListener("change", () => {
    surReglage({ sourceDiscord: choixSource.value });
    afficherEtapes();
  });

  function afficherEtapes() {
    etapes.replaceChildren(
      ...ETAPES[choixSource.value].map((texte) => {
        const li = document.createElement("li");
        li.textContent = texte;
        return li;
      })
    );
  }

  // ----- Les deux choix du Mode JDR -----
  boutonImporter.addEventListener("click", () => surImporter());
  $("bouton-capture-importer").addEventListener("click", () => surImporter());

  boutonCapturer.addEventListener("click", () => {
    const ouvrir = zoneCapture.hidden;
    zoneCapture.hidden = !ouvrir;
    boutonCapturer.setAttribute("aria-expanded", String(ouvrir));
    if (ouvrir) preparer();
  });

  function preparer() {
    cacherMessage(message);
    if (!compatibilite.possible) {
      zoneIncompatible.hidden = false;
      zonePreparation.hidden = true;
      $("capture-incompatible-texte").textContent =
        compatibilite.raison === "telephone"
          ? "Sur téléphone ou tablette, la capture en direct est impossible : Android ne permet pas " +
            "à une page web (ni même à une application) d'écouter le son de Discord. " +
            "Utilisez ce mode sur un ordinateur, avec Chrome ou Edge. Sur le téléphone, vous pouvez " +
            "transcrire l'enregistrement d'une partie (fichier audio) avec la reconnaissance des intervenants."
          : "Ce navigateur ne permet pas de capter le son de l'ordinateur. " +
            "Utilisez Google Chrome ou Microsoft Edge sur ordinateur.";
      return;
    }
    zoneIncompatible.hidden = true;
    zonePreparation.hidden = Boolean(session);
    zoneEnCours.hidden = !session;
    afficherEtapes();

    // Navigateurs qui ne savent pas capter le son du système
    const avertissement = $("capture-avertissement");
    if (!compatibilite.chromium) {
      afficherMessage(avertissement, "Ce navigateur ne sait sans doute pas capter le son de l'ordinateur : utilisez de préférence Chrome ou Edge.", "erreur");
    } else if (compatibilite.mac) {
      afficherMessage(avertissement, "Sur Mac, seul le son d'un onglet est sûr d'être capté : ouvrez Discord dans Chrome (discord.com/app) et choisissez « dans un onglet ».", "erreur");
    } else {
      cacherMessage(avertissement);
    }
    afficherEspace();
  }

  // Espace libre pour l'application → durée de capture possible
  async function afficherEspace() {
    try {
      const { quota, usage } = await navigator.storage.estimate();
      const libre = quota - usage;
      const heures = libre / OCTETS_PAR_SECONDE / 3600;
      const possible = heures >= 10 ? "plus de 10 h" : `environ ${formaterDuree(heures * 3600)}`;
      espace.textContent =
        `Espace disponible : ${possible} de capture (une heure occupe environ ${formaterTaille(OCTETS_PAR_SECONDE * 3600)}).`;
      espace.dataset.peu = heures < 3 ? "oui" : "non";
    } catch {
      espace.textContent = "Une heure de capture occupe environ 230 Mo sur l'ordinateur.";
    }
  }

  // ----- Démarrer -----
  boutonDemarrer.addEventListener("click", async () => {
    cacherMessage(message);
    if (!(await demanderConsentement())) {
      afficherMessage(message, "Capture annulée. Elle ne démarre qu'après le rappel de consentement.", "info");
      return;
    }
    boutonDemarrer.disabled = true;
    let partage = null;
    let micro = null;
    try {
      // Le partage d'écran d'abord : le navigateur l'exige juste après un clic
      partage = await demanderPartage(choixSource.value);
      micro = await demanderMicro();
      session = new SessionCapture({ surMiseAJour, surCoupure, surErreur });
      const nomJoueur = champNom.value.trim() || "Moi";
      await session.demarrer({
        micro,
        partage,
        fiche: {
          titre: `Partie du ${formaterDate(Date.now())}`,
          nomJoueur,
          nombreAutres: choixAutres.value,
          source: choixSource.value,
          consentementLe: Date.now(),
        },
      });
      $("niveau-micro-nom").textContent = nomJoueur;
    } catch (erreur) {
      console.error(erreur);
      arreterFlux(partage);
      arreterFlux(micro);
      session = null;
      boutonDemarrer.disabled = false;
      afficherMessage(message, texteErreur(erreur.code ?? "inconnue"), "erreur");
      return;
    }
    coupures.micro = coupures.autres = false;
    afficherCoupures();
    chrono.textContent = "00:00";
    zonePreparation.hidden = true;
    zoneEnCours.hidden = false;
    boutonArreter.disabled = false;
    boutonDemarrer.disabled = false;
    surDebutCapture();
  });

  // ----- Pendant la capture -----
  function surMiseAJour({ duree, niveaux: pics, silences, octets }) {
    chrono.textContent = formaterHorodatage(duree);
    taille.textContent = `Espace utilisé : ${formaterTaille(octets)}`;
    ["micro", "autres"].forEach((piste, p) => {
      niveaux[piste].value = enPourcentage(pics[p]);
      const s = silences[p];
      etatsNiveaux[piste].textContent = coupures[piste]
        ? "⛔ Source coupée"
        : s < 2
          ? "✓ Son capté"
          : s < SILENCE_ALERTE
            ? "Silence"
            : `⚠️ Aucun son depuis ${formaterDuree(s)}`;
    });
    afficherAlerteSilence(silences);
  }

  // Prévient si une piste reste muette longtemps (sans alarmer : c'est souvent normal)
  function afficherAlerteSilence([silenceMicro, silenceAutres]) {
    if (coupures.micro || coupures.autres) return; // l'alerte de coupure est prioritaire
    if (silenceAutres >= SILENCE_ALERTE) {
      afficherMessage(
        alerte,
        `Aucun son des autres joueurs depuis ${formaterDuree(silenceAutres)}. C'est normal si personne ne parle. ` +
          "Sinon : dans Discord, la sortie doit être « Default » (par défaut) ; dans Windows, la sortie par défaut " +
          "doit être votre casque ; et la case « audio du système » devait être cochée (sinon : arrêtez et recommencez).",
        "info"
      );
    } else if (silenceMicro >= SILENCE_ALERTE) {
      afficherMessage(
        alerte,
        `Votre micro ne capte rien depuis ${formaterDuree(silenceMicro)}. C'est normal si vous ne parlez pas. ` +
          "Sinon : vérifiez qu'il n'est pas coupé (bouton du casque) et que c'est bien le micro par défaut de Windows.",
        "info"
      );
    } else {
      cacherMessage(alerte);
    }
  }

  // Une source s'est arrêtée (bouton « Arrêter le partage » de Chrome, casque débranché…)
  function surCoupure(piste) {
    coupures[piste] = true;
    afficherCoupures();
  }

  function afficherCoupures() {
    boutonsReprendre.autres.hidden = !coupures.autres;
    boutonsReprendre.micro.hidden = !coupures.micro;
    if (coupures.autres) {
      afficherMessage(
        alerte,
        "Le partage du son a été arrêté (bouton « Arrêter le partage » de Chrome ?). La capture continue, " +
          "mais sans les autres joueurs. Appuyez sur « Reprendre le partage du son ».",
        "erreur"
      );
    } else if (coupures.micro) {
      afficherMessage(
        alerte,
        "Votre micro ne répond plus (casque débranché ?). La capture continue sans votre voix. " +
          "Rebranchez-le puis appuyez sur « Reprendre le micro ».",
        "erreur"
      );
    } else {
      cacherMessage(alerte);
    }
  }

  boutonsReprendre.autres.addEventListener("click", async () => {
    try {
      session.reprendre("autres", await demanderPartage(choixSource.value));
      coupures.autres = false;
      afficherCoupures();
    } catch (erreur) {
      afficherMessage(alerte, texteErreur(erreur.code ?? "inconnue"), "erreur");
    }
  });

  boutonsReprendre.micro.addEventListener("click", async () => {
    try {
      session.reprendre("micro", await demanderMicro());
      coupures.micro = false;
      afficherCoupures();
    } catch (erreur) {
      afficherMessage(alerte, texteErreur(erreur.code ?? "inconnue"), "erreur");
    }
  });

  // La sauvegarde a échoué (plus d'espace…) : on arrête proprement
  function surErreur(code) {
    terminer(
      `La capture a dû s'arrêter : ${texteErreur(code)} Ce qui a été enregistré jusque-là est conservé.`,
      "erreur"
    );
  }

  // ----- Arrêter -----
  boutonArreter.addEventListener("click", () => {
    if (!confirm("Arrêter la capture ? L'enregistrement sera gardé sur cet ordinateur.")) return;
    terminer();
  });

  async function terminer(texte, type) {
    if (!session) return;
    boutonArreter.disabled = true;
    const enCours = session;
    session = null;
    const fiche = await enCours.arreter();
    zoneEnCours.hidden = true;
    zonePreparation.hidden = false;
    afficherEspace();
    const duree = fiche ? formaterDuree(fiche.echantillons / FREQUENCE_AUDIO) : "";
    afficherMessage(
      message,
      texte ?? `✓ Capture enregistrée (${duree}). Elle apparaît ci-dessous : vous pouvez la transcrire maintenant ou plus tard.`,
      type ?? "succes"
    );
    surFinCapture(fiche);
  }

  return {
    get enCours() {
      return Boolean(session);
    },
    // Grise les boutons pendant une transcription
    activer(actif) {
      boutonImporter.disabled = !actif;
      boutonDemarrer.disabled = !actif;
    },
  };
}

// Niveau sonore (0 à 1) → pourcentage de la barre, sur une échelle en décibels
// (-50 dB = barre vide, 0 dB = barre pleine), plus proche de ce que l'oreille perçoit
function enPourcentage(pic) {
  if (pic <= 0) return 0;
  const decibels = 20 * Math.log10(pic);
  return Math.max(0, Math.min(100, ((decibels + 50) / 50) * 100));
}
