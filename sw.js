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
const VERSION_CACHE = "transcriptor-v1";

// Liste des fichiers à garder en réserve.
// Chemins relatifs : ils fonctionnent aussi dans le sous-dossier GitHub Pages.
const FICHIERS_APPLICATION = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/pwa/register-service-worker.js",
  "./js/pwa/install-button.js",
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

// 2) Activation : on supprime les réserves des anciennes versions
self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms
            .filter((nom) => nom.startsWith("transcriptor-") && nom !== VERSION_CACHE)
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
  // (Plus tard, les modèles d'IA téléchargés ailleurs seront gérés à part.)
  if (requete.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  evenement.respondWith(
    caches.match(requete, { ignoreSearch: true }).then((reponseEnReserve) => {
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
  );
});
