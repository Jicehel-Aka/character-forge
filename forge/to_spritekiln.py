"""Animation apprise (forge anim) -> clip SpriteKiln (spec YAML qui étend le gabarit humanoid) : une pose = une clé.
Les cibles IK de SpriteKiln sont foot_L/R (espace racine : x latéral, y haut, z avant) et hand_L/R (espace du torse),
plus lean/bob. On convertit les positions 2D (image, x = avant, y = bas) de nos poses en ces canaux.
Hypothèse : le personnage avance vers +x de l'image ; échelle déduite de la longueur de jambe SpriteKiln (0,42+0,40)."""
import json, math
from pathlib import Path
import numpy as np

LEG = 0.82


def poses_to_keys(poses, ms=90, lat_foot=0.13, lat_hand=0.30):
    p0 = poses[0]
    leg = lambda p, s: np.linalg.norm(np.subtract(p[f"knee_{s}"], p[f"hip_{s}"])) + np.linalg.norm(np.subtract(p[f"ankle_{s}"], p[f"knee_{s}"]))
    sc = LEG / np.mean([leg(p0, "l"), leg(p0, "r")])
    ground = max(p[f"ankle_{s}"][1] for p in poses for s in "lr")
    up0 = (ground - p0["pelvis"][1]) * sc
    keys = []
    for p in poses:
        px, py = p["pelvis"]
        ch = {}
        for s, S in (("l", "L"), ("r", "R")):
            a = p[f"ankle_{s}"]; w = p[f"wrist_{s}"]
            ch[f"foot_{S}"] = [lat_foot, float(round(max(0.0, (ground - a[1]) * sc), 3)), float(round((a[0] - px) * sc, 3))]
            ch[f"hand_{S}"] = [lat_hand, float(round((py - w[1]) * sc, 3)), float(round((w[0] - px) * sc, 3))]
        nk = p["neck"]; ch["lean"] = float(round(math.atan2(nk[0] - px, py - nk[1]), 3))
        ch["bob"] = float(round((ground - py) * sc - up0, 3))
        keys.append({"ms": ms, "set": ch})
    return keys


def write_spec(poses, name, out, ms=90, base="humanoid", loop=False):
    import yaml
    keys = poses_to_keys(poses, ms)
    spec = {"spritekiln": 1, "name": name, "extends": base,
            "animations": {name: {"loop": loop, "keys": keys}}}
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    return out


def cmd(a):
    import subprocess
    from . import anim
    m = json.loads(Path(a.model).read_text()); name = a.name or m["type"]
    poses = anim.generate(m, a.frames, None, a.height)
    out = Path(a.output); spec = write_spec(poses, name, out / f"{name}.yaml", a.ms, loop=a.loop)
    print(f"[skiln] {len(poses)} clés -> {spec}")
    if a.render:
        subprocess.run(["spritekiln", "render", str(spec), "--anims", name, "--dirs", a.dirs, "-o", str(out / "render")], check=True)
    return 0
