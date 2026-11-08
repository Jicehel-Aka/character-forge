"""Captures d'un visualiseur 3D (fond uni, caméra fixe, plateau tournant) -> sprites pixel art des 8 directions.
Détourage par écart au fond (+ retrait de l'ombre au sol), mise à l'échelle commune (hauteur médiane), alignement (centre du bas du corps, pieds),
réduction par aire, palette commune, contour. Sert quand on n'a pas le fichier 3D mais seulement des captures."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage


def cutout(path, tol=48, shadow_cut=0.86, shadow_lum=34):
    im = np.asarray(Image.open(path).convert("RGB")).astype(float); H, W, _ = im.shape
    edge = np.concatenate([im[:6].reshape(-1, 3), im[:, :6].reshape(-1, 3), im[:, -6:].reshape(-1, 3)])
    bg = np.median(edge, axis=0)
    # le fond est un dégradé léger : on le modélise par lignes (médiane des bords gauche/droite)
    rowbg = np.median(np.concatenate([im[:, :6], im[:, -6:]], axis=1), axis=1)               # (H,3)
    d = np.abs(im - rowbg[:, None, :]).sum(-1); m = d > tol
    m = ndimage.binary_opening(m, iterations=1); lab, k = ndimage.label(m)
    if k: m = lab == (1 + int(np.argmax(ndimage.sum(m, lab, range(1, k + 1)))))
    ys, xs = np.where(m); top, bot = ys.min(), ys.max()
    low = np.arange(H)[:, None] > top + shadow_cut * (bot - top)                                # ombre portée sous les pieds : très sombre, bas du corps
    m &= ~(low & (im.max(-1) < shadow_lum))
    m = ndimage.binary_fill_holes(ndimage.binary_opening(m, iterations=1)); lab, k = ndimage.label(m)
    if k: m = lab == (1 + int(np.argmax(ndimage.sum(m, lab, range(1, k + 1)))))
    rgba = np.dstack([im.astype(np.uint8), (m * 255).astype(np.uint8)]); ys, xs = np.where(m)
    return Image.fromarray(rgba, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)), m


def normalise(cuts, canvas=512, ground=0.94):
    """Même échelle (hauteur médiane), pieds au même niveau, centrés sur le bas du corps."""
    hs = [c.height for c in cuts]; H = float(np.median(hs)); out = []
    for c in cuts:
        s = H / c.height if abs(H / c.height - 1) < 0.08 else 1.0                              # écart > 8 % : vraie différence de pose, on garde l'échelle
        s = (canvas * 0.86) / max(hs) * (1.0 if s == 1.0 else s)
        w, h = max(1, int(round(c.width * s))), max(1, int(round(c.height * s))); r = c.resize((w, h), Image.LANCZOS)
        a = np.asarray(r)[..., 3] > 0; ys, xs = np.where(a); lo = a[int(h * 0.6):int(h * 0.92)]; lx = np.where(lo.any(0))[0]
        cx = (lx.min() + lx.max()) / 2 if len(lx) else w / 2
        cv = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0)); cv.paste(r, (int(round(canvas / 2 - cx)), int(round(canvas * ground - h))))
        out.append(cv)
    return out


def cmd(a):
    from . import pixdown
    dirs = a.dirs.split(","); files = a.images
    assert len(dirs) == len(files), "autant de directions que d'images"
    out = Path(a.output); out.mkdir(parents=True, exist_ok=True)
    cuts = [cutout(f)[0] for f in files]; norm = normalise(cuts)
    for d, im in zip(dirs, norm): im.save(out / f"big_{d}.png")
    arrs = {d: pixdown.shrink(im, a.size, sharpen=0.35) for d, im in zip(dirs, norm)}
    allpx = np.concatenate([x[x[..., 3] > 0][:, :3] for x in arrs.values()]).astype(np.uint8)
    pal = Image.fromarray(allpx[None, ...]).quantize(a.colors, Image.MEDIANCUT)
    for d, x in arrs.items():
        x = pixdown.outline(x) if a.outline else x
        q = np.asarray(Image.fromarray(x[..., :3]).quantize(palette=pal, dither=Image.NONE).convert("RGB")).copy(); r = np.dstack([q, x[..., 3]]); r[x[..., 3] == 0] = 0
        Image.fromarray(r, "RGBA").save(out / f"{a.name}_{d}.png")
    print(f"[shots] {len(files)} vues -> {out} ({a.size} px, {a.colors} couleurs)"); return 0
