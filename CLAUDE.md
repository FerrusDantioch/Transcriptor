# CLAUDE.md — Règles du projet Transcriptor

Ce fichier est lu par Claude au début de chaque session. Il résume les règles
de travail à respecter sur ce projet.

## Le projet

**Transcriptor** est une application web installable (PWA) qui transforme la
voix en texte, entièrement dans le navigateur.

Feuille de route :
1. Transcrire une voix (micro ou fichier audio).
2. Reconnaître jusqu'à 6 voix différentes (« Intervenant 1 », « Intervenant 2 »…).
3. Générer des sous-titres pour des vidéos (fichiers `.srt` et `.vtt`).
4. Plus tard : publication sur le Google Play Store.

## L'utilisateur

- Débutant complet en programmation.
- **Toujours parler en français**, simplement, et expliquer chaque terme technique.
- Les **commentaires dans le code sont en français**.
- Les **messages de commit sont en français**.

## Contraintes techniques (à ne pas oublier)

- **Aucun serveur** : tout tourne dans le navigateur, gratuitement, sans clé d'API payante.
- **Transcription locale** sur l'appareil avec Whisper via Transformers.js
  (protège la vie privée : l'audio ne quitte jamais le téléphone).
- **Hors ligne** : le modèle se télécharge une seule fois, puis l'application
  fonctionne sans internet. Toujours afficher une **barre de progression claire**
  pendant le téléchargement. La connexion de l'utilisateur est parfois instable :
  prévoir les coupures (reprise, messages d'erreur compréhensibles).
- **Mobile d'abord** : appareil cible = Android (Redmi Note 15), navigateur Chrome.
  Gros boutons, textes lisibles, contrastes forts, interface sobre et calme,
  pas d'animations agressives.
- **Langue de l'interface** : français. **Transcription** : français par défaut,
  avec choix d'autres langues.
- **Hébergement** : GitHub Pages (site statique). Compte GitHub : `FerrusDantioch`.
- **Technologies** : HTML, CSS, JavaScript simple (modules ES). Pas de framework
  lourd. Pas d'outil de compilation, sauf si indispensable — et dans ce cas,
  expliquer pourquoi avant de l'ajouter.
- **Organisation** : petits fichiers clairs, un dossier par responsabilité.

## Méthode de travail

1. **Avant de coder**, écrire un court plan en français et **attendre l'accord**
   de l'utilisateur.
2. Avancer par **petites étapes testables**. Après chaque étape, expliquer
   **exactement comment tester** (quoi ouvrir, sur quoi cliquer, ce qu'on doit voir).
3. Faire des **commits Git fréquents**, avec des messages en français.
4. Si un choix technique est **risqué ou limité** (ex. performances sur téléphone),
   le dire honnêtement et proposer une alternative.

## Points de vigilance connus

- **Performances sur téléphone** : utiliser de petits modèles Whisper
  (`tiny` ou `base`, version « quantifiée » = compressée). Les gros modèles
  sont trop lents ou trop lourds en mémoire sur mobile.
- **GitHub Pages** ne permet pas de régler certains en-têtes HTTP
  (COOP/COEP) qui accélèrent le calcul multi-cœurs. Contournement possible :
  un petit script « service worker » dédié (`coi-serviceworker`).
- **Micro** : le navigateur n'autorise le micro que sur une page sécurisée
  (`https://` ou `http://localhost`).
- **Reconnaissance des voix (étape 2)** : faisable dans le navigateur mais
  expérimental ; la qualité et la vitesse seront à vérifier sur le téléphone.
