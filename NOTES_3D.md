# Notes sur l'extrapolation 3D (état des sources au 2026-11-08)

Ce document sépare **ce qui est établi par les sources** de **ce qui reste à tester**.

## CharacterGen — ce que disent les sources

- **Entrée** : une image d'un personnage de style **anime**, dans une pose quelconque. L'article dit accepter
  « any input body pose » ; il ne dit pas explicitement si le personnage doit être en pied. Les auteurs
  reconnaissent des pertes pour les poses extrêmes ou les points de vue inhabituels.
- **Méthode** : diffusion multi-vues (base Stable Diffusion 2.1) qui produit 4 vues du personnage en **A-pose**,
  puis reconstruction (triplane, SDF, mesh extrait par DMTet) et texture affinée par rétro-projection.
- **Données d'entraînement** (Anime3D) : 13 746 personnages stylisés issus de VRoidHub, rendus en A-pose et en poses
  de 10 animations Mixamo. Aucune licence n'est indiquée pour ce jeu de données : **à vérifier avant tout usage
  commercial**. Les poids ont une licence Apache-2.0 (fiche Hugging Face).
- **Sortie** (lue dans le code de l'app) : `output.obj` et `output.glb` dans `3D_Stage/outputs/@date-heure/`.
  Les couleurs sont cuites **par sommet** ; le matériau GLB est blanc. **Pas de squelette** : les auteurs ont rigué
  avec AccuRig (outil séparé) et montré le résultat dans Warudo.
- **Préparation de l'image** (app) : détourage avec un modèle anime (`isnetis` de skytnt), recadrage sur le
  personnage, canevas 2:3 redimensionné en **512×768**. Notre `gen3d` reproduit cette préparation ; notre détourage
  utilise `isnet-anime` (probablement le même modèle, non vérifié).
- **Vitesse** : moins d'une minute sur « un seul GPU » (non nommé). **VRAM : non documentée** (code en CUDA obligatoire,
  fp16/bf16 côté 2D). Pas de version CPU.
- **Version hébergée** : l'Espace Hugging Face `VAST-AI/CharacterGen` était en « Runtime error » à la vérification ;
  la copie `YUGOROU/CharacterGen` était en pause. Il faut donc un GPU local (ou en louer un).

### Ce qui reste incertain pour tes images
Tes 5 images sont semi-réalistes (rendu photo de style fantasy), pas anime, et ce sont des plans buste/taille.
Le modèle est entraîné sur des personnages anime en pied : **rien ne garantit un bon résultat**. Le seul moyen de
le savoir est un essai (une image, une minute de calcul).

## Alternatives généralistes (image → 3D), sans spécialisation personnage
Sources : comparatifs de blogs, **pas de benchmarks indépendants** ; aucun ne teste les personnages.

| Modèle | Licence (selon les sources) | VRAM annoncée |
|---|---|---|
| TRELLIS.2 | MIT | 16 Go ou 24 Go selon la source |
| Hunyuan3D 2.1 | licence communautaire Tencent **excluant l'UE, le Royaume-Uni et la Corée du Sud** | 10 à 29 Go selon l'étape |
| TripoSR | MIT | ~6 Go (moins de détails) |
| Stable Fast 3D | gratuite sous 1 M$ de chiffre d'affaires | ~8 Go |
| InstantMesh | Apache-2.0 | non indiquée |

Point important si tu es en France : **Hunyuan3D 2.1 est exclu par sa propre licence**. À lire : la licence peut changer.

## Rigging et animation (nécessaires pour « utiliser le personnage comme on veut »)
- CharacterGen ne rigue pas. Il faut un squelette pour animer, puis des animations (Mixamo en propose).
- Exigences d'un auto-rig : A-pose ou T-pose, surface unique et fermée, échelle humaine (~1,7–1,9 m), normales
  vers l'extérieur, pas d'accessoires dans le fichier.
- Échecs fréquents : pièces détachées (casque, gants), cheveux longs, capes, jupes, doigts mal rigués.
- Outils cités : Mixamo (gratuit avec compte Adobe, bipèdes uniquement, marqueurs à placer), AccuRig (utilisé par les
  auteurs), UniRig (open source, auto-hébergé), Meshy et Tripo (services hébergés).

