"""Harmoniser le rendu de sprites venus d'une autre source avec ceux d'un personnage de référence.

Cas vécu : le cycle de marche (rendu plus réaliste) avait un vert plus clair, pas de contour, une silhouette plus
fine et une tête plus petite que la combattante des autres lignes. Quatre corrections, indépendantes :
  1. taille      : hauteur cible commune (--height), largeur ajustable (--width, ex. 1.10 pour une carrure plus large) ;
  2. tête        : agrandissement de la tête (--head-scale, ex. 1.30) coupée à --head-cut (fraction de la hauteur,
                   sous le menton) et ancrée au cou : la tête grandit vers le haut, le corps ne bouge pas ;
  3. couleurs    : transfert d'histogramme par canal vers les pixels de référence, puis recollage sur une palette
                   (k-means, --colors) tirée de la référence ; les sombres (cheveux) sont préservés ;
  4. contour     : liseré sombre de 1 px autour du sprite, comme les sprites de référence.
Ordre fixe : tête -> taille -> couleurs -> contour. Le point 2 dépend de la pose : --head-cut se règle à l'œil sur
une frame (une valeur par source de sprites) ; sur 6 frames d'un même rendu, la même valeur suffit.

  python -m forge harmonize DOSSIER_SPRITES --ref DOSSIER_OU_PLANCHE_REF -o sortie --height 102 --width 1.10 \
      --head-scale 1.30 --head-cut 0.30 --colors 28
Limite : transfert de couleurs = style, pas de la repeinte ; il n'invente aucun détail."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.cluster.vq import kmeans2

from .flat import load


def rgba_of(path):
    im, _ = load(path); return np.asarray(im)


def ref_pixels(paths_or_arrays, min_lum=45):
    px = []
    for p in paths_or_arrays:
        a = p if isinstance(p, np.ndarray) else rgba_of(p)
        v = a[a[..., 3] > 127][:, :3]; px.append(v)
    px = np.concatenate(px).astype(float)
    return px[px.mean(1) > min_lum]          # sans le contour sombre


def palette(px, n=28, seed=1):
    rng = np.random.RandomState(0)
    s = px[rng.choice(len(px), min(len(px), 20000), replace=False)]
    c, _ = kmeans2(s, n, seed=seed, minit="++")
    return c[np.argsort(c.mean(1))]


def _match(src, ref):
    out = np.empty_like(src, float)
    for ch in range(3):
        sv = np.sort(src[:, ch]); rv = np.sort(ref[:, ch])
        q = np.searchsorted(sv, src[:, ch]) / len(sv)
        out[:, ch] = np.interp(q, np.linspace(0, 1, len(rv)), rv)
    return out


def enlarge_head(rgb, mask, scale, cut):
    """Agrandit la partie haute (y < cut*h) autour du cou ; renvoie (rgb, mask) recadrés."""
    h, w = mask.shape; cut = int(round(cut * h))
    r = rgb.astype(int); R, G, B = r[..., 0], r[..., 1], r[..., 2]
    skin = mask & (R > 170) & (G > 110) & (B > 80) & (R > G + 15) & (G > B) & (R - B > 40)
    ys, xs = np.nonzero(skin[:cut]); cx = float(xs.mean()) if len(xs) else w / 2
    hd = Image.fromarray(rgb[:cut]); hm = Image.fromarray((mask[:cut] * 255).astype(np.uint8))
    nh, nw = round(cut * scale), round(w * scale)
    hd = np.array(hd.resize((nw, nh), Image.LANCZOS)); hm = np.array(hm.resize((nw, nh), Image.LANCZOS)) > 128
    pad = nh - cut; left = max(0, int(round(cx * scale - cx)))
    W = max(w + left, nw)
    out = np.zeros((h + pad, W, 3), np.uint8); om = np.zeros((h + pad, W), bool)
    out[pad + cut:, left:left + w] = rgb[cut:]; om[pad + cut:, left:left + w] = mask[cut:]
    reg = out[:nh, :nw]; reg[hm] = hd[hm]; out[:nh, :nw] = reg; om[:nh, :nw] |= hm
    ys, xs = np.nonzero(om)
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1], om[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def harmonize(rgba, ref_px, pal, height=None, width=1.0, head_scale=1.0, head_cut=0.30, outline=(14, 8, 22), keep_dark=85):
    a = np.asarray(rgba); rgb = a[..., :3].copy(); mask = a[..., 3] > 127
    ys, xs = np.nonzero(mask); rgb = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; mask = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    if head_scale != 1.0: rgb, mask = enlarge_head(rgb, mask, head_scale, head_cut)
    h, w = mask.shape; nh = int(height or h); nw = int(round(w * nh / h * width))
    im = np.array(Image.fromarray(rgb).resize((nw, nh), Image.LANCZOS)).astype(float)
    m = np.array(Image.fromarray((mask * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)) > 128
    m = ndi.binary_opening(m, iterations=1); inner = ndi.binary_erosion(m, iterations=1)
    px = im[inner]; mp = 0.8 * _match(px, ref_px) + 0.2 * px
    dark = px.mean(1) < keep_dark; mp[dark] = px[dark] * 0.75 + np.array((8, 4, 22)) * 0.25
    d = ((mp[:, None, :] - pal[None]) ** 2).sum(2); im[inner] = pal[d.argmin(1)]
    ring = ndi.binary_dilation(m, iterations=1); im[ring & ~inner] = outline
    out = np.zeros((nh, nw, 4), np.uint8); out[..., :3] = im.astype(np.uint8); out[..., 3] = np.where(ring, 255, 0)
    return Image.fromarray(out, "RGBA")


def cmd(a):
    src = sorted(Path(a.folder).glob("*.png")); refs = Path(a.ref)
    rp = [refs] if refs.is_file() else sorted(refs.glob("*.png"))
    px = ref_pixels(rp); pal = palette(px, a.colors)
    Path(a.output).mkdir(parents=True, exist_ok=True)
    for p in src:
        harmonize(Image.fromarray(rgba_of(p)), px, pal, a.height, a.width, a.head_scale, a.head_cut).save(Path(a.output) / p.name)
    print(f"[harmonize] {len(src)} sprites -> {a.output} (palette {len(pal)} couleurs, référence {len(px)} px)")
    return 0
