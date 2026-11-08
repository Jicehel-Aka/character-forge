"""Accessoires dessinés par l'outil (arc, flèche, lance) à placer sur un personnage détouré.

Sert quand le détourage a raté une arme : on efface les restes (`erase`) puis on dessine un objet propre
là où on le décide (coordonnées en pixels de l'image d'origine, y vers le bas).

Format du fichier de spécification (JSON) :
{
  "image.png": {
    "restore": [{"box": [x, y, w, h], "hue": [60, 170]}],   # récupère la peau perdue (doigts, bord du corps)
    "erase": [[x, y, w, h], {"box": [x, y, w, h], "hue": [345, 15], "sat": 0.55}, ...],
                                              # zones à vider (restes de l'arme ratée) ; avec "hue", seules les
                                              # couleurs de cette teinte (degrés, cyclique) sont effacées
    "person": {"head": 160},                 # hauteur de la tête en px -> taille de la personne = 7,5 têtes
    "props": [
      {"type": "bow", "grip": [x, y], "kind": "standard",   # kind : short 0,5 | standard 0,75 | recurve 0,93 | long 1,1
                                                            # (ou un nombre) x taille de la personne
       "angle": 82, "bulge": "right", ...},
      {"type": "arrow", "tail": [x, y], "toward": [x, y], "length": "auto"},   # flèche ~0,43 x taille
      {"type": "bow", "grip": [x, y], "length": 400, "angle": 82, "bulge": "right",
       "bend": 0.12, "width": 5, "color": [60, 40, 28], "layer": "behind",
       "pull": [x, y]},                       # pull (optionnel) : point où la corde est tirée
      {"type": "arrow", "tail": [x, y], "tip": [x, y], "layer": "front"},
      {"type": "spear", "tail": [x, y], "tip": [x, y]}
    ]
  }
}
angle : direction de l'axe de l'arc depuis la poignée vers l'extrémité haute, en degrés, 90 = vers le haut.
bulge : "left" ou "right", côté où le ventre de l'arc est tourné (dans l'image).
layer : "behind" (derrière le personnage : la main passe devant la poignée) ou "front" (devant).
"""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

S = 4  # sur-échantillonnage pour des bords lissés

WOOD = (112, 74, 42)
OUTLINE = (30, 20, 16)
STRING = (226, 216, 190)
STEEL = (196, 202, 212)
FLETCH = (196, 62, 52)


# Proportions de l'arc par rapport à la taille de la personne.
#  short/standard : définies par l'utilisateur (1/2 et 3/4) ; long : plus grand que la personne.
#  recurve : arc de tir moderne 64-66 po pour ~1,75 m (≈ 0,93) ; long ≈ longbow anglais 1,8-2,0 m (≈ 1,1).
RATIOS = {"short": 0.5, "standard": 0.75, "recurve": 0.93, "long": 1.1}
# Hauteur de repos (distance poignée-corde) / longueur : valeurs ESTIMÉES (non vérifiées dans les sources lues).
BRACE = {"short": 0.14, "standard": 0.12, "recurve": 0.12, "long": 0.09}
ARROW_RATIO = 0.43   # flèche ≈ 28-30 po (71-76 cm) pour ~1,75 m ; allonge de tir = envergure / 2,5 ≈ 0,4 × taille
HEADS = 7.5          # une personne adulte ≈ 7,5 têtes de haut


def _person_height(spec):
    p = spec.get("person")
    if not p:
        return None
    if "height" in p:
        return float(p["height"])
    return float(p["head"]) * float(p.get("heads", HEADS))


