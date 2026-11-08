"""Planche de N vues d'un même personnage SANS caméra connue (dessin/IA) -> volume 3D de test.
Estime : le tangage de la caméra, les conventions de signe et le décalage de chaque vue (recalage par IoU croisé : chaque vue
est comparée à la silhouette du volume sculpté avec toutes les AUTRES), puis sculpte avec hullcam.
Hypothèses : caméra orthographique, 8 azimuts à 45° dans l'ordre s,se,e,ne,n,nw,w,sw, même échelle pour toutes les vues."""
import math
import numpy as np
from scipy import ndimage
from PIL import Image
from . import hullcam as H

NAMES = ["s", "se", "e", "ne", "n", "nw", "w", "sw"]


def prepare(rgba_views, target_h=128, canvas=256, ground=200):
    """RGBA (cellule détourée) -> canvas carré, échelle commune, calage provisoire (centre en x, bas du sprite en y)."""
    hs = []
    for a in rgba_views.values():
        ys, xs = np.where(a[..., 3] > 0); hs.append(ys.max() - ys.min() + 1)
    f = target_h / float(np.median(hs)); out = {}
    for n, a in rgba_views.items():
        ys, xs = np.where(a[..., 3] > 0); box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        c = Image.fromarray(a).crop(box); c = c.resize((max(1, round(c.width * f)), max(1, round(c.height * f))), Image.BOX)
        cv = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0)); x0 = canvas // 2 - c.width // 2; y0 = ground - c.height
        cv.paste(c, (x0, y0)); arr = np.array(cv); arr[..., 3] = np.where(arr[..., 3] > 127, 255, 0); out[n] = arr
    return out


def shift(a, du, dv):
    out = np.zeros_like(a); h, w = a.shape[:2]
    ys0, ys1 = max(0, dv), min(h, h + dv); xs0, xs1 = max(0, du), min(w, w + du)
    out[ys0:ys1, xs0:xs1] = a[ys0 - dv:ys1 - dv, xs0 - du:xs1 - du]; return out


def make_cam(pitch, canvas=256, ground=200, n=64, upp=2.0, height=200):
    yaws = {"s": 0, "se": 45, "e": 90, "ne": 135, "n": 180, "nw": -135, "w": -90, "sw": -45}
    return {"pitch": pitch, "upp": upp, "pivot": (canvas / 2, ground), "yaw": yaws, "size": canvas, "n": n, "height": height}


def score(views, cam, sy, sd):
    occ, pts, _ = H.carve(views, cam, sy=sy, sd=sd, dil=0)
    return float(np.mean([H.iou(H.reproject(occ, pts, d, cam, cam["size"], sy, sd), views[d][..., 3] > 0) for d in views])), int(occ.sum())


def refine(views, cam, sy, sd, rounds=2, rad=10):
    """Recalage des vues. Les décalages sont cumulés sur les images d'origine puis recentrés (moyenne nulle) :
    une translation commune à toutes les vues ne change rien au volume mais couperait les pieds hors du cadre."""
    base = {k: v.copy() for k, v in views.items()}; cur = {k: v.copy() for k, v in views.items()}; sh = {k: [0, 0] for k in views}
    for _ in range(rounds):
        for d in cur:
            others = [k for k in cur if k != d]
            occ, pts, _ = H.carve(cur, cam, use=others, sy=sy, sd=sd, dil=0)
            pred = H.reproject(occ, pts, d, cam, cam["size"], sy, sd); m = cur[d][..., 3] > 0; best = (-1, 0, 0)
            for dv in range(-rad, rad + 1, 2):
                for du in range(-rad, rad + 1, 2):
                    s_ = H.iou(pred, shift(m, du, dv))
                    if s_ > best[0]: best = (s_, du, dv)
            _, du, dv = best
            if du or dv:
                sh[d][0] += du; sh[d][1] += dv; cur[d] = shift(base[d], sh[d][0], sh[d][1])
        mu = np.mean(list(sh.values()), 0)
        for d in cur: cur[d] = shift(base[d], int(round(sh[d][0] - mu[0])), int(round(sh[d][1] - mu[1])))
    return cur, {d: [int(round(v[0] - mu[0])), int(round(v[1] - mu[1]))] for d, v in sh.items()}


def fit(rgba_views, pitches=(10, 20, 30, 40), verbose=True):
    base = prepare(rgba_views); res = []
    for p in pitches:
        for sy, sd in ((1, -1), (1, 1)):
            cam = make_cam(p); v, sh = refine(base, cam, sy, sd, rounds=1)
            sc, nv = score(v, cam, sy, sd); res.append((sc, p, sy, sd, v, sh))
            if verbose: print(f"  pitch {p:2d} sy={sy:+d} sd={sd:+d} : IoU moyen {sc:.3f} ({nv} voxels)")
    return max(res, key=lambda r: r[0])


