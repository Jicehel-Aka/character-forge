"""Texture UV cuite depuis les photos (alternative aux couleurs par sommet de `forge hull`).
Pourquoi : les couleurs par sommet sont échantillonnées à ~0,7 pixel de photo (espacement des sommets 1,4 px dans la tête) puis lissées
sur le maillage -> visage, bords de manches/col/ceinture flous. Une texture est échantillonnée à la résolution de la photo (texel < pixel).
Étapes : 1) dépliage xatlas (sommets dupliqués aux coutures) ; 2) chaque texel reçoit la position 3D et la normale du point de surface qu'il recouvre
(échantillonnage dense des triangles dans l'espace UV) ; 3) couleur = même pondération que `colorize` (vue de face ^POW, visibilité par z-buffer
issu des sommets, bord du masque), la couleur par sommet servant de repli aux points vus par aucune vue ; 4) marge (dilatation) contre les coutures."""
import io, math
import numpy as np
from scipy import ndimage as ndi
from PIL import Image


def unwrap(V, F, resolution=2048, padding=3, log=print):
    import xatlas
    a = xatlas.Atlas(); a.add_mesh(V.astype(np.float32), F.astype(np.uint32)); po = xatlas.PackOptions(); po.resolution = int(resolution); po.padding = int(padding); po.bruteForce = False
    a.generate(xatlas.ChartOptions(), po); vm, idx, uv = a[0]
    log(f"  dépliage xatlas : {a.chart_count} îlots, atlas {a.width}x{a.height}, {len(vm)} sommets ({len(V)} avant coutures)")
    return vm.astype(np.int64), idx.astype(np.int64), uv.astype(np.float64), (int(a.width), int(a.height))


def _zbuffers(views, V, sg):
    zbs = []
    for v in views:
        r, c = v.basis(sg); col, row = v.project(V, sg); depth = V @ c
        zb = np.full((v.h, v.w), -1e9); ci = np.round(col).astype(int); ri = np.round(row).astype(int); ok = (ci >= 1) & (ci < v.w - 1) & (ri >= 1) & (ri < v.h - 1)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1): np.maximum.at(zb, (ri[ok] + dy, ci[ok] + dx), depth[ok])
        zbs.append(ndi.maximum_filter(zb, size=7))
    return zbs


def _sample(views, zbs, P, Nrm, sg, pw, lin):
    """Couleur (linéaire) et poids total en des points P (n,3) de normale Nrm : même pondération que hull.colorize."""
    from .hull import srgb2lin
    acc = np.zeros((len(P), 3)); wsum = np.zeros(len(P))
    for v, zb, L in zip(views, zbs, lin):
        r, c = v.basis(sg); col, row = v.project(P, sg); depth = P @ c; ci = np.round(col).astype(int); ri = np.round(row).astype(int)
        ok = (ci >= 1) & (ci < v.w - 1) & (ri >= 1) & (ri < v.h - 1); cc = np.clip(ci, 0, v.w - 1); rc = np.clip(ri, 0, v.h - 1)
        vis = ok & (depth >= zb[rc, cc] - 5.0); w = vis * np.clip(Nrm @ c, 0, 1) ** pw * np.clip(v.dist[rc, cc] / 8.0, 0, 1)
        m = w > 1e-9
        if not m.any(): continue
        samp = np.stack([ndi.map_coordinates(L[k], [row[m], col[m]], order=1, mode="nearest") for k in range(3)], 1)
        acc[m] += samp * w[m, None]; wsum[m] += w[m]
    return acc, wsum


