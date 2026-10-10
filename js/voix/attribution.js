// ==========================================================
// Attribution d'un intervenant à chaque passage de texte.
// On compare les heures du texte (données par Whisper) avec la
// chronologie des voix : le texte va à la voix qui parle le plus
// longtemps pendant ce passage.
// ==========================================================

/**
 * @param {Array<{debut:number, fin:number, texte:string}>} segments texte horodaté
 * @param {Array<{debut:number, fin:number, intervenant:number}>} tours chronologie des voix
 * @returns {{segments: Array, nombre: number}} segments avec « intervenant »
 *          (0, 1, 2… dans l'ordre d'apparition) et nombre d'intervenants
 */
export function attribuerIntervenants(segments, tours) {
  const valides = tours.filter((t) => t.intervenant >= 0);
  if (valides.length === 0) return { segments, nombre: 0 };

  const attribues = segments.map((s) => ({ ...s, intervenant: voixPrincipale(s, valides) }));

  // Renumérote dans l'ordre d'apparition dans le texte (1er qui parle = Intervenant 1)
  const correspondance = new Map();
  for (const s of attribues) {
    if (!correspondance.has(s.intervenant)) correspondance.set(s.intervenant, correspondance.size);
    s.intervenant = correspondance.get(s.intervenant);
  }
  return { segments: attribues, nombre: correspondance.size };
}

// Voix qui parle le plus longtemps entre s.debut et s.fin
// (à défaut, la voix la plus proche dans le temps)
function voixPrincipale(s, tours) {
  const durees = new Map();
  for (const t of tours) {
    const commun = Math.min(s.fin, t.fin) - Math.max(s.debut, t.debut);
    if (commun > 0) durees.set(t.intervenant, (durees.get(t.intervenant) || 0) + commun);
  }
  if (durees.size > 0) {
    return [...durees.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  let plusProche = tours[0];
  let ecartMin = Infinity;
  for (const t of tours) {
    const ecart = Math.max(t.debut - s.fin, s.debut - t.fin, 0);
    if (ecart < ecartMin) {
      ecartMin = ecart;
      plusProche = t;
    }
  }
  return plusProche.intervenant;
}