## Chaîne complète pour des sprites animés (non testée de bout en bout)
```
image -> forge extract/gen3d -> CharacterGen (GPU) -> output.glb (A-pose, couleurs par sommet)
      -> nettoyage Blender (pièces détachées, échelle) -> rig + animation (Mixamo/AccuRig)
      -> forge turntable --anim-step N  (un dossier par angle)
      -> forge sprites (une spritesheet RGB565 par angle)
```

## Compléments de recherche (2e passe)

### Autres modèles image → personnage 3D
- **StdGEN** (CVPR 2025) : génère un personnage **décomposé en corps, vêtements et cheveux** à partir d'une image, en
  ~3 minutes. C'est le plus proche de « utiliser le personnage comme on veut » (changer de tenue, séparer les
  cheveux), mais les expériences portent sur de l'**anime** ; format, VRAM et licence ne sont pas indiqués sur la page
  du projet. Le code et les poids sont annoncés (dépôt `hyz317/StdGEN`, que je n'ai pas pu lire).
- **PSHuman** (CVPR 2025, licence MIT) : humains vêtus réalistes à partir d'une image, maillage texturé. **Plus de
  40 Go de VRAM** pour le modèle actuel (768 px) : hors de portée d'une carte grand public ; une version 512 px est
  seulement envisagée. Aucun format de sortie ni limite sur les accessoires n'est documenté.

### Détourage (testé ici sur tes images)
- `isnet-general-use` conserve nettement mieux les arcs, flèches et lances que `isnet-anime` sur tes images
  semi-réalistes (essai visuel sur 2 images, puis extraction sur les 5). **C'est maintenant le défaut.**
  `isnet-anime` reste préférable pour de vrais dessins anime.
- Le bâton sombre de l'image 1 est perdu par tous les modèles testés (isnet-anime, isnet-general-use, u2net).
- **BiRefNet** (souvent cité comme meilleur sur les structures fines) n'a pas pu être évalué : le processus est tué
  faute de mémoire dans un environnement de 8 Go sans GPU, comme dans l'[article de test de rembg](https://www.creativeainews.com/articles/rembg-background-removal-models-tested-2026/)
  qui constate la même chose sur 12 Go de RAM. À essayer sur ton PC : `--model birefnet-general`.
  Cet article ne teste que des photos, pas des illustrations ni des personnages.

### Sprites lisibles à petite taille (testé ici)
Comparaison visuelle de 6 variantes à 64 px de haut (frames des orques, agrandies ×3) :
- La version de base (réduction Lanczos + palette) est sombre et boueuse.
- **Contraste + saturation + relevé des tons sombres** (`--boost 0.8`) : gain de lisibilité net.
- **Contour sombre de 1 px** : détache la silhouette du fond. Le contour et le contraste sont maintenant les défauts.
- **Tramage** (Floyd-Steinberg ou Bayer) : trop de bruit à cette taille ; désactivé par défaut.
- **Réduction « nearest »** : un [article sur le pixel art](https://rangy.ai/blog/ai-pixel-art) la recommande, avec
  palette réduite et sans tramage ; sur nos sources photographiques elle laisse des poussières de pixels sur les
  flèches, donc Lanczos reste le défaut (`--resample nearest` pour comparer).
- Limite : jugement visuel sur 2 frames et fond gris, **pas sur l'écran réel de l'AKA**.
- Les outils commerciaux de rendu 3D → pixel art (ex. Pixel Kit pour Blender) rendent directement à basse résolution
  avec un shader dédié plutôt que de réduire une image haute définition ; piste à étudier pour la partie Blender.

### Sources (2e passe)
- [PSHuman (GitHub)](https://github.com/pengHTYX/PSHuman)
- [StdGEN, résumé arXiv](https://arxiv.org/abs/2411.05738) et [page du projet](https://stdgen.github.io)
- [Test des modèles rembg en 2026](https://www.creativeainews.com/articles/rembg-background-removal-models-tested-2026/)
- [Pixel art : pourquoi un redimensionnement n'en est pas](https://rangy.ai/blog/ai-pixel-art)
- [Image vers pixel art : méthode « true pixel »](https://sorceress.games/tutorials/true-pixel)

## Sources (1re passe)
- [CharacterGen (arXiv 2402.17214)](https://arxiv.org/html/2402.17214v3)
- [Fiche du modèle zjpshadow/CharacterGen](https://huggingface.co/zjpshadow/CharacterGen/blob/main/README.md?code=true)
- [Code de l'interface 3D (VAST-AI/CharacterGen)](https://huggingface.co/spaces/VAST-AI/CharacterGen/blob/main/3D_Stage/webui.py)
- [Code de l'app complète (copie YUGOROU)](https://huggingface.co/spaces/YUGOROU/CharacterGen/blob/main/app.py)
- [Hunyuan3D-2.1 vs TRELLIS.2 : licence, GPU, coût](https://image3d.io/compare/hunyuan3d-2-1-vs-trellis-2-2026/)
- [Open Source AI 3D Model Generator: 7 Best Options for 2026](https://www.cmarix.com/blog/top-open-source-ai-models-for-3d-image-generation/)
- [Automatic rigging explained](https://app.cinevva.com/guides/automatic-rigging-explained)

## Accessoires (3e passe)
Le détourage perd parfois l'arme (bâton sombre de l'image 1, arc de l'image 4). `forge/props.py` permet de la
remplacer : arc paramétrable (poignée, longueur, angle, courbure, corde tirée), flèche, lance, plus `erase` et
`restore`. Limites : les accessoires sont dessinés (simples, sans texture) ; `restore` se base sur la teinte et
peut laisser des bords irréguliers (visible sur le buste de l'image 4) ; l'arc et la flèche ne sont pas
reliés automatiquement (position de la corde tirée et direction de la flèche à décider, comme dans la pose).

## Base physique des équipements (4e passe)
`forge/gear.py` : règles (couches, zones, incompatibilités, masse, proportions en têtes) pour que les accessoires
et vêtements soient cohérents, y compris comme consignes pour une génération 3D ou le rigging (pièces séparées :
casque, gants, cape sont les points d'échec cités plus haut). Proportions = canon d'anatomie artistique, **non
vérifiées par sources dans cette session**. Rien n'est encore dessiné automatiquement : le module valide et place.

## Multi-images (5e passe)
TRELLIS (MIT) : le README annonce le « multi-image conditioning » (déc. 2024), méthode **sans réglage dédié**, donc
résultats variables ; GPU NVIDIA ≥ 16 Go (testé A100/A6000). L'exemple `example_multi_image.py` existe, son appel
exact n'a pas été lu. Une page tierce décrit « TRELLIS Multi-image » comme moins détaillé que TRELLIS.2.
CharacterGen n'accepte qu'une image. `forge consolidate` prépare les deux cas.

## Animations : état de l'existant (6e passe, 2026-11-08)
Lu directement : README d'Animated Drawings, pages APES, Sprite Sheet Diffusion, pose des personnages illustrés,
PerfectPixel Studio, Sprite Sheet Maker (Blender). Les autres résultats de recherche (Spritify, Pixel Kit, etc.) ne sont
connus que par leur titre : non évalués.
- **Animated Drawings (Meta, archivé le 09-03-25)** : code, poids et jeu de données Amateur Drawings en **MIT**.
  Anime un personnage 2D humanoïde à partir de fichiers **BVH** (mocap quelconque, squelette Mixamo par défaut),
  sorties GIF transparent / MP4, rendu sans écran possible. Annotations d'articulations corrigeables à la main
  (`fix_annotations.py`). Détection automatique via Docker + TorchServe (~16 Go de mémoire conseillés). C'est la
  brique la plus proche de « rejouer une animation apprise sur un autre personnage » ; à tester sur ton PC.
- **PerfectPixel Studio (MIT)** : application Go/React qui génère des planches 8 directions / 100+ actions, mais
  **via une API d'IA payante** (Gemini, OpenRouter, fal.ai, BytePlus : clé requise). Son post-traitement est à
  reprendre : centrage par centre de masse alpha, découpe des frames par profils de projection, contrôle de dérive
  d'identité (histogrammes de couleurs, hash perceptuel), palette partagée + grille, retry avec consignes corrigées,
  export Aseprite JSON + manifest (FPS, boucle, pivot des pieds).
- **Sprite Sheet Diffusion (arXiv 2412.03685)** : image de référence + suite de poses -> une image par pose (base
  Animate Anyone). Code et poids : non indiqués. Limites déclarées : détails fins (cheveux, accessoires) et
  cohérence du sujet ; évaluation qualitative sur 4 exemples.
- **APES (Adobe, CVPR 2022)** : extrait les parties articulées d'un personnage à partir d'une planche de poses, pour
  les recomposer en marionnette. Dépôt annoncé ; licence et poids non confirmés.
- **Pose des personnages illustrés (Chen & Zwicker, WACV 2022)** : OpenPose standard tombe à 0,49 (OKS@50) sur des
  illustrations, le modèle dédié atteint 0,898. Dépôt `ShuhongChen/bizarre-pose-estimator` : poids, démo, code ;
  **Docker + GPU**, personnage seul en pied ; licence non confirmée. Ce sont des illustrations, pas du pixel art :
  non testé sur sprites.
- **Sprite Sheet Maker (Blender 5.1+, GPL-3.0+)** : 3D animé -> planche de sprites, pixélisation intégrée,
  caméra auto, reprise après échec. Multi-angles et atlas non mentionnés.
- **Sources d'animations** : Quaternius (CC0), Kenney (CC0), Mixamo (gratuit avec compte Adobe, usage commercial
  sans redevance selon un résumé tiers ; bipèdes seulement ; vérifier les conditions Adobe pour redistribuer).
- **Constat** : ici, MediaPipe s'installe (0.10.32) mais sans l'ancienne API `solutions` ni modèle téléchargeable
  (hôtes non autorisés) : pas d'estimation de pose automatique dans ce bac à sable.

## Voxel : sprites multi-vues → volume (forge voxel)
Sans GPU : sculpture d'un volume (visual hull) à partir de 4 silhouettes orthogonales (face/dos/gauche/droite),
texturé par les vues (mélange pondéré par la normale lissée), export OBJ/PLY + turntable.
Testé sur planches LPC (lignes 8–11 = dos/gauche/face/droite) : IoU de re-rendu 0.72–0.91.
Limites : sprites légèrement vus de dessus (pas orthographiques), doublement de texture aux diagonales (45°),
l'a priori « ellipse » (--rounding 2) dégrade le rendu → désactivé par défaut.
Ex. : python -m forge voxel --sheet body.png hair.png -o out --name N --cell 64 --row0 8

### Diagonales (45°) — résultat des essais
- Aucun outil gratuit existant ne résout ça (sprite2model, Pixhull, SpriteToVoxel : voxels depuis 1 à 3 vues, pas de synthèse de vues intermédiaires ; sprite2model compile mais sa lecture « outfit » vise des sprites Tibia 32 px).
- Diagnostic : la géométrie est correcte à 45° (largeur de tête 21,9 vs 22 de face). Le « doublement » vient de la texture : face et profil peignent chacun un visage complet sur deux facettes voisines.
- Ajoutés : `--diag` (coupe octogonale par rangée, volume plus juste à 45°) et texturage dépendant de la caméra (net aux 4 axes, plus de mélange). Le doublement à 45° persiste : 4 vues ne contiennent pas l'information du 45°.
- Vraies solutions : (a) fournir les 8 directions (6+ planches RPG Maker/Tibia en ont) et les ajouter comme silhouettes/textures ; (b) synthèse de vues par modèle (Zero123++/Wonder3D/SV3D, GPU) pour générer les diagonales.

### 8 directions + caméras connues (forge/hullcam.py) — mesuré sur SpriteKiln (MIT)
SpriteKiln livre dans son JSON la caméra (orthographique, pitch 38°, 0,05 u/px, pivot, yaw par direction). `hullcam` sculpte le volume
avec ces caméras (convention de signes calibrée automatiquement ; exclure l'ombre au sol : alpha > 128).
Résultat sur le gargouille de l'exemple (silhouettes diagonales réelles, IoU) :
- 2 vues (face + côté) : 0,60 ; 4 axes : 0,84 (hors échantillon) ; 8 directions : 0,98. Volume −14 % avec les diagonales.
- Reconstruire une diagonale retirée (leave-one-out) depuis les 7 autres vues : IoU 0,85, erreur couleur 40/255 -> encore flou/fantôme.
Conclusion : avec les 8 directions fournies il n'y a rien à reconstruire aux 45° (elles existent) ; la 3D sert aux angles et poses nouveaux.
SpriteKiln sait aussi rendre un modèle 3D procédural (YAML/SDF) en 8 directions animées : piste pour « personnage modélisé -> toutes les animations ».

### Pose automatique sur planches de combattants (tools/pose_sprites.py)
YOLOv8-pose (ultralytics, AGPL-3.0 : outil externe, non redistribué ; poids `yolov8n-pose.pt` depuis les releases GitHub d'ultralytics)
détecte les 17 points COCO sur des sprites, à condition de cadrer serré (marge ×1,6, agrandissement ×4) : 0/36 sans, 123/138 et 130/138 avec sur deux planches magenta (6 colonnes × 23 lignes).
Les points sont à exprimer en coordonnées locales à la cellule, sinon le bassin « dérive » d'une colonne à l'autre.
`anim check` signale les os douteux (bras surtout) ; sur la ligne « coup de pied » l'animation apprise est reconnaissable (accroupi puis jambe tendue) mais les bras sont bruités.
Limite : une seule vue (profil/3-4) par image -> pas de 3D par sculpture ; ces planches servent à l'apprentissage d'animations, pas à `forge voxel`.

### Animation apprise -> sprites 8 directions (forge skiln + SpriteKiln)
`forge skiln modele.json --render` convertit les poses 2D apprises en clés SpriteKiln (cibles IK foot_L/R, hand_L/R, lean, bob ; échelle d'après la jambe 0,82) et produit les sprites avec le gabarit `humanoid`.
Essai : coup de pied appris sur un sprite de combattant (pose YOLO) -> 12 clés -> rendu 64 px en s/se/e (36 images, QA OK).
Limites : poses bruitées (bras), hauteur du coup de pied sous-estimée (portée IK 0,82), gauche/droite et sens « avant = +x » supposés, personnage = gabarit humanoid (pas encore bâti depuis nos parties/gear).

### forge -> personnage SpriteKiln (forge skiln-char)
`forge skiln-char exemple/orc_archer_skiln.json --anim modele.json --render` : build (largeur du tronc, tête), couleurs -> rampes de palette (ombres froides, lumières chaudes), équipement -> kits (casque, chapeau, capuche, cape, ceinture, bourse, bouclier, armes), puis idle + animation apprise en 8 directions.
Sans kit SpriteKiln (couleurs seulement) : armures, bottes, gants, lunettes, robes... ; à modéliser en SDF/YAML si besoin.

### Modification textuelle (forge skiln-char --edit)
`--edit "sans la cape, cheveux plus longs, les cheveux roux"` (FR/EN, règles à mots-clés, pas de LLM) : retire/ajoute de l'équipement, change d'arme, longueur/style des cheveux (chauve, queue de cheval, chignon, frange, volume), couleurs (peau, cheveux, cape, tissu, cuir ; « plus foncé/clair »), corpulence. Ce qui n'est pas compris est listé, jamais deviné. `--save` garde la nouvelle description ; les sprites sont recalculés (`--render`).

### Résolution (64 -> 128 px)
`forge skiln-char ... --size 128` : même spec, même cadrage, rendu en 13 s pour 66 images. À 128 px apparaissent yeux, bouche, mains, détail du chignon et contours plus fins (comparaison 64 ×4 / 128 ×2).
Coût AKA : une image RGB565 128×128 = 32 Ko (64×64 = 8 Ko) ; une animation de 8 images × 8 directions = 2 Mo -> à lire depuis la SD plutôt que de garder en RAM.
Les clips appris portent le suffixe `_forge` quand leur nom est celui d'un clip du gabarit (idle, walk, attack).

### Contrôle qualité à 256 px (combattante)
Défauts relevés : peau presque blanche (mains, visage) -> rampe de peau à lumières contenues ; visage sans sourcils ni bouche -> parties `brow_L` et `mouth` ajoutées dès `--size 96` ;
restent : mèches fines « bâtons » devant le visage, yeux en gros rectangles, cou masqué par le col, ceinture en « beignet » pendant le saut, membres en tubes, bottes sans cheville.

### Planche de 8 vues dessinée/IA sans caméra (forge hull8)
Test sur une planche 4×2 de combattante à l'éventail (fond magenta). Caméra inconnue : tangage, signes et décalages estimés par recalage croisé ; sculpture « par vote » (≥ 7 vues sur 8).
Cohérence des silhouettes : ≈ 0,6 (contre 0,98 sur SpriteKiln, rendu depuis un vrai 3D) : les 8 images d'une IA ne sont pas des rotations d'un même objet (pose, bras, pieds, éventail varient).
Hors échantillon (une vue retirée puis reconstruite) : IoU 0,64–0,68, erreur de couleur ≈ 62/255. Volume utilisable pour des tests, pas comme modèle final.
Sortie : PLY (nuage coloré) + tour de table. Pour un modèle propre : partir d'un personnage SpriteKiln (caméras connues, IoU 0,98) ou d'images multi-vues cohérentes.

## Nettoyage avant traitement (`forge hull8`, `forge/hullclean.py`)
Actif par défaut, `--no-clean` pour le couper. Ordre : stats robustes (z-score médiane/MAD sur hauteur, aire, largeur ; rapports des paires de vues opposées) → masques (halo de la couleur clé retiré sur les bords, îlots < 0,3 % et trous < 0,05 % comblés, lissage médian 3×3) → remise à l'échelle des vues aberrantes (|z|>2) → accord des normales de contour avec l'enveloppe consensuelle (vote N−2 des autres vues) → `clip_to_consensus` (optionnel, via l'API). Rapport : `<name>_clean_report.json`.
Mesures sur la planche IA « combattante à l'éventail » : halo retiré 556–862 px/vue, 1 îlot sur 3 vues, vue `sw` remise à l'échelle ×0,961 (z=+2,7), aucune vue suspecte, rapports opposés ≈ 1. Accord des normales faible (cos 0,21–0,71), vues les plus en désaccord : ne, sw. Cohérence IoU 0,594 → 0,73 (moyenne, après réglage pitch 10/vote 7). Limite : le nettoyage retire les artefacts de pixels, il ne rend pas cohérentes des vues dessinées par IA (IoU < 0,8 → volume de test seulement).

## Repeindre un modèle SpriteKiln avec une planche source (`forge skiln-paint`, `forge/skiln_paint.py`)
Idée : la géométrie et l'animation viennent de SpriteKiln (ossature, poses apprises), les détails de surface viennent du dessin.
1. G-buffer SpriteKiln (id de pièce, profondeur, normale) -> position de chaque pixel dans le **repère local de sa pièce** (suit le squelette).
2. Calage de chaque vue source sur la silhouette rendue (échelle + translation, affinées par IoU). Association colonnes source <-> directions : cyclique (signe, décalage) ; la silhouette seule ne tranche pas le sens (IoU 0,615 vs 0,614) -> `--sign` (ici +1, vérifié sur le sens du regard).
3. Accumulation par cellule locale (1,2 cm), pondérée par la normale ; seuls les pixels dont la **classe de couleur** (blanc/bleu/chair/noir) correspond au matériau de la pièce comptent : supprime le magenta de fond et les débordements entre pièces mal calées.
4. Repeinture de n'importe quelle image d'animation (plus proche cellule de la pièce), réduction par aire, palette commune échantillonnée à parts égales par pièce, contour 1 px.
Limites : calage rigide (la pose du dessin ≠ pose de repos du modèle -> bavures et taches sur le torse), pas d'ombrage SpriteKiln, correspondances de classes écrites à la main pour Kenji, une seule rangée source. Suite : caler avec la pose estimée de la vue source, calage par pièce, peinture lissée.
Seconde passe (correction des défauts, `skiln_paint.Learner.tables/paint`) : (a) calage par pièce (décalage ±7 px maximisant l'accord de classe de couleur), (b) débruitage : médiane des 7 plus proches cellules locales, (c) kimono et peau repeints en « albédo (percentile 75) x ombrage SpriteKiln » (plis et volumes propres, fini les taches), (d) chaussures blanches à semelle noire dans le modèle (`skiln_details.karate`). Reste à faire : visage (yeux, sourcils, bouche) et plis du kimono ; estimation de pose de la vue source.

## Visage : projection d'un portrait net (`forge/skiln_face.py`, option `--face` de `skiln-paint`)
Un portrait net (ici l'illustration de Kenji) est projeté sur les pièces du visage (head, nose, ears) : repères (yeux, nez, bouche, menton, oreille) <-> repères du modèle -> caméra orthographique du portrait par moindres carrés (lacet -68°, inclinaison -4°, erreur 11,6 px sur 480) -> rendu du modèle dans cette caméra -> échantillonnage dans le repère local de la tête, cellules de 5 mm, poids x6. `face_check.png` montre le modèle peint vu depuis la caméra du portrait : yeux, sourcil, bouche et cicatrice sont reproduits.
Limite mesurée : avec la caméra des sprites (tête de ~45 px à 256 px, ~12 px à 64 px) le visage devient illisible. Il faut une passe au niveau du sprite final (repères projetés + glyphes d'expression, ou tête plus grosse).
Option de modèle : `"face_texture": true` retire les yeux en relief du gabarit.

## Greffe de tête (`forge skiln-paint --transplant`, `forge/skiln_head.py`) : la méthode retenue pour le visage
Constat : une texture projetée sur un corps en volumes simples ne donne pas de visage lisible à 64–96 px (tête de 12–20 px), même avec un portrait net.
Méthode : corps = rendu natif SpriteKiln (propre, animé, ombrage cohérent) ; tête = vue source de la direction correspondante (dessinée par l'artiste), découpée à la ligne d'épaules (+ rubans bleus reliés à la tête, gants écartés, liseré magenta supprimé), mise à l'échelle sur la boîte des pièces de tête du modèle (bas-centre), les pièces de tête natives étant effacées. Réduction par aire, palette commune, contour 1 px.
Résultat : yeux, sourcils, bandeau et rubans lisibles en 256 px et encore reconnaissables en 96 px. Limites : la tête reste la même d'une image à l'autre (pas d'expression ni de rotation selon `head_pitch/head_yaw`), échelle de tête à régler (`--head-scale`), corps blanc générique.

## Marionnette 2D (`forge/puppet.py`, début) : constat sur la planche de Kenji
Détection du squelette (YOLOv8-pose) sur les 8 vues de la planche : tronc et jambes corrects, **bras faux sur la majorité des vues** (poings en garde devant le tronc, gants masquant coudes et poignets). Dans toutes les vues les avant-bras passent devant le tronc : découpés puis ré-articulés, ils laisseraient des trous et des doublons.
Conclusion : une marionnette (ou une texture projetée) demande une planche source en **pose neutre ou en A** (bras écartés du corps, mains visibles), pas une garde. Voir aussi le moucheté du tronc dans `skiln-paint` : il vient du même défaut.

## Source 3D Meshy (`forge meshy`, `forge/meshy.py`, `tools/meshy/render.html`)
GLB (aussi FBX/OBJ) -> sprites pixel art dans les 8 directions. Rendu three.js dans Chromium sans tête (playwright), caméra orthographique inclinée (38°), lumière fixe, animations/clips du fichier (`--anim`, `--frames`), pieds au sol et centrage sur la pose de repos. `--info` liste os, clips, textures, triangles. Réduction : suréchantillonnage (`--ss 4`), aire, palette commune, contour 1 px. `--yaw-offset` si le modèle ne regarde pas vers +Z (testé sur le Soldier de three.js : 180).
Dépendances : playwright + Chromium, npm (three@0.160 installé dans ~/.cache/forge).
À faire : retarget des animations apprises (forge anim -> os du squelette Meshy/Mixamo), vérification sur un vrai GLB Meshy.
