"""Greffe de tête : le corps vient du rendu natif SpriteKiln (propre, animé), la tête vient de l'image source de la direction
correspondante (visage, cheveux, bandeau dessinés par l'artiste), mise à l'échelle sur l'emplacement de la tête du modèle.
Une texture projetée sur un modèle en volumes simples ne peut pas donner un visage lisible à 64 px ; le dessin de départ, lui, le peut."""
import numpy as np
from PIL import Image
from scipy import ndimage

HEAD_GROUPS = ("head", "hair", "fringe", "locks", "back", "nose", "ear_L", "ear_R", "headband", "hb_knot", "hb_ribbon_a", "hb_ribbon_b", "eye_L", "eye_R", "brow_L", "brow_R", "mouth")


def head_sprite(cell):
    """Vue source RGBA (figure recadrée) -> (tête RGBA, bbox 'principale' sans rubans).
    La tête = les lignes au-dessus de la ligne d'épaules + les rubans bleus reliés à elle (les gants bleus, eux, sont écartés)."""
    from .skiln_paint import classify
    a = np.asarray(cell).copy(); m = a[..., 3] > 0; H, W = m.shape
    widths = m.sum(1); ref = widths[: int(H * 0.25)].max()
    rows = np.where((widths > 1.3 * ref) & (np.arange(H) >= int(H * 0.25)))[0]
    cut = int(np.clip(rows[0] if len(rows) else H * 0.4, H * 0.30, H * 0.45))
    cls = classify(a[..., :3]); head = m.copy(); head[cut:] = False
    blue = (cls == "blue") & m; blue[int(H * 0.55):] = False
    cand = head | blue; lab, n = ndimage.label(cand)
    keep = np.isin(lab, np.unique(lab[head & (lab > 0)]))
    keep = ndimage.binary_erosion(keep, iterations=1) | (keep & blue)                 # liseré de fond magenta
    lab, n = ndimage.label(keep)
    if n > 1: sizes = ndimage.sum(keep, lab, range(1, n + 1)); keep = lab == (1 + int(np.argmax(sizes)))
    a[..., 3] = (keep * 255).astype(np.uint8)
    f = a[..., :3].astype(float) / 255; mag = (f[..., 0] > f[..., 1] + 0.12) & (f[..., 2] > f[..., 1] + 0.12) & (np.abs(f[..., 0] - f[..., 2]) < 0.45)   # liseré magenta du fond
    mag &= keep
    if mag.any() and (~mag & keep).any():
        _, (iy, ix) = ndimage.distance_transform_edt(mag | ~keep, return_indices=True); a[mag, :3] = a[iy[mag], ix[mag], :3]
    main = keep & ~(blue & (np.arange(H)[:, None] >= cut - 2))
    ys, xs = np.where(keep); x0, y0 = xs.min(), ys.min(); a = a[y0:ys.max() + 1, x0:xs.max() + 1]
    ys2, xs2 = np.where(main); box = (xs2.min() - x0, ys2.min() - y0, xs2.max() + 1 - x0, ys2.max() + 1 - y0)
    return Image.fromarray(a, "RGBA"), box


def compose(native, gp, head, box, scale_k=1.0, lift=0.0):
    """native : Image RGBA du rendu natif (taille S) ; gp : gpoints (gid, names) du même rendu ; head/box : tête source.
    Efface les pièces de tête du natif, colle la tête source calée sur la boîte des pièces de tête (bas-centre)."""
    nat = np.asarray(native).copy(); ids = [i for i, n in enumerate(gp["names"]) if n in HEAD_GROUPS]
    hm = np.isin(gp["gid"], ids) & gp["hit"]
    if not hm.any(): return native
    ys, xs = np.where(hm); bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    bw, bh = box[2] - box[0], box[3] - box[1]; s = scale_k * max((bx1 - bx0) / bw, (by1 - by0) / bh)
    nat[hm] = 0                                                         # tête native retirée (le cou reste)
    w, h = max(1, int(round(head.width * s))), max(1, int(round(head.height * s))); hs = head.resize((w, h), Image.LANCZOS)
    cx = (bx0 + bx1) / 2 - (box[0] + bw / 2) * s + 0                      # centre horizontal de la boîte principale
    x = int(round((bx0 + bx1) / 2 - ((box[0] + box[2]) / 2) * s)); y = int(round(by1 - box[3] * s + lift))
    base = Image.fromarray(nat, "RGBA"); base.alpha_composite(hs, (x, y)) if x >= 0 and y >= 0 and x + w <= base.width and y + h <= base.height else _paste_clipped(base, hs, x, y)
    return base


def _paste_clipped(base, im, x, y):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0)); layer.paste(im, (x, y)); base.alpha_composite(layer)