def bake(views, sg, V, F, N, uv, size, C_vertex, pw, chunk=400000, log=print):
    """V,F,N,uv : maillage déplié (sommets dupliqués) ; C_vertex : couleurs par sommet (repli). -> image RGB uint8 (h,w,3) sRGB."""
    from .hull import srgb2lin
    from scipy.spatial import cKDTree
    W, H = size; px = uv * [W, H]; tri = px[F]                       # (nt,3,2) en texels (convention glTF : v croît vers le bas de l'image, aucune retournement)
    e = np.maximum.reduce([np.linalg.norm(tri[:, 0] - tri[:, 1], axis=1), np.linalg.norm(tri[:, 1] - tri[:, 2], axis=1), np.linalg.norm(tri[:, 2] - tri[:, 0], axis=1)])
    kt = np.clip(np.ceil(1.6 * e).astype(int), 1, 48)                 # 1,6 échantillons par texel sur la plus longue arête : pas de trou
    zbs = _zbuffers(views, V, sg); lin = [[srgb2lin(v.rgb[..., k]) for k in range(3)] for v in views]
    acc = np.zeros((H * W, 3)); wacc = np.zeros(H * W); fb = np.zeros((H * W, 3)); fbn = np.zeros(H * W)
    kd = cKDTree(V)
    for k in np.unique(kt):
        ids = np.nonzero(kt == k)[0]
        a, b = np.meshgrid(np.arange(k + 1), np.arange(k + 1)); m = a + b <= k; a, b = a[m], b[m]; bw = np.stack([(k - a - b), a, b], 1) / float(k)   # barycentres
        bw = (bw * (k / (k + 1.0)) + 1.0 / (3 * (k + 1.0)))
        for s in range(0, len(ids), max(1, chunk // len(bw))):
            t = ids[s:s + max(1, chunk // len(bw))]; f = F[t]
            P = np.einsum('sb,tbc->tsc', bw, V[f]).reshape(-1, 3); Nn = np.einsum('sb,tbc->tsc', bw, N[f]).reshape(-1, 3); Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-12
            T = np.einsum('sb,tbc->tsc', bw, tri[t]).reshape(-1, 2); ti = np.clip(np.floor(T[:, 1]).astype(int), 0, H - 1) * W + np.clip(np.floor(T[:, 0]).astype(int), 0, W - 1)
            ac, ws = _sample(views, zbs, P, Nn, sg, pw, lin)
            lo = ws < 1e-3   # vus seulement très de biais : pondération douce (facing^1.5), poids faible pour ne pas écraser les échantillons de face
            if lo.any():
                a2, w2 = _sample(views, zbs, P[lo], Nn[lo], sg, 1.5, lin); good = w2 > 1e-9; col2 = np.zeros_like(a2); col2[good] = a2[good] / w2[good, None]
                ac[lo] = col2 * 1e-2 * good[:, None]; ws[lo] = 1e-2 * good
            np.add.at(acc, ti, ac); np.add.at(wacc, ti, ws)
            _, nn = kd.query(P); np.add.at(fb, ti, C_vertex[nn]); np.add.at(fbn, ti, 1)
    covered = fbn > 0
    out = np.zeros((H * W, 3)); seen = wacc > 1e-3
    out[seen] = acc[seen] / wacc[seen, None]
    fill = covered & ~seen; out[fill] = fb[fill] / fbn[fill, None]
    log(f"  texture {W}x{H} : {covered.sum()} texels recouverts, {seen.sum()} vus par au moins une photo, {fill.sum()} remplis par la couleur des sommets")
    img = out.reshape(H, W, 3); cov = covered.reshape(H, W)
    # marge : on étend les couleurs vers les texels vides (coutures, filtrage bilinéaire / mipmaps)
    for _ in range(6):
        d = ndi.maximum_filter(cov.astype(np.uint8), size=3).astype(bool) & ~cov
        if not d.any(): break
        num = np.stack([ndi.uniform_filter(img[..., k] * cov, 3) for k in range(3)], -1); den = ndi.uniform_filter(cov.astype(float), 3)[..., None]
        img = np.where(d[..., None], num / np.maximum(den, 1e-9), img); cov = cov | d
    img = np.where(cov[..., None], img, img[cov].mean(0))
    s = np.clip(img, 0, 1); s = np.where(s <= 0.0031308, 12.92 * s, 1.055 * np.power(s, 1 / 2.4) - 0.055)
    return (s * 255 + 0.5).astype(np.uint8)


def png_bytes(img):
    b = io.BytesIO(); Image.fromarray(img).save(b, "PNG", optimize=False); return b.getvalue()
