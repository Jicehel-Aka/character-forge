"""Peinture d'un modèle SpriteKiln à partir d'une planche source (8 vues d'un dessin) : on apprend une couleur par point de
surface en coordonnées LOCALES de chaque pièce (donc elle suit le squelette), puis on repeint n'importe quelle image
d'animation. Étapes : (1) G-buffer SpriteKiln -> position de chaque pixel dans le repère de sa pièce ; (2) calage de la vue source sur
la silhouette rendue (échelle + translation, affinés par IoU) et association automatique colonne source <-> direction
(hongrois sur l'IoU) ; (3) accumulation des couleurs par cellule locale, pondérées par la normale ; (4) repeinture."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

CELL = 0.012
ALLOWED = {"skin": {"skin"}, "cloth": {"white"}, "collar": {"white"}, "gloves": {"blue"}, "cuff": {"blue"}, "headband": {"blue"},
           "leather": {"black", "white"}, "belt_k": {"black"}, "hair": {"black"}, "ink": {"black"}, "steel": {"white"}}


def classify(rgb):
    """Classe de couleur d'un pixel source (white/blue/skin/black, None = ambigu : fond magenta, halos) -> tableau d'objets."""
    import colorsys
    a = np.asarray(rgb, float) / 255; mx = a.max(-1); mn = a.min(-1); sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.zeros_like(mx); d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    out = np.full(mx.shape, None, object)
    out[(mx < 0.30)] = "black"
    out[(mx >= 0.5) & (sat < 0.30) & (mx >= 0.30)] = "white"
    out[(mx >= 0.7) & (sat < 0.38) & (hue > 190) & (hue < 260)] = "white"
    out[(sat >= 0.38) & (hue > 195) & (hue < 255) & (mx >= 0.3) & (out == None)] = "blue"
    out[(sat >= 0.18) & ((hue < 48) | (hue > 340)) & (mx >= 0.45) & (out == None)] = "skin"
    return out


def gpoints(spec_path, size, anim, frame, yaw_deg):
    """-> dict : rgba (S,S,4 SpriteKiln), gid, normal, q (S,S,3 coord. locales de la pièce), P (modèle), names, cam."""
    from spritekiln import pipeline, spec as specmod
    from spritekiln.render import Scene
    from spritekiln.anim import frames_of
    spec = pipeline.get_spec(str(spec_path), size)
    env, _ms, _ev = frames_of(spec, anim, yaw_deg)[frame]
    env = dict(env, yaw=float(yaw_deg), dir=specmod.direction_name(yaw_deg))
    buf, groups, frames, cam = pipeline.render_buffers(spec, env, yaw_deg)
    S = cam.size; o = np.arange(S) + 0.5
    px, py = np.meshgrid(o, o)
    ro = cam.center + ((px - S / 2) * cam.scale)[..., None] * cam.R + ((S / 2 - py) * cam.scale)[..., None] * cam.U - cam.D * 20
    gid = buf.gid.astype(int); hit = gid >= 0
    Pw = ro + cam.D * np.where(hit, buf.depth, 0)[..., None]
    sc = Scene(groups, np.radians(yaw_deg)); P = sc.to_local(Pw.reshape(-1, 3)).reshape(S, S, 3)
    q = np.zeros_like(P)
    for i, g in enumerate(groups):
        sel = gid == i
        if sel.any() and g.frame is not None:
            oo, R, s = g.frame; qq = ((P[sel] - oo) @ R) / s
            if g.mirror: qq[:, 0] = -qq[:, 0]
            q[sel] = qq
    return {"mats": [g.mat for g in groups], "gid": gid, "normal": buf.normal.astype(float), "q": q, "P": P, "names": [g.name for g in groups], "cam": cam, "hit": hit}


def source_cells(path, y0, y1, n=8, key=(255, 0, 255), tol=120):
    """Rangée de n vues d'une planche -> liste d'images RGBA (fond clé retiré, plus grand îlot conservé)."""
    from scipy import ndimage
    im = np.asarray(Image.open(path).convert("RGB")); H, W, _ = im.shape; out = []
    row = im[y0:y1]; d = np.abs(row.astype(int) - np.array(key)).sum(-1)
    fg = d > tol
    # grille violette (traits de séparation) : proche de la clé mais plus sombre -> fond
    lab, k = ndimage.label(ndimage.binary_opening(fg, iterations=1))
    cw = W / n
    for i in range(n):
        x0, x1 = int(i * cw), int((i + 1) * cw); m = fg[:, x0 + 6:x1 - 6]
        l, kk = ndimage.label(ndimage.binary_closing(m, iterations=2))
        if kk: sizes = ndimage.sum(m, l, range(1, kk + 1)); m = ndimage.binary_closing(l == (1 + int(np.argmax(sizes))), iterations=2); m = ndimage.binary_fill_holes(m)
        m = ndimage.binary_erosion(m, iterations=1)
        rgba = np.dstack([row[:, x0 + 6:x1 - 6], (m * 255).astype(np.uint8)]); ys, xs = np.where(m)
        out.append(Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA") if len(ys) else None)
    return out


def _box(mask):
    ys, xs = np.where(mask); return xs.min(), xs.max() + 1, ys.min(), ys.max() + 1


def align(src, mask_r, iters=2):
    """Cale l'image source RGBA sur le masque rendu : échelle (par hauteur) + translation (pieds/centre), puis affinage IoU.
    -> (rgb (S,S,3), alpha bool (S,S), iou, params)"""
    from scipy import ndimage
    S = mask_r.shape[0]; x0, x1, y0, y1 = _box(mask_r); a = np.asarray(src)
    sh, sw = a.shape[:2]; best = None
    def warp(s, tx, ty):
        h = int(round(sh * s)); w = int(round(sw * s)); r = src.resize((max(1, w), max(1, h)), Image.BILINEAR)
        canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0)); canvas.paste(r, (int(round(tx - w / 2)), int(round(ty - h))))
        return np.asarray(canvas)
    s0 = (y1 - y0) / sh; tx0 = (x0 + x1) / 2; ty0 = y1
    for ds in (0.9, 0.95, 1.0, 1.05, 1.1):
        for dx in range(-8, 9, 4):
            for dy in range(-6, 7, 3):
                c = warp(s0 * ds, tx0 + dx, ty0 + dy); m = c[..., 3] > 128
                iou = (m & mask_r).sum() / max(1, (m | mask_r).sum())
                if best is None or iou > best[0]: best = (iou, ds, dx, dy, c)
    iou, ds, dx, dy, c = best
    return c[..., :3], c[..., 3] > 128, float(iou), (s0 * ds, tx0 + dx, ty0 + dy)


class Learner:
    def __init__(self, spec_path, size=256, anim="idle", frame=0):
        self.spec, self.size, self.anim, self.frame = Path(spec_path), size, anim, frame
        self.acc = {}; self.names = None

    def add(self, yaw_deg, src_rgb, src_mask, power=1.0):
        gp = gpoints(self.spec, self.size, self.anim, self.frame, yaw_deg); self.names = gp["names"]
        cam = gp["cam"]; nz = np.clip(-(gp["normal"] @ cam.D), 0, 1) ** power
        sel = gp["hit"] & src_mask & (nz > 0.15)
        cls = classify(src_rgb); ok = np.zeros_like(sel)
        for gi, mat in enumerate(gp["mats"]):
            allowed = ALLOWED.get(mat); m = gp["gid"] == gi
            ok |= m & (np.isin(cls, list(allowed)) if allowed else True)
        sel &= ok
        key = np.round(gp["q"][sel] / CELL).astype(np.int32); gid = gp["gid"][sel]; col = src_rgb[sel].astype(float); w = nz[sel]
        for g, k, c, ww in zip(gid, map(tuple, key), col, w):
            a = self.acc.setdefault((int(g), k), [np.zeros(3), 0.0]); a[0] += c * ww; a[1] += ww

    def tables(self):
        from scipy.spatial import cKDTree
        by = {}
        for (g, k), (c, w) in self.acc.items(): by.setdefault(g, ([], []))[0].append(np.array(k) * CELL); by[g][1].append(c / w)
        return {g: (cKDTree(np.array(p)), np.array(c)) for g, (p, c) in by.items()}

    def paint(self, tables, anim, frame, yaw_deg, size=None):
        gp = gpoints(self.spec, size or self.size, anim, frame, yaw_deg); S = gp["gid"].shape[0]
        out = np.zeros((S, S, 4), np.uint8)
        for g, (tree, cols) in tables.items():
            sel = gp["gid"] == g
            if sel.any(): _, idx = tree.query(gp["q"][sel]); out[sel, :3] = cols[idx].astype(np.uint8)
        out[..., 3] = np.where(gp["hit"], 255, 0); return Image.fromarray(out, "RGBA")


def palette_from(tables, ncol=32, per=400, seed=0):
    """Palette commune : couleurs apprises, échantillonnées à parts égales par pièce (les petites zones — gants, bandeau, visage — pèsent autant que le kimono)."""
    rng = np.random.default_rng(seed); px = []
    for _g, (_t, cols) in tables.items():
        px.append(cols[rng.choice(len(cols), min(per, len(cols)), replace=False)])
    arr = np.concatenate(px).astype(np.uint8)
    return Image.fromarray(arr[None, ...]).quantize(ncol, Image.MEDIANCUT)


def to_final(im, size, pal, thr=0.45):
    """Image peinte grande -> taille finale : réduction par aire, alpha binaire, palette, contour sombre d'1 px."""
    from . import pixdown
    a = pixdown.shrink(im, size, sharpen=0.8, thr=thr); a = pixdown.outline(a)
    q = np.asarray(Image.fromarray(a[..., :3]).quantize(palette=pal, dither=Image.NONE).convert("RGB")).copy()
    r = np.dstack([q, a[..., 3]]); r[a[..., 3] == 0] = 0; return Image.fromarray(r, "RGBA")


