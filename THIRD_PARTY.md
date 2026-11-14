# Projets externes et contenus tiers : ce qui est repris, comment, et sous quelle licence

**Licence du dépôt : MIT** (fichier `LICENSE`, copie dans `docs/LICENSE`), copyright « Jicehel-Aka ». Elle couvre le **code** et les contenus
créés par le propriétaire. Elle ne remplace pas les licences des éléments listés ci-dessous, qui gardent les leurs
(la plupart sont CC0 ou MIT, donc compatibles avec une publication sous MIT ; les éléments CC-BY-SA / GPL ne sont **pas** redistribués).

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
| Liberated Pixel Cup (LPC) sprites | CC-BY-SA 3.0 / GPL-3.0, attribution | jeu de test local pour `forge voxel`, non redistribué |
| SpriteKiln (Lucas Ramos) | MIT | planches 8 directions et JSON de caméra utilisés comme jeu de test pour `forge/hullcam.py` |

## Garde-robe de `modele.html` (docs/wardrobe/, ajoutée en novembre 2026)
Toutes les pièces sont **CC0 1.0** (domaine public, aucune attribution requise ; crédit volontaire ci-dessous). Récupérées via GitHub, converties en GLB par `tools/wardrobe/build.mjs`.
| Pack | Auteur | Licence | Pièces reprises | Source |
|---|---|---|---|---|
| Ultimate Modular Men Pack, Ultimate Modular Women Pack | Quaternius | CC0 1.0 | 97 pièces habillables (haut, bas, chaussures, tête, cheveux, sac) découpées dans les 21 personnages | https://quaternius.com/packs/ultimatemodularcharacters.html, .../ultimatemodularwomen.html (copie : github.com/trebeljahr/quaternius-showcase, `public/glb/`) |
| Modular Weapons Pack | Quaternius | CC0 1.0 | armes et boucliers | https://quaternius.com/packs/medievalweapons.html |
| Ultimate RPG Pack | Quaternius | CC0 1.0 | couronnes, colliers, sacs, gant, plastrons, objets | https://quaternius.com/packs/ultimaterpg.html |
| KayKit Character Pack : Adventurers 1.0 | Kay Lousberg | CC0 1.0 | armes, boucliers, livre, carquois | github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
| KayKit Character Pack : Adventurers 1.0 (personnages) | Kay Lousberg | CC0 1.0 | banque de personnages `docs/bank/` (Knight, Barbarian, Mage, Rogue, Rogue Hooded, animations retirées) | github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
Le dépôt `trebeljahr/quaternius-showcase` (visionneuse, code MIT) n'a servi que de miroir des GLB ; ses `LICENSES.md` confirme CC0 pour chaque pack.

## Bibliothèque d'animations de `modele.html` (docs/anims/, novembre 2026)
Animations **CC0 1.0** (aucune attribution requise ; crédit volontaire). Les GLB sont les fichiers d'origine dépouillés de leurs textures par `tools/anims/build.mjs`.
| Pack | Auteur | Licence | Contenu repris | Source |
|---|---|---|---|---|
| Universal Animation Library (version gratuite « Standard ») | Quaternius | CC0 1.0 | 45 animations (déplacements, combat, magie, assis, nage…) | https://quaternius.com/packs/universalanimationlibrary.html (copie : github.com/j-ponzo/gltf-universal-animation-library) |
| KayKit Character Pack : Adventurers 1.0 | Kay Lousberg | CC0 1.0 | 69 animations (mêlée 1/2 mains, tir, esquives, sauts, sorts…) du squelette `Knight.glb` | https://kaylousberg.itch.io/kaykit-character-pack-adventures |
| KayKit Character Pack : Adventurers 1.0 (personnages) | Kay Lousberg | CC0 1.0 | banque de personnages `docs/bank/` (Knight, Barbarian, Mage, Rogue, Rogue Hooded, animations retirées) | github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |

