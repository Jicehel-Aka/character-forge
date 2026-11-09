"""forge control DIR : planche de contrôle d'un rendu `forge meshy` (sprites vs rendu haute résolution) + métriques d'intégrité :
 - perte : part de la silhouette (couverture >= 0.2 en haute résolution) absente du sprite (bras/jambes fins qui disparaissent)
 - morceaux : nombre de composantes connexes du sprite vs de la silhouette de référence (membre coupé)
Écrit control.png et control.json ; signale en rouge les images fautives."""
import json, re
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ST = np.ones((3, 3), int)


def metrics(big, small):
    sz = small.width; a = np.asarray(big.convert("RGBA"), np.float32)[..., 3] / 255
    A = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((sz, sz), Image.BOX), np.float32) / 255
    S = np.asarray(small.convert("RGBA"))[..., 3] > 0; R = A >= 0.2
    near = ndimage.binary_dilation(S, ST)  # le liseré de bord (couverture partielle) n'est pas une perte : seules comptent les parties sans voisin dans le sprite
    lost = float((R & ~near).sum()) / max(1, R.sum())
    cs = ndimage.label(S, ST)[1]; cr = ndimage.label(A >= 0.2, ST)[1]
    return dict(perte=round(lost, 4), morceaux_sprite=int(cs), morceaux_ref=int(cr), aire_ratio=round(float(S.sum()) / max(1, float(R.sum())), 3))


def scan(d):
    d = Path(d); items = {}
    for f in d.glob("*_big.png"):
        m = re.match(r"(.*)_([a-z]+)_(\d+)_big\.png$", f.name)
        if not m: continue
        small = f.with_name(f.name.replace("_big", ""))
        if small.exists(): items[(m.group(2), int(m.group(3)))] = (f, small)
    return items


def sheet(d, title=None, rows=6, scale=2, seuil=0.015):
    items = scan(d)
    if not items: print("[control] rien dans", d); return None
    dirs = [x for x in "s se e ne n nw w sw".split() if any(k[0] == x for k in items)]
    frames = sorted({k[1] for k in items}); pick = [frames[int(i * (len(frames) - 1) / max(1, rows - 1))] for i in range(min(rows, len(frames)))] if len(frames) > 1 else frames
    pick = sorted(set(pick)); sz = Image.open(next(iter(items.values()))[1]).width; cell = sz * scale
    H = 22; W = cell * len(dirs); img = Image.new("RGB", (W, H + cell * len(pick)), (34, 36, 48)); dr = ImageDraw.Draw(img)
    res = {}; bad = 0
    for (dd, fi), (fb, fs) in items.items():
        m = metrics(Image.open(fb), Image.open(fs)); res[f"{dd}_{fi}"] = m
        if m["perte"] > seuil or m["morceaux_sprite"] > m["morceaux_ref"] + 1: bad += 1
    for r, fi in enumerate(pick):
        for c, dd in enumerate(dirs):
            if (dd, fi) not in items: continue
            sm = Image.open(items[(dd, fi)][1]).convert("RGBA").resize((cell, cell), Image.NEAREST); x, y = c * cell, H + r * cell
            img.paste(sm, (x, y), sm); m = res[f"{dd}_{fi}"]; flag = m["perte"] > seuil or m["morceaux_sprite"] > m["morceaux_ref"] + 1
            dr.text((x + 2, y + 1), f"{dd}{fi} {m['perte']*100:.0f}%", fill=(255, 90, 90) if flag else (140, 150, 170))
            if flag: dr.rectangle([x, y, x + cell - 1, y + cell - 1], outline=(255, 70, 70))
    dr.text((4, 5), f"{title or Path(d).name} : {len(items)} images, {bad} signalées (perte>{seuil*100:.1f}% ou membre coupé)", fill=(230, 230, 240))
    img.save(Path(d) / "control.png"); (Path(d) / "control.json").write_text(json.dumps(res, indent=1))
    pm = np.mean([v["perte"] for v in res.values()])
    print(f"[control] {Path(d).name}: {len(items)} images, {bad} signalées, perte moyenne {pm*100:.1f}%")
    return dict(name=Path(d).name, n=len(items), bad=bad, perte=float(pm))


def cmd(a):
    for d in a.dirs: sheet(d, rows=a.rows)
    return 0
