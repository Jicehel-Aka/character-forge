import argparse
from pathlib import Path

from . import anim, assets, atlas, flat, gear, gen3d, job, multiview, qa, persona, pipeline, props, sheet, sprites, turntable


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
    s.add_argument("--forward", choices=["x", "y", "z"], default="x", help="import-bvh : axe « avant » du mocap")
    s.add_argument("--flip", action="store_true", help="import-bvh : inverser le sens avant/arrière")
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
        r = atlas.export(a.frames_dir, a.output, a.name, a.fps, not a.no_loop)
        print(f"[atlas] {r['frames']} images, cellule {r['cell']} -> {a.output}")
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
