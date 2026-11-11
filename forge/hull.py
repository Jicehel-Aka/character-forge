"""Reconstruction 3D à partir de vues tournantes (visual hull + couleurs projetées) -> GLB texturé (couleurs par sommet).

Principe : N vues d'un personnage sur fond uni, prises à intervalles réguliers autour de l'axe vertical (0°, 45°, 90°, …).
1. segmentation du fond ; 2. calage fin de chaque vue (décalage x / y) en maximisant le volume de l'enveloppe ;
3. sculpture d'une grille voxel par les silhouettes ; 4. surface (marching cubes, lissée) ; 5. couleur de chaque sommet
projetée depuis les vues qui le voient de face ; 6. export GLB.
Limites : une enveloppe visuelle ne voit pas les concavités (entre les jambes vues de profil, aisselles) -> formes un peu enveloppantes."""
import json, struct, math
from pathlib import Path
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

def segment(path, thr=16):
    """Fond = dégradé lisse (vignette) : ajusté par un polynôme 2D sur les pixels sûrement hors personnage, puis seuil sur l'écart."""
    im = Image.open(path).convert("RGB"); a = np.asarray(im).astype(np.float32); h, w, _ = a.shape
    yy, xx = np.mgrid[0:h, 0:w]; u = (xx - w / 2) / (w / 2); v = (yy - h / 2) / (h / 2)
    basis = np.stack([np.ones_like(u), u, v, u * u, v * v, u * v, u ** 2 * v ** 2], -1).reshape(-1, 7)
    lum = a.mean(-1); sat = a.max(-1) - a.min(-1)
    # amorce : le fond est supposé visible sur le pourtour de l'image (un personnage sombre sur fond sombre, ex. cheveux noirs, ne doit pas servir
    # d'échantillon de fond) ; on ajuste d'abord sur ce cadre, puis on affine en excluant ce qui s'écarte du modèle
    ring = np.ones((h, w), bool); mg = max(4, int(0.07 * min(h, w))); ring[mg:h - mg, mg:w - mg] = False
    fg = ~ring
    if os.environ.get("FORGE_HULL_OLDSEG"): fg = ndi.binary_dilation((lum > 62) | (sat > 40), iterations=6)
    for _ in range(4):
        sel = (~fg).ravel(); sub = np.nonzero(sel)[0][:: max(1, sel.sum() // 40000)]
        coef = np.stack([np.linalg.lstsq(basis[sub], a[..., k].ravel()[sub], rcond=None)[0] for k in range(3)], 1)
        bg = (basis @ coef).reshape(h, w, 3); d = np.abs(a - bg).max(-1)
        fg = ndi.binary_dilation(d > thr, iterations=3)
    m = d > thr
    # fond lisse : une zone texturée (mèches, reflets) est du personnage même si sa couleur moyenne est proche du fond (cheveux noirs sur fond sombre)
    lum = a.mean(-1); mu = ndi.uniform_filter(lum, 5); tex = np.sqrt(np.maximum(ndi.uniform_filter(lum * lum, 5) - mu * mu, 0))
    t = ndi.binary_dilation(tex > 3.0, iterations=2) & (d > 5)
    m = m | ndi.binary_closing(t, iterations=3)
    m = ndi.binary_opening(m, iterations=1); m = ndi.binary_closing(m, iterations=2); m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    if n > 1:
        sizes = ndi.sum(m, lab, range(1, n + 1)); m = lab == (1 + int(np.argmax(sizes)))
    return a, m

def srgb2lin(c): c = c / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

class View:
    def __init__(s, path, theta):
        s.rgb, s.mask = segment(path); s.theta = theta; s.h, s.w = s.mask.shape
        ys, xs = np.nonzero(s.mask); s.cx0 = xs.mean(); s.bot = ys.max(); s.top = ys.min()
        s.dx = 0.0; s.dy = 0.0; s.phi = 0.0; s.sc = 1.0; s.dth = 0.0; s.dist = ndi.distance_transform_edt(s.mask)
    def basis(s, sign):
        t = math.radians(s.theta + s.dth); c = np.array([sign * math.sin(t), 0, math.cos(t)]); r = np.array([math.cos(t), 0, -sign * math.sin(t)]); return r, c
    def project(s, P, sign):  # P (n,3) en unités px, y vers le haut, y=0 aux pieds -> (col,row)
        r, c = s.basis(sign); ph = math.radians(s.phi); col = (P @ r) * s.sc + s.cx0 + s.dx
        row = (s.bot + s.dy) - s.sc * (P[:, 1] * math.cos(ph) - (P @ c) * math.sin(ph)); return col, row

def grid(extent_xz, height, vox):
    xs = np.arange(-extent_xz, extent_xz + vox, vox); ys = np.arange(0, height + vox, vox)
    X, Y, Z = np.meshgrid(xs, ys, xs, indexing="ij"); return xs, ys, np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)

import os
TOL = int(os.environ.get('FORGE_HULL_TOL', '0'))  # nb de vues qui peuvent contredire un voxel (tolérance aux erreurs de calage/perspective)

ARMTOL = int(os.environ.get('FORGE_HULL_ARMTOL', '3'))  # tolérance plus forte dans la bande des bras en T (bouts de bras coupés par la perspective)
ZONE = None  # (y0, y1, |x| min) en unités px, posé par build()

def carve(views, P, sign, tol=0):
    miss = np.zeros(len(P), np.int8); miss_ax = np.zeros(len(P), np.int8)
    for v in views:
        col, row = v.project(P, sign); ci = np.round(col).astype(int); ri = np.round(row).astype(int)
        ok = (ci >= 0) & (ci < v.w) & (ri >= 0) & (ri < v.h); occ = np.zeros(len(P), bool); occ[ok] = getattr(v, 'cmask', v.mask)[ri[ok], ci[ok]]; miss += ~occ
        if abs(((v.theta + 45) % 90) - 45) < 1: miss_ax += ~occ   # vues de face/profil/dos : fiables pour l'épaisseur et la longueur des bras
    if ZONE is not None and ARMTOL > tol:
        z = (P[:, 1] >= ZONE[0]) & (P[:, 1] <= ZONE[1]) & (np.abs(P[:, 0]) >= ZONE[2]); return np.where(z, (miss_ax <= 0) & (miss <= ARMTOL) & (np.abs(P[:, 2]) <= 0.5 * 1.15 * ZONE[3][np.clip(np.round(ZONE[4] + P[:, 0]).astype(int), 0, len(ZONE[3]) - 1)] + 2), miss <= tol)
    return miss <= tol

def calibrate(views, sign, extent, height, vox=5, rounds=3, rng=16, scale=True, yaw=False):
    xs, ys, P = grid(extent, height, vox)
    for r in range(rounds):
        for v in (views[1:] if r == 0 else views):
            others = [u for u in views if u is not v]; sub = P[carve(others, P, sign)]  # voxels admis par les autres vues
            best = None; ox, oy, op = v.dx, v.dy, v.phi
            for ph in (0,):
                for dx in range(-rng, rng + 1, 2):
                    for dy in range(-rng // 2, rng // 2 + 1, 2):
                        v.dx, v.dy, v.phi = ox + dx, oy + dy, op + ph; col, row = v.project(sub, sign)
                        ci = np.round(col).astype(int); ri = np.round(row).astype(int); ok = (ci >= 0) & (ci < v.w) & (ri >= 0) & (ri < v.h); n = int(v.mask[ri[ok], ci[ok]].sum())
                        if best is None or n > best[0]: best = (n, dx, dy, ph)
            v.dx, v.dy, v.phi = ox + best[1], oy + best[2], op + best[3]
        rng = max(4, rng // 2)
    if yaw:   # le pas de rotation n'est jamais exactement 45° : on cherche un petit écart de lacet par vue (IoU silhouette)
        for r in range(2):
            for v in views:
                others = [u for u in views if u is not v]; sub = P[carve(others, P, sign)]
                if len(sub) < 50: continue
                best = None; o = (v.dth, v.dx)
                for dth in (o[0] + k for k in (-6, -4, -2, 0, 2, 4, 6)):
                    for dx in (-6, -3, 0, 3, 6):
                        v.dth, v.dx = dth, o[1] + dx; col, row = v.project(sub, sign)
                        ci = np.round(col).astype(int); ri = np.round(row).astype(int); ok = (ci >= 0) & (ci < v.w) & (ri >= 0) & (ri < v.h)
                        im = np.zeros((v.h, v.w), bool); im[ri[ok], ci[ok]] = True; im = ndi.binary_closing(im, iterations=2)
                        iou = (im & v.mask).sum() / max(1, (im | v.mask).sum())
                        if best is None or iou > best[0]: best = (iou, dth, o[1] + dx)
                v.dth, v.dx = best[1], best[2]
    if scale:   # perspective / cadrage : échelle propre à chaque vue, jugée par l'IoU silhouette projetée / masque
        for r in range(2):
            for v in views:
                others = [u for u in views if u is not v]; sub = P[carve(others, P, sign)]
                if len(sub) < 50: continue
                best = None; o_sc, o_dx, o_dy = v.sc, v.dx, v.dy
                for sc in (o_sc * k for k in (0.95, 0.975, 1.0, 1.025, 1.05)):
                    for dx in (-3, 0, 3):
                        for dy in (-4, 0, 4):
                            v.sc, v.dx, v.dy = sc, o_dx + dx, o_dy + dy; col, row = v.project(sub, sign)
                            ci = np.round(col).astype(int); ri = np.round(row).astype(int); ok = (ci >= 0) & (ci < v.w) & (ri >= 0) & (ri < v.h)
                            im = np.zeros((v.h, v.w), bool); im[ri[ok], ci[ok]] = True; im = ndi.binary_closing(im, iterations=2)
                            iou = (im & v.mask).sum() / max(1, (im | v.mask).sum())
                            if best is None or iou > best[0]: best = (iou, sc, o_dx + dx, o_dy + dy)
                v.sc, v.dx, v.dy = best[1], best[2], best[3]
    return int(carve(views, P, sign).sum())

def taubin(verts, faces, iters=12, lam=0.5, mu=-0.53):
    """Lissage de maillage sans rétrécissement (Taubin) : supprime les marches d'escalier des voxels."""
    from scipy import sparse
    n = len(verts); e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]])
    A = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr(); A.data[:] = 1; deg = np.maximum(np.asarray(A.sum(1)).ravel()[:, None], 1)
    for _ in range(iters):
        for f in (lam, mu): verts = verts + f * ((A @ verts) / deg - verts)
    return verts

