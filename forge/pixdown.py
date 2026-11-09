"""Réduction pixel art d'un atlas SpriteKiln rendu en grand : on rend à 256 px, on réduit à la taille finale.
Étapes : renforcement local du contraste (pour que les petits détails survivent), réduction par aire sur alpha prémultiplié,
alpha binaire, palette commune à toutes les images (quantification médiane), contour d'1 px sombre sur le bord extérieur."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter


def frames(png, js):
    j = json.load(open(js)); im = Image.open(png).convert("RGBA"); out = {}
    for k, v in j["frames"].items():
        f = v["frame"]; out[k] = im.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))
    return out


def shrink(im, size, sharpen=1.2, thr=0.45):
    a = im.convert("RGBA")
    if sharpen:
        rgb = a.convert("RGB").filter(ImageFilter.UnsharpMask(radius=max(1, a.width / size), percent=int(100 * sharpen), threshold=2)); a = Image.merge("RGBA", (*rgb.split(), a.split()[3]))
    arr = np.asarray(a, np.float32); al = arr[..., 3:] / 255; pm = np.concatenate([arr[..., :3] * al, al * 255], -1)
    small = Image.fromarray(pm.astype(np.float32), mode="F") if False else None
    k = a.width / size; chans = [np.asarray(Image.fromarray(pm[..., i]).resize((size, size), Image.BOX), np.float32) for i in range(4)]
    A = chans[3] / 255; rgb = np.stack(chans[:3], -1) / np.maximum(A, 1e-3)[..., None]
    M = keep_thin(A, thr)
    out = np.zeros((size, size, 4), np.uint8); out[..., :3] = np.clip(rgb, 0, 255); out[..., 3] = np.where(M, 255, 0)
    return out


def keep_thin(A, thr=0.45, lo=0.12, bridge=0.2):
    """Seuil de couverture qui ne fait pas disparaître les parties fines (bras, jambes, rubans) : les pixels de couverture faible sont ajoutés
    seulement s'ils relient deux zones du masque (pont) ou s'ils forment une pièce isolée qui disparaîtrait entièrement."""
    from scipy import ndimage
    M = A >= thr; C = (A >= lo) & ~M
    if not C.any(): return M
    st = np.ones((3, 3), int)
    lm, nm = ndimage.label(M, st); lc, nc = ndimage.label(M | C, st)
    add = np.zeros_like(M)
    for k in range(1, nc + 1):
        comp = lc == k; cand = comp & C
        if not cand.any(): continue
        nparts = len(np.unique(lm[comp & M])) - (1 if (lm[comp & M] == 0).any() else 0)
        if nparts >= 2 or (nparts == 0 and A[comp].sum() >= 0.8): add |= cand & (A >= bridge)
    return M | add


def outline(arr, col=(16, 16, 24)):
    from scipy import ndimage
    m = arr[..., 3] > 0; edge = m & ~ndimage.binary_erosion(m)
    dark = np.array(col, np.uint8); o = arr.copy(); o[edge, :3] = (o[edge, :3] * 0.35 + dark * 0.65).astype(np.uint8)
    return o


def run(png, js, size, ncol=32, sharpen=1.2, out=None):
    fr = frames(png, js); sm = {k: outline(shrink(v, size, sharpen)) for k, v in fr.items()}
    allpx = np.concatenate([a[a[..., 3] > 0][:, :3] for a in sm.values()]).astype(np.uint8)
    pal = Image.fromarray(allpx[None, ...]).quantize(ncol, Image.MEDIANCUT)
    res = {}
    for k, a in sm.items():
        q = Image.fromarray(a[..., :3]).quantize(palette=pal, dither=Image.NONE).convert("RGB"); b = np.asarray(q).copy()
        r = np.dstack([b, a[..., 3]]); r[a[..., 3] == 0] = 0; res[k] = Image.fromarray(r, "RGBA")
    if out:
        Path(out).mkdir(parents=True, exist_ok=True)
        for k, v in res.items(): v.save(Path(out) / f"{k}.png")
    return res


def separate(arr, cm, mindiff=26, strength=0.4):
    """Contours internes lisibles : un pixel de bras/jambe (classes 1-4) voisin d'une autre classe avec peu de contraste de luminance est assombri,
    pour que le membre se détache du torse (blanc sur blanc, peau sur peau)."""
    a = arr.copy(); al = a[..., 3] > 0; lum = a[..., :3].astype(np.float32) @ np.array([.3, .59, .11], np.float32)
    limb = (cm >= 1) & (cm <= 4) & al; mark = np.zeros_like(limb)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        sh = lambda v: np.roll(np.roll(v, dy, 0), dx, 1)
        other = al & sh(al) & (sh(cm) != cm); diff = np.abs(lum - sh(lum))
        mark |= limb & other & (diff < mindiff)
    rgb = a[..., :3].astype(np.float32); dark = rgb * (1 - strength); dark = np.where(lum[..., None] < 45, rgb + 45 * strength, dark)
    a[..., :3] = np.where(mark[..., None], np.clip(dark, 0, 255), rgb).astype(np.uint8)
    return a


def fatten(arr, minw=2, notch=6):
    """Épaisseur minimale des membres + lissage des contours d'un sprite RGBA (size x size) :
    1) comble les encoches (pixel vide entouré d'au moins `notch` voisins pleins) ;
    2) tout pixel qui n'appartient à aucun bloc 2x2 plein (membre réduit à un trait d'1 px) reçoit un voisin du côté vide (alternance gauche/droite, haut/bas
       pour garder l'axe du membre), de même couleur : un bras ou une jambe ne tombe jamais sous `minw` pixels."""
    out = arr.copy(); a = out[..., 3] > 0; H, W = a.shape
    def sh(m, dy, dx):
        r = np.zeros_like(m); ys = slice(max(dy, 0), H + min(dy, 0)); yd = slice(max(-dy, 0), H + min(-dy, 0))
        xs = slice(max(dx, 0), W + min(dx, 0)); xd = slice(max(-dx, 0), W + min(-dx, 0)); r[ys, xs] = m[yd, xd]; return r
    nb = sum(sh(a, dy, dx).astype(int) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx))
    fill = (~a) & (nb >= notch)
    if fill.any():
        rgb = out[..., :3].astype(float) * a[..., None]; cnt = np.maximum(nb, 1)[..., None]
        acc = sum(sh(rgb, dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx)); out[fill, :3] = (acc / cnt)[fill].astype(np.uint8); out[fill, 3] = 255; a = a | fill
    if minw >= 2:
        r, l, d, u = (lambda dy, dx: sh(a, dy, dx))(0, -1), sh(a, 0, 1), sh(a, -1, 0), sh(a, 1, 0)   # voisins (décalages : r = pixel à droite ... )
        t = a & ((r & d & sh(a, -1, -1)) | (l & d & sh(a, -1, 1)) | (r & u & sh(a, 1, -1)) | (l & u & sh(a, 1, 1)))
        thin = a & ~t
        ys, xs = np.nonzero(thin)
        for y, x in zip(ys, xs):
            horiz_free = (x == 0 or not a[y, x - 1]) and (x == W - 1 or not a[y, x + 1])
            vert_free = (y == 0 or not a[y - 1, x]) and (y == H - 1 or not a[y + 1, x])
            if horiz_free:
                nx = x + 1
                if 0 <= nx < W and not out[y, nx, 3]: out[y, nx] = out[y, x]
            if vert_free:
                ny = y + 1
                if 0 <= ny < H and not out[ny, x, 3]: out[ny, x] = out[y, x]
    return out
