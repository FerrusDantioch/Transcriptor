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

## Organisation des fichiers

```
index.html                 page unique de l'application
manifest.json              fiche d'identité de la PWA (nom, icônes, couleurs)
sw.js                      service worker (hors ligne + en-têtes COOP/COEP) — doit rester à la racine
.nojekyll                  dit à GitHub Pages de publier les fichiers tels quels
css/style.css              styles (thème clair/sombre automatique)
js/app.js                  point d'entrée : relie toutes les parties
js/config.js               qualités, langues, moteurs (constantes)
js/pwa/                    installation et enregistrement du service worker
js/stockage/               IndexedDB (historique, téléchargements) et réglages
js/audio/                  micro, décodage des fichiers, découpage en morceaux
js/transcription/          Web Worker (Whisper), téléchargement avec reprise, assemblage du texte
js/interface/              une « carte » de l'écran par fichier + textes des messages
js/outils/                 mise en forme, écran allumé
vendor/transformers/       Transformers.js + ONNX Runtime copiés depuis npm (voir son README)
icons/                     icônes 192 et 512 px (« any » et « maskable »)
```

## Règles à ne pas oublier

- **Chemins toujours relatifs** (`./css/style.css`, jamais `/css/style.css`) :
  le site est publié dans un sous-dossier sur GitHub Pages.
- **À chaque modification d'un fichier de l'application**, augmenter
  `VERSION_CACHE` dans `sw.js` (v2 → v3…), sinon les téléphones gardent
  l'ancienne version. Tout nouveau fichier doit aussi être ajouté à la
  liste `FICHIERS_APPLICATION` de `sw.js`.
- **Transformers.js et ONNX Runtime** : les versions dans `vendor/` doivent aller
  ensemble (voir `vendor/transformers/README.md`). Si on change la version
  d'ONNX Runtime, changer aussi `CACHE_MOTEUR` dans `js/transcription/worker.js`.
- **Langue** : Transformers.js v4 ne détecte pas la langue (anglais par défaut) :
  toujours passer `language`.
- **Garde-fous Whisper** (worker) : `no_repeat_ngram_size` et `max_new_tokens`
  évitent les boucles « mot mot mot… » et les recalculs très longs. Ne pas les retirer.
- **Messages d'erreur** : un code par type d'erreur (`js/transcription/erreurs.js`),
  texte rassurant correspondant dans `js/interface/messages.js`.

## Comment Claude teste (environnement cloud)

- `huggingface.co` est bloqué par le réseau de l'environnement cloud : on ne peut pas
  y télécharger les vrais modèles. Pour les tests, Playwright (Chromium) intercepte
  les requêtes vers Hugging Face et sert une copie de Whisper tiny (paquet npm
  `sts-whisper-tiny`, utilisé seulement pour les tests, jamais dans l'application).
- Voix de test : `espeak-ng` (voix de synthèse, très mal reconnue par Whisper tiny :
  la qualité du texte doit être jugée sur une vraie voix, sur le téléphone).
- Le site est servi dans un sous-dossier (`/Transcriptor/`) comme sur GitHub Pages.

## Points de vigilance connus

- **Performances sur téléphone** : utiliser de petits modèles Whisper
  (`tiny` ou `base`, version « quantifiée » = compressée). Les gros modèles
  sont trop lents ou trop lourds en mémoire sur mobile.
- **Téléphone figé** (retour de l'utilisateur, Redmi, qualité Équilibré, moteur
  « Automatique ») : la carte graphique et 4 cœurs à fond figeaient l'écran.
  Depuis : moteur « Processeur » et vitesse « Douce » (2 cœurs) par défaut,
  pause de 300 ms entre les morceaux. Le nombre de cœurs ne peut être choisi
  qu'au démarrage du worker : en changer = relancer un worker neuf.
- **GitHub Pages** ne permet pas de régler les en-têtes HTTP COOP/COEP qui
  permettent le calcul multi-cœurs : c'est `sw.js` qui les ajoute (la page se
  recharge une fois toute seule à la première visite).
- **Micro** : le navigateur n'autorise le micro que sur une page sécurisée
  (`https://` ou `http://localhost`).
- **Reconnaissance des voix (étape 2)** : faisable dans le navigateur mais
  expérimental ; la qualité et la vitesse seront à vérifier sur le téléphone.
