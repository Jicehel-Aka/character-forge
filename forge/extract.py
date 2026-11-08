"""Détection et découpe des éléments d'une image (composantes connexes)."""
import numpy as np
from PIL import Image
from scipy import ndimage


def foreground_mask(img: Image.Image, tol: int = 24) -> np.ndarray:
    """Masque booléen du premier plan.
    Utilise le canal alpha s'il est utile, sinon estime la couleur de fond
    à partir des 4 coins."""
    rgba = np.asarray(img.convert("RGBA")).astype(np.int16)
    alpha = rgba[..., 3]
    if alpha.min() < 250:  # vraie transparence
        return alpha > 127
    corners = np.array([rgba[0, 0, :3], rgba[0, -1, :3], rgba[-1, 0, :3], rgba[-1, -1, :3]])
    bg = np.median(corners, axis=0)
    dist = np.abs(rgba[..., :3] - bg).sum(axis=2)
    return dist > tol


def extract_elements(img: Image.Image, tol=24, merge=3, min_area=16, pad=1):
    """Retourne [(Image RGBA recadrée, {'bbox': [x,y,w,h], 'area': n}), ...]
    triés de haut en bas puis de gauche à droite.
    merge : dilatation (px) pour fusionner les pièces proches (ex. un bras détaché)."""
    mask = foreground_mask(img, tol)
    grown = ndimage.binary_dilation(mask, iterations=merge) if merge > 0 else mask
    labels, _ = ndimage.label(grown)
    rgba = img.convert("RGBA")
    arr = np.asarray(rgba).copy()
    arr[~mask, 3] = 0  # fond rendu transparent
    clean = Image.fromarray(arr, "RGBA")
    W, H = clean.size
    results = []
    for sl in ndimage.find_objects(labels):
        sub = mask[sl]
        area = int(sub.sum())
        if area < min_area:
            continue
        # bbox serré calculé sur le masque réel (pas sur la zone dilatée)
        yy, xx = np.nonzero(sub)
        ys0, xs0 = sl[0].start, sl[1].start
        x0, x1 = xs0 + int(xx.min()), xs0 + int(xx.max()) + 1
        y0, y1 = ys0 + int(yy.min()), ys0 + int(yy.max()) + 1
        x0, y0 = max(x0 - pad, 0), max(y0 - pad, 0)
        x1, y1 = min(x1 + pad, W), min(y1 + pad, H)
        crop = clean.crop((x0, y0, x1, y1))
        results.append((crop, {"bbox": [x0, y0, x1 - x0, y1 - y0], "area": area}))
    results.sort(key=lambda r: (r[1]["bbox"][1] // 16, r[1]["bbox"][0]))
    return results
