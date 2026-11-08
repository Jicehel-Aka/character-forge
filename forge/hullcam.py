"""Sculpture d'un volume (visual hull) à partir de vues à caméras connues : azimuts quelconques (8 directions) + inclinaison.

Pensé pour les sorties de SpriteKiln (MIT) : caméra orthographique, pitch fixe, yaw par direction, pivot au sol.
Sert à (1) régler le problème des 45° quand on dispose des 8 directions, (2) mesurer ce que les diagonales apportent
(carver avec les 4 axes, comparer aux silhouettes diagonales réelles = IoU « hors échantillon »).
"""
import json, math
from pathlib import Path
import numpy as np
from PIL import Image

DIRS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"]


def load_spritekiln(png, meta_json=None, anim="idle", frame=0):
    """-> (views {dir: RGBA array}, cam {pitch, upp, pivot, yaw{dir:deg}})."""
    png = Path(png); meta_json = Path(meta_json or png.with_suffix(".json"))
    j = json.load(open(meta_json)); sk = j["spritekiln"]; fs = sk["frame_size"]
    im = Image.open(png).convert("RGBA"); views = {}
    for d in sk["directions"]:
        f = j["frames"][f"{anim}_{d}_{frame}"]["frame"]
        views[d] = np.array(im.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])))
    c = sk["camera"]
    cam = {"pitch": c["pitch_deg"], "upp": c["world_units_per_px"], "pivot": (sk["pivot"]["x"], sk["pivot"]["y"]),
           "yaw": sk["direction_yaw"], "size": fs}
    return views, cam


def project(pts, yaw_deg, cam, sy=1, sd=1):
    """pts (N,3) monde (X, Y haut, Z) -> pixels (u, v). Caméra orthographique : yaw autour de Y, puis inclinaison."""
    a = math.radians(sy * yaw_deg); ca, sa = math.cos(a), math.sin(a)
    X, Y, Z = pts[:, 0], pts[:, 1], pts[:, 2]
    xr = X * ca + Z * sa; zr = -X * sa + Z * ca                   # zr > 0 : éloigné (selon sd)
    p = math.radians(cam["pitch"]); up = cam["upp"]
    k = cam.get("persp", 0.0)                                      # perspective : 1/distance caméra (unités monde) ; 0 = orthographique
    f = 1.0 / (1.0 + k * (sd * zr * math.cos(p) - Y * math.sin(p) + cam.get("persp_z0", 0.0))) if k else 1.0
    u = cam["pivot"][0] + xr / up * f
    v = cam["pivot"][1] - (Y * math.cos(p) + sd * zr * math.sin(p)) / up * f
    return u, v


def grid(cam, n=64, height=3.2):
    up = cam["upp"]; nx = cam.get("n", n); ny = int(cam.get("height", height) / up)
    xs = (np.arange(nx) - nx / 2 + 0.5) * up; ys = (np.arange(ny) + 0.5) * up
    X, Y, Z = np.meshgrid(xs, ys, xs, indexing="ij")
    return np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1), (nx, ny, nx)


def carve(views, cam, use=None, sy=1, sd=1, dil=1, vote=None):
    """Intersection des cônes (cylindres) de silhouettes. use = directions à utiliser.
    vote : nombre minimal de vues qui doivent contenir le voxel (None = toutes ; N-1 ou N-2 tolère des vues incohérentes,
    typique de planches dessinées ou générées par IA). -> (occ, pts, shape)."""
    from scipy import ndimage
    pts, shape = grid(cam); cnt = np.zeros(len(pts), np.int16); names = list(use or views)
    for d in names:
        m = views[d][..., 3] > 0
        if dil: m = ndimage.binary_dilation(m, iterations=dil)
        u, v = project(pts, cam["yaw"][d], cam, sy, sd)
        ui = np.floor(u).astype(int); vi = np.floor(v).astype(int)
        ok = (ui >= 0) & (ui < m.shape[1]) & (vi >= 0) & (vi < m.shape[0])
        hit = np.zeros(len(pts), bool); hit[ok] = m[vi[ok], ui[ok]]
        cnt += hit
    need = len(names) if vote is None else min(vote, len(names))
    return cnt >= need, pts, shape


