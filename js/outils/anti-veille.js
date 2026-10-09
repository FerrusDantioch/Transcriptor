// ==========================================================
// Garde l'écran allumé pendant un enregistrement ou une transcription.
// Si l'écran s'éteint, Android peut mettre l'application en pause.
// (API « Wake Lock » ; sans effet si le navigateur ne la connaît pas.)
// ==========================================================

let verrou = null;
let actif = false;

export async function garderEcranAllume() {
  actif = true;
  await demanderVerrou();
}

export function laisserEcranSEteindre() {
  actif = false;
  verrou?.release().catch(() => {});
  verrou = null;
}

async function demanderVerrou() {
  if (!("wakeLock" in navigator) || verrou) return;
  try {
    verrou = await navigator.wakeLock.request("screen");
    verrou.addEventListener("release", () => {
      verrou = null;
    });
  } catch {
    // Refusé (batterie faible…) : pas grave, on continue sans
  }
}

// Le verrou saute quand on quitte l'application : on le reprend au retour
document.addEventListener("visibilitychange", () => {
  if (actif && document.visibilityState === "visible") demanderVerrou();
});
