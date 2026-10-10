// ==========================================================
// Point d'entrée de l'application.
// Ce fichier relie les différentes parties entre elles :
// l'interface (les « cartes »), le moteur de transcription,
// le micro et l'historique.
// ==========================================================

import { enregistrerServiceWorker } from "./pwa/register-service-worker.js";
import { preparerBoutonInstallation } from "./pwa/install-button.js";
import { QUALITES, nombreDeCoeurs } from "./config.js";
import { lireReglages, enregistrerReglages } from "./stockage/reglages.js";
import { ajouterTranscription } from "./stockage/historique.js";
import { MoteurTranscription } from "./transcription/client-moteur.js";
import { transcrireAudio } from "./transcription/transcrire-audio.js";
import { regrouperEnPhrases } from "./transcription/assemblage.js";
import { codeErreur } from "./transcription/erreurs.js";
import { effacerTousLesTelechargements } from "./transcription/telechargement-reprise.js";
import { decoderAudio } from "./audio/decoder-audio.js";
import { Enregistreur } from "./audio/enregistreur.js";
import { garderEcranAllume, laisserEcranSEteindre } from "./outils/anti-veille.js";
import { formaterDate } from "./outils/format.js";
import { creerCarteModele } from "./interface/carte-modele.js";
import { creerCarteTranscription } from "./interface/carte-transcription.js";
import { creerCarteResultat } from "./interface/carte-resultat.js";
import { creerCarteHistorique } from "./interface/carte-historique.js";
import { creerReglages } from "./interface/reglages.js";

// ---------------------------------------------------------------
// État de l'application
// ---------------------------------------------------------------
let reglages = lireReglages();
// absent | disponible (téléchargé mais pas en mémoire) | verification | telechargement
// | pause | connexion-perdue | chargement | pret (en mémoire) | erreur
let etatModele = "inconnu";
let progression = { recu: 0, total: 0 };
let occupe = false;          // vrai pendant un enregistrement ou une transcription
let demandeArret = false;    // l'utilisateur a demandé d'arrêter la transcription
let minuteurChrono = null;
const enregistreur = new Enregistreur();

// Le modèle chargé en mémoire est libéré après 5 minutes sans servir
const DELAI_LIBERATION = 5 * 60 * 1000; // millisecondes
let minuteurLiberation = null;

// Transcriptions qui attendent que le modèle soit prêt
let attentesModele = [];

// ---------------------------------------------------------------
// Mode hors ligne et installation
// ---------------------------------------------------------------
enregistrerServiceWorker({ estOccupe: () => occupe });
preparerBoutonInstallation();

// ---------------------------------------------------------------
// Moteur de transcription (Web Worker)
// ---------------------------------------------------------------
const moteur = new MoteurTranscription({
  surEtat(message) {
    if (message.type === "verification") {
      if (message.present) {
        // Déjà téléchargé : on ne le charge en mémoire qu'au moment de transcrire
        changerEtat("disponible");
        carteModele.afficherDisponible({ qualite: reglages.qualite });
      } else {
        changerEtat("absent");
        carteModele.afficherAbsent({
          qualite: reglages.qualite,
          device: message.device,
          dejaTelecharge: message.dejaTelecharge,
        });
      }
      return;
    }
    if (message.etat === "verification") {
      changerEtat("verification");
      carteModele.afficherVerification();
    } else if (message.etat === "chargement") {
      changerEtat("chargement");
      carteModele.afficherChargement();
    } else if (message.etat === "pret") {
      changerEtat("pret");
      carteModele.afficherPret({ qualite: reglages.qualite, device: message.device, coeurs: message.coeurs });
      programmerLiberation();
    }
  },

  surProgression(recu, total) {
    progression = { recu, total };
    changerEtat("telechargement");
    carteModele.afficherTelechargement(recu, total);
  },

  surErreur(code) {
    // Les transcriptions qui attendaient le modèle reçoivent l'erreur
    finirAttentes(code);
    if (code === "pause") {
      changerEtat("pause");
      carteModele.afficherPause(progression.recu, progression.total);
    } else if (code === "connexion") {
      changerEtat("connexion-perdue");
      carteModele.afficherConnexionPerdue(progression.recu, progression.total);
    } else {
      changerEtat("erreur");
      carteModele.afficherErreur(code);
    }
  },

  surInfo(code) {
    if (code === "repli-processeur") {
      carteModele.afficherInfo(
        "La carte graphique n'a pas fonctionné sur ce téléphone : le processeur est utilisé à la place."
      );
    }
  },
});

function qualiteChoisie() {
  return QUALITES[reglages.qualite];
}

function verifierModele() {
  changerEtat("verification");
  carteModele.afficherVerification();
  moteur.verifier(qualiteChoisie(), reglages.moteur);
}