## three.js GLTFExporter / TextureUtils (docs/vendor/three/addons/)
Copiés de three.js r160 (MIT), même version que le reste de `docs/vendor/three`, pour le bouton « Télécharger le modèle avec squelette (GLB) ».

## Application React (src/, npm) : dépendances
Installées par `npm ci` (versions exactes dans `package-lock.json`), **non copiées** dans le dépôt ; le build `docs/assets/` les embarque.
| Paquet | Licence |
|---|---|
| react, react-dom, vite, @vitejs/plugin-react, three, express, @tailwindcss/vite, tailwindcss, motion, esbuild, tsx | MIT |
| jszip | MIT OU GPL-3.0 (choix : MIT) |
| lucide-react | ISC |
| dotenv | BSD-2-Clause |
| @google/genai, typescript | Apache-2.0 |
Les polices **JetBrains Mono** (OFL 1.1) et **Plus Jakarta Sans** (OFL 1.1) sont chargées depuis Google Fonts par `index.html` (pas de copie dans le dépôt ; une requête réseau vers Google à l'ouverture de la page).
Licences exactes : `npm ls --all` puis le champ `license` de chaque paquet ; à re-vérifier avant tout usage commercial.

## Images d'exemple de l'app React (src/assets/images/, copiées dans docs/assets/)
Ajoutées par le propriétaire (commit 7546d6b / 20d2499, « Add files via upload »). **Origine et droits NON documentés dans le dépôt** : aucune métadonnée EXIF/IPTC, aucune licence, aucune mention de source.
| Fichier | Contenu apparent | Origine / licence |
|---|---|---|
| `meshy_karate_front_*.jpg`, `meshy_karate_back_*.jpg` | karatéka vu de face / de dos (896×1200) | **inconnue** : le nom évoque Meshy, mais rien ne le prouve |
| `sample_character_bd_*.jpg` | « Gruumshka », guerrière de BD (896×1200) | **inconnue** ; un personnage de BD / de licence tierce reste du fan-art (voir README) |
| `sample_retro_game_*.jpg` | capture de jeu rétro (1376×768) | **inconnue** |
| `sample_spritesheet_*.jpg` | planche de sprites (1200×896) | **inconnue** |
**À faire par le propriétaire** : confirmer qu'il en détient les droits (ou qu'elles sont générées par lui) et l'indiquer ici ; sinon les retirer du dépôt (`src/data/samples.ts` les référence) avant de les publier sous MIT.

## Mannequin d'exemple (docs/exemple/mannequin.glb)
Mannequin procédural nommé `Mannequin_CC0`, exporté par three.js (GLTFExporter r187), avec squelette et clips Idle / Walk. Indiqué comme **modèle original CC0** par le propriétaire dans le README ; aucune source tierce n'a été trouvée dans le dépôt.

## Décodeurs GLB locaux de `modele.html` (docs/vendor/three/addons/, novembre 2026)
Lecture des GLB compressés (Draco, Meshopt, KTX2/Basis), 100 % hors ligne : fichiers copiés tels quels du paquet npm `three@0.160.0` (`examples/jsm/`), la même version que le reste de `docs/vendor/three`.
| Fichiers | Origine | Licence |
|---|---|---|
| `loaders/DRACOLoader.js`, `loaders/KTX2Loader.js`, `utils/WorkerPool.js` | three.js r160 | MIT |
| `libs/draco/gltf/draco_decoder.js`, `draco_decoder.wasm`, `draco_wasm_wrapper.js` | Google Draco (build « glTF ») | Apache 2.0 |
| `libs/meshopt_decoder.module.js` | meshoptimizer (Arseny Kapoulkine) 0.18 | MIT |
| `libs/basis/basis_transcoder.js`, `basis_transcoder.wasm` | Binomial Basis Universal | Apache 2.0 |
| `libs/ktx-parse.module.js` | donmccurdy/KTX-Parse | MIT |
| `libs/zstddec.module.js` | donmccurdy/zstddec (décodeur Zstandard, Facebook) | MIT / BSD |
