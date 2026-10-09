// ==========================================================
// Bouton « Installer l'application ».
// Quand Chrome juge que l'application peut être installée, il envoie
// un événement « beforeinstallprompt ». On le garde de côté et on
// affiche notre propre bouton. Un appui sur ce bouton ouvre la
// fenêtre d'installation officielle du navigateur.
// ==========================================================

export function preparerBoutonInstallation() {
  const zone = document.getElementById("zone-installation");
  const bouton = document.getElementById("bouton-installer");

  // Proposition d'installation mise de côté (vide au départ)
  let propositionEnAttente = null;

  window.addEventListener("beforeinstallprompt", (evenement) => {
    // Empêche Chrome d'afficher son propre bandeau automatiquement
    evenement.preventDefault();
    propositionEnAttente = evenement;
    zone.hidden = false;
  });

  bouton.addEventListener("click", async () => {
    if (!propositionEnAttente) return;
    // Ouvre la fenêtre d'installation du navigateur
    propositionEnAttente.prompt();
    // On attend la réponse (accepté ou refusé)
    await propositionEnAttente.userChoice;
    // Une proposition ne peut servir qu'une fois
    propositionEnAttente = null;
    zone.hidden = true;
  });

  // Une fois l'application installée, le bouton n'a plus de raison d'être
  window.addEventListener("appinstalled", () => {
    propositionEnAttente = null;
    zone.hidden = true;
  });
}
