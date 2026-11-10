import argparse
from pathlib import Path

from . import hullfit, skiln_char, to_spritekiln, anim, assets, atlas, flat, gear, gen3d, job, multiview, qa, voxel, persona, pipeline, props, sheet, sprites, turntable


def add_extract_args(p):
    p.add_argument("--colors", type=int, default=16)
    p.add_argument("--tol", type=int, default=24, help="tolérance couleur de fond (sans --segment)")
    p.add_argument("--merge", type=int, default=3, help="fusion des pièces proches (px)")
    p.add_argument("--min-area", type=int, default=16)
    p.add_argument("--max-size", type=int, default=64, help="taille max RGB565 (0 = pas de redim.)")
    p.add_argument("--big-endian", action="store_true")
    p.add_argument("--no-rgb565", action="store_true")
    p.add_argument("--segment", action="store_true", help="détourage IA du personnage (rembg)")
    p.add_argument("--model", default="isnet-general-use", help="modèle rembg (isnet-general-use: images semi-réalistes ; isnet-anime: anime)")
    p.add_argument("--alpha-thr", type=int, default=128)
    p.add_argument("--parts", help="JSON {fichier: {partie: [x,y,w,h]}}")
    p.add_argument("--props", help="JSON d'accessoires à dessiner/effacer (voir forge/props.py)")


