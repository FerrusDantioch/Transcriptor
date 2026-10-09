// ==========================================================
// Ouverture de la base de données du navigateur (IndexedDB).
// IndexedDB est une petite base de données intégrée au navigateur :
// les informations restent sur l'appareil, même hors ligne.
//
// Ce fichier est utilisé à la fois par la page et par le Web Worker,
// pour que les deux partagent exactement la même organisation.
// ==========================================================

const NOM_BASE = "transcriptor";
const VERSION_BASE = 1;

// Noms des « tiroirs » (object stores) de la base
export const TIROIR_TRANSCRIPTIONS = "transcriptions";   // historique
export const TIROIR_TELECHARGEMENTS = "telechargements"; // suivi des téléchargements en cours
export const TIROIR_MORCEAUX = "morceaux";               // morceaux déjà téléchargés

let promesseBase = null;

// Ouvre la base (une seule fois) et la crée si besoin
export function ouvrirBase() {
  if (promesseBase) return promesseBase;

  promesseBase = new Promise((resoudre, rejeter) => {
    const demande = indexedDB.open(NOM_BASE, VERSION_BASE);

    // Appelé seulement à la création (ou lors d'un changement de version)
    demande.onupgradeneeded = () => {
      const base = demande.result;
      if (!base.objectStoreNames.contains(TIROIR_TRANSCRIPTIONS)) {
        const tiroir = base.createObjectStore(TIROIR_TRANSCRIPTIONS, {
          keyPath: "id",
          autoIncrement: true,
        });
        tiroir.createIndex("creeLe", "creeLe");
      }
      if (!base.objectStoreNames.contains(TIROIR_TELECHARGEMENTS)) {
        base.createObjectStore(TIROIR_TELECHARGEMENTS, { keyPath: "url" });
      }
      if (!base.objectStoreNames.contains(TIROIR_MORCEAUX)) {
        base.createObjectStore(TIROIR_MORCEAUX, { keyPath: ["url", "index"] });
      }
    };

    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => {
      promesseBase = null;
      rejeter(demande.error);
    };
  });

  return promesseBase;
}

// Transforme une demande IndexedDB en promesse (plus simple à utiliser avec await)
export function attendre(demande) {
  return new Promise((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  });
}

// Attend la fin d'une transaction (= un groupe d'opérations tout-ou-rien)
export function finDeTransaction(transaction) {
  return new Promise((resoudre, rejeter) => {
    transaction.oncomplete = () => resoudre();
    transaction.onerror = () => rejeter(transaction.error);
    transaction.onabort = () => rejeter(transaction.error);
  });
}
