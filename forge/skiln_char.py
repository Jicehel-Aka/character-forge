"""Description de personnage forge (build, couleurs, équipement, arme) -> spec SpriteKiln (palette + YAML étendant `humanoid`).
L'équipement est traduit en « kits » SpriteKiln quand il en existe (casque, chapeau, cape, ceinture, bourse, bouclier, armes) ;
le reste (armure de cuir, bottes, gants...) n'a pas de kit : il est listé dans le rapport et seulement suggéré par les couleurs.
Entrée JSON : {"name":"orc","build":"orc","colors":{"skin":"#6d9a3c","cloth":"#5a4632","leather":"#7a5230","hair":"#1a1a1a","steel":"#8a93a0"},
               "gear":["leather_armor","belt","cloak","boots"],"weapon":"axe","head":{"jaw":0.7,"width":1.1}}"""
import colorsys, json
from pathlib import Path
import yaml

KIT = {"cap": "hat", "hat": "hat", "helmet": "helmet", "helmet_full": "helmet", "helm": "helmet", "hood": "hood", "cloak": "cape",
       "cape": "cape", "belt": "belt", "pouch": "pouch", "quiver": "pouch", "shield": "shield"}
WEAPON = {"sword", "axe", "bow", "spear", "staff", "hammer", "mace", "pistol", "rifle"}
BUILD_W = {"human": 1.0, "slim": 0.9, "stocky": 1.12, "orc": 1.28, "child": 0.9}      # largeur du tronc (cohérent avec gear.BUILDS)
BUILD_HEAD = {"human": 1.0, "slim": 1.0, "stocky": 1.05, "orc": 1.15, "child": 1.25}


def ramp(hexc, n=6, dark=None):
    """Rampe de n teintes : ombres vers le froid/saturées, lumières vers le chaud (convention de la palette gothic)."""
    h = hexc.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    H, L, S = colorsys.rgb_to_hls(r, g, b); out = []
    for i in range(n):
        t = i / (n - 1); l = 0.06 + t * (min(0.92, L + 0.30) - 0.06)
        # le point milieu de la rampe est la couleur demandée
        l = L + (t - 0.6) * (0.55 if t < 0.6 else 0.6)
        l = min(0.95, max(0.05, l)); hh = (H + (0.60 - t) * 0.03) % 1.0
        rr, gg, bb = colorsys.hls_to_rgb(hh, l, min(1.0, S * (0.9 + 0.2 * (1 - t))))
        out.append("#%02x%02x%02x" % (int(rr * 255), int(gg * 255), int(bb * 255)))
    return out


