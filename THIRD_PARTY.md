# Projets externes : ce qui est repris, comment, et sous quelle licence

Principe : on réimplémente des **idées** (pas de copie de code) ou on appelle l'outil externe depuis ton PC.
Licences lues sur les pages/README des projets, à re-vérifier avant tout usage commercial.

| Projet | Licence | Intégration dans forge | Statut |
|---|---|---|---|
| Animated Drawings (Meta, archivé) | MIT (code, poids, données) | `anim export-bvh` écrit un BVH (squelette nommé Mixamo, mouvement dans le plan) à rejouer par lui ou par Blender ; `anim import-bvh` lit des BVH de mocap | BVH aller-retour exact sur nos 10 os animés ; chargement réel dans Animated Drawings **non testé** |
| PerfectPixel Studio | MIT | idées reprises : `atlas` (centre de masse, pivot aux pieds, manifest, JSON Aseprite, GIF), `qa --identity` (histogramme de couleurs), découpe par profils (`sheetops slice`), palette partagée | réimplémenté, testé sur 40 frames ; l'IA génératrice (clés API payantes) n'est **pas** reprise |
| Sprite Sheet Maker (Blender) | GPL-3.0+ | non embarqué (contamination GPL) : notre `turntable` + `atlas` couvrent le besoin ; l'extension reste utilisable en parallèle | lien seulement |
| Estimateurs de pose (bizarre-pose-estimator, etc.) | non confirmée | `anim import-coco` lit leur JSON COCO-17 | converti et vérifié sur données synthétiques ; **aucun estimateur lancé** (Docker+GPU) |
| APES (Adobe) | non confirmée | rien (code/poids non confirmés) ; `parts.json` manuel en attendant | veille |
| Sprite Sheet Diffusion | non indiquée | rien (code/poids non indiqués) | veille |
| Mixamo / Quaternius / Kenney | Mixamo : compte Adobe ; Quaternius, Kenney : CC0 | sources de BVH/animations pour `anim import-bvh` | non téléchargé ici |

## Données récupérées (4e ajout)
| Données | Licence / conditions | Usage |
|---|---|---|
| CMU Motion Capture (BVH cgspeed, via Shriinivas/cmubvh) | « aucune restriction » selon le README du dépôt (reprenant cgspeed) | `animlib/` (modèles appris), annotations dérivées ; BVH non copiés |
| LPC sprite sheets (via YingzhenLi/Sprites) | CC-BY-SA 3.0 / GPL-3.0, attribution | test de `sheetops` seulement, non redistribué |

- Liberated Pixel Cup (LPC) sprites : CC-BY-SA 3.0 / GPL-3.0 — utilisés uniquement comme jeu de test local pour `forge voxel`, non redistribués.
