"""Exporte la base physique (forge/gear.py) vers docs/gear.js pour l'interface web (une seule source de vérité)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from forge import gear
out = {"landmarks": gear.LANDMARKS, "widths": gear.WIDTHS, "builds": gear.BUILDS, "layers": gear.LAYERS,
       "catalog": gear.CATALOG, "torso_armor": sorted(gear._TORSO_ARMOR)}
Path(__file__).resolve().parent.parent.joinpath("docs/gear.js").write_text("window.GEAR = " + json.dumps(out, ensure_ascii=False) + ";\n")
print("docs/gear.js")