function preparerModele() {
  // Demande au navigateur de ne pas effacer le modèle pour libérer de la place
  navigator.storage?.persist?.().catch(() => {});
  moteur.preparer(qualiteChoisie(), reglages.moteur, nombreDeCoeurs(reglages.vitesse));
}

// Charge le modèle en mémoire (si besoin) et attend qu'il soit prêt.
// Renvoie une promesse : réussie quand le modèle est prêt, en échec s'il y a une erreur.
function attendreModelePret() {
  if (etatModele === "pret") return Promise.resolve();
  if (!["verification", "telechargement", "chargement"].includes(etatModele)) preparerModele();
  return new Promise((resoudre, rejeter) => attentesModele.push({ resoudre, rejeter }));
}

// Prévient toutes les transcriptions en attente (code = undefined si tout va bien)
function finirAttentes(code) {
  const attentes = attentesModele;
  attentesModele = [];
  for (const { resoudre, rejeter } of attentes) {
    if (code) rejeter(Object.assign(new Error("Modèle indisponible"), { code }));
    else resoudre();
  }
}

// Après 5 minutes sans transcription, on libère la mémoire du téléphone
function programmerLiberation() {
  clearTimeout(minuteurLiberation);
  minuteurLiberation = setTimeout(() => {
    if (occupe || etatModele !== "pret") return;
    moteur.arreter(); // arrête le worker : toute sa mémoire est rendue au téléphone
    changerEtat("disponible");
    carteModele.afficherDisponible({ qualite: reglages.qualite, libere: true });
  }, DELAI_LIBERATION);
}

// Met à jour l'état et active / désactive ce qui doit l'être
function changerEtat(nouvelEtat) {
  etatModele = nouvelEtat;
  if (etatModele === "pret") finirAttentes();
  // On peut lancer une transcription dès que le modèle est sur l'appareil,
  // même s'il n'est pas encore en mémoire (il se chargera à ce moment-là)
  carteTranscription.activer(["pret", "disponible"].includes(etatModele) && !occupe);
  // On ne change pas de modèle en plein téléchargement ou chargement
  const reglagesModifiables = !occupe && !["verification", "telechargement", "chargement"].includes(etatModele);
  interfaceReglages.activer(reglagesModifiables);
}

// La connexion revient : on relance le téléchargement interrompu
window.addEventListener("online", () => {
  if (etatModele === "connexion-perdue") preparerModele();
  else if (etatModele === "absent") verifierModele();
});

// ---------------------------------------------------------------
// Les cartes de l'interface
// ---------------------------------------------------------------
const carteModele = creerCarteModele({
  surTelecharger: () => preparerModele(),
  surPause: () => moteur.pause(),
});

const carteTranscription = creerCarteTranscription({
  langueInitiale: reglages.langue,
  surChangementLangue: (langue) => {
    reglages = enregistrerReglages({ langue });
  },
  surMicro: demarrerEnregistrement,
  surFichier: (fichier) => {
    const titre = fichier.name.replace(/\.[^.]+$/, "") || "Fichier audio";
    traiterAudio(fichier, { titre, source: "fichier" });
  },
  surArreterEnregistrement: arreterEnregistrement,
  surAnnulerEnregistrement: annulerEnregistrement,
  surArreterTranscription: () => {
    demandeArret = true;
  },
});

const carteResultat = creerCarteResultat();

const carteHistorique = creerCarteHistorique({
  surOuvrir: (transcription) => {
    carteResultat.afficher(transcription);
    carteResultat.montrer();
  },
  surSuppression: (id) => {
    if (carteResultat.idAffiche === id) carteResultat.effacer();
  },
});

const interfaceReglages = creerReglages({
  reglages,
  surChangement: (modifications) => {
    reglages = enregistrerReglages(modifications);
    // Changer de moteur ou de vitesse demande un worker neuf
    // (le nombre de cœurs ne peut être choisi qu'au démarrage du moteur)
    if ("moteur" in modifications || "vitesse" in modifications) moteur.arreter();
    verifierModele();
  },
  surSupprimerModeles: async () => {
    moteur.arreter(); // libère la mémoire
    for (const nom of await caches.keys()) {
      // « transformers-cache » : nom du cache utilisé par Transformers.js
      if (nom === "transformers-cache" || nom.startsWith("transcriptor-moteur-")) {
        await caches.delete(nom);
      }
    }
    await effacerTousLesTelechargements();
    progression = { recu: 0, total: 0 };
    verifierModele();
  },
});