def _resolve(props, H, size):
    """Calcule longueurs/épaisseurs à partir de la taille de la personne (px) quand elle est connue."""
    out = []
    for sp in props:
        sp = dict(sp)
        k = sp["type"]
        if k == "bow" and "kind" in sp:
            if H is None:
                raise SystemExit("arc avec 'kind' : indiquer person.head (hauteur de la tête en px) ou person.height")
            kind = sp["kind"]
            ratio = RATIOS[kind] if isinstance(kind, str) else float(kind)
            sp["length"] = ratio * H
            sp.setdefault("bend", BRACE.get(kind, 0.12) if isinstance(kind, str) else 0.12)
            sp.setdefault("width", max(3.0, 0.016 * H * (0.8 if ratio < 0.8 else 1.0)))
            a = math.radians(sp.get("angle", 90))
            g = np.array(sp["grip"], float)
            u = np.array([math.cos(a), -math.sin(a)])
            tips = [g + u * sp["length"] / 2, g - u * sp["length"] / 2]
            clipped = any(not (0 <= t[0] <= size[0] and 0 <= t[1] <= size[1]) for t in tips)
            print(f"[props] arc {kind}: {sp['length']:.0f} px = {ratio:.2f} x taille ({H:.0f} px)"
                  + (" — extrémités hors cadre (arc coupé par l'image)" if clipped else ""))
        if k in ("arrow", "spear") and H is not None:
            if k == "arrow":
                sp.setdefault("width", max(2.5, 0.0055 * H))
                sp.setdefault("head_length", max(10.0, 0.032 * H))
                sp.setdefault("head_width", max(7.0, 0.014 * H))
                sp.setdefault("fletch_length", max(14.0, 0.075 * H))
                sp.setdefault("fletch_width", max(5.0, 0.02 * H))
            if "tip" not in sp:
                tail = np.array(sp["tail"], float)
                if "toward" in sp:
                    d = np.array(sp["toward"], float) - tail
                    d /= np.linalg.norm(d) or 1.0
                else:
                    a = math.radians(sp.get("angle", 0))
                    d = np.array([math.cos(a), -math.sin(a)])
                ln = sp.get("length", "auto")
                ln = ARROW_RATIO * H if ln == "auto" else float(ln)
                sp["tip"] = list(tail + d * ln)
                print(f"[props] {k}: {ln:.0f} px = {ln / H:.2f} x taille")
        out.append(sp)
    return out


def _lighter(c, k=0.35):
    return tuple(int(v + (255 - v) * k) for v in c)


def _bezier(p0, c, p2, n=160):
    t = np.linspace(0, 1, n)[:, None]
    p0, c, p2 = np.array(p0, float), np.array(c, float), np.array(p2, float)
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * c + t ** 2 * p2


def _stroke(draw, pts, widths, color):
    for (x, y), w in zip(pts, widths):
        r = w * S / 2
        draw.ellipse((x * S - r, y * S - r, x * S + r, y * S + r), fill=color)


def _draw_bow(draw, sp):
    gx, gy = sp["grip"]
    L = float(sp.get("length", 400))
    a = math.radians(sp.get("angle", 90))
    u = np.array([math.cos(a), -math.sin(a)])
    n = np.array([-u[1], u[0]])  # normale « vers la droite » à l'écran
    side = 1 if sp.get("bulge", "right") == "right" else -1
    bend = float(sp.get("bend", 0.12)) * L
    g = np.array([gx, gy], float)
    top = g + u * L / 2 - side * n * bend
    bot = g - u * L / 2 - side * n * bend
    ctrl = g + side * n * bend           # la courbe passe exactement par la poignée
    pts = _bezier(top, ctrl, bot)
    w0 = float(sp.get("width", 5))
    t = np.linspace(-1, 1, len(pts))
    widths = w0 * (1.0 - 0.55 * np.abs(t) ** 1.5)
    color = tuple(sp.get("color", WOOD))

    # corde (derrière le bois)
    pull = sp.get("pull")
    cord = [tuple(top), tuple(pull), tuple(bot)] if pull else [tuple(top), tuple(bot)]
    pts_c = [(x * S, y * S) for x, y in cord]
    draw.line(pts_c, fill=OUTLINE, width=max(3, int(2.6 * S)))
    draw.line(pts_c, fill=STRING, width=max(2, int(1.5 * S)))
    # contour, bois, reflet
    _stroke(draw, pts, widths + 2.2, OUTLINE)
    _stroke(draw, pts, widths, color)
    hl = pts - side * n * (widths[:, None] * 0.22)
    _stroke(draw, hl, widths * 0.35, _lighter(color))
    # poignée (enroulement de cuir) autour de la prise
    mid = len(pts) // 2
    span = int(len(pts) * 0.07)
    grip_pts = pts[mid - span:mid + span]
    _stroke(draw, grip_pts, np.full(len(grip_pts), w0 * 1.25 + 2.2), OUTLINE)
    _stroke(draw, grip_pts, np.full(len(grip_pts), w0 * 1.25), (70, 46, 34))
    # encoches aux extrémités
    for tip in (top, bot):
        draw.ellipse(((tip[0] - 2) * S, (tip[1] - 2) * S, (tip[0] + 2) * S, (tip[1] + 2) * S), fill=OUTLINE)


