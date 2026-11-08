# Références de formats

| Fichier | Nature | Fiabilité |
|---|---|---|
| `coco17_exemple_synthetique.json` | fichier COCO keypoints complet (categories.keypoints, annotations [x,y,v]) | **synthétique** : 3 poses identiques décalées, pour tester `anim import-coco` |
| `aseprite_exemple_forge.json` | sortie de `forge atlas --array` | produite par nous ; champs vérifiés contre les types de [aseprite-atlas](https://app.unpkg.com/aseprite-atlas@3.0.0/files/dist/types/Aseprite.d.ts), pas contre Aseprite |

## Vraies données : où les prendre (aucune n'a pu être téléchargée depuis ce bac à sable)
- **Aseprite** : l'application exporte `--data planche.json --format json-hash|json-array` ; un exemple réel
  (format tableau, `format: "I8"`, `frameTags`, `layers`, `slices`) est visible dans [ce dépôt](https://dev.ncot.uk/NCoT/TeapotCE/src/commit/2be8e5190f48d04cbb779caf6899514d86cac7d4/test/assets/player.json).
  Phaser lit ces fichiers (`createFromAseprite`) : bon test d'intégration côté jeu.
- **COCO-17 réel** : `person_keypoints_val2017.json` (site COCO) ou l'export « COCO Keypoints » de
  [CVAT](https://docs.cvat.ai/docs/dataset_management/formats/format-coco-keypoints/) (annotation manuelle de tes
  sprites, fichier `annotations/person_keypoints_*.json`). Le jeu pour illustrations animées vient de
  [Chen & Zwicker](https://ar5iv.labs.arxiv.org/html/2108.01819) (4 000 images, 17 points COCO) : lien de
  téléchargement non vérifié.
- **Sprites de jeu** : le jeu « Sprites » de [V7](https://www.v7labs.com/open-datasets/sprites) (672 personnages,
  20 animations, 60 px) n'indique ni licence ni points-clés ; [spraix](https://huggingface.co/datasets/pawkanarek/spraix_1024_best_96/blob/main/README.md?code=true)
  est en GPL-3.0 sans annotations de pose. Aucun jeu de sprites avec points-clés COCO n'a été trouvé.

## Données réelles récupérées (via GitHub, seul hôte joignable depuis ce bac à sable)
- **CMU mocap BVH** (`Shriinivas/cmubvh`, 2 505 clips zip, « no restrictions ») : utilisé pour `animlib/` ; voir `tools/fetch_cmu.sh`.
  Clips de combat repérés dans ses README : 90_05-07 (coup de pied sauté), 113_13 (coup de poing et de pied),
  144_05/06/09/10 (coups de pied de face), 144_13/14/20/21 (suites de coups de poing), 02_07-09 (escrime), 86_xx (mélanges).
- **Planches LPC** (`YingzhenLi/Sprites` : scripts + calques Liberated Pixel Cup, licences CC-BY-SA 3.0 et GPL-3.0, avec
  attribution) : planche 832×1344 en grille 13×21 de cases 64 px ; `sheetops slice` y retrouve bien 21 lignes × 13 colonnes
  (178 cellules) et `flatten`/`reintegrate` rendent l'image exacte (82 couleurs, palette 128). **Non copiées dans le dépôt**
  (obligations d'attribution et de partage à l'identique).