// ---------------------------------------------------------------
// Enregistrement au micro
// ---------------------------------------------------------------
async function demarrerEnregistrement() {
  carteTranscription.cacherMessage();
  if (!Enregistreur.estDisponible()) {
    carteTranscription.afficherErreur("micro-indisponible");
    return;
  }
  try {
    await enregistreur.demarrer();
  } catch (erreur) {
    console.error(erreur);
    carteTranscription.afficherErreur(codeErreur(erreur));
    return;
  }
  commencerTravail();
  carteTranscription.afficherEnregistrement();
  minuteurChrono = setInterval(() => carteTranscription.majChrono(enregistreur.duree), 500);
  // Pendant que vous parlez, le modèle se charge en mémoire en arrière-plan
  // (une éventuelle erreur s'affichera dans la carte du modèle)
  attendreModelePret().catch(() => {});
}

async function arreterEnregistrement() {
  clearInterval(minuteurChrono);
  const enregistrement = await enregistreur.arreter();
  finirTravail();
  if (!enregistrement || enregistrement.size === 0) {
    carteTranscription.afficherErreur("fichier-vide");
    return;
  }
  const titre = `Enregistrement du ${formaterDate(Date.now())}`;
  await traiterAudio(enregistrement, { titre, source: "micro" });
}

function annulerEnregistrement() {
  clearInterval(minuteurChrono);
  enregistreur.annuler();
  finirTravail();
  carteTranscription.afficherDepart();
}

// ---------------------------------------------------------------
// Transcription d'un audio (fichier ou enregistrement)
// ---------------------------------------------------------------
async function traiterAudio(fichierAudio, { titre, source }) {
  commencerTravail();
  demandeArret = false;
  carteTranscription.afficherLecture();
  let transcription = null;

  try {
    // Lecture du fichier et chargement du modèle en même temps
    const chargement = attendreModelePret();
    chargement.catch(() => {}); // l'erreur éventuelle est traitée plus bas
    const audio = await decoderAudio(fichierAudio);
    if (etatModele !== "pret") carteTranscription.afficherPreparation();
    await chargement;
    if (audio.duration < 0.3) {
      carteTranscription.afficherErreur("fichier-vide");
      return;
    }

    transcription = {
      titre,
      creeLe: Date.now(),
      duree: audio.duration,
      source,
      langue: reglages.langue,
      qualite: reglages.qualite,
      phrases: [],
      interrompue: false,
    };
    carteResultat.afficher(transcription, { enCours: true });

    const { segments, interrompue } = await transcrireAudio(audio, {
      moteur,
      langue: reglages.langue,
      doitArreter: () => demandeArret,
      surAvancement: (segmentsObtenus, numero, total, resteEstime) => {
        transcription.phrases = regrouperEnPhrases(segmentsObtenus);
        carteResultat.afficher(transcription, { enCours: true });
        carteTranscription.majAvancement(numero, total, resteEstime);
      },
    });
    transcription.phrases = regrouperEnPhrases(segments);
    transcription.interrompue = interrompue;

    await sauvegarder(transcription);
    carteResultat.afficher(transcription);
    carteResultat.montrer();

    if (transcription.phrases.length === 0) {
      carteTranscription.afficherInfo(
        "Aucune parole n'a été détectée. Vérifiez la langue choisie et que le son est assez fort."
      );
    } else if (interrompue) {
      carteTranscription.afficherInfo("Transcription arrêtée. Le texte déjà obtenu est conservé dans l'historique.");
    } else {
      carteTranscription.afficherInfo("✓ Transcription terminée et enregistrée dans l'historique.");
    }
  } catch (erreur) {
    console.error(erreur);
    carteTranscription.afficherErreur(erreur.code ?? codeErreur(erreur));
    // On garde quand même ce qui a déjà été transcrit
    if (transcription?.phrases.length > 0) {
      transcription.interrompue = true;
      await sauvegarder(transcription);
      carteResultat.afficher(transcription);
    } else {
      carteResultat.effacer();
    }
  } finally {
    finirTravail();
  }
}

// Enregistre dans l'historique (si le texte n'est pas vide)
async function sauvegarder(transcription) {
  if (transcription.phrases.length === 0) return;
  try {
    transcription.id = await ajouterTranscription(transcription);
    await carteHistorique.rafraichir();
  } catch (erreur) {
    console.error("Sauvegarde impossible :", erreur);
  }
}

function commencerTravail() {
  occupe = true;
  clearTimeout(minuteurLiberation);
  garderEcranAllume();
  changerEtat(etatModele);
}

function finirTravail() {
  occupe = false;
  laisserEcranSEteindre();
  changerEtat(etatModele);
  if (etatModele === "pret") programmerLiberation();
}

// Évite de perdre un enregistrement en fermant la page par erreur
window.addEventListener("beforeunload", (e) => {
  if (occupe) e.preventDefault();
});

// ---------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------
carteHistorique.rafraichir();
verifierModele();