def _shaft(draw, tail, tip, width, color):
    tail, tip = np.array(tail, float), np.array(tip, float)
    d = tip - tail
    ln = np.linalg.norm(d) or 1.0
    d /= ln
    n = np.array([-d[1], d[0]])
    return tail, tip, d, n, ln


def _draw_arrow(draw, sp, spear=False):
    tail, tip, d, n, ln = _shaft(draw, sp["tail"], sp["tip"], 0, None)
    w = float(sp.get("width", 6 if spear else 3.2))
    shaft_c = tuple(sp.get("color", (168, 124, 80)))
    # hampe : contour puis bois
    draw.line([(tail[0] * S, tail[1] * S), (tip[0] * S, tip[1] * S)], fill=OUTLINE, width=int((w + 2.2) * S))
    draw.line([(tail[0] * S, tail[1] * S), (tip[0] * S, tip[1] * S)], fill=shaft_c, width=int(w * S))
    # pointe
    hl = float(sp.get("head_length", 38 if spear else 20))
    hw = float(sp.get("head_width", 16 if spear else 11))
    base = tip - d * hl
    head = [tuple((tip + d * 2) * S), tuple((base + n * hw / 2) * S), tuple((base - n * hw / 2) * S)]
    draw.polygon([tuple((np.array(p) * 1)) for p in head], fill=STEEL, outline=OUTLINE)
    if not spear:
        # empennage : deux plumes près de l'encoche
        fc = tuple(sp.get("fletch", FLETCH))
        fl = float(sp.get("fletch_length", 26))
        fw = float(sp.get("fletch_width", 8))
        for off in (0.0, 0.45):
            a0 = tail + d * (6 + off * fl)
            for sgn in (1, -1):
                poly = [a0, a0 + d * fl * 0.55, a0 + d * fl * 0.55 + n * sgn * fw, a0 + n * sgn * fw * 0.6 - d * 3]
                draw.polygon([tuple(p * S) for p in poly], fill=fc, outline=OUTLINE)


