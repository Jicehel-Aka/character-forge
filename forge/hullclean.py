"""Nettoyage des vues AVANT sculpture, fondé sur des statistiques robustes et des normales de contour.

1. Statistiques par vue (aire, hauteur, largeur, remplissage, périmètre normalisé, axe du tronc) ; écart à la médiane en MAD
   (z robuste) -> vues suspectes. Les vues opposées (s/n, e/w, se/nw, ne/sw) doivent avoir hauteur et aire proches.
2. Corrections de masque : frange de la couleur de fond (halo magenta), petits îlots, petits trous, lissage de contour.
3. Échelle : une vue dont la hauteur s'écarte de plus de 2 MAD est remise à l'échelle commune (limitée à ±12 %).
4. Normales de contour (2D) : chaque vue est comparée au contour du volume sculpté avec les AUTRES vues ; accord moyen des
   normales + fraction de contour « hors consensus » ; les petits îlots hors consensus sont supprimés (clip_to_consensus).
Chaque correction est journalisée dans le rapport : rien n'est modifié en silence."""
import numpy as np
from scipy import ndimage
from PIL import Image

PAIRS = [("s", "n"), ("e", "w"), ("se", "nw"), ("ne", "sw")]


def _mad_z(x):
    x = np.asarray(x, float); m = np.median(x); s = 1.4826 * np.median(np.abs(x - m)) + 1e-9
    return (x - m) / s


def stats(views):
    out = {}
    for n, a in views.items():
        m = a[..., 3] > 0; ys, xs = np.where(m); h = ys.max() - ys.min() + 1; w = xs.max() - xs.min() + 1
        er = ndimage.binary_erosion(m); per = int((m & ~er).sum()); band = m[ys.min() + int(.35 * h):ys.min() + int(.6 * h)]
        cx = float(np.where(band)[1].mean()) if band.any() else float(xs.mean())
        out[n] = {"area": int(m.sum()), "h": int(h), "w": int(w), "fill": float(m.sum() / (h * w)), "perim": per / np.sqrt(m.sum()), "torso_x": cx, "bottom": int(ys.max())}
    return out


def suspects(st, zmax=3.0):
    names = list(st); rep = {}
    for k in ("area", "h", "w", "fill", "perim"):
        z = _mad_z([st[n][k] for n in names])
        for n, v in zip(names, z): rep.setdefault(n, {})[k] = round(float(v), 2)
    flags = {n: [k for k, v in z.items() if abs(v) > zmax] for n, z in rep.items()}
    pairs = {f"{a}/{b}": {"h": round(st[a]["h"] / st[b]["h"], 3), "area": round(st[a]["area"] / st[b]["area"], 3)} for a, b in PAIRS if a in st and b in st}
    return rep, flags, pairs


def _near_key(rgb, key, tol):
    return np.abs(rgb.astype(int) - np.array(key)).sum(-1) < tol


def clean_masks(views, key=(255, 0, 255), halo_tol=260, log=None):
    log = log if log is not None else []
    out = {}
    for n, a in views.items():
        a = a.copy(); m = a[..., 3] > 0; a0 = int(m.sum())
        # 1. halo : pixels de bord proches de la couleur de fond (pas l'intérieur : des violets du dessin existent)
        edge = m & ~ndimage.binary_erosion(m, iterations=2)
        halo = edge & _near_key(a[..., :3], key, halo_tol)
        m2 = m & ~halo
        # 2. îlots (< 0,3 % de l'aire) et petits trous (< 0,05 %)
        lab, nl = ndimage.label(m2); islands = 0
        if nl > 1:
            sz = ndimage.sum(m2, lab, range(1, nl + 1)); good = [i + 1 for i, v in enumerate(sz) if v >= 0.003 * m2.sum()]
            islands = nl - len(good); m2 = np.isin(lab, good)
        holes = ndimage.binary_fill_holes(m2) & ~m2; hl, hn = ndimage.label(holes)
        for i in range(1, hn + 1):
            if (hl == i).sum() < 0.0005 * m2.sum(): m2 |= hl == i
        # 3. lissage de contour (majorité 3×3)
        m2 = ndimage.median_filter(m2.astype(np.uint8), size=3) > 0
        # couleurs des pixels retirés/ajoutés : plus proche voisin intérieur
        idx = ndimage.distance_transform_edt(~(m2 & ~halo), return_distances=False, return_indices=True)
        rgb = a[..., :3][idx[0], idx[1]]; a[..., :3] = np.where(m2[..., None], rgb, a[..., :3]); a[..., 3] = np.where(m2, 255, 0)
        out[n] = a; ch = int(m2.sum()) - a0
        if halo.sum() or islands or ch: log.append(f"{n}: halo {int(halo.sum())} px, îlots retirés {islands}, aire {ch:+d} px")
    return out, log


