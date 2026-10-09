// ==========================================================
// Téléchargement « avec reprise ».
//
// Un gros fichier est téléchargé par morceaux de 4 Mo. Chaque morceau
// reçu est aussitôt rangé dans IndexedDB. Si la connexion coupe, on
// ne perd au pire que le morceau en cours : au prochain essai, le
// téléchargement repart du dernier morceau reçu.
//
// Pour demander « seulement les octets 4 194 304 à 8 388 607 » d'un
// fichier, on utilise l'en-tête HTTP « Range ». Le serveur répond
// alors avec le code 206 (« contenu partiel »).
// ==========================================================

import {
  ouvrirBase,
  attendre,
  finDeTransaction,
  TIROIR_TELECHARGEMENTS,
  TIROIR_MORCEAUX,
} from "../stockage/base-de-donnees.js";

const TAILLE_MORCEAU = 4 * 1024 * 1024; // 4 Mo
const ESSAIS_MAX = 4;                   // essais par morceau avant d'abandonner
const DELAI_INACTIVITE = 30000;         // 30 s sans recevoir un seul octet = connexion bloquée

// Erreur spéciale : la connexion internet ne répond plus
export class ErreurConnexion extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurConnexion";
  }
}

// Erreur spéciale : le fichier n'existe pas sur le serveur
export class ErreurFichierIntrouvable extends Error {
  constructor(message) {
    super(message);
    this.name = "ErreurFichierIntrouvable";
  }
}

/**
 * Télécharge un fichier en reprenant là où il s'était arrêté.
 * @param {string} url adresse du fichier
 * @param {object} options
 * @param {AbortSignal} options.signal permet d'interrompre (bouton « Pause »)
 * @param {(recu:number, total:number|undefined) => void} options.surProgression
 * @returns {Promise<Blob>} le fichier complet
 */
export async function telechargerAvecReprise(url, { signal, surProgression = () => {} }) {
  let suivi = await lireSuivi(url);
  let recu = suivi?.recu ?? 0;
  let index = suivi?.nbMorceaux ?? 0;
  let total = suivi?.total;

  if (recu > 0) surProgression(recu, total);

  while (total === undefined || recu < total) {
    const debut = recu;
    const fin = total === undefined
      ? debut + TAILLE_MORCEAU - 1
      : Math.min(debut + TAILLE_MORCEAU, total) - 1;

    const reponse = await essayerPlusieursFois(signal, (signalEssai) =>
      demanderMorceau(url, debut, fin, signalEssai, (n) => surProgression(debut + n, total))
    );

    // Cas rare : le serveur ne sait pas envoyer un morceau seul.
    // On reçoit alors le fichier entier d'un coup (sans reprise possible).
    if (reponse.complet) {
      await effacerTelechargement(url);
      return reponse.donnees;
    }

    // Le fichier a changé sur le serveur depuis le dernier essai :
    // les morceaux déjà reçus ne correspondent plus, on recommence.
    const fichierModifie =
      (total !== undefined && reponse.total !== total) ||
      (suivi?.etag && reponse.etag && suivi.etag !== reponse.etag);
    if (fichierModifie) {
      await effacerTelechargement(url);
      suivi = null;
      recu = 0;
      index = 0;
      total = undefined;
      continue;
    }

    total = reponse.total;
    suivi = {
      url,
      total,
      etag: suivi?.etag ?? reponse.etag,
      type: suivi?.type ?? reponse.type,
      recu: recu + reponse.donnees.size,
      nbMorceaux: index + 1,
    };
    await enregistrerMorceau(suivi, index, reponse.donnees);
    recu = suivi.recu;
    index += 1;
    surProgression(recu, total);
  }

  return assemblerMorceaux(url, total, suivi?.type);
}

// Renvoie le nombre total d'octets déjà téléchargés (tous fichiers confondus)
export async function octetsDejaTelecharges() {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TELECHARGEMENTS, "readonly");
  const suivis = await attendre(transaction.objectStore(TIROIR_TELECHARGEMENTS).getAll());
  return suivis.reduce((somme, s) => somme + (s.recu || 0), 0);
}

// Supprime les morceaux et le suivi d'un fichier
export async function effacerTelechargement(url) {
  const base = await ouvrirBase();
  const transaction = base.transaction([TIROIR_TELECHARGEMENTS, TIROIR_MORCEAUX], "readwrite");
  transaction.objectStore(TIROIR_TELECHARGEMENTS).delete(url);
  transaction.objectStore(TIROIR_MORCEAUX).delete(intervalleDuFichier(url));
  await finDeTransaction(transaction);
}

// Supprime tous les téléchargements inachevés
export async function effacerTousLesTelechargements() {
  const base = await ouvrirBase();
  const transaction = base.transaction([TIROIR_TELECHARGEMENTS, TIROIR_MORCEAUX], "readwrite");
  transaction.objectStore(TIROIR_TELECHARGEMENTS).clear();
  transaction.objectStore(TIROIR_MORCEAUX).clear();
  await finDeTransaction(transaction);
}

// ---------------------------------------------------------------
// Fonctions internes
// ---------------------------------------------------------------

