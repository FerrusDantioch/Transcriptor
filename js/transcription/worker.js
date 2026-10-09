// ==========================================================
// Web Worker de transcription.
//
// Un « Web Worker » est un programme qui tourne à côté de la page,
// sur un autre cœur du processeur. Le modèle Whisper y fait ses
// calculs lourds sans jamais figer l'interface.
//
// La page et le worker se parlent par messages :
//   page → worker : { type: "verifier" | "preparer" | "pause" | "transcrire", … }
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

const TACHE = "automatic-speech-recognition";

// Fichiers du moteur de calcul (ONNX Runtime), copiés dans le projet
const URL_MOTEUR_MJS = new URL("../../vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs", import.meta.url).href;
const URL_MOTEUR_WASM = new URL("../../vendor/transformers/ort-wasm-simd-threaded.asyncify.wasm", import.meta.url).href;
// Le nom contient la version : changer de version = nouveau téléchargement
const CACHE_MOTEUR = "transcriptor-moteur-1.31.0-dev.20260914";

// Niveau de compression des fichiers du modèle selon le moteur.
// « q8 » = poids compressés sur 8 bits (léger, idéal pour le processeur).
// Pour la carte graphique, on suit les réglages recommandés par Transformers.js.
const COMPRESSION = {
  wasm: { encoder_model: "q8", decoder_model_merged: "q8" },
  webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" },
};

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
async function verifier({ modele, moteur }) {
  const device = await choisirDevice(moteur);
  const present = (await moteurEnCache()) && (await modeleEnCache(modele, device));
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
async function preparer({ modele, moteur }) {
  controleur = new AbortController();
  const device = await choisirDevice(moteur);
  try {
    await charger(modele, device);
  } catch (erreur) {
    const code = codeErreur(erreur);
    // Si la carte graphique pose problème, on se rabat sur le processeur
    if (device === "webgpu" && moteur === "auto" && !["pause", "connexion", "hors-ligne", "espace"].includes(code)) {
      console.warn("WebGPU indisponible, passage au processeur :", erreur);
      envoyer({ type: "info", code: "repli-processeur" });
      await charger(modele, "wasm");
    } else {
      throw erreur;
    }
  } finally {
    controleur = null;
  }
}

async function charger(modele, device) {
  const options = { dtype: COMPRESSION[device], device };

  // Déjà chargé avec les mêmes réglages : rien à faire
  if (transcripteur && configChargee?.modele === modele && configChargee?.device === device) {
    envoyer({ type: "etat", etat: "pret", device, multiCoeurs: self.crossOriginIsolated });
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
  if (!(await modeleEnCache(modele, device))) {
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
  configChargee = { modele, device };
  envoyer({ type: "etat", etat: "pret", device, multiCoeurs: self.crossOriginIsolated });
}

async function telechargerTout(liste, dejaEnCache) {
  const total = dejaEnCache + liste.reduce((somme, f) => somme + (f.taille || 0), 0);
  let termine = dejaEnCache; // octets des fichiers déjà complets

  for (const fichier of liste) {
    const blob = await telechargerAvecReprise(fichier.url, {
      signal: controleur.signal,
      surProgression: (recu) => {
        envoyer({ type: "progression", recu: termine + recu, total });
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
    envoyer({ type: "progression", recu: termine, total });
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
  const sortie = await transcripteur(audio, {
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
  const segments = (sortie.chunks || []).map((c) => ({
    debut: c.timestamp?.[0] ?? null,
    fin: c.timestamp?.[1] ?? null,
    texte: c.text,
  }));
  envoyer({ type: "resultat", id, segments, texte: sortie.text });
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

async function modeleEnCache(modele, device) {
  try {
    return await ModelRegistry.is_pipeline_cached(TACHE, modele, { dtype: COMPRESSION[device], device });
  } catch {
    return false;
  }
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