def rescale(views, st, log, zmax=2.0, clip=0.12):
    zh = dict(zip(views, _mad_z([st[n]["h"] for n in views]))); med = float(np.median([st[n]["h"] for n in views])); out = {}
    for n, a in views.items():
        f = med / st[n]["h"]
        if abs(zh[n]) > zmax and abs(f - 1) > 0.01:
            f = float(np.clip(f, 1 - clip, 1 + clip)); im = Image.fromarray(a); im = im.resize((round(im.width * f), round(im.height * f)), Image.BOX)
            b = np.array(im); b[..., 3] = np.where(b[..., 3] > 127, 255, 0)
            canvas = np.zeros_like(a); h, w = min(b.shape[0], a.shape[0]), min(b.shape[1], a.shape[1]); canvas[:h, :w] = b[:h, :w]
            out[n] = canvas; log.append(f"{n}: hauteur {st[n]['h']} px (z={zh[n]:+.1f}) -> échelle ×{f:.3f}")
        else: out[n] = a
    return out


def outline_normals(m, sigma=1.5):
    g = ndimage.gaussian_filter(m.astype(float), sigma); gy, gx = np.gradient(g); nrm = np.hypot(gx, gy) + 1e-9
    return -gx / nrm, -gy / nrm            # normale sortante (le masque diminue vers l'extérieur)


def normal_agreement(m, pred, near=6):
    """Accord des normales du contour de m avec celles du contour de pred + fraction de contour hors consensus."""
    bm = m & ~ndimage.binary_erosion(m); bp = pred & ~ndimage.binary_erosion(pred)
    if not bm.any() or not bp.any(): return 0.0, 1.0, bm & False
    d, idx = ndimage.distance_transform_edt(~bp, return_indices=True)
    nxm, nym = outline_normals(m); nxp, nyp = outline_normals(pred)
    ys, xs = np.where(bm); iy, ix = idx[0][ys, xs], idx[1][ys, xs]; cos = nxm[ys, xs] * nxp[iy, ix] + nym[ys, xs] * nyp[iy, ix]
    close = d[ys, xs] <= near; bad = np.zeros_like(m); bad[ys[~close], xs[~close]] = True
    return float(cos[close].mean()) if close.any() else 0.0, float((~close).mean()), bad


def consensus_report(views, cam, hull, near=6):
    """Pour chaque vue : volume sculpté avec les autres (vote N-2) reprojeté -> accord des normales, contour hors consensus."""
    from . import hullcam as H
    rep = {}
    for d in views:
        others = [k for k in views if k != d]; occ, pts, _ = H.carve(views, cam, use=others, sy=1, sd=-1, dil=0, vote=max(1, len(others) - 1))
        pred = H.reproject(occ, pts, d, cam, cam["size"], 1, -1); m = views[d][..., 3] > 0
        cos, off, bad = normal_agreement(m, pred, near); rep[d] = {"cos": round(cos, 3), "hors_consensus": round(off, 3), "iou_croise": round(H.iou(pred, m), 3), "_pred": pred, "_bad": bad}
    return rep


def clip_to_consensus(views, rep, tol=4, max_frac=0.03, log=None):
    """Supprime, dans chaque vue, les petits îlots situés hors du volume des autres vues (dilaté de tol px)."""
    out = {}
    for d, a in views.items():
        a = a.copy(); m = a[..., 3] > 0; far = m & ~ndimage.binary_dilation(rep[d]["_pred"], iterations=tol)
        lab, nl = ndimage.label(far); rm = np.zeros_like(m)
        for i in range(1, nl + 1):
            if (lab == i).sum() <= max_frac * m.sum(): rm |= lab == i
        a[..., 3] = np.where(m & ~rm, 255, 0)
        if rm.any() and log is not None: log.append(f"{d}: {int(rm.sum())} px hors consensus supprimés")
        out[d] = a
    return out


def clean(rgba_views, key=(255, 0, 255), verbose=True):
    """Statistiques -> corrections de masque -> échelle. Renvoie (vues, rapport)."""
    log = []; st0 = stats(rgba_views); z, flags, pairs = suspects(st0)
    v, _ = clean_masks(rgba_views, key, log=log); st1 = stats(v); v = rescale(v, st1, log)
    rep = {"stats": st0, "z": z, "suspectes": {n: f for n, f in flags.items() if f}, "paires_opposees": pairs, "actions": log}
    if verbose:
        print("[clean] vues suspectes (|z| > 3) :", rep["suspectes"] or "aucune")
        print("[clean] paires opposées (rapport hauteur, aire) :", pairs)
        for l in log: print("[clean]  -", l)
    return v, rep