def cmd(a):
    """forge skiln-paint spec.yaml planche.png --row Y0,Y1 [--anims coup_d,...] [--dirs ...] --size 256 --final 64 -o dir"""
    from scipy.optimize import linear_sum_assignment  # noqa: F401 (réservé : association libre)
    out = Path(a.output); out.mkdir(parents=True, exist_ok=True)
    meta = json.load(open(a.meta))["spritekiln"]["direction_yaw"] if a.meta else {d: y for d, y in zip(
        ["s", "se", "e", "ne", "n", "nw", "w", "sw"], [0, 45, 90, 135, 180, -135, -90, -45])}
    dirs = list(meta); y0, y1 = (int(v) for v in a.row.split(","))
    cells = source_cells(a.sheet, y0, y1, len(dirs)); L = Learner(a.spec, a.size, "idle", 0); M = np.zeros((len(dirs), len(dirs))); AL = {}
    for j, d in enumerate(dirs):
        gp = gpoints(L.spec, a.size, "idle", 0, meta[d])
        for i, c in enumerate(cells):
            rgb, m, iou, _ = align(c, gp["hit"]); M[i, j] = iou; AL[i, j] = (rgb, m)
    best = max(((sum(M[i, (sg * i + sh) % 8] for i in range(8)), sg, sh) for sg in (a.sign,) if sg for sh in range(8)), key=lambda t: t[0]) if a.sign else None
    if best is None:
        best = max(((sum(M[i, (sg * i + sh) % 8] for i in range(8)), sg, sh) for sg in (1, -1) for sh in range(8)), key=lambda t: t[0])
    print(f"[skiln-paint] association colonnes -> directions : signe {best[1]:+d}, décalage {best[2]}, IoU moyen {best[0] / 8:.2f}")
    for i in range(8): L.add(meta[dirs[(best[1] * i + best[2]) % 8]], *AL[i, (best[1] * i + best[2]) % 8])
    T = L.tables(); pal = palette_from(T); n = 0
    for anim in a.anims:
        for d in a.dirs.split(","):
            from spritekiln.anim import frames_of
            from spritekiln import pipeline
            nf = len(frames_of(pipeline.get_spec(str(a.spec), a.size), anim, meta[d]))
            for f in range(nf):
                big = L.paint(T, anim, f, meta[d]); big.save(out / f"{anim}_{d}_{f}_big.png")
                to_final(big, a.final, pal).save(out / f"{anim}_{d}_{f}.png"); n += 1
    print(f"[skiln-paint] {n} images -> {out}"); return 0
