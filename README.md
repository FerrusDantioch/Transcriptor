# Transcriptor

**Transcriptor** transforme la voix en texte, directement dans votre navigateur.

- 🎙️ Transcription depuis le micro ou depuis un fichier audio.
- 🔒 **Respect de la vie privée** : l'audio est traité sur votre appareil,
  rien n'est envoyé sur internet.
- 📴 **Fonctionne hors ligne** : le modèle de reconnaissance vocale se
  télécharge une seule fois, puis l'application marche sans connexion.
- 📱 Pensée d'abord pour le téléphone (Android), installable comme une
  application (PWA).
- 🇫🇷 Interface en français ; transcription en français par défaut, avec
  d'autres langues au choix.

> **État actuel :** le socle de l'application est en place (page d'accueil,
> installation, mode hors ligne). La transcription n'est pas encore codée.

## Feuille de route

1. Transcrire une voix (micro ou fichier audio).
2. Reconnaître jusqu'à 6 voix différentes (« Intervenant 1 », « Intervenant 2 »…).
3. Générer des sous-titres pour des vidéos (`.srt` et `.vtt`).
4. Publier l'application sur le Google Play Store.

## Petit lexique

- **PWA** (Progressive Web App) : un site web qu'on peut « installer » sur son
  téléphone comme une vraie application, et qui peut marcher hors ligne.
- **Whisper** : un modèle d'intelligence artificielle, gratuit, qui reconnaît
  la parole.
- **Transformers.js** : une bibliothèque JavaScript qui permet de faire tourner
  Whisper directement dans le navigateur.
- **Serveur local** : un petit programme qui « sert » les fichiers du projet à
  votre navigateur, comme le ferait un vrai site web, mais sur votre ordinateur.

## Lancer le projet en local (sur votre ordinateur)

On ne peut pas simplement double-cliquer sur `index.html` : les navigateurs
bloquent certaines fonctions (modules JavaScript, micro, mode hors ligne)
quand une page est ouverte directement depuis le disque. Il faut passer par
un **serveur local**. Voici deux façons simples, choisissez-en une.

### Option A — avec Python (souvent déjà installé)

1. Ouvrez un terminal dans le dossier du projet.
2. Tapez :
   ```bash
   python3 -m http.server 8000
   ```
   (Sous Windows, essayez `python -m http.server 8000` ou `py -m http.server 8000`.)
3. Ouvrez votre navigateur à l'adresse : <http://localhost:8000>
4. Pour arrêter le serveur : revenez dans le terminal et appuyez sur `Ctrl + C`.

### Option B — avec Node.js

1. Installez Node.js depuis <https://nodejs.org> (version « LTS »).
2. Dans un terminal ouvert dans le dossier du projet, tapez :
   ```bash
   npx serve .
   ```
3. Ouvrez l'adresse affichée dans le terminal (par exemple <http://localhost:3000>).

### Tester sur le téléphone

Le micro ne fonctionne que sur une adresse sécurisée (`https://`) ou sur
`localhost`. Le plus simple pour tester sur le téléphone sera donc la version
publiée sur **GitHub Pages** (en `https://`), que nous mettrons en place
plus tard.

## Organisation des fichiers

```
index.html          page d'accueil
manifest.json       fiche d'identité de la PWA (nom, icônes, couleurs)
sw.js               service worker : garde une copie de l'application pour le hors ligne
.nojekyll           dit à GitHub Pages de publier les fichiers tels quels
css/style.css       apparence (thème clair et sombre automatique)
js/app.js           point de départ du JavaScript
js/pwa/             installation de l'application et mode hors ligne
icons/              icônes de l'application
```

## Publier sur GitHub Pages

1. Sur GitHub, ouvrez le dépôt, puis **Settings** (Paramètres) → **Pages**.
2. Dans **Build and deployment** → **Source**, choisissez **Deploy from a branch**.
3. Dans **Branch**, choisissez la branche à publier et le dossier **/ (root)**,
   puis cliquez sur **Save**.
4. Attendez 1 à 2 minutes, puis rechargez la page **Settings → Pages** :
   l'adresse du site s'affiche en haut (par exemple
   `https://ferrusdantioch.github.io/Transcriptor/`).

Tous les chemins du projet sont **relatifs** (ils commencent par `./`) : le
site fonctionne donc dans le sous-dossier `/Transcriptor/` sans réglage
supplémentaire.

## Technologies

- HTML, CSS et JavaScript « simple » (modules ES), sans framework.
- [Transformers.js](https://huggingface.co/docs/transformers.js) pour faire
  tourner Whisper dans le navigateur.
- Hébergement gratuit sur GitHub Pages.

## Licence

À définir.
