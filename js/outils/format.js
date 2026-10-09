// ==========================================================
// Petits outils de mise en forme (durées, tailles, dates…).
// ==========================================================

// 75.3 → « 01:15 » ; 3725 → « 1:02:05 »
export function formaterHorodatage(secondes) {
  const total = Math.max(0, Math.floor(secondes || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const deuxChiffres = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${deuxChiffres(m)}:${deuxChiffres(s)}` : `${deuxChiffres(m)}:${deuxChiffres(s)}`;
}

// 95 → « 1 min 35 s » ; 20 → « 20 s »
export function formaterDuree(secondes) {
  const total = Math.max(0, Math.round(secondes || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, "0")} s`;
  return `${s} s`;
}

// 41234567 → « 41,2 Mo »
export function formaterTaille(octets) {
  const mo = (octets || 0) / 1_000_000;
  return `${mo.toLocaleString("fr-FR", { maximumFractionDigits: mo < 10 ? 1 : 0 })} Mo`;
}

// Date lisible : « 9 oct. 2026 à 15:40 »
export function formaterDate(millisecondes) {
  const date = new Date(millisecondes);
  const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${jour} à ${heure}`;
}

// Transforme un titre en nom de fichier sans caractères gênants
export function nomDeFichier(titre, extension) {
  const propre = (titre || "transcription")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${propre || "transcription"}.${extension}`;
}