def _render(spec_props, size, layer):
    img = Image.new("RGBA", (size[0] * S, size[1] * S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    drew = False
    for sp in spec_props:
        default_layer = "behind" if sp["type"] == "bow" else "front"
        if sp.get("layer", default_layer) != layer:
            continue
        kind = sp["type"]
        if kind == "bow":
            _draw_bow(draw, sp)
        elif kind in ("arrow", "spear"):
            _draw_arrow(draw, sp, spear=(kind == "spear"))
        else:
            raise ValueError(f"accessoire inconnu : {kind}")
        drew = True
    if not drew:
        return None
    return img.resize(size, Image.LANCZOS)


def _restore(a: np.ndarray, source: Image.Image, items: list) -> None:
    """Récupère dans l'image d'origine les pixels perdus par le détourage (doigts, bord du corps) :
    dans chaque boîte, les pixels dont la teinte est dans [hue] (degrés) sont remis opaques."""
    hsv = np.asarray(source.convert("RGB").convert("HSV")).astype(np.float32)
    rgb = np.asarray(source.convert("RGB"))
    hue = hsv[..., 0] * 360.0 / 255.0
    sat, val = hsv[..., 1] / 255.0, hsv[..., 2] / 255.0
    for it in items:
        x, y, w, h = it["box"]
        lo, hi = it.get("hue", [60, 170])
        m = (hue >= lo) & (hue <= hi) & (sat >= it.get("sat", 0.18)) & (val >= it.get("val", 0.08))
        sub = np.zeros_like(m)
        sub[max(y, 0):y + h, max(x, 0):x + w] = m[max(y, 0):y + h, max(x, 0):x + w]
        sub &= a[..., 3] == 0  # seulement ce qui a été perdu
        # petit nettoyage : on garde les pixels qui touchent le personnage existant ou entre eux
        sub = ndimage.binary_closing(sub, iterations=1) & (a[..., 3] == 0)
        a[sub, :3] = rgb[sub]
        a[sub, 3] = 255


def apply(cutout: Image.Image, spec: dict, source: Image.Image = None) -> Image.Image:
    """Restaure (optionnel), efface les zones `erase`, puis ajoute les accessoires derrière/devant."""
    base = cutout.convert("RGBA")
    a = np.asarray(base).copy()
    if spec.get("restore") and source is not None:
        _restore(a, source, spec["restore"])
    erase_hsv = None
    for it in spec.get("erase", []):
        if isinstance(it, dict):  # effacement par teinte (ex. reste d'une flèche rouge) dans une boîte
            if erase_hsv is None:
                erase_hsv = np.asarray(Image.fromarray(a[..., :3], "RGB").convert("HSV")).astype(np.float32)
            x, y, w, h = it["box"]
            lo, hi = it.get("hue", [0, 360])
            hue = erase_hsv[..., 0] * 360.0 / 255.0
            m = (hue >= lo) & (hue <= hi) if lo <= hi else (hue >= lo) | (hue <= hi)  # teinte cyclique
            m &= (erase_hsv[..., 1] / 255.0) >= it.get("sat", 0.4)
            sub = np.zeros_like(m)
            sub[max(y, 0):y + h, max(x, 0):x + w] = m[max(y, 0):y + h, max(x, 0):x + w]
            a[sub, 3] = 0
        else:
            x, y, w, h = it
            a[max(y, 0):y + h, max(x, 0):x + w, 3] = 0
    base = Image.fromarray(a, "RGBA")
    props = _resolve(spec.get("props", []), _person_height(spec), base.size)
    behind = _render(props, base.size, "behind")
    front = _render(props, base.size, "front")
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    if behind:
        out.alpha_composite(behind)
    out.alpha_composite(base)
    if front:
        out.alpha_composite(front)
    return out


def scale_chart(path, H=420):
    """Image de référence : une personne et les arcs short / standard / recurve / long à l'échelle."""
    from PIL import ImageFont  # noqa: F401
    cols = list(RATIOS.items())
    W = 220 * len(cols) + 60
    canvas_h = int(H * 1.35)
    ground = canvas_h - 50
    props = []
    for i, (kind, ratio) in enumerate(cols):
        cx = 60 + i * 220 + 90
        L = ratio * H
        props.append({"type": "bow", "kind": kind, "grip": [cx + 55, ground - L / 2], "angle": 90, "bulge": "right",
                      "layer": "behind"})
    props = _resolve(props, H, (W, canvas_h))
    layer = _render(props, (W, canvas_h), "behind")
    img = Image.new("RGBA", (W, canvas_h), (245, 242, 235, 255))
    d = ImageDraw.Draw(img)
    d.line((20, ground, W - 20, ground), fill=(120, 110, 100), width=2)
    for i, (kind, ratio) in enumerate(cols):
        cx = 60 + i * 220 + 90
        hr = H / HEADS / 2
        top = ground - H
        d.ellipse((cx - hr * 0.8, top, cx + hr * 0.8, top + 2 * hr), outline=(60, 60, 60), width=3)
        neck = top + 2 * hr
        hip = ground - H * 0.5
        d.line((cx, neck, cx, hip), fill=(60, 60, 60), width=3)
        d.line((cx - H * 0.12, neck + hr * 0.5, cx + H * 0.12, neck + hr * 0.5), fill=(60, 60, 60), width=3)
        d.line((cx, hip, cx - H * 0.08, ground), fill=(60, 60, 60), width=3)
        d.line((cx, hip, cx + H * 0.08, ground), fill=(60, 60, 60), width=3)
        d.text((cx - 40, 8), f"{kind}", fill=(30, 30, 30))
        d.text((cx - 40, 22), f"{ratio:.2f} x taille", fill=(30, 30, 30))
    img.alpha_composite(layer)
    img.convert("RGB").save(path)
    return path
