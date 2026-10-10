// ==========================================================
// Web Worker de transcription.
//
// Un « Web Worker » est un programme qui tourne à côté de la page,
// sur un autre cœur du processeur. Le modèle Whisper y fait ses
// calculs lourds sans jamais figer l'interface.
//
// La page et le worker se parlent par messages :
//   page → worker : { type: "verifier" | "preparer" | "pause" | "transcrire"
//                      | "verifierVoix" | "preparerVoix" | "analyserVoix" | "regrouperVoix", … }
//   worker → page : { type: "etat" | "progression" | "resultat" | "erreur", … }
// ==========================================================

import { env, pipeline, ModelRegistry } from "../../vendor/transformers/transformers.min.js";
import {
  telechargerAvecReprise,
  octetsDejaTelecharges,
  effacerTelechargement,
  ErreurConnexion,
} from "./telechargement-reprise.js";
import { codeErreur } from "./erreurs.js";
import {
  fichiersModelesVoix,
  chargerModelesVoix,
  modelesVoixCharges,
  analyserFenetre,
} from "../voix/analyse-voix.js";
import { regrouperEmpreintes } from "../voix/regroupement.js";

const TACHE = "automatic-speech-recognition";

// Fichiers du moteur de calcul (ONNX Runtime), copiés dans le projet
const URL_MOTEUR_MJS = new URL("../../vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs", import.meta.url).href;
const URL_MOTEUR_WASM = new URL("../../vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm", import.meta.url).href;
// Le nom contient la version : changer de version = nouveau téléchargement
const CACHE_MOTEUR = "transcriptor-moteur-1.31.0-dev.20260914";

// Niveau de compression des fichiers du modèle selon le moteur.
// « q8 » = poids compressés sur 8 bits (léger, idéal pour le processeur).
// Pour la carte graphique, on suit les réglages recommandés par Transformers.js.
// L'encodeur (« q8 » ou « fp32 ») dépend de la qualité choisie.
// L'encodeur est donné sous deux noms : « encoder_model » (utilisé pour charger
// le modèle) et « model » (utilisé par la bibliothèque pour lister les fichiers
// à télécharger). Sans ce doublon, la liste ne correspondrait pas.
function compression(device, encodeur = "q8") {
  const enc = device === "webgpu" ? "fp32" : encodeur;
  const dec = device === "webgpu" ? "q4" : "q8";
  return { model: enc, encoder_model: enc, decoder_model_merged: dec };
}

// --- Réglages de Transformers.js ---
env.allowLocalModels = false; // les modèles viennent de Hugging Face (puis du cache)
env.useBrowserCache = true;   // garde les modèles dans le Cache du navigateur
env.useWasmCache = false;     // le moteur est géré par nous (voir assurerMoteur)
env.backends.onnx.wasm.wasmPaths = { mjs: URL_MOTEUR_MJS, wasm: URL_MOTEUR_WASM };

// --- État du worker ---
let transcripteur = null;     // le modèle chargé en mémoire
let configChargee = null;     // { modele, device }
let controleur = null;        // permet de mettre le téléchargement en pause

self.addEventListener("message", async (evenement) => {
  const message = evenement.data;
  try {
    if (message.type === "verifier") await verifier(message);
    else if (message.type === "preparer") await preparer(message);
    else if (message.type === "pause") controleur?.abort(new DOMException("Pause", "AbortError"));
    else if (message.type === "transcrire") await transcrire(message);
    else if (message.type === "verifierVoix") envoyer({ type: "resultat", id: message.id, present: await voixEnCache() });
    else if (message.type === "preparerVoix") await preparerVoix(message);
    else if (message.type === "analyserVoix") await analyserVoix(message);
    else if (message.type === "regrouperVoix") regrouperVoix(message);
  } catch (erreur) {
    const code = codeErreur(erreur);
    // Pause et coupure de connexion sont prévues : inutile de les signaler en rouge
    if (!["pause", "connexion", "hors-ligne"].includes(code)) console.error(erreur);
    envoyer({
      type: "erreur",
      id: message.id,
      operation: message.type,
      code,
      detail: String(erreur?.message ?? erreur),
    });
  }
});