def reproject(occ, pts, d, cam, size, sy=1, sd=1):
    """Silhouette du volume vu depuis la direction d (rendu en points, comblé)."""
    from scipy import ndimage
    u, v = project(pts[occ], cam["yaw"][d], cam, sy, sd)
    img = np.zeros((size, size), bool)
    ui = np.floor(u).astype(int); vi = np.floor(v).astype(int)
    ok = (ui >= 0) & (ui < size) & (vi >= 0) & (vi < size); img[vi[ok], ui[ok]] = True
    return ndimage.binary_closing(img, iterations=1)


def iou(a, b):
    u = (a | b).sum(); return float((a & b).sum() / u) if u else 1.0


def calibrate(views, cam):
    """Teste les 4 conventions de signe (yaw, profondeur) ; garde celle qui explique le mieux les 8 silhouettes."""
    best = None
    for sy in (1, -1):
        for sd in (1, -1):
            occ, pts, shp = carve(views, cam, sy=sy, sd=sd)
            s = np.mean([iou(reproject(occ, pts, d, cam, cam["size"], sy, sd), views[d][..., 3] > 0) for d in views])
            if best is None or s > best[0]: best = (s, sy, sd)
    return best


def surface(occ, shape):
    from scipy import ndimage
    o = occ.reshape(shape)
    er = ndimage.binary_erosion(o, structure=np.ones((3, 3, 3)), border_value=0)
    return (o & ~er).ravel()


def _zbuf(pts, d, cam, size, sy, sd):
    u, v = project(pts, cam["yaw"][d], cam, sy, sd)
    a = math.radians(sy * cam["yaw"][d]); p = math.radians(cam["pitch"])
    zr = -pts[:, 0] * math.sin(a) + pts[:, 2] * math.cos(a)
    depth = sd * zr * math.cos(p) - pts[:, 1] * math.sin(p)       # petit = proche de la caméra
    return np.floor(u).astype(int), np.floor(v).astype(int), depth


def colorize(pts, surf, views, cam, yaw_target, use, sy=1, sd=-1, tol=0.12, power=3):
    """Couleur de chaque voxel de surface : mélange des vues sources les plus proches de l'angle cible, visibles seulement."""
    size = cam["size"]; idx = np.where(surf)[0]; P = pts[idx]
    cols = np.zeros((len(idx), 3)); wsum = np.zeros(len(idx))
    for d in use:
        dy = (cam["yaw"][d] - yaw_target + 180) % 360 - 180
        wc = max(0.0, math.cos(math.radians(dy))) ** power
        if wc < 1e-3: continue
        ui, vi, dep = _zbuf(P, d, cam, size, sy, sd)
        ok = (ui >= 0) & (ui < size) & (vi >= 0) & (vi < size)
        zb = np.full((size, size), np.inf); np.minimum.at(zb, (vi[ok], ui[ok]), dep[ok])
        vis = ok & (dep <= zb[np.clip(vi, 0, size - 1), np.clip(ui, 0, size - 1)] + tol)
        c = views[d][np.clip(vi, 0, size - 1), np.clip(ui, 0, size - 1), :3].astype(float)
        cols += c * (wc * vis)[:, None]; wsum += wc * vis
    cols = np.where(wsum[:, None] > 0, cols / np.maximum(wsum, 1e-9)[:, None], 128)
    return idx, cols


def render(pts, idx, cols, cam, yaw, sy=1, sd=-1, ss=3):
    size = cam["size"]; P = pts[idx]
    c2 = dict(cam); c2["yaw"] = {"t": yaw}
    ui, vi, dep = _zbuf(P, "t", c2, size, sy, sd)
    img = np.zeros((size * ss, size * ss, 4), np.uint8); zb = np.full((size * ss, size * ss), np.inf)
    u, v = project(P, yaw, cam, sy, sd)
    for k in np.argsort(-dep):
        x0, y0 = int(math.floor((u[k]) * ss)), int(math.floor((v[k]) * ss))
        x1, y1 = x0 + ss, y0 + ss
        if x0 < 0 or y0 < 0 or x1 > size * ss or y1 > size * ss: continue
        img[y0:y1, x0:x1, :3] = cols[k]; img[y0:y1, x0:x1, 3] = 255
    return Image.fromarray(img[ss // 2::ss, ss // 2::ss])
