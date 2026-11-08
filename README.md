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
