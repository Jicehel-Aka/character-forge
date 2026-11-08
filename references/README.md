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
