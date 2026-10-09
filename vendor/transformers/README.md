# Bibliothèques externes (ne pas modifier à la main)

Ces fichiers sont copiés tels quels depuis npm, pour que l'application
ne dépende d'aucun site externe (CDN) et fonctionne hors ligne.

| Fichier | Paquet npm | Version | Licence |
|---|---|---|---|
| `transformers.min.js` | `@huggingface/transformers` | 4.3.0 | Apache-2.0 (voir `LICENSE-transformers.txt`) |
| `ort-wasm-simd-threaded.asyncify.mjs` / `.wasm` | `onnxruntime-web` | 1.31.0-dev.20260914-8d85527a0 | MIT (© Microsoft Corporation) |

La version d'`onnxruntime-web` doit être **exactement** celle attendue par
`transformers.min.js` (indiquée dans le `package.json` de Transformers.js).