def split_sheet(path, cols=4, rows=2, key=(255, 0, 255), tol=140):
    """Planche en grille (traits noirs possibles) -> {nom: RGBA détouré}, noms dans l'ordre s,se,e,ne,n,nw,w,sw."""
    a = np.array(Image.open(path).convert("RGB")); h, w = a.shape[:2]
    dark = a.sum(-1) < 60
    cx = [0] + [i for i in range(1, w - 1) if dark[:, i].mean() > 0.8] + [w]; cy = [0] + [i for i in range(1, h - 1) if dark[i].mean() > 0.8] + [h]
    xs = [cx[0]] + [x for x in cx[1:-1] if not any(0 <= x - y < 3 for y in cx[1:-1] if y < x)] + [cx[-1]]
    ys = [cy[0]] + [y for y in cy[1:-1] if not any(0 <= y - z < 3 for z in cy[1:-1] if z < y)] + [cy[-1]]
    if len(xs) != cols + 1: xs = [round(i * w / cols) for i in range(cols + 1)]
    if len(ys) != rows + 1: ys = [round(i * h / rows) for i in range(rows + 1)]
    out = {}
    for k, n in enumerate(NAMES[:cols * rows]):
        r, c = divmod(k, cols); cell = a[ys[r] + 3:ys[r + 1] - 2, xs[c] + 3:xs[c + 1] - 2]
        fg = np.abs(cell.astype(int) - np.array(key)).sum(-1) > tol
        fg = ndimage.binary_opening(fg, iterations=1); lab, nl = ndimage.label(fg)
        if nl > 1: fg = lab == (1 + int(np.argmax(ndimage.sum(fg, lab, range(1, nl + 1)))))
        out[n] = np.dstack([cell, (fg * 255).astype(np.uint8)])
    return out


def export_ply(occ, pts, views, cam, path, sy=1, sd=-1):
    """Surface du volume en nuage de points coloré (PLY ascii) ; couleur = vue la plus proche de la direction radiale du voxel."""
    surf = H.surface(occ, H.grid(cam)[1]); idx = np.where(surf)[0]; P = pts[idx]
    c = P[:, [0, 2]] - P[:, [0, 2]].mean(0); cols = np.zeros((len(idx), 3))
    for d, ya in cam["yaw"].items():
        a = math.radians(sy * ya); toward = -c[:, 0] * math.sin(a) + c[:, 1] * math.cos(a)
        best = np.ones(len(idx), bool)
        for d2, y2 in cam["yaw"].items():
            a2 = math.radians(sy * y2); best &= toward >= (-c[:, 0] * math.sin(a2) + c[:, 1] * math.cos(a2)) - 1e-9
        if best.any():
            sub = np.zeros_like(surf); sub[idx[best]] = True
            i2, c2 = H.colorize(pts, sub, views, cam, ya, [d], sy, sd, power=1)
            pos = {j: k for k, j in enumerate(idx)}; 
            for j, col in zip(i2, c2): cols[pos[j]] = col
    with open(path, "w") as f:
        f.write(f"ply\nformat ascii 1.0\nelement vertex {len(idx)}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n")
        for p, col in zip(P, cols): f.write(f"{p[0]:.2f} {p[1]:.2f} {p[2]:.2f} {int(col[0])} {int(col[1])} {int(col[2])}\n")
    return len(idx)


def cmd(a):
    from pathlib import Path
    out = Path(a.output); out.mkdir(parents=True, exist_ok=True)
    key = tuple(int(a.key[i:i + 2], 16) for i in (0, 2, 4)); v = split_sheet(a.sheet, a.cols, a.rows, key)
    base = prepare(v); cam0 = make_cam(a.pitch); vv, sh = refine(base, cam0, 1, -1, rounds=2, rad=6)
    cam = make_cam(a.pitch, n=160, upp=1.0, height=200)
    occ, pts, shp = H.carve(vv, cam, sy=1, sd=-1, dil=0, vote=a.vote or None); surf = H.surface(occ, shp)
    ious = {d: round(H.iou(H.reproject(occ, pts, d, cam, cam["size"], 1, -1), vv[d][..., 3] > 0), 2) for d in vv}
    frames = []
    for k in range(a.angles):
        yaw = 360.0 * k / a.angles; i, c = H.colorize(pts, surf, vv, cam, yaw, list(vv), power=6); frames.append(H.render(pts, i, c, cam, yaw, ss=2))
    bbs = [f.getbbox() for f in frames]; x0, y0 = min(b[0] for b in bbs), min(b[1] for b in bbs); x1, y1 = max(b[2] for b in bbs), max(b[3] for b in bbs)
    sheet = Image.new("RGBA", ((x1 - x0) * a.angles, y1 - y0), (0, 0, 0, 0))
    for k, f in enumerate(frames): sheet.alpha_composite(f.crop((x0, y0, x1, y1)), (k * (x1 - x0), 0))
    sheet.save(out / f"{a.name}_turntable.png"); n = export_ply(occ, pts, vv, cam, str(out / f"{a.name}.ply"))
    print(f"[hull8] {int(occ.sum())} voxels, {n} points -> {out}/{a.name}.ply, {a.name}_turntable.png")
    print(f"[hull8] cohérence des vues (IoU re-rendu/entrée) : {ious} ; moyenne {np.mean(list(ious.values())):.2f}"
          + ("  ATTENTION : < 0,8 = vues géométriquement incohérentes (dessinées/IA) : volume de test seulement" if np.mean(list(ious.values())) < 0.8 else ""))
    return 0