function envoyer(message) {
  self.postMessage(message);
}

// ---------------------------------------------------------------
// 1) Vérifier si le modèle est déjà sur l'appareil
// ---------------------------------------------------------------
async function verifier({ modele, moteur, encodeur }) {
  const device = await choisirDevice(moteur);
  const present = (await moteurEnCache()) && (await modeleEnCache(modele, device, encodeur));
  envoyer({
    type: "verification",
    present,
    device,
    dejaTelecharge: present ? 0 : await octetsDejaTelecharges(),
  });
}

// ---------------------------------------------------------------
// 2) Préparer : télécharger si besoin, puis charger en mémoire
// ---------------------------------------------------------------
async function preparer({ modele, moteur, coeurs, encodeur }) {
  controleur = new AbortController();
  // Nombre de cœurs du processeur : n'a d'effet qu'avant le tout premier
  // chargement (pour en changer, la page relance un worker neuf)
  if (!transcripteur) env.backends.onnx.wasm.numThreads = coeurs || 2;
  const device = await choisirDevice(moteur);
  try {
    await charger(modele, device, encodeur);
  } catch (erreur) {
    const code = codeErreur(erreur);
    // Si la carte graphique pose problème, on se rabat sur le processeur
    if (device === "webgpu" && moteur === "auto" && !["pause", "connexion", "hors-ligne", "espace"].includes(code)) {
      console.warn("WebGPU indisponible, passage au processeur :", erreur);
      envoyer({ type: "info", code: "repli-processeur" });
      await charger(modele, "wasm", encodeur);
    } else {
      throw erreur;
    }
  } finally {
    controleur = null;
  }
}

async function charger(modele, device, encodeur) {
  const options = { dtype: compression(device, encodeur), device };
  const config = `${modele}|${device}|${encodeur}`;

  // Déjà chargé avec les mêmes réglages : rien à faire
  if (transcripteur && configChargee === config) {
    envoyer({ type: "etat", etat: "pret", device, coeurs: coeursUtilises() });
    return;
  }

  // a) Liste des fichiers à télécharger (moteur + modèle).
  //    On compte aussi ce qui est déjà en cache, pour que la barre de
  //    progression reste cohérente après une reprise.
  envoyer({ type: "etat", etat: "verification" });
  const aTelecharger = [];
  let dejaEnCache = 0;
  const moteurGarde = await caches.open(CACHE_MOTEUR).then((c) => c.match(URL_MOTEUR_WASM));
  if (moteurGarde) {
    dejaEnCache += tailleReponse(moteurGarde);
  } else {
    aTelecharger.push({ url: URL_MOTEUR_WASM, cache: CACHE_MOTEUR, taille: await tailleFichier(URL_MOTEUR_WASM) });
  }
  if (!(await modeleEnCache(modele, device, encodeur))) {
    if (!navigator.onLine) throw new ErreurHorsLigne();
    const fichiers = await ModelRegistry.get_pipeline_files(TACHE, modele, options);
    const cacheModeles = await caches.open(env.cacheKey);
    for (const fichier of fichiers) {
      const url = urlDistante(modele, fichier);
      // On regarde nous-mêmes dans le cache (la bibliothèque garde en mémoire
      // d'anciennes réponses, qui peuvent être périmées après une reprise)
      const garde = await cacheModeles.match(url);
      if (garde) {
        dejaEnCache += tailleReponse(garde);
        continue;
      }
      const infos = await ModelRegistry.get_file_metadata(modele, fichier, options);
      aTelecharger.push({ url, cache: env.cacheKey, taille: infos.size });
    }
  }

  // b) Téléchargement, fichier après fichier, avec reprise
  if (aTelecharger.length > 0) {
    if (!navigator.onLine) throw new ErreurHorsLigne();
    await telechargerTout(aTelecharger, dejaEnCache);
  }

  // c) Chargement en mémoire (depuis le cache, sans internet)
  envoyer({ type: "etat", etat: "chargement", device });
  env.backends.onnx.wasm.wasmBinary = await lireMoteur();
  await transcripteur?.dispose();
  transcripteur = null;
  configChargee = null;
  const nouveau = await pipeline(TACHE, modele, options);

  // Sur carte graphique, un petit essai à vide permet de détecter tout
  // de suite un téléphone incompatible (et prépare les calculs).
  if (device === "webgpu") {
    await nouveau(new Float32Array(16000), { language: "fr", task: "transcribe" });
  }

  transcripteur = nouveau;
  configChargee = config;
  envoyer({ type: "etat", etat: "pret", device, coeurs: coeursUtilises() });
}

