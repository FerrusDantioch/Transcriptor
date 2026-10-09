// ==========================================================
// Point d'entrée de l'application.
// Ce fichier est chargé par index.html et démarre chaque partie.
// ==========================================================

import { enregistrerServiceWorker } from "./pwa/register-service-worker.js";
import { preparerBoutonInstallation } from "./pwa/install-button.js";

// Mode hors ligne : met les fichiers de l'application en réserve
enregistrerServiceWorker();

// Bouton « Installer l'application » (s'affiche seulement si possible)
preparerBoutonInstallation();
