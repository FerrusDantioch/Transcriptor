// ==========================================================
// Enregistrement du « service worker ».
// Le service worker est un petit script qui tourne en arrière-plan
// et garde une copie des fichiers de l'application sur l'appareil.
// Grâce à lui, l'application s'ouvre même sans internet.
// ==========================================================

export function enregistrerServiceWorker() {
  const etat = document.getElementById("etat-hors-ligne");

  // Certains vieux navigateurs ne connaissent pas les service workers
  if (!("serviceWorker" in navigator)) {
    etat.textContent = "Ce navigateur ne permet pas le mode hors ligne.";
    return;
  }

  // On attend que la page soit entièrement chargée pour ne pas la ralentir
  window.addEventListener("load", async () => {
    try {
      // "./sw.js" : chemin relatif, valable aussi dans un sous-dossier
      await navigator.serviceWorker.register("./sw.js");
      // "ready" se déclenche quand le service worker est actif
      await navigator.serviceWorker.ready;
      etat.textContent = "✓ Prête à fonctionner hors ligne.";
    } catch (erreur) {
      console.error("Échec de l'enregistrement du service worker :", erreur);
      etat.textContent = "Le mode hors ligne n'a pas pu être activé.";
    }
  });
}
