// ==========================================================
// Classe chaque erreur technique dans une catégorie simple
// (« connexion », « mémoire »…). Le texte affiché à l'utilisateur
// pour chaque catégorie se trouve dans js/interface/messages.js.
// ==========================================================

export function codeErreur(erreur) {
  const nom = erreur?.name ?? "";
  const texte = String(erreur?.message ?? erreur ?? "").toLowerCase();

  if (nom === "AbortError") return "pause";
  if (nom === "ErreurHorsLigne") return "hors-ligne";
  if (nom === "ErreurConnexion") return "connexion";
  if (nom === "ErreurFichierIntrouvable") return "introuvable";
  if (nom === "QuotaExceededError" || texte.includes("quota")) return "espace";

  // Erreurs du micro
  if (nom === "NotAllowedError" || nom === "SecurityError") return "micro-refuse";
  if (nom === "NotFoundError" || nom === "OverconstrainedError") return "micro-absent";
  if (nom === "NotReadableError") return "micro-occupe";

  // Fichier audio illisible
  if (nom === "EncodingError" || texte.includes("unable to decode")) return "fichier-illisible";

  // Manque de mémoire (les messages varient selon les navigateurs)
  if (
    nom === "RangeError" ||
    texte.includes("out of memory") ||
    texte.includes("memory") ||
    texte.includes("allocation") ||
    texte.includes("bad_alloc")
  ) {
    return "memoire";
  }

  // Coupure réseau pendant une requête
  if (nom === "TypeError" && texte.includes("fetch")) return "connexion";

  return "inconnue";
}
