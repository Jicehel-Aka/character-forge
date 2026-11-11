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

- SpriteKiln (MIT, Lucas Ramos) : planches 8 directions et JSON de caméra utilisés comme jeu de test pour `forge/hullcam.py`.

## Garde-robe de `modele.html` (docs/wardrobe/, ajoutée en novembre 2026)
Toutes les pièces sont **CC0 1.0** (domaine public, aucune attribution requise ; crédit volontaire ci-dessous). Récupérées via GitHub, converties en GLB par `tools/wardrobe/build.mjs`.
| Pack | Auteur | Licence | Pièces reprises | Source |
|---|---|---|---|---|
| Ultimate Modular Men Pack, Ultimate Modular Women Pack | Quaternius | CC0 1.0 | 97 pièces habillables (haut, bas, chaussures, tête, cheveux, sac) découpées dans les 21 personnages | https://quaternius.com/packs/ultimatemodularcharacters.html, .../ultimatemodularwomen.html (copie : github.com/trebeljahr/quaternius-showcase, `public/glb/`) |
| Modular Weapons Pack | Quaternius | CC0 1.0 | armes et boucliers | https://quaternius.com/packs/medievalweapons.html |
| Ultimate RPG Pack | Quaternius | CC0 1.0 | couronnes, colliers, sacs, gant, plastrons, objets | https://quaternius.com/packs/ultimaterpg.html |
| KayKit Character Pack : Adventurers 1.0 | Kay Lousberg | CC0 1.0 | armes, boucliers, livre, carquois | github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
Le dépôt `trebeljahr/quaternius-showcase` (visionneuse, code MIT) n'a servi que de miroir des GLB ; ses `LICENSES.md` confirme CC0 pour chaque pack.

## Bibliothèque d'animations de `modele.html` (docs/anims/, novembre 2026)
Animations **CC0 1.0** (aucune attribution requise ; crédit volontaire). Les GLB sont les fichiers d'origine dépouillés de leurs textures par `tools/anims/build.mjs`.
| Pack | Auteur | Licence | Contenu repris | Source |
|---|---|---|---|---|
| Universal Animation Library (version gratuite « Standard ») | Quaternius | CC0 1.0 | 45 animations (déplacements, combat, magie, assis, nage…) | https://quaternius.com/packs/universalanimationlibrary.html (copie : github.com/j-ponzo/gltf-universal-animation-library) |
| KayKit Character Pack : Adventurers 1.0 | Kay Lousberg | CC0 1.0 | 69 animations (mêlée 1/2 mains, tir, esquives, sauts, sorts…) du squelette `Knight.glb` | https://kaylousberg.itch.io/kaykit-character-pack-adventures |

## three.js GLTFExporter / TextureUtils (docs/vendor/three/addons/)
Copiés de three.js r160 (MIT), même version que le reste de `docs/vendor/three`, pour le bouton « Télécharger le modèle avec squelette (GLB) ».
