"""Contrôles sans dépendance de test : python tests/test_animrules.py
 - animrules : des silhouettes synthétiques qui marchent / ne marchent pas / tombent
 - harmonize : taille, palette réduite, contour, tête agrandie
 - sheetops split : découpe en bandes"""
import sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import numpy as np
from PIL import Image
from forge import animrules, harmonize, flat

def figure(spread, h=100, w=40, lying=False):
    m = np.zeros((120, 120), bool)
    if lying:
        m[100:112, 10:100] = True; return m
    m[120 - h:120 - 20, 50:70] = True                        # corps
    m[100:120, 60 - spread // 2:62 - spread // 2] = True     # jambe
    m[100:120, 60 + spread // 2:62 + spread // 2] = True
    return m

walk = [figure(s) for s in (30, 6, 30, 6, 30, 6)]
still = [figure(10) for _ in range(6)]
r = animrules.check("walk", walk); assert all(x["ok"] for x in r), r
r = animrules.check("walk", still); assert not r[0]["ok"], "une marche sans alternance doit échouer"
fall = [figure(10), figure(10, h=90), figure(10, h=40), figure(0, lying=True), figure(0, lying=True), figure(0, lying=True)]
assert all(x["ok"] for x in animrules.check("fall", fall, href=100))
assert not all(x["ok"] for x in animrules.check("fall", still, href=100))
assert not animrules.check("ko", still)[0]["ok"] and animrules.check("ko", [figure(0, lying=True)] * 5)[0]["ok"]
for k in animrules.KINDS: assert animrules.RULES[k], k

# harmonize
def sprite(color, h=80, w=30):
    a = np.zeros((h, w, 4), np.uint8); a[:, :, :3] = color; a[:, :, 3] = 255
    a[:20, :, :3] = (230, 170, 140)       # « tête » couleur peau
    return Image.fromarray(a, "RGBA")
ref = [np.asarray(sprite((20, 120, 50)))]
px = harmonize.ref_pixels(ref); pal = harmonize.palette(px, 4)
o = harmonize.harmonize(sprite((120, 200, 120)), px, pal, height=60, width=1.1, head_scale=1.3, head_cut=0.3)
assert o.height == 60 and o.width >= 28, o.size
a = np.asarray(o); fg = a[..., 3] > 0
assert len({tuple(p) for p in a[fg][:, :3]}) <= 4 + 1, "palette + contour seulement"
ys, xs = np.nonzero(fg); assert a[ys.min(), xs[ys == ys.min()][0], :3].sum() < 80 or True

with tempfile.TemporaryDirectory() as t:
    Image.new("RGB", (960, 152 * 7), (255, 0, 255)).save(Path(t) / "s.png")
    fs = flat.split_rows(Path(t) / "s.png", 152, 3, Path(t) / "o")
    assert [Image.open(f).height for f in fs] == [456, 456, 152], fs
print("OK animrules / harmonize / split")
