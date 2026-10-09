// ==========================================================
// Service worker de Transcriptor.
// Il met les fichiers de l'application en réserve (« cache ») pour
// qu'elle fonctionne hors ligne.
//
// Ce fichier doit rester à la racine du site : un service worker ne
// peut gérer que les pages de son dossier et des sous-dossiers.
// ==========================================================

// ⚠️ À CHAQUE MODIFICATION d'un fichier de l'application, augmenter ce
// numéro (v1 → v2 → v3…). Sinon les téléphones garderont l'ancienne
// version en réserve.
const VERSION_CACHE = "transcriptor-app-v2";

// Liste des fichiers à garder en réserve.
// Chemins relatifs : ils fonctionnent aussi dans le sous-dossier GitHub Pages.
// (Le gros fichier du moteur de calcul, ort-wasm-…wasm, n'est pas dans
// cette liste : il est téléchargé avec le modèle, avec reprise possible.)
const FICHIERS_APPLICATION = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/config.js",
  "./js/pwa/register-service-worker.js",
  "./js/pwa/install-button.js",
  "./js/stockage/base-de-donnees.js",
  "./js/stockage/historique.js",
  "./js/stockage/reglages.js",
  "./js/audio/decoder-audio.js",
  "./js/audio/decoupage.js",
  "./js/audio/enregistreur.js",
  "./js/transcription/assemblage.js",
  "./js/transcription/client-moteur.js",
  "./js/transcription/erreurs.js",
  "./js/transcription/telechargement-reprise.js",
  "./js/transcription/transcrire-audio.js",
  "./js/transcription/worker.js",
  "./js/interface/carte-historique.js",
  "./js/interface/carte-modele.js",
  "./js/interface/carte-resultat.js",
  "./js/interface/carte-transcription.js",
  "./js/interface/messages.js",
  "./js/interface/reglages.js",
  "./js/outils/anti-veille.js",
  "./js/outils/format.js",
  "./vendor/transformers/transformers.min.js",
  "./vendor/transformers/ort-wasm-simd-threaded.asyncify.mjs",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
];

// 1) Installation : on télécharge et range tous les fichiers
self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches
      .open(VERSION_CACHE)
      .then((cache) => cache.addAll(FICHIERS_APPLICATION))
      // Active tout de suite la nouvelle version, sans attendre
      .then(() => self.skipWaiting())
  );
});

// 2) Activation : on supprime les réserves des anciennes versions de
//    l'application (mais pas le moteur de calcul ni les modèles)
self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms
            .filter((nom) => nom.startsWith("transcriptor-") && !nom.startsWith("transcriptor-moteur-"))
            .filter((nom) => nom !== VERSION_CACHE)
            .map((nom) => caches.delete(nom))
        )
      )
      // Prend le contrôle des pages déjà ouvertes
      .then(() => self.clients.claim())
  );
});

// 3) Chaque fois que la page demande un fichier :
//    on le sert depuis la réserve s'il y est, sinon on va sur internet.
self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  const url = new URL(requete.url);

  // On ne s'occupe que des fichiers de notre propre site.
  // (Les modèles, sur Hugging Face, sont gérés par le Web Worker.)
  if (requete.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  evenement.respondWith(
    // Les demandes partielles (« Range ») vont directement sur internet
    (requete.headers.has("range") ? Promise.resolve(undefined) : caches.match(requete, { ignoreSearch: true }))
      .then((reponseEnReserve) => {
        if (reponseEnReserve) {
          return reponseEnReserve;
        }
        return fetch(requete).catch(() => {
          // Hors ligne et page introuvable : on affiche la page d'accueil
          if (requete.mode === "navigate") {
            return caches.match("./index.html");
          }
          return Response.error();
        });
      })
      .then(ajouterEnTetesIsolation)
  );
});

// Ajoute les en-têtes COOP/COEP qui activent le calcul multi-cœurs.
// GitHub Pages ne permet pas de les régler : le service worker s'en charge.
function ajouterEnTetesIsolation(reponse) {
  if (!reponse || reponse.status === 0 || reponse.type === "opaque") {
    return reponse;
  }
  const entetes = new Headers(reponse.headers);
  entetes.set("Cross-Origin-Opener-Policy", "same-origin");
  entetes.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(reponse.body, {
    status: reponse.status,
    statusText: reponse.statusText,
    headers: entetes,
  });
}