// Toutes les clés [url, n] d'un même fichier
function intervalleDuFichier(url) {
  return IDBKeyRange.bound([url, 0], [url, Infinity]);
}

async function lireSuivi(url) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_TELECHARGEMENTS, "readonly");
  return attendre(transaction.objectStore(TIROIR_TELECHARGEMENTS).get(url));
}

// Range un morceau et met à jour le suivi, en une seule opération « tout ou rien »
async function enregistrerMorceau(suivi, index, donnees) {
  const base = await ouvrirBase();
  const transaction = base.transaction([TIROIR_TELECHARGEMENTS, TIROIR_MORCEAUX], "readwrite");
  transaction.objectStore(TIROIR_MORCEAUX).put({ url: suivi.url, index, donnees });
  transaction.objectStore(TIROIR_TELECHARGEMENTS).put(suivi);
  await finDeTransaction(transaction);
}

// Recolle tous les morceaux dans l'ordre pour reformer le fichier
async function assemblerMorceaux(url, total, type) {
  const base = await ouvrirBase();
  const transaction = base.transaction(TIROIR_MORCEAUX, "readonly");
  const morceaux = await attendre(
    transaction.objectStore(TIROIR_MORCEAUX).getAll(intervalleDuFichier(url))
  );
  morceaux.sort((a, b) => a.index - b.index);
  const fichier = new Blob(
    morceaux.map((m) => m.donnees),
    { type: type || "application/octet-stream" }
  );
  if (fichier.size !== total) {
    // Ne devrait jamais arriver : on repart de zéro pour ce fichier
    await effacerTelechargement(url);
    throw new ErreurConnexion(`Fichier incomplet (${fichier.size} octets sur ${total}).`);
  }
  return fichier;
}

// Réessaie une opération réseau quelques fois, en attendant de plus en plus longtemps
async function essayerPlusieursFois(signal, operation) {
  let derniereErreur;
  for (let essai = 0; essai < ESSAIS_MAX; essai++) {
    if (signal.aborted) throw signal.reason;
    try {
      return await operation(signal);
    } catch (erreur) {
      // Pause demandée par l'utilisateur, ou fichier absent : inutile de réessayer
      if (signal.aborted) throw signal.reason;
      if (erreur instanceof ErreurFichierIntrouvable) throw erreur;
      derniereErreur = erreur;
      // Attente : 1 s, puis 2 s, puis 4 s…
      await patienter(1000 * 2 ** essai, signal);
    }
  }
  throw new ErreurConnexion(`Connexion impossible : ${derniereErreur?.message ?? "inconnue"}`);
}

function patienter(millisecondes, signal) {
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(resoudre, millisecondes);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(minuteur);
        rejeter(signal.reason);
      },
      { once: true }
    );
  });
}

// Demande un morceau [debut, fin] du fichier et le lit entièrement
async function demanderMorceau(url, debut, fin, signal, surOctets) {
  // Petit « chien de garde » : si aucun octet n'arrive pendant 30 s,
  // on coupe cette demande pour la relancer (connexion figée).
  const garde = new AbortController();
  let minuteur = setTimeout(() => garde.abort(new ErreurConnexion("Connexion figée")), DELAI_INACTIVITE);
  const relancerGarde = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => garde.abort(new ErreurConnexion("Connexion figée")), DELAI_INACTIVITE);
  };
  const signalCombine = AbortSignal.any([signal, garde.signal]);

  try {
    const reponse = await fetch(url, {
      headers: { Range: `bytes=${debut}-${fin}` },
      signal: signalCombine,
      cache: "no-store",
    });

    if (reponse.status === 404 || reponse.status === 401 || reponse.status === 403) {
      throw new ErreurFichierIntrouvable(`Fichier introuvable (${reponse.status}) : ${url}`);
    }

    if (reponse.status === 206) {
      // En-tête « Content-Range: bytes 0-4194303/41234567 »
      const plage = /bytes (\d+)-(\d+)\/(\d+)/.exec(reponse.headers.get("content-range") || "");
      if (!plage || Number(plage[1]) !== debut) {
        throw new Error("Réponse partielle inattendue du serveur");
      }
      const donnees = await lireCorps(reponse, surOctets, relancerGarde);
      const attendu = Number(plage[2]) - Number(plage[1]) + 1;
      if (donnees.size !== attendu) throw new Error("Morceau incomplet");
      return {
        complet: false,
        donnees,
        total: Number(plage[3]),
        etag: reponse.headers.get("etag"),
        type: reponse.headers.get("content-type"),
      };
    }

    if (reponse.status === 200) {
      // Le serveur ignore « Range » et envoie tout le fichier
      const donnees = await lireCorps(reponse, surOctets, relancerGarde);
      return { complet: true, donnees };
    }

    throw new Error(`Réponse du serveur : ${reponse.status}`);
  } finally {
    clearTimeout(minuteur);
  }
}

// Lit la réponse petit à petit pour suivre la progression octet par octet
async function lireCorps(reponse, surOctets, surActivite) {
  const lecteur = reponse.body.getReader();
  const parties = [];
  let recus = 0;
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    parties.push(value);
    recus += value.byteLength;
    surActivite();
    surOctets(recus);
  }
  return new Blob(parties, { type: reponse.headers.get("content-type") || "" });
}
