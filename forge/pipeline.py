"""Orchestration : enchaîne ce qui peut tourner automatiquement et liste le reste."""
from pathlib import Path

from . import assets, gen3d, persona, sheet


def run(image: Path, out: Path, a, lang: str = "fr", size3d: int = 512):
    image = Path(image)
    d = Path(out) / image.stem
    a.segment = True  # le pipeline complet part toujours d'un détourage
    assets.run(image, d, a)
    sp = sheet.init_sheet(d, name=image.stem)
    sheet.render_html(d)
    data = __import__("json").loads(sp.read_text())
    todo = sheet.missing(data)
    if not todo:
        persona.build(sp, lang)
    gen3d.prepare(d, size3d)

    print("\n=== État ===")
    print("fait     : extraction 2D, fiche (modèle), entrée 3D + scripts CharacterGen")
    if todo:
        print(f"à faire  : remplir {sp} (champs : {', '.join(todo)}), puis `python -m forge persona {sp}`")
    else:
        print("fait     : persona.md")
    print(f"sur ton PC (GPU) : lancer run_charactergen.bat dans {d}, récupérer le modèle 3D dans {d / 'mesh'}")
    print(f"ensuite  : python -m forge turntable {d / 'mesh' / '<modele>.glb'} -o {d / 'turn'}"
          f" && python -m forge sprites {d / 'turn'} -o {d / 'sprites'} --name {image.stem}")