def surface(views, sg, extent, height, vox, smooth, iters=30):
    from skimage import measure
    xs, ys, P = grid(extent, height, vox); inside = carve(views, P, sg, tol=TOL).reshape(len(xs), len(ys), len(xs)).astype(np.float32)
    vol = ndi.gaussian_filter(np.pad(inside, 2), smooth)
    verts, faces, normals, _ = measure.marching_cubes(vol, 0.5, spacing=(vox, vox, vox))
    verts = verts - 2 * vox + np.array([xs[0], ys[0], xs[0]]); faces = faces[:, ::-1]
    verts = taubin(verts, faces, iters)
    tri = verts[faces]; fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); nv = np.zeros_like(verts)   # normales recalculées depuis les faces (aire pondérée)
    for k in range(3): np.add.at(nv, faces[:, k], fn)
    nv /= np.linalg.norm(nv, axis=1, keepdims=True) + 1e-12
    if (nv * (verts - verts.mean(0))).sum(1).mean() < 0: nv, faces = -nv, faces[:, ::-1]
    return verts, faces, nv

def smooth_normals(verts, faces, nv, iters=6):
    from scipy import sparse
    n = len(verts); e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]])
    A = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr(); A.data[:] = 1
    for _ in range(iters): nv = nv + A @ nv; nv /= np.linalg.norm(nv, axis=1, keepdims=True) + 1e-12
    return nv

