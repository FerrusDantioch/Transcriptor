# Modèles de reconnaissance des voix (ne pas modifier à la main)

Ces deux petits modèles servent à reconnaître **qui parle** (diarisation).
Ils sont hébergés avec l'application (sur GitHub Pages) et téléchargés
une seule fois sur l'appareil, avec reprise possible.

| Dossier | Rôle | Origine | Licence |
|---|---|---|---|
| `pyannote-segmentation-3.0/` | repère qui parle quand (fenêtres de 10 s, 3 voix au plus par fenêtre) | [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0), conversion ONNX par [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-segmentation-models) | MIT, © 2022 CNRS (voir `LICENSE`) |
| `wespeaker-resnet34-LM/` | calcule une « empreinte vocale » (256 nombres) pour un passage de parole | [WeSpeaker](https://github.com/wenet-e2e/wespeaker) `voxceleb_resnet34_LM`, conversion ONNX par [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models) | CC BY 4.0 (modèle entraîné sur VoxCeleb), © les auteurs de WeSpeaker |

Fichiers ONNX utilisés tels quels (non modifiés). Les `config.json` indiquent
simplement le type de modèle à Transformers.js.

- Entrée de pyannote : `x` (audio 16 kHz, forme [1, 1, échantillons]) ; sortie `y`
  ([1, trames, 7] : silence, voix A, B, C, A+B, A+C, B+C). Une trame = 270 échantillons.
- Entrée de WeSpeaker : `feats` (bancs de filtres « fbank » 80 valeurs × trames) ;
  sortie `embs` (empreinte de 256 nombres).