// « cible » indique à la page quelle barre de progression mettre à jour
// (« modele » : Whisper ; « voix » : modèles de reconnaissance des voix)
async function telechargerTout(liste, dejaEnCache, cible = "modele") {
  const total = dejaEnCache + liste.reduce((somme, f) => somme + (f.taille || 0), 0);
  let termine = dejaEnCache; // octets des fichiers déjà complets

  for (const fichier of liste) {
    const blob = await telechargerAvecReprise(fichier.url, {
      signal: controleur.signal,
      surProgression: (recu) => {
        envoyer({ type: "progression", recu: termine + recu, total, cible });
      },
    });
    // On range le fichier complet dans le Cache du navigateur
    // (l'adresse du fichier sert de « clé » pour le retrouver)…
    const cache = await caches.open(fichier.cache);
    await cache.put(
      fichier.url,
      new Response(blob, {
        headers: {
          "content-type": blob.type || "application/octet-stream",
          "content-length": String(blob.size),
        },
      })
    );
    // … puis on supprime les morceaux devenus inutiles
    await effacerTelechargement(fichier.url);
    termine += fichier.taille || blob.size;
    envoyer({ type: "progression", recu: termine, total, cible });
  }

  // Ménage : anciennes versions du moteur
  for (const nom of await caches.keys()) {
    if (nom.startsWith("transcriptor-moteur-") && nom !== CACHE_MOTEUR) await caches.delete(nom);
  }
}

// ---------------------------------------------------------------
// 3) Transcrire un morceau d'audio (30 secondes au maximum)
// ---------------------------------------------------------------
async function transcrire({ id, audio, langue }) {
  if (!transcripteur) throw new Error("Le modèle n'est pas chargé.");
  const duree = audio.length / 16000; // en secondes
  let sortie;
  try {
    sortie = await appelerWhisper(audio, langue, duree);
  } catch (erreur) {
    // Whisper n'a produit aucun mot pour ce morceau (bruit, musique…) :
    // la bibliothèque plante au lieu de renvoyer un texte vide. On l'ignore.
    if (String(erreur?.message).includes("token_ids must be a non-empty array")) {
      envoyer({ type: "resultat", id, segments: [], texte: "" });
      return;
    }
    throw erreur;
  }
  const segments = (sortie.chunks || []).map((c) => ({
    debut: c.timestamp?.[0] ?? null,
    fin: c.timestamp?.[1] ?? null,
    texte: c.text,
  }));
  envoyer({ type: "resultat", id, segments, texte: sortie.text });
}

function appelerWhisper(audio, langue, duree) {
  return transcripteur(audio, {
    language: langue,
    task: "transcribe",
    return_timestamps: true,
    // Garde-fous contre les « boucles » de Whisper (le même mot répété sans fin) :
    // - une même suite de 4 « jetons » (bouts de mots) ne peut pas revenir ;
    // - le nombre de jetons est limité selon la durée (on parle rarement
    //   plus de 4 mots par seconde). Cela évite aussi de longs calculs inutiles.
    no_repeat_ngram_size: 4,
    max_new_tokens: Math.min(400, Math.ceil(duree * 8) + 20),
  });
}

// ---------------------------------------------------------------
// 4) Reconnaissance des intervenants (voir js/voix/)
// ---------------------------------------------------------------

// Les modèles de voix sont-ils tous dans le cache ?
async function voixEnCache() {
  const cache = await caches.open(env.cacheKey);
  for (const url of fichiersModelesVoix()) {
    if (!(await cache.match(url))) return false;
  }
  return true;
}