POW = float(os.environ.get('FORGE_HULL_POW', '24'))

def colorize(views, verts, normals, sg):
    """Couleur par sommet = moyenne (linéaire) des vues qui le voient de face. Renvoie aussi un score d'incohérence (variance pondérée)."""
    acc = np.zeros((len(verts), 3)); acc2 = np.zeros((len(verts), 3)); wsum = np.zeros(len(verts)) + 1e-9
    for v in views:
        r, c = v.basis(sg); col, row = v.project(verts, sg); depth = verts @ c
        zb = np.full((v.h, v.w), -1e9); ci = np.round(col).astype(int); ri = np.round(row).astype(int); ok = (ci >= 1) & (ci < v.w - 1) & (ri >= 1) & (ri < v.h - 1)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1): np.maximum.at(zb, (ri[ok] + dy, ci[ok] + dx), depth[ok])
        zb = ndi.maximum_filter(zb, size=7); cc = np.clip(ci, 0, v.w - 1); rc = np.clip(ri, 0, v.h - 1)
        vis = ok & (depth >= zb[rc, cc] - 5.0); facing = np.clip(normals @ c, 0, 1) ** POW; edge = np.clip(v.dist[rc, cc] / 8.0, 0, 1)
        w = vis * facing * edge
        samp = np.stack([ndi.map_coordinates(srgb2lin(v.rgb[..., k]), [row, col], order=1, mode="nearest") for k in range(3)], 1)
        acc += samp * w[:, None]; acc2 += samp ** 2 * w[:, None]; wsum += w
    mean = acc / wsum[:, None]; var = (acc2 / wsum[:, None] - mean ** 2).clip(0).sum(1); seen = wsum > 1e-3
    score = float((var * (wsum > 0.3)).sum() / max(1, (wsum > 0.3).sum()))
    if (~seen).any():
        from scipy.spatial import cKDTree
        t = cKDTree(verts[seen]); _, ix = t.query(verts[~seen]); mean[~seen] = mean[seen][ix]
    return mean, score