def build(desc, outdir, anims=None):
    out = Path(outdir); out.mkdir(parents=True, exist_ok=True)
    name = desc.get("name", "perso"); b = desc.get("build", "human"); col = desc.get("colors", {})
    base = yaml.safe_load(open(Path(__import__("spritekiln").__file__).parent / "data/palettes/gothic.yaml"))
    ramps = dict(base["ramps"])
    for k, v in col.items(): ramps[k] = ramp(v)
    (out / f"{name}_palette.yaml").write_text(yaml.safe_dump({"ramps": ramps}, sort_keys=False))
    use, skipped, notes = [], [], []
    for g in desc.get("gear", []):
        if g in KIT:
            kit = KIT[g]
            if kit == "pouch": use.append({"kit": "pouch", "as": "pouch_L", "with": {"angle": 1.15}})
            elif kit in ("helmet", "hat", "hood"): use.append({"kit": kit, "at": "head"})
            elif kit == "cape": use.append({"kit": "cape"})
            else: use.append({"kit": kit})
        else: skipped.append(g)
    w = desc.get("weapon")
    spec = {"spritekiln": 1, "name": name, "extends": "humanoid", "palette": f"{name}_palette.yaml",
            "brief": {"summary": desc.get("summary", f"{name} ({b})"), "head": desc.get("head_note", "tête du gabarit, ajustée par les paramètres"),
                      "must_keep": desc.get("must_keep", []), "simplify": []},
            "materials": {"skin": {"ramp": "skin", "gamma": 0.75}, "cloth": {"ramp": "cloth"}, "leather": {"ramp": "leather" if "leather" in col else "bone", "bands": [1, 3]}}}
    for k in ("hair", "cape", "gold", "plume"):           # matériaux propres aux kits (cape, casque) : couleur de forge si fournie
        if k in col: spec["materials"][k] = {"ramp": k}
    if "steel" in col: spec["materials"]["steel"] = {"ramp": "steel", "finish": "metal"}
    # silhouette : largeur du tronc (le pelvis porte épaules et hanches) et taille de tête
    kw = BUILD_W.get(b, 1.0)
    spec["bones"] = {"pelvis": {"scale": f"[{kw}/sqrt(squash), squash, {kw}/sqrt(squash)]"},
                     "head": {"scale": round(1.25 * BUILD_HEAD.get(b, 1.0), 3)}}
    hp = {"width": 1.0, "jaw": 0.4, "chin": 0.5, "nose": 0, "ears": 0}; hp.update(desc.get("head", {}))
    hr = dict(desc.get("hair", {})); style = hr.pop("style", "short")
    hair_with = {k: hr[k] for k in ("fringe", "part", "locks", "length", "volume") if k in hr}
    spec["use"] = [{"kit": "head", "at": "head", "with": hp}] + use
    rem0 = []
    if style == "bald": rem0.append("use.hair")
    else:
        spec["use"].append({"kit": "hair", "at": "head", "with": hair_with or {"length": 0.3}})
        if style == "ponytail": spec["use"].append({"kit": "ponytail", "at": "head", "with": {"length": max(1.0, hr.get("length", 1.5))}})
        if style == "bun": spec["use"].append({"kit": "bun", "at": "head"})
    rem = ["parts.belt"] if any(u.get("kit") == "belt" for u in spec["use"]) else []   # remplace la ceinture simple du gabarit
    if w in WEAPON and w != "sword":                       # le gabarit porte déjà une épée (use.sword)
        rem.append("use.sword"); spec["use"].append({"kit": w, "as": w, "at": "wrist_R"})
    elif w and w not in WEAPON: skipped.append(f"weapon:{w}")
    if w is None or w == "":
        rem.append("use.sword")
    if not any(g in ("coat", "robe", "dress", "long_coat") for g in desc.get("gear", [])):
        rem.append("parts.coat")          # la « jupe » du gabarit cache les jambes : retirée sauf manteau/robe demandé
    rem += rem0
    if rem: spec["remove"] = rem
    if anims: spec["animations"] = anims
    p = out / f"{name}.yaml"; p.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    return p, skipped


def cmd(a):
    import subprocess
    desc = json.loads(Path(a.character).read_text()); anims = None
    if getattr(a, "edit", None):
        from . import edit_text
        desc, done, unk = edit_text.apply(desc, a.edit)
        print("[skiln-char] modifications : " + (", ".join(done) or "aucune") + (f" ; non compris : {unk}" if unk else ""))
        if a.save: Path(a.save).parent.mkdir(parents=True, exist_ok=True); Path(a.save).write_text(json.dumps(desc, indent=1, ensure_ascii=False))
    if a.anim:
        from . import anim, to_spritekiln
        anims = {}
        for i, f in enumerate(a.anim):
            m = json.loads(Path(f).read_text()); poses = anim.generate(m, a.frames, None, 60)
            nm = (a.anim_name[i] if a.anim_name and i < len(a.anim_name) else m["type"])
            anims[nm] = {"loop": bool(m.get("periodic")), "keys": to_spritekiln.poses_to_keys(poses, a.ms)}
    p, skipped = build(desc, a.output, anims)
    print(f"[skiln-char] {p}" + (f" ; sans kit (couleurs seulement) : {skipped}" if skipped else ""))
    if a.render:
        names = ["idle"] + (list(anims) if anims else [])
        subprocess.run(["spritekiln", "render", str(p), "--anims", ",".join(names), "--dirs", a.dirs, "-o", str(Path(a.output) / "render"), "--size", "64"], check=True)
    return 0