// Télécharge (si besoin, avec reprise) puis charge les modèles de voix.
// « charger: false » : téléchargement seul (bouton « Télécharger maintenant »).
// Le chargement exige que Whisper soit déjà chargé : le moteur de calcul est
// alors démarré avec le bon nombre de cœurs (réglage « Vitesse »).
async function preparerVoix({ id, charger = true }) {
  if (!modelesVoixCharges()) {
    const cache = await caches.open(env.cacheKey);
    const liste = [];
    let dejaEnCache = 0;
    for (const url of fichiersModelesVoix()) {
      const garde = await cache.match(url);
      if (garde) dejaEnCache += tailleReponse(garde);
      else liste.push({ url, cache: env.cacheKey, taille: await tailleFichier(url) });
    }
    if (liste.length > 0) {
      if (!navigator.onLine) throw new ErreurHorsLigne();
      controleur = new AbortController();
      try {
        await telechargerTout(liste, dejaEnCache, "voix");
      } finally {
        controleur = null;
      }
    }
    if (charger) {
      if (!transcripteur) throw new Error("Le modèle de transcription doit être chargé avant les modèles de voix.");
      await chargerModelesVoix();
    }
  }
  envoyer({ type: "resultat", id });
}

async function analyserVoix({ id, audio, decalage }) {
  const elements = await analyserFenetre(audio, decalage);
  // Les empreintes (listes de nombres) sont « transférées » à la page sans copie
  const transferts = elements.filter((e) => e.empreinte).map((e) => e.empreinte.buffer);
  self.postMessage({ type: "resultat", id, elements }, transferts);
}

function regrouperVoix({ id, elements, nombreVoix }) {
  envoyer({ type: "resultat", id, etiquettes: regrouperEmpreintes(elements, nombreVoix) });
}

// ---------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------

class ErreurHorsLigne extends Error {
  constructor() {
    super("Hors ligne");
    this.name = "ErreurHorsLigne";
  }
}

// Choisit « webgpu » (carte graphique) ou « wasm » (processeur)
async function choisirDevice(moteur) {
  if (moteur === "wasm") return "wasm";
  let adaptateur = null;
  try {
    adaptateur = await navigator.gpu?.requestAdapter();
  } catch {
    adaptateur = null;
  }
  if (adaptateur) return "webgpu";
  return "wasm"; // pas de carte graphique utilisable : processeur
}

// Adresse d'un fichier du modèle sur Hugging Face (c'est aussi sa clé dans le cache)
function urlDistante(modele, fichier) {
  const chemin = env.remotePathTemplate
    .replaceAll("{model}", modele)
    .replaceAll("{revision}", "main");
  return new URL(chemin + fichier, env.remoteHost).href;
}

async function modeleEnCache(modele, device, encodeur) {
  try {
    return await ModelRegistry.is_pipeline_cached(TACHE, modele, { dtype: compression(device, encodeur), device });
  } catch {
    return false;
  }
}

// Nombre de cœurs réellement utilisés (1 si le calcul multi-cœurs est impossible)
function coeursUtilises() {
  return self.crossOriginIsolated ? env.backends.onnx.wasm.numThreads || 1 : 1;
}

// Taille d'un fichier rangé dans le cache
function tailleReponse(reponse) {
  return Number(reponse.headers.get("content-length")) || 0;
}

async function moteurEnCache() {
  const cache = await caches.open(CACHE_MOTEUR);
  return (await cache.match(URL_MOTEUR_WASM)) !== undefined;
}

async function lireMoteur() {
  const cache = await caches.open(CACHE_MOTEUR);
  const reponse = await cache.match(URL_MOTEUR_WASM);
  if (!reponse) throw new ErreurConnexion("Moteur de calcul absent");
  return reponse.arrayBuffer();
}

// Taille d'un fichier sans le télécharger (requête « HEAD »)
async function tailleFichier(url) {
  try {
    const reponse = await fetch(url, { method: "HEAD", cache: "no-store" });
    return Number(reponse.headers.get("content-length")) || undefined;
  } catch {
    return undefined;
  }
}