def smooth_colors(colr, faces, iters=3, a=0.5):
    """Lissage des couleurs le long des arêtes : masque les stries dues aux changements de vue."""
    from scipy import sparse
    n = len(colr); e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]])
    A = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr(); A.data[:] = 1; deg = np.asarray(A.sum(1)).ravel()[:, None]
    for _ in range(iters): colr = (1 - a) * colr + a * (A @ colr) / np.maximum(deg, 1)
    return colr

def refine_photo(views, verts, normals, sg, rounds=3, n=6000, log=print):
    rs = np.random.default_rng(1); ix = rs.choice(len(verts), min(n, len(verts)), replace=False); Vs, Ns = verts[ix], normals[ix]
    score = lambda: colorize(views, Vs, Ns, sg)[1]
    cur = score(); log(f"  cohérence photo initiale {cur:.5f}")
    steps = [("dx", (-3, -1.5, 1.5, 3)), ("dy", (-3, -1.5, 1.5, 3)), ("sc", (-0.03, -0.015, 0.015, 0.03))]
    for r in range(rounds):
        for v in views:
            for k, ds in steps:
                base = getattr(v, k); best = (cur, 0)
                for d in ds:
                    setattr(v, k, base + d); sc_ = score()
                    if sc_ < best[0]: best = (sc_, d)
                setattr(v, k, base + best[1]); cur = best[0]
        log(f"  tour {r + 1} : {cur:.5f}")
    return cur

