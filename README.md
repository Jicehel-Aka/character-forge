# forge — de l'image d'un personnage aux assets de jeu (AKA / ESP32)

```
image ──► extract ──► sheet ──► persona          (2D, fiche, dialogue : tourne partout)
              │
              └──► gen3d ──► [CharacterGen, PC avec GPU] ──► turntable (Blender) ──► sprites
```

## Installation
```
pip install pillow numpy scipy rembg onnxruntime
```
(Python 3.9+ ; `rembg` télécharge son modèle `isnet-anime` au premier usage.)

## Commandes (`python -m forge ...`)

| Commande | Rôle | Testé |
|---|---|---|
| `extract IMG... -o out [--segment] [--model isnet-general-use] [--parts parts.json]` | détourage IA (défaut : isnet-general-use), éléments, parties nommées, palette, RGB565 | oui |
| `sheet DOSSIER` | crée `character.json` (palette + parties) et `character_sheet.html` | oui |
| `persona character.json [--lang fr\|en]` | `persona.md` (prompt système de dialogue) + `dialogue_seed.json`, sans réseau | oui |
| `gen3d DOSSIER` | prépare `charactergen_input.png` + `run_charactergen.bat/.sh`, détecte le GPU | oui (préparation) |
| `turntable MODELE -o out [--angles 8 --size 128 --anim-step N]` | rend N vues (et l'animation si le modèle est rigué) via Blender | **non** (pas de Blender ici) |
| `sprites DOSSIER_IMAGES -o out --name x [--height 64 --colors 24 --boost 0.8 --no-outline --dither ... --resample ...]` | spritesheet à palette partagée, contraste + contour, RGB565 LE, header C | oui |
| `pipeline IMG -o out [--parts parts.json]` | enchaîne extract + sheet + persona (si fiche remplie) + gen3d | oui |

## Accessoires : remplacer une arme ratée
Quand le détourage perd un arc, une flèche ou une lance, on le dit à l'outil (ou à Claude, qui écrit le JSON) :
`python -m forge extract img.png --segment --props props_orcs.json`. Voir `props_orcs.json` pour un exemple et
`forge/props.py` pour toutes les options : `erase` (vider les restes), `restore` (récupérer la peau perdue,
doigts, bord du corps), `props` (arc, flèche, lance dessinés propres, derrière ou devant le personnage).
Les coordonnées sont celles de l'image d'origine ; `python -m forge props` donne un aperçu rapide.

### Tailles réalistes des armes (props)
`person.head` (hauteur de tête en px) fixe la taille du personnage (7,5 têtes). Un arc se décrit par `kind` :
`short` 0,5 × taille, `standard` 0,75, `recurve` 0,93, `long` 1,1 ; la flèche vaut ≈ 0,43 × taille (`length:"auto"`,
`toward` pour viser un point). `python -m forge scale-chart -o echelle_arcs.png` dessine l'échelle.
Un arc réaliste est souvent coupé par le cadre d'un plan buste : l'outil l'indique dans la console.
`erase` accepte aussi `{"box":[x,y,w,h],"hue":[345,15],"sat":0.55}` pour n'effacer qu'une teinte (restes rouges).

## Équipements : base physique (`gear`)
`python -m forge gear list | check OBJET... | fit OBJET... --head 215 --top 40 --center 380 --build orc`
(ou `--file tenues_exemple.json --name archer_orque`). Le catalogue (`forge/gear.py`) décrit casque, casquette,
lunettes, bandeau, capuche, chemise, tunique, gambison, armures, épaulières, gants, pantalon, jupe, robe, bottes,
cape, carquois… par emplacement, couche (dessous → base → mi → armure → dessus), zones couvertes, taille en têtes,
masse et protection. `check` refuse les tenues impossibles (robe + pantalon, casque fermé + lunettes, plastron sans
vêtement dessous…) ; `fit` donne la boîte en pixels sur l'image. Les valeurs sont des **estimations** à ajuster.

## Plusieurs photos -> un seul modèle (`consolidate`)
`python -m forge consolidate analyze manifest.json [--decisions decisions.json]` puis `... build ... -o dossier`.
Le manifeste (voir `forge/multiview.py`) donne pour chaque image sa vue (front/back/left/right/three_quarter/face),
la hauteur de tête `head_px` si connue, et ce qu'elle montre (`attrs` : casque, arme, tenue…). L'outil :
- détecte les vues manquantes et **demande des images complémentaires** (dos, profils, pied) ;
- pose des **questions** quand une vue est inconnue ou qu'un attribut diffère d'une image à l'autre
  (tu réponds dans `decisions.json` : `{"weapon":"orc1.png"}` ou une valeur, `_primary` = image principale) ;
- valide la tenue fusionnée avec `gear` ;
- `build` met toutes les images à la même échelle (canevas 512x768 transparent) dans `refs/` et écrit
  `consolidation.json` + `REPORT.md` avec l'entrée pour TRELLIS multi-image (plusieurs images) ou CharacterGen (une seule).
Limites : les vues et attributs sont donnés par toi ou par Claude qui regarde les images (pas de reconnaissance
automatique) ; la génération 3D elle-même reste à lancer sur un PC avec GPU (non testée ici).

## Automatisation depuis un studio/IDE (`job`)
`python -m forge job run manifest.json -o JOB [--decisions d.json] [--3d-cmd "CMD {input} {outdir}"] --json`
Un seul appel enchaîne consolidation -> références -> GPU -> 3D -> turntable. Avec `--json`, une ligne JSON par
événement (`step`, `question`, `request`, `result`). Code de sortie 0 = terminé, 3 = il manque des réponses
(le studio les pose à l'utilisateur, écrit `decisions.json`, relance), 1 = erreur.
`--3d-cmd` branche n'importe quel générateur sur TON PC (CharacterGen, TRELLIS) ; son appel sans écran n'a pas
été vérifié, donc sans cette commande l'étape s'arrête proprement après avoir préparé les entrées.
Depuis un programme (C#, Python...) : lancer le processus, lire stdout ligne par ligne, afficher les questions.

## Reconstituer une planche : règles, harmonisation, découpe
Leçons complètes : `docs/LECONS_PLANCHES.md`. Trois commandes en sortent :
- `python -m forge animrules list | check PLANCHE --cell 160x152 --kinds tools/sheet_rebuild/kinds.json` (ou `--frames DOSSIER --kind walk`) :
  vérifie que chaque ligne FAIT son mouvement (marche = jambes qui alternent, accroupi = frames basses, chute = recul → genoux → sol…),
  avec une consigne de correction par règle échouée.
- `python -m forge harmonize DOSSIER --ref REF -o out --height 102 --width 1.10 --head-scale 1.30 --head-cut 0.30 --colors 28` :
  met des sprites d'une autre source au rendu du personnage de référence (taille, tête, palette, contour 1 px).
- `python -m forge sheetops split PLANCHE -o dossier --cell-h 152 --per-part 6` : coupe une planche trop haute en bandes de lignes.

### Récupérer le travail depuis « modèle 3D → sprites » (`docs/modele.html`)
Panneau **Exporter** (toujours visible à droite) : **Paquet complet (.zip)** (planche transparente + planche **fond magenta**, atlas **Aseprite**
JSON avec une étiquette par `animation_direction`, `.raw`/`.h` RGB565 par animation, images séparées, GIF animés, `LISEZ-MOI.txt`),
**Enregistrer dans un dossier…** (Chrome/Edge : écrit directement dans le dossier du projet), planche PNG (case « fond magenta »), atlas JSON,
GIF de la direction affichée, images `.zip`. **Générer toutes les animations** rend chaque clip du modèle avec les mêmes réglages et les
range dans la bibliothèque, exportée d'un seul bloc. Le `LISEZ-MOI` donne les commandes pour enchaîner `forge qa`, `animrules`, `harmonize`, `atlas`.
**Palette commune** (cochée par défaut avec « Générer toutes les animations », ou bouton **Unifier la palette**) : une seule palette RGB565 pour toute la bibliothèque, donc les mêmes couleurs d'une animation à l'autre.

### Ajouter squelette et animations venus d'autres fichiers (`docs/modele.html`)
Carte **Squelette et animations d'autres fichiers**, sous la vue 3D :
- **Ajouter des animations… (FBX / GLB)** : un ou plusieurs fichiers (clips Mixamo, bibliothèques d'animations, autre modèle animé).
  Chaque clip est **reciblé** sur le squelette du modèle : les os sont appariés par nom canonique (`mixamorig:LeftUpLeg` = `Bip01 L Thigh` =
  `thigh_l`…), puis les rotations sont recopiées en repère monde relatif au repos (indépendant des axes locaux, des unités et du nombre d'os ;
  les os sans équivalent gardent leur repos). Le déplacement du bassin est mis à l'échelle de la jambe, et supprimé si « sur place » est coché.
  Les clips rejoignent la liste Animation et « Générer toutes les animations » ; le rapport donne les os appariés (refus sous 8 os ou sans bassin).
- **Ajouter un squelette… (modèle sans os)** : pose le squelette d'un autre fichier (ex. un FBX Mixamo) sur un maillage statique : mise à
  l'échelle sur la hauteur, recentrage des jambes et bras sur la coupe du maillage, poids = segment d'os le plus proche, lissés sur le maillage
  (sommets soudés par position pour éviter les fissures aux coutures UV).
Hypothèses/limites : modèle debout, de face, en T ou en A (même pose que le squelette) ; rigs très atypiques (danseuse : os « Leg_-_HipR »…)
n'apparient que quelques os ; aucun poids peint à la main. Test : `tests/ui_modele_rig.py` (Playwright).

## Contrôle qualité des frames (`qa`)
`python -m forge qa DOSSIER_FRAMES [--max-colors 24]` : cadre coupé, poussières, alpha semi-transparent, nombre de
couleurs, taille et ligne des pieds d'une frame à l'autre ; chaque problème donne une consigne de correction.
À lancer sur des sprites, pas sur les références haute définition (qui déclenchent « couleurs » et « alpha » à raison).

## Interface graphique (`docs/index.html`)
Page statique, sans serveur ni dépendance : s'ouvre en local (double-clic) ou via GitHub Pages
(Settings > Pages > Branch `main`, dossier `/docs`). Onglets : détourage (couleur de fond + gomme/restaurer),
zones à effacer et parties nommées, armes à taille réelle (arc court/standard/recurve/long, flèche), tenue
(règles de `gear`), sprite RGB565 (palette, contour, export .h/.raw/.png), multi-vues (vues manquantes, questions,
décisions), export de `props.json`, `parts.json`, `manifest.json`, `decisions.json` et commandes à lancer.
Limites : le détourage IA, le rendu définitif des armes et la 3D restent des commandes Python (`forge`) ou le
notebook Colab ; l'aperçu des armes est approché. `tools/export_gear_json.py` régénère `docs/gear.js` depuis
`forge/gear.py` (la CI vérifie qu'ils sont synchronisés). GitHub Pages n'est pas disponible pour un dépôt privé
en compte gratuit : rendre le dépôt public ou ouvrir `docs/index.html` en local.

## Planches de sprites : découpe, export à plat, réintégration (`sheetops`)
`python -m forge sheetops slice planche.png -o dossier` : détecte la grille et écrit `frames/*.png` + `sheet.json`.
`sheetops flatten planche.png -o dossier -f 4 [--colors 64]` : agrandissement à plat (pixels carrés) +
`palette.json` + `meta.json` ; on retouche `flat.png` dans un éditeur de pixel art.
`sheetops reintegrate flat_retouché.png -m dossier/meta.json -o planche.png` : retour à la résolution d'origine,
recollage sur la palette (`--no-snap` pour garder de nouvelles couleurs), clé de transparence restaurée.
Testé : aller-retour sans perte sur une planche, et une retouche de 10×10 px revient à l'identique. Agrandir ne
crée pas de détail ; une source compressée (webp/jpg) est ramenée à `--colors` couleurs.

## Mode apprentissage des animations (`anim`)
`python -m forge anim check annot.json` (cohérence des os) · `anim learn a.json b.json --type walk --loop -o animlib`
(moyenne circulaire des angles d'os de plusieurs exemples) · `anim generate animlib/walk.json --character pose.json
--frames 12 --height 64` (rejoue sur un autre squelette ; aperçu bonhomme-bâton `walk_gen.png`).
Une annotation = JSON `{"facing":"right","loop":true,"frames":[{"pelvis":[x,y],"neck":[..],...15 articulations}]}`
(voir `forge/anim.py`). Testé sur des données **synthétiques** (marche artificielle, 3 « exemples » à proportions
différentes : écart moyen 2,4°) ; pas encore sur de vraies planches. Les articulations sont à annoter (ou à importer
d'un estimateur lancé sur ton PC). Limite : vue de côté seulement (angles dans le plan de l'image). L'export
Blender (`to_blender`) et le rendu 3D des poses restent à écrire/tester.

### Ponts avec l'existant (voir THIRD_PARTY.md)
`anim import-bvh mocap.bvh --forward x [--flip] --loop` : apprend une animation depuis un mocap (Mixamo, Quaternius…
noms de nœuds Mixamo requis) ; `anim import-coco kp.json` : depuis un estimateur de pose (COCO-17) ;
`anim export-bvh animlib/walk.json` : BVH rejouable ; `atlas frames/ -o out --name walk --fps 12` : atlas aligné aux
pieds + JSON Aseprite + manifest + GIF ; `qa dossier --identity` : dérive d'identité des couleurs (seuils non calibrés).
Les 4 petits os (clavicules, bassin) ne sont pas animés à l'export BVH.

## Parties nommées
`parts.json` : `{"image.png": {"head": [x,y,w,h], "body": [...], "weapon": [...]}}`.
Les boîtes sont décidées en regardant l'image (par Claude ou à la main), puis découpées dans le détourage.

## Étape 3D (CharacterGen)
- Voir **NOTES_3D.md** : fonctionnement, limites, licences, alternatives et sources.
- `gen3d` prépare l'image (512x768, fond transparent, comme l'app) et les scripts ; **le lancement se fait sur un PC
  avec GPU NVIDIA** (VRAM non documentée).
- Sortie : `output.glb` / `output.obj` en A-pose, couleurs par sommet, **sans squelette**. À copier dans `mesh/`.
- Résultat incertain sur des images semi-réalistes ou en plan buste (modèle entraîné sur de l'anime en pied).

## Ce que l'outil ne fait pas
- Il n'utilise pas l'API non officielle Character AI (token navigateur, conditions du service) :
  la persona est un fichier texte à donner à n'importe quel LLM ou moteur de dialogue.
- Le script Blender (`forge/blender/render_turntable.py`) est écrit mais non exécuté ici.
- Les armes fines (arcs, lances) sont souvent mal détourées par le modèle.

## Licence

Création originale de Jicehel (Jean-Charles Lebeau), publiée sous licence **[Creative Commons Attribution - Pas d'Utilisation Commerciale 4.0 (CC BY-NC 4.0)](LICENSE)** : tu peux copier, modifier et partager librement, avec mention de l'auteur, mais pas à des fins commerciales. Le texte complet est dans le fichier [LICENSE](LICENSE). Les bibliothèques et ressources tierces gardent leur propre licence.
