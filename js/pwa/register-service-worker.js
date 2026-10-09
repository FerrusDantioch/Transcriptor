// ==========================================================
// Enregistrement du « service worker ».
// Le service worker est un petit script qui tourne en arrière-plan
// et garde une copie des fichiers de l'application sur l'appareil.
// Grâce à lui, l'application s'ouvre même sans internet.
//
// Il ajoute aussi deux réglages de sécurité (COOP/COEP) qui
// permettent au modèle de calculer sur plusieurs cœurs du
// processeur (beaucoup plus rapide). Ces réglages ne s'appliquent
// qu'aux pages chargées APRÈS l'installation du service worker :
// la toute première fois, la page se recharge donc une fois toute seule.
// ==========================================================

const CLE_RECHARGEMENT = "transcriptor-recharge-coi";

/**
 * @param {object} options
 * @param {() => boolean} options.estOccupe vrai si un enregistrement ou une transcription est en cours
 */
export function enregistrerServiceWorker({ estOccupe }) {
  const etat = document.getElementById("etat-hors-ligne");

  // Certains vieux navigateurs ne connaissent pas les service workers
  if (!("serviceWorker" in navigator)) {
    etat.textContent = "Ce navigateur ne permet pas le mode hors ligne.";
    return;
  }

  // Le service worker vient de prendre le contrôle de la page :
  // on recharge une fois pour activer le calcul multi-cœurs.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    let dejaRecharge = false;
    try {
      dejaRecharge = sessionStorage.getItem(CLE_RECHARGEMENT) === "oui";
      sessionStorage.setItem(CLE_RECHARGEMENT, "oui");
    } catch {
      dejaRecharge = true; // sans sessionStorage, on évite tout risque de boucle
    }
    if (!window.crossOriginIsolated && !dejaRecharge && !estOccupe()) {
      window.location.reload();
    }
  });

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