def build(paths, thetas=None, out="modele.glb", vox=2.5, height_m=1.75, sign=None, smooth=1.6, grow=2, photo=True, smooth_col=3, uv=0, close=True, log=print):
    thetas = thetas or [45 * i for i in range(len(paths))]
    views = [View(p, t) for p, t in zip(paths, thetas)]
    height = max(v.bot - v.top for v in views) * 1.05; extent = max(v.w for v in views) * 0.62
    global ZONE; ZONE = None
    try:   # bande des bras : rangées où la silhouette de face est la plus large (pose en T)
        v0 = views[0]; ws = np.array([ (np.ptp(np.nonzero(r)[0]) if r.any() else 0) for r in v0.mask ]); rows = np.nonzero(ws > 0.9 * ws.max())[0]
        if ws.max() > 0.75 * (v0.bot - v0.top):
            rc_row = float(np.median(rows)); rc = v0.bot - rc_row; band = (int(max(0, rc_row - 0.09 * height)), int(min(v0.h, rc_row + 0.09 * height)))
            th = np.array([ (np.ptp(np.nonzero(v0.mask[band[0]:band[1], cc])[0]) if v0.mask[band[0]:band[1], cc].any() else 0) for cc in range(v0.w) ], float)
            th = ndi.uniform_filter1d(th, 9)   # épaisseur verticale du bras en chaque colonne : le bras est ~rond, donc même profondeur
            ZONE = (rc - 0.045 * height, rc + 0.045 * height, 0.22 * ws.max(), th, v0.cx0)
    except Exception: ZONE = None
    best = None
    for sg in ([sign] if sign else [1, -1]):
        for v in views: v.dx = 0.0; v.dy = 0.0; v.sc = 1.0; v.dth = 0.0; v.cmask = v.mask
        n = calibrate(views, sg, extent, height); calibrate(views, sg, extent, height, vox=3, rounds=1, rng=4, scale=False, yaw=False)
        for v in views: sm = ndi.gaussian_filter(v.mask.astype(np.float32), 2.0) > 0.5; v.cmask = ndi.binary_dilation(sm, iterations=grow) if grow else sm
        V, F, N = surface(views, sg, extent, height, vox, smooth); C, score = colorize(views, V, smooth_normals(V, F, N), sg)
        if photo:
            sv = [(v.dx, v.dy, v.sc) for v in views]; refine_photo(views, V, N, sg, log=log); V2, F2, N2 = surface(views, sg, extent, height, vox, smooth); C2, score2 = colorize(views, V2, smooth_normals(V2, F2, N2), sg)
            log(f"  avant/après affinage photo : {score:.5f} / {score2:.5f}")
            if score2 < score: V, F, N, C, score = V2, F2, N2, C2, score2
            else:
                for v, (dx, dy, sc) in zip(views, sv): v.dx, v.dy, v.sc = dx, dy, sc
        log(f"sens {sg:+d} : volume {n}, incohérence des couleurs {score:.5f}")
        if best is None or score < best[0]: best = (score, sg, V, F, N, C, [(v.dx, v.dy, v.dth, v.sc) for v in views])
    score, sg, verts, faces, normals, colr, offs = best; colr = smooth_colors(colr, faces, iters=smooth_col); log(f"sens retenu {sg:+d} ; {len(verts)} sommets, {len(faces)} triangles")
    if os.environ.get("FORGE_HULL_DUMP"):   # mise au point des couleurs : géométrie (px), faces, vues calées
        np.savez(os.environ["FORGE_HULL_DUMP"], verts=verts, faces=faces, normals=normals, sign=sg, offs=np.array(offs), thetas=np.array(thetas), paths=np.array([str(p) for p in paths]))
    if close:   # surface unique et fermée, sans trou ni triangle flottant (voir meshclose.py) ; rien à faire si déjà fermée
        from . import meshclose
        st = meshclose.stats(verts, faces)
        if not (st["watertight"] and st["components"] == 1):
            log("fermeture du maillage :"); verts, faces, colr, rep = meshclose.close(verts, faces, colr, log=log); normals = meshclose.vertex_normals(verts, faces); log("  " + meshclose.report_text(rep))
    mn = verts.min(0); mx = verts.max(0); k = height_m / (mx[1] - mn[1]); V = (verts - [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]) * k
    Ns = smooth_normals(verts, faces, normals, 3)
    if uv:   # texture UV cuite depuis les photos (voir hulluv.py) : sommets dupliqués aux coutures, plus de COLOR_0
        from . import hulluv
        for v, (dx, dy, dth, sc) in zip(views, offs): v.dx, v.dy, v.dth, v.sc = dx, dy, dth, sc   # état de calage du meilleur sens
        vm, idx, uvc, size = hulluv.unwrap(verts, faces, resolution=uv, log=log)
        img = hulluv.bake(views, sg, verts[vm], idx, Ns[vm], uvc, size, colr[vm], POW, log=log)
        write_glb(out, V[vm].astype(np.float32), Ns[vm].astype(np.float32), None, idx.astype(np.uint32), uv=uvc.astype(np.float32), png=hulluv.png_bytes(img)); log("écrit " + str(out) + f" (texture {size[0]}x{size[1]})")
        return dict(vertices=len(vm), triangles=len(idx), sign=sg, score=score, offsets=offs, texture=list(size))
    write_glb(out, V.astype(np.float32), Ns.astype(np.float32), colr.astype(np.float32), faces.astype(np.uint32)); log("écrit " + str(out))
    return dict(vertices=len(V), triangles=len(faces), sign=sg, score=score, offsets=offs)