def main(argv=None):
    p = argparse.ArgumentParser(prog="forge", description="Image de personnage -> assets de jeu")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("extract", help="extraction 2D : éléments, parties, palette, RGB565")
    s.add_argument("images", nargs="+")
    s.add_argument("-o", "--output", default="output")
    add_extract_args(s)

    s = sub.add_parser("props", help="aperçu : applique les accessoires d'un JSON sur un détourage")
    s.add_argument("cutout")
    s.add_argument("spec")
    s.add_argument("--name", required=True, help="nom de l'image dans le JSON (ex. orc4.png)")
    s.add_argument("-o", "--output", required=True)

    s = sub.add_parser("scale-chart", help="schéma des tailles d'arcs par rapport à une personne")
    s.add_argument("-o", "--output", default="echelle_arcs.png")

    s = sub.add_parser("gear", help="base physique des équipements : list | check | fit")
    s.add_argument("action", choices=["list", "check", "fit"])
    s.add_argument("items", nargs="*", help="noms d'objets (ex. shirt pants helmet_open)")
    s.add_argument("--file", help="JSON {tenue: [objets]}")
    s.add_argument("--name", help="nom de la tenue dans --file")
    s.add_argument("--head", type=float, default=100, help="hauteur de tête en px (fit)")
    s.add_argument("--top", type=float, default=0, help="y du sommet du crâne (fit)")
    s.add_argument("--center", type=float, default=0, help="x de l'axe du corps (fit)")
    s.add_argument("--build", default="human", help="human|slim|stocky|orc|child")

    s = sub.add_parser("consolidate", help="plusieurs photos d'un personnage -> références 3D (analyze | build)")
    s.add_argument("action", choices=["analyze", "build"])
    s.add_argument("manifest", help="JSON des images (vues, attributs) — voir forge/multiview.py")
    s.add_argument("--decisions", help="JSON de tes réponses aux questions")
    s.add_argument("-o", "--output", default="consolidated")
    s.add_argument("--model", default="isnet-general-use")

    s = sub.add_parser("job", help="tout enchaîner en un appel (pour un studio/IDE) : événements JSON, reprise")
    s.add_argument("action", choices=["run"])
    s.add_argument("manifest")
    s.add_argument("-o", "--output", required=True)
    s.add_argument("--decisions")
    s.add_argument("--3d-cmd", dest="cmd3d", help='commande du générateur 3D, ex. "python run.py --in {input} --out {outdir}"')
    s.add_argument("--json", action="store_true", help="une ligne JSON par événement")
    s.add_argument("--model", default="isnet-general-use")

    s = sub.add_parser("qa", help="contrôles qualité d'un dossier de frames (cadre, poussières, taille, pieds, couleurs)")
    s.add_argument("folder")
    s.add_argument("--max-colors", type=int, default=24)
    s.add_argument("--identity", action="store_true", help="ajoute le contrôle de dérive d'identité (couleurs)")
    s.add_argument("--json")

    s = sub.add_parser("sheetops", help="planche de sprites : slice | flatten | reintegrate")
    s.add_argument("action", choices=["slice", "flatten", "reintegrate"])
    s.add_argument("sheet", help="planche (slice/flatten) ou image retravaillée (reintegrate)")
    s.add_argument("-o", "--output", required=True)
    s.add_argument("-f", "--factor", type=int, default=4)
    s.add_argument("-m", "--meta", help="meta.json produit par flatten (reintegrate)")
    s.add_argument("--colors", type=int, default=64, help="flatten : palette maximale si la source en a plus (bruit)")
    s.add_argument("--no-snap", action="store_true", help="ne pas recoller sur la palette d'origine")
    s.add_argument("--limit", type=int, default=0, help="slice : n'écrire que N cellules")

    s = sub.add_parser("anim", help="mode apprentissage : check | learn | generate (voir forge/anim.py)")
    s.add_argument("action", choices=["check", "learn", "generate", "import-bvh", "import-coco", "export-bvh"])
    s.add_argument("inputs", nargs="+", help="annotations .json (check/learn) ou modèle appris (generate)")
    s.add_argument("--type", default="anim", help="nom du type d'animation (learn)")
    s.add_argument("--frames", type=int, default=16, help="images du modèle (learn) / à générer (generate)")
    s.add_argument("--loop", action="store_true", help="animation cyclique (marche, idle)")
    s.add_argument("--forward", choices=["x", "y", "z", "auto"], default="x", help="import-bvh : axe « avant » du mocap")
    s.add_argument("--flip", action="store_true", help="import-bvh : inverser le sens avant/arrière")
    s.add_argument("--skip", type=int, default=0, help="import-bvh : ignorer les N premières images (ex. T-pose de CMU)")
    s.add_argument("--count", type=int, default=0, help="import-bvh : ne garder que N images après --skip")
    s.add_argument("--cycle", action="store_true", help="import-bvh : ne garder qu'un cycle (marche, course…)")
    s.add_argument("--stride", type=int, default=1, help="import-bvh : garder 1 image sur N")
    s.add_argument("--character", help="JSON d'une pose annotée du personnage cible (proportions)")
    s.add_argument("--height", type=float, default=64.0, help="hauteur tronc+jambe en px (generate)")
    s.add_argument("-o", "--output", default="animlib")

    s = sub.add_parser("atlas", help="export moteur : atlas aligné + JSON Aseprite + manifest + GIF")
    s.add_argument("frames_dir")
    s.add_argument("-o", "--output", required=True)
    s.add_argument("--name", default="anim")
    s.add_argument("--fps", type=int, default=12)
    s.add_argument("--no-loop", action="store_true")
    s.add_argument("--array", action="store_true", help="frames en tableau (json-array) au lieu d'un dictionnaire (json-hash)")

    s = sub.add_parser("voxel", help="4 vues (face/dos/gauche/droite) -> objet 3D par sculpture de voxels + rendus multi-angles")
    s.add_argument("-o", "--output", default="voxel_out")
    s.add_argument("--name", default="perso")
    s.add_argument("--sheet", nargs="+", help="planche(s) LPC (calques composés dans l'ordre)")
    s.add_argument("--cell", type=int, default=64); s.add_argument("--col", type=int, default=0)
    s.add_argument("--row0", type=int, default=8, help="1re ligne des 4 directions (dos, gauche, face, droite) ; 8 = marche LPC")
    s.add_argument("--refs", help="dossier refs/ de `consolidate build`")
    for k in ("front", "back", "left", "right"): s.add_argument("--" + k, help=f"image de la vue {k}")
    s.add_argument("--size", type=int, default=64, help="résolution de la grille (voxels)")
    s.add_argument("--diag", type=float, default=1.0, help="coupe diagonale (45°) : 0 = aucune (boîte), 1 = octogone calé sur une ellipse")
    s.add_argument("--rounding", type=float, default=0.0, help="0 = hull pur (défaut, meilleur rendu mesuré), 2 = ellipse, 6+ = boîte")
    s.add_argument("--angles", type=int, default=8); s.add_argument("--out-size", type=int, default=96)

    s = sub.add_parser("skiln", help="animation apprise -> clip SpriteKiln (spec YAML) ; --render pour produire les sprites 8 directions")
    s.add_argument("model", help="modèle appris (forge anim learn) ")
    s.add_argument("-o", "--output", default="skiln_out"); s.add_argument("--name", default=None)
    s.add_argument("--frames", type=int, default=12); s.add_argument("--height", type=float, default=60)
    s.add_argument("--ms", type=int, default=80); s.add_argument("--loop", action="store_true")
    s.add_argument("--render", action="store_true", help="lance `spritekiln render` (pip install spritekiln)")
    s.add_argument("--dirs", default="s,se,e,ne,n,nw,w,sw")

    s = sub.add_parser("skiln-char", help="description de personnage forge (build/couleurs/équipement) -> spec SpriteKiln, sprites 8 directions")
    s.add_argument("character", help="JSON : name, build, colors, gear, weapon, head")
    s.add_argument("-o", "--output", default="skiln_char"); s.add_argument("--anim", nargs="+", help="modèle(s) appris à ajouter (forge anim learn)")
    s.add_argument("--edit", help="modification en texte : « sans la cape, cheveux plus longs »"); s.add_argument("--save", help="enregistrer la description modifiée")
    s.add_argument("--anim-name", nargs="+"); s.add_argument("--frames", type=int, default=12); s.add_argument("--ms", type=int, default=80)
    s.add_argument("--render", action="store_true"); s.add_argument("--dirs", default="s,e,n"); s.add_argument("--size", type=int, default=64, help="taille d'une image : 64, 96, 128…")

    s = sub.add_parser("skiln-paint", help="repeint un modèle SpriteKiln avec les couleurs d'une planche source (8 vues), en coordonnées locales des pièces")
    s.add_argument("spec"); s.add_argument("sheet", nargs="?", default=None); s.add_argument("--views", default=None, help="dossier de vues détourées (big_<dir>.png de forge shots)"); s.add_argument("--row", default=None, help="y0,y1 de la rangée de 8 vues dans la planche")
    s.add_argument("-o", "--output", default="paint_out"); s.add_argument("--anims", nargs="+", default=["idle"]); s.add_argument("--dirs", default="s,se,e,ne,n,nw,w,sw")
    s.add_argument("--size", type=int, default=256); s.add_argument("--final", type=int, default=64); s.add_argument("--meta", default=None, help="JSON SpriteKiln (direction_yaw)")
    s.add_argument("--face", default=None, help="JSON {portrait, window:[x0,y0,w], points:{eye_near,eye_far,nose,mouth,chin,ear}} : portrait net projeté sur la tête")
    s.add_argument("--transplant", action="store_true", help="corps natif SpriteKiln + tête recopiée de la vue source (visage lisible)"); s.add_argument("--head-scale", type=float, default=1.0)
    s.add_argument("--sign", type=int, choices=[1, -1], default=None, help="sens de rotation des colonnes source (sinon choisi par IoU : ambigu)")

    s = sub.add_parser("meshy", help="modèle 3D Meshy (GLB/FBX/OBJ) -> sprites pixel art 8 directions, animations du fichier")
    s.add_argument("model"); s.add_argument("--info", action="store_true", help="liste os, clips, textures, triangles"); s.add_argument("-o", "--output", default="meshy_out")
    s.add_argument("--size", type=int, default=64); s.add_argument("--ss", type=int, default=4, help="facteur de suréchantillonnage avant réduction"); s.add_argument("--dirs", default="s,se,e,ne,n,nw,w,sw")
    s.add_argument("--anim", default=None, help="nom d'un clip du fichier"); s.add_argument("--frames", type=int, default=1); s.add_argument("--pitch", type=float, default=38)
    s.add_argument("--margin", type=float, default=1.25); s.add_argument("--colors", type=int, default=40); s.add_argument("--no-outline", dest="outline", action="store_false"); s.add_argument("--texture", default=None, help="atlas PNG appliqué aux UV (FBX sans textures intégrées)"); s.add_argument("--pad", type=float, default=0.04, help="marge autour du personnage (fraction), cadrage serré sur toutes les images"); s.add_argument("--no-separate", dest="separate", action="store_false", help="désactive les contours internes bras/jambes"); s.add_argument("--donor", default=None, help="FBX dont on greffe la tête sur le corps du modèle principal"); s.add_argument("--donor-texdir", default=None); s.add_argument("--donor-yaw", type=float, default=0); s.add_argument("--head-frac", type=float, default=0.82, help="seuil de hauteur (fraction) au-dessus duquel un maillage fait partie de la tête"); s.add_argument("--head-names", default=None, help="regex des maillages de la tête de la base"); s.add_argument("--donor-head-names", default=None); s.add_argument("--head-scale", type=float, default=1.0); s.add_argument("--head-drop", type=float, default=0.0, help="décalage vertical de la tête greffée (fraction de la hauteur de tête)"); s.add_argument("--tmax", type=float, default=None, help="n'échantillonner le clip que sur les tmax premières secondes"); s.add_argument("--texdir", default=None, help="dossier de textures : association automatique matériau -> image (diffuse/base color)"); s.add_argument("--yaw-offset", type=float, default=0, help="degrés ajoutés à toutes les directions si le modèle ne regarde pas vers +Z (glTF : +Z = avant)")

    s = sub.add_parser("hull", help="vues tournantes (8 captures à 45°) -> modèle 3D GLB couleur (enveloppe visuelle + projection des couleurs)")
    s.add_argument("images", nargs="+", help="vues dans l'ordre de rotation : face, 45°, profil, 135°, dos, 225°, profil opposé, 315°")
    s.add_argument("-o", "--output", default="modele.glb"); s.add_argument("--angles", default=None, help="angles en degrés séparés par des virgules (défaut 0,45,90,...)")
    s.add_argument("--vox", type=float, default=2.5, help="taille de voxel en pixels (plus petit = plus fin, plus lent)"); s.add_argument("--height", type=float, default=1.75, help="hauteur du modèle (m)")
    s.add_argument("--sign", type=int, choices=[1, -1], default=None, help="sens de rotation (auto par défaut)"); s.add_argument("--no-photo", action="store_true", help="pas d'affinage du calage par cohérence des couleurs")
    s.add_argument("--uv", type=int, default=0, metavar="N", help="texture UV cuite depuis les photos (atlas ~N px, ex. 2048 ; nécessite xatlas) au lieu des couleurs par sommet")
    s.add_argument("--smooth-colors", type=int, default=3)

    s = sub.add_parser("control", help="planche de contrôle + métriques (membres fins qui disparaissent) d'un ou plusieurs rendus forge meshy")
    s.add_argument("dirs", nargs="+"); s.add_argument("--rows", type=int, default=6)

    s = sub.add_parser("bank", help="banque de personnages (manifeste) : liste, rendu, greffe de tête d'un personnage sur le corps d'un autre")
    s.add_argument("action", choices=["list", "render"]); s.add_argument("name", nargs="?"); s.add_argument("--head", default=None, help="personnage donneur de la tête")
    s.add_argument("--bank", default=None); s.add_argument("--frames", type=int, default=12); s.add_argument("--size", type=int, default=64); s.add_argument("--dirs", default="s,se,e,ne,n,nw,w,sw"); s.add_argument("-o", "--output", default=None)

    s = sub.add_parser("rig", help="FBX statique T-pose + squelette Mixamo -> GLB skinné (accessoires séparés, clips Mixamo)")
    s.add_argument("model"); s.add_argument("--fit", action="store_true", help="cale les hauteurs (entrejambe, bras) du modèle sur le squelette : personnages chibi / proportions différentes"); s.add_argument("--skeleton", required=True, help="FBX Mixamo skinné de référence (ex. Idle.fbx)"); s.add_argument("--texture", default=None, help="absente : couleurs de sommets du modèle (GLB de `forge hull`)"); s.add_argument("--arm-down", type=float, default=0, help="modèle en pose A : angle des bras sous l'horizontale (ex. 60)"); s.add_argument("--noprops", action="store_true", help="pas de séparation hache/bouclier (personnage nu / vêtu)")
    s.add_argument("--clips", nargs="*", help="FBX Mixamo dont on embarque l'animation"); s.add_argument("-o", "--output", default="rigged.glb"); s.add_argument("--knn", type=int, default=8)
    s.add_argument("--skin", choices=["bones", "knn"], default="bones", help="poids de peau : distance aux os du squelette ajusté au personnage (défaut) ou copie kNN depuis le corps Mixamo (ancien)")
    s.add_argument("--rebind", action="store_true", help="(diagnostic, avec --skin knn) recalcule les inverses de liaison sur le squelette tel quel")
    s.add_argument("--skin-smooth", type=int, default=4, help="itérations de lissage des poids sur le maillage")
    s.add_argument("--skin-soft", type=float, default=1.0, help="douceur des transitions entre os (1 = défaut)")
    s.add_argument("--axe", default=None, help='JSON {"grip":[x,y,z],"rot":[dx,dy,dz],"pos":[x,y,z]} (repère main)'); s.add_argument("--shield", default=None); s.add_argument("--axe-bone", default=None); s.add_argument("--shield-bone", default=None)

    s = sub.add_parser("clips", help="ajoute des animations (FBX Mixamo, animation apprise) à un GLB déjà rigué")
    s.add_argument("model"); s.add_argument("--fbx", nargs="*", help="FBX Mixamo"); s.add_argument("--learned", nargs="*", help="modèles d'animation appris (JSON, ex. animlib/walk.json)")
    s.add_argument("--name", default=None); s.add_argument("--fps", type=float, default=10, help="images/s de l'animation apprise"); s.add_argument("--sign", type=float, default=-1, help="sens de rotation (-1 ou 1)"); s.add_argument("-o", "--output", default="rig_anim.glb")

    s = sub.add_parser("anim2d", help="GLB rigué + animations -> planches de sprites 2D sur fond magenta (plateforme / combat / aventure)")
    s.add_argument("model"); s.add_argument("--anim", nargs="*", help="clips du GLB (ou all) ; par défaut : les clips externes donnés, sinon tous")
    s.add_argument("--fbx", nargs="*", help="FBX Mixamo à jouer (sans modifier le GLB)"); s.add_argument("--learned", nargs="*", help="animations apprises (JSON, ex. animlib/walk.json)")
    s.add_argument("--preset", choices=["platformer", "combat", "adventure4", "adventure8"], default="platformer")
    s.add_argument("--size", type=int, default=64); s.add_argument("--ss", type=int, default=4); s.add_argument("--frames", type=int, default=8); s.add_argument("--colors", type=int, default=32)
    s.add_argument("--pitch", type=float, default=None, help="inclinaison caméra (0 = profil pur ; défaut selon le préréglage)"); s.add_argument("--margin", type=float, default=1.25); s.add_argument("--pad", type=float, default=0.02)
    s.add_argument("--fps", type=float, default=10, help="vitesse des animations apprises"); s.add_argument("--fps-play", dest="fps_play", type=float, default=12, help="fps indiqué dans le JSON"); s.add_argument("--sign", type=float, default=-1)
    s.add_argument("--no-outline", dest="outline", action="store_false"); s.add_argument("--no-separate", dest="separate", action="store_false"); s.add_argument("--tube", type=float, default=1.0, help="épaisseur sprite en gardant la forme (ligne médiane + disques) ; 1 = rayons standard (bras 3 px, jambes 4 px, poings 4 px), 0 = désactivé"); s.add_argument("--keep-renders", default=None, help="enregistre les rendus 3D (pour itérer vite)"); s.add_argument("--from-renders", default=None, help="réutilise des rendus enregistrés (pas de 3D)"); s.add_argument("--chunk", type=float, default=0.008, help="proportions sprite : gonfle mains/poings/pieds/avant-bras/jambes (fraction de la hauteur, 0 = désactivé)"); s.add_argument("--min-limb", type=int, default=2, help="épaisseur minimale d'un membre en pixels (0 = désactivé)"); s.add_argument("--thr", type=float, default=0.3, help="seuil de couverture d'un pixel (bas = garde les parties fines)"); s.add_argument("--no-match-light", dest="match_light", action="store_false", help="ne pas recaler la luminosité sur le rendu 3D"); s.add_argument("-o", "--output", default="sprites2d")

    s = sub.add_parser("shots", help="captures d'un visualiseur 3D (8 directions) -> sprites pixel art (détourage, échelle, alignement, réduction)")
    s.add_argument("images", nargs="+"); s.add_argument("--dirs", required=True, help="direction de chaque image, ex. sw,w,nw,n,ne,e,se,s")
    s.add_argument("-o", "--output", default="shots_out"); s.add_argument("--name", default="perso"); s.add_argument("--size", type=int, default=96)
    s.add_argument("--colors", type=int, default=40); s.add_argument("--no-outline", dest="outline", action="store_false")

    s = sub.add_parser("hull8", help="planche de 8 vues sans caméra connue (dessin/IA) -> volume 3D de test (PLY) + tour de table")
    s.add_argument("sheet"); s.add_argument("-o", "--output", default="hull8_out"); s.add_argument("--name", default="perso")
    s.add_argument("--cols", type=int, default=4); s.add_argument("--rows", type=int, default=2); s.add_argument("--key", default="ff00ff")
    s.add_argument("--pitch", type=float, default=10); s.add_argument("--vote", type=int, default=7, help="vues minimales contenant un voxel (8 = intersection stricte)")
    s.add_argument("--angles", type=int, default=8); s.add_argument("--no-clean", dest="clean", action="store_false", help="ne pas nettoyer les vues avant sculpture (stats, halo, îlots, normales)")

    s = sub.add_parser("sheet", help="fiche de personnage (character.json + HTML)")
    s.add_argument("extract_dir")
    s.add_argument("--name")
    s.add_argument("--force", action="store_true")

    s = sub.add_parser("persona", help="persona de dialogue (persona.md) depuis character.json")
    s.add_argument("character_json")
    s.add_argument("--lang", choices=["fr", "en"], default="fr")

    s = sub.add_parser("gen3d", help="prépare l'entrée et les scripts CharacterGen")
    s.add_argument("extract_dir")
    s.add_argument("--size", type=int, default=512)

    s = sub.add_parser("turntable", help="rendu N angles d'un modèle 3D (Blender)")
    s.add_argument("mesh")
    s.add_argument("-o", "--output", required=True)
    s.add_argument("--angles", type=int, default=8)
    s.add_argument("--size", type=int, default=128)
    s.add_argument("--blender")
    s.add_argument("--anim-step", type=int, default=0,
                   help="modèle rigué + animé : rend 1 image sur N de l'animation, par angle")

    s = sub.add_parser("sprites", help="spritesheet RGB565 depuis un dossier d'images")
    s.add_argument("frames_dir")
    s.add_argument("-o", "--output", required=True)
    s.add_argument("--name", default="char")
    s.add_argument("--height", type=int, default=64)
    s.add_argument("--colors", type=int, default=24)
    s.add_argument("--columns", type=int, default=8)
    s.add_argument("--big-endian", action="store_true")
    s.add_argument("--dither", choices=["none", "fs", "bayer"], default="none",
                   help="tramage (déconseillé à petite taille : bruyant)")
    s.add_argument("--boost", type=float, default=0.8,
                   help="contraste/saturation/tons sombres (0 = désactivé) ; défaut choisi sur essais visuels")
    s.add_argument("--no-outline", action="store_true", help="désactive le contour sombre de 1 px")
    s.add_argument("--resample", choices=["lanczos", "box", "nearest"], default="lanczos")

    s = sub.add_parser("pipeline", help="extraction + fiche + persona + préparation 3D")
    s.add_argument("image")
    s.add_argument("-o", "--output", default="output")
    s.add_argument("--lang", choices=["fr", "en"], default="fr")
    s.add_argument("--size3d", type=int, default=512)
    add_extract_args(s)

    a = p.parse_args(argv)
    if a.cmd == "extract":
        for im in a.images:
            ip = Path(im)
            if not ip.exists():
                print(f"introuvable: {ip}")
                continue
            assets.run(ip, Path(a.output) / ip.stem, a)
    elif a.cmd == "props":
        import json
        from PIL import Image
        spec = json.loads(Path(a.spec).read_text())[a.name]
        props.apply(Image.open(a.cutout), spec).save(a.output)
        print(f"[props] {a.output}")
    elif a.cmd == "scale-chart":
        props.scale_chart(a.output)
        print(f"[props] {a.output}")
    elif a.cmd == "consolidate":
        raise SystemExit(multiview.cmd(a))
    elif a.cmd == "job":
        raise SystemExit(job.run(a.manifest, a.output, a.decisions, a.cmd3d, a.json, a.model))
    elif a.cmd == "qa":
        raise SystemExit(qa.cmd(a))
    elif a.cmd == "sheetops":
        raise SystemExit(flat.cmd(a))
    elif a.cmd == "anim":
        raise SystemExit(anim.cmd(a))
    elif a.cmd == "atlas":
        r = atlas.export(a.frames_dir, a.output, a.name, a.fps, not a.no_loop, as_array=a.array)
        print(f"[atlas] {r['frames']} images, cellule {r['cell']} -> {a.output}")
    elif a.cmd == "skiln-paint":
        from . import skiln_paint
        raise SystemExit(skiln_paint.cmd(a))
    elif a.cmd == "hull":
        from . import hull
        raise SystemExit(hull.cmd(a))
    elif a.cmd == "control":
        from . import control
        raise SystemExit(control.cmd(a))
    elif a.cmd == "bank":
        from . import bank
        raise SystemExit(bank.cmd(a))
    elif a.cmd == "clips":
        from . import clips
        raise SystemExit(clips.cmd(a))
    elif a.cmd == "anim2d":
        from . import anim2d
        raise SystemExit(anim2d.cmd(a))
    elif a.cmd == "rig":
        from . import rig
        raise SystemExit(rig.cmd(a))
    elif a.cmd == "meshy":
        from . import meshy
        raise SystemExit(meshy.cmd(a))
    elif a.cmd == "shots":
        from . import shots
        raise SystemExit(shots.cmd(a))
    elif a.cmd == "hull8":
        raise SystemExit(hullfit.cmd(a))
    elif a.cmd == "skiln-char":
        raise SystemExit(skiln_char.cmd(a))
    elif a.cmd == "skiln":
        raise SystemExit(to_spritekiln.cmd(a))
    elif a.cmd == "voxel":
        raise SystemExit(voxel.cmd(a))
    elif a.cmd == "gear":
        raise SystemExit(gear.cmd(a))
    elif a.cmd == "sheet":
        sheet.init_sheet(Path(a.extract_dir), a.name, a.force)
        sheet.render_html(Path(a.extract_dir))
    elif a.cmd == "persona":
        persona.build(Path(a.character_json), a.lang)
    elif a.cmd == "gen3d":
        gen3d.prepare(Path(a.extract_dir), a.size)
    elif a.cmd == "turntable":
        turntable.render(Path(a.mesh), Path(a.output), a.angles, a.size, a.blender, a.anim_step)
    elif a.cmd == "sprites":
        sprites.build(Path(a.frames_dir), Path(a.output), a.name, a.height, a.colors, a.columns,
                      not a.big_endian, a.dither, a.resample, a.boost, not a.no_outline)
    elif a.cmd == "pipeline":
        pipeline.run(Path(a.image), Path(a.output), a, a.lang, a.size3d)