def write_glb(path, V, N, C, F, uv=None, png=None):
    """GLB : couleurs par sommet (COLOR_0) ou, si uv+png fournis, texture de couleur de base (PNG embarqué)."""
    def pad(b, ch=b"\x00"): return b + ch * (-len(b) % 4)
    textured = uv is not None and png is not None
    parts = [pad(F.tobytes()), pad(V.tobytes()), pad(N.tobytes()), pad((uv if textured else C).astype(np.float32).tobytes())]
    if textured: parts.append(pad(png))
    offs = np.cumsum([0] + [len(p) for p in parts]); binb = b"".join(parts)
    attrs = {"POSITION": 1, "NORMAL": 2, ("TEXCOORD_0" if textured else "COLOR_0"): 3}
    mat = {"name": "couleurs", "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.85}, "doubleSided": True}
    if textured: mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}
    bvs = [{"buffer": 0, "byteOffset": int(offs[0]), "byteLength": int(F.nbytes), "target": 34963}] + [{"buffer": 0, "byteOffset": int(offs[i]), "byteLength": int(len(parts[i])), "target": 34962} for i in (1, 2, 3)]
    js = {"asset": {"version": "2.0", "generator": "character-forge hull"}, "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": "personnage"}],
          "meshes": [{"primitives": [{"attributes": attrs, "indices": 0, "material": 0}]}], "materials": [mat],
          "buffers": [{"byteLength": len(binb)}], "bufferViews": bvs,
          "accessors": [{"bufferView": 0, "componentType": 5125, "count": int(F.size), "type": "SCALAR"},
                        {"bufferView": 1, "componentType": 5126, "count": len(V), "type": "VEC3", "min": V.min(0).tolist(), "max": V.max(0).tolist()},
                        {"bufferView": 2, "componentType": 5126, "count": len(V), "type": "VEC3"},
                        {"bufferView": 3, "componentType": 5126, "count": len(V), "type": "VEC2" if textured else "VEC3"}]}
    if textured:
        bvs.append({"buffer": 0, "byteOffset": int(offs[4]), "byteLength": len(png)})
        js["images"] = [{"bufferView": 4, "mimeType": "image/png"}]; js["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]; js["textures"] = [{"source": 0, "sampler": 0}]
    j = pad(json.dumps(js).encode(), b" ")
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(j) + 8 + len(binb))); f.write(struct.pack("<I4s", len(j), b"JSON")); f.write(j); f.write(struct.pack("<I4s", len(binb), b"BIN\x00")); f.write(binb)

def cmd(a):
    paths = [str(p) for p in a.images]; th = [float(t) for t in a.angles.split(",")] if a.angles else None
    r = build(paths, th, out=a.output, vox=a.vox, height_m=a.height, sign=a.sign, photo=not a.no_photo, smooth_col=a.smooth_colors, uv=getattr(a, 'uv', 0), close=not getattr(a, 'no_close', False))
    print(json.dumps(r, indent=1)); return 0
