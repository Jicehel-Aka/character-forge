"""Sprites -> objet 3D par sculpture de voxels à partir de 4 vues orthogonales (face, dos, gauche, droite).

Pourquoi : les planches de sprites RPG (ex. LPC) donnent exactement 4 directions. Sculpter l'intersection des 4 silhouettes
donne un volume (« visual hull ») coloré par projection ; c'est calculable ici (numpy), sans GPU ni Blender, et on peut
re-rendre le personnage sous n'importe quel angle (8 directions, 3/4...) puis mesurer la cohérence (IoU des silhouettes).
LIMITES : vues supposées orthographiques et à la même échelle (les sprites LPC sont en 3/4 légèrement plongeant : écart
visible) ; les creux (entre bras et torse, sous le menton) sont comblés ; les faces haut/bas sont colorées par la face
avant. Sortie : OBJ (couleur par sommet), PLY (couleur par face) et rendus. Ce n'est PAS un maillage lisse."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

VIEWS = ("front", "back", "left", "right")


def align_views(views, size=None, anchor_front=True):
    """Même échelle (hauteur médiane), pieds en bas, silhouette centrée : -> dict vue -> RGBA (H, W, 4)."""
    boxes = {}
    for v, im in views.items():
        a = np.asarray(im.convert("RGBA")); ys, xs = np.where(a[..., 3] > 0)
        boxes[v] = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    H0 = float(np.median([b[3] - b[1] for b in boxes.values()]))
    W = size or max(im.width for im in views.values()); Hc = size or max(im.height for im in views.values())
    out = {}
    crops = {}
    for v, im in views.items():
        b = boxes[v]; s = H0 / (b[3] - b[1])
        c = im.convert("RGBA").crop(b)
        crops[v] = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.NEAREST)
    side_w = [crops[v].width for v in ("left", "right") if v in crops]
    t = int(round(float(np.median(side_w)))) if side_w else 0
    for v, crop in crops.items():
        canvas = Image.new("RGBA", (W, Hc), (0, 0, 0, 0))
        if v == "left" and anchor_front:      # bord avant (nez) du profil placé à la même profondeur dans les 2 profils
            x = (W - t) // 2
        elif v == "right" and anchor_front:
            x = W - (W - t) // 2 - crop.width
        else:
            x = (W - crop.width) // 2
        canvas.alpha_composite(crop, (x, Hc - 1 - crop.height))
        out[v] = np.asarray(canvas)
    return out


def _runs(mask):
    """Pour chaque ligne et colonne vraie de `mask` (H, W) : début et fin (exclu) du segment continu qui la contient."""
    H, W = mask.shape; st = np.zeros((H, W)); en = np.zeros((H, W))
    for y in range(H):
        x = 0
        while x < W:
            if mask[y, x]:
                x0 = x
                while x < W and mask[y, x]: x += 1
                st[y, x0:x] = x0; en[y, x0:x] = x
            else:
                x += 1
    return st, en


def carve(views, rounding=0.0, diag=0.0):
    """views : dict de tableaux RGBA alignés (H, W, 4). -> occupation (x, y, z) booléenne.
    rounding : exposant d'une super-ellipse par segment de ligne (2 = ellipse, grand = boîte, 0/None = hull pur).
    L'a priori « section arrondie » évite l'effet de boîte plaquée de textures quand on tourne à 45°."""
    """views : dict de tableaux RGBA alignés (H, W, 4). -> occupation (x, y, z) booléenne."""
    H, W = next(iter(views.values())).shape[:2]
    S = {v: a[..., 3] > 0 for v, a in views.items()}
    x = np.arange(W)[:, None, None]; y = np.arange(H)[None, :, None]; z = np.arange(W)[None, None, :]
    occ = np.ones((W, H, W), bool)
    if "front" in S: occ &= S["front"][y, x]                 # (x,y) -> sur toutes les profondeurs
    if "back" in S: occ &= S["back"][y, W - 1 - x]           # vu de dos : gauche/droite inversées
    if "left" in S: occ &= S["left"][y, z]                   # caméra côté -x : z = colonne (face à gauche)
    if "right" in S: occ &= S["right"][y, W - 1 - z]         # caméra côté +x : face à droite
    if rounding and "front" in S and ("left" in S or "right" in S):
        zm = np.ones((H, W), bool)
        if "left" in S: zm &= S["left"]
        if "right" in S: zm &= S["right"][:, ::-1]
        xs0, xs1 = _runs(S["front"]); zs0, zs1 = _runs(zm)
        X0 = xs0[y, x]; X1 = xs1[y, x]; Z0 = zs0[y, z]; Z1 = zs1[y, z]
        xc, rx = (X0 + X1) / 2, np.maximum((X1 - X0) / 2, 0.5); zc, rz = (Z0 + Z1) / 2, np.maximum((Z1 - Z0) / 2, 0.5)
        occ &= (np.abs((x + 0.5 - xc) / rx) ** rounding + np.abs((z + 0.5 - zc) / rz) ** rounding) <= 1.0
    if diag:
        occ = chamfer(occ, diag)
    return occ


def chamfer(occ, t=1.0):
    """Calcul du 45° : par rangée et par composante connexe (tronc, bras, jambe…), la section est un rectangle (hull de 4 vues
    orthogonales). Sa projection à 45° est donc trop large (coin de boîte -> « double tête »). On recoupe par 2 plans diagonaux :
    demi-largeur diagonale h = (1-t)*(rx+rz)/sqrt2 [boîte] + t*sqrt((rx**2+rz**2)/2)*... [ellipse] ; t=1 -> octogone ellipse."""
    from scipy import ndimage
    W, H, D = occ.shape
    out = occ.copy()
    for y in range(H):
        sl = occ[:, y, :]
        if not sl.any(): continue
        lab, n = ndimage.label(sl)
        for k in range(1, n + 1):
            xs, zs = np.where(lab == k)
            x0, x1, z0, z1 = xs.min(), xs.max() + 1, zs.min(), zs.max() + 1
            rx, rz = (x1 - x0) / 2, (z1 - z0) / 2
            if min(rx, rz) < 1.5: continue                      # trop fin pour être recoupé
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
            hb = (rx + rz) / np.sqrt(2)                          # support d'une boîte dans la direction 45°
            he = np.sqrt((rx * rx + rz * rz) / 2)                # support d'une ellipse
            h = (1 - t) * hb + t * he
            X, Z = np.meshgrid(np.arange(W) + 0.5 - cx, np.arange(D) + 0.5 - cz, indexing="ij")
            keep = (np.abs(X + Z) / np.sqrt(2) <= h) & (np.abs(X - Z) / np.sqrt(2) <= h)
            m = lab == k
            out[:, y, :][m & ~keep] = False
    return out


_N = {"front": (0, 0, -1), "back": (0, 0, 1), "left": (-1, 0, 0), "right": (1, 0, 0), "top": (0, 1, 0), "bottom": (0, -1, 0)}


def radial(occ):
    """Pour chaque voxel : vecteur (dx, dz) depuis le centre de sa composante de rangée (tronc, bras, jambe...)."""
    from scipy import ndimage
    W, H, D = occ.shape
    dxa = np.zeros(occ.shape, np.float32); dza = np.zeros(occ.shape, np.float32)
    for y in range(H):
        sl = occ[:, y, :]
        if not sl.any(): continue
        lab, n = ndimage.label(sl)
        for k in range(1, n + 1):
            xs, zs = np.where(lab == k)
            cx, cz = (xs.min() + xs.max()) / 2, (zs.min() + zs.max()) / 2
            rx, rz = max((xs.max() - xs.min()) / 2, 0.5), max((zs.max() - zs.min()) / 2, 0.5)
            dxa[xs, y, zs] = (xs - cx) / rx; dza[xs, y, zs] = (zs - cz) / rz   # normalisé par les demi-axes -> quadrants à 45° vrais
    return dxa, dza


def faces(occ, views, blend=True, sigma=1.5, power=4, cam=None, cpow=4, vpow=1.5):
    """Faces exposées -> liste de (4 sommets, normale, couleur RGB). y image vers le bas -> y 3D vers le haut."""
    W, H, D = occ.shape; out = []
    pad = np.pad(occ, 1)
    if blend:   # normale de surface lissée (plan horizontal) -> mélange pondéré des 4 projections, au lieu d'une face par vue
        from scipy import ndimage
        gx, gz = radial(occ)
    def col(name, x, y, z):
        a = views.get(name)
        if a is None: a = views["front"]
        if name == "front": p = a[y, x]
        elif name == "back": p = a[y, W - 1 - x]
        elif name == "left": p = a[y, z]
        else: p = a[y, D - 1 - z]
        return p[:3] if p[3] else views["front"][y, x][:3]
    for x, y, z in zip(*np.where(occ)):
        for name, (dx, dy, dz) in _N.items():
            nx, ny, nz = x + dx, y - dy, z + dz                      # dy>0 = haut = y image plus petit
            if pad[nx + 1, ny + 1, nz + 1]:
                continue
            Y = H - 1 - y
            c = col(name if name in VIEWS else "front", x, y, z)
            if blend and name in VIEWS:
                nx_, nz_ = gx[x, y, z], gz[x, y, z]; nrm = math.hypot(nx_, nz_)
                if nrm > 1e-6:
                    nx_, nz_ = nx_ / nrm, nz_ / nrm
                    wts = {"front": max(0.0, -nz_), "back": max(0.0, nz_), "right": max(0.0, nx_), "left": max(0.0, -nx_)}
                    if cam is None:
                        wts = {k: v ** power for k, v in wts.items() if k in views}
                    else:   # texturage dépendant de la caméra : on échantillonne la vue la plus proche de l'angle de rendu,
                        # modulée par la visibilité du voxel dans cette vue -> une seule image du visage, pas deux
                        A = {"front": 0, "right": 90, "back": 180, "left": 270}
                        wts = {k: (max(0.0, math.cos(math.radians(cam - A[k]))) ** cpow) * (v ** vpow + 1e-3) for k, v in wts.items() if k in views}
                    tot = sum(wts.values())
                    if tot > 1e-9:
                        c = sum(np.array(col(k, x, y, z), float) * w for k, w in wts.items()) / tot
            fx, fy, fz = x + (dx > 0), Y + (dy > 0), z + (dz > 0)
            if dx:   v = [(fx, Y, z), (fx, Y + 1, z), (fx, Y + 1, z + 1), (fx, Y, z + 1)]
            elif dy: v = [(x, fy, z), (x + 1, fy, z), (x + 1, fy, z + 1), (x, fy, z + 1)]
            else:    v = [(x, Y, fz), (x + 1, Y, fz), (x + 1, Y + 1, fz), (x, Y + 1, fz)]
            out.append((v, (dx, dy, dz), tuple(int(t) for t in c)))
    return out


def save_obj_ply(F, path_stem):
    vs, cols, quads = {}, [], []
    for v, n, c in F:
        ids = []
        for p in v:
            k = (p, c)
            if k not in vs: vs[k] = len(vs) + 1; cols.append((p, c))
            ids.append(vs[k])
        quads.append(ids)
    with open(f"{path_stem}.obj", "w") as f:
        f.write("# sculpture de voxels, couleur par sommet (v x y z r g b, 0-1)\n")
        for (p, c) in cols:
            f.write(f"v {p[0]} {p[1]} {p[2]} {c[0]/255:.4f} {c[1]/255:.4f} {c[2]/255:.4f}\n")
        for q in quads: f.write("f " + " ".join(map(str, q)) + "\n")
    with open(f"{path_stem}.ply", "w") as f:
        f.write(f"ply\nformat ascii 1.0\nelement vertex {len(cols)}\nproperty float x\nproperty float y\nproperty float z\n"
                f"property uchar red\nproperty uchar green\nproperty uchar blue\nelement face {len(quads)}\n"
                "property list uchar int vertex_indices\nend_header\n")
        for (p, c) in cols: f.write(f"{p[0]} {p[1]} {p[2]} {c[0]} {c[1]} {c[2]}\n")
        for q in quads: f.write("4 " + " ".join(str(i - 1) for i in q) + "\n")
    return len(cols), len(quads)


def render(F, dims, angle_deg, size=(128, 128), pitch_deg=0.0, scale=None, ss=3, foot=0.96):
    """Rendu orthographique par peintre (faces triées par profondeur), fond transparent. Angle 0 = vue de face."""
    W, H, D = dims; cx, cz = W / 2, D / 2
    a = math.radians(angle_deg); p = math.radians(pitch_deg)
    ca, sa, cp, sp = math.cos(a), math.sin(a), math.cos(p), math.sin(p)
    s = (scale or size[1] / (H * 1.08)) * ss
    img = Image.new("RGBA", (size[0] * ss, size[1] * ss), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    items = []
    def tr(q):
        x, y, z = q[0] - cx, q[1], q[2] - cz
        xr = x * ca + z * sa; zr = -x * sa + z * ca                     # rotation autour de Y (z>0 = vers l'arrière)
        yr = y * cp - zr * sp; zr2 = y * sp + zr * cp
        return xr, yr, zr2
    light = np.array([0.3, 0.6, -0.75]); light /= np.linalg.norm(light)
    for v, n, c in F:
        nx, ny, nz = n
        n_r = (nx * ca + nz * sa, ny, -nx * sa + nz * ca)
        if n_r[2] * cp - n_r[1] * sp >= 0.0:                            # dos à la caméra
            continue
        pts = [tr(q) for q in v]; depth = sum(q[2] for q in pts) / 4
        sh = 0.65 + 0.35 * max(0.0, float(np.dot((n_r[0], n_r[1], n_r[2]), light)))
        items.append((depth, [(size[0] * ss / 2 + q[0] * s, size[1] * ss * foot - q[1] * s) for q in pts],
                      tuple(min(255, int(t * sh)) for t in c)))
    for _, poly, c in sorted(items, key=lambda t: -t[0]):
        d.polygon(poly, fill=c + (255,))
    return img.resize(size, Image.NEAREST if False else Image.BOX)


def silhouette_iou(img, ref_alpha):
    a = np.asarray(img.convert("RGBA"))[..., 3] > 40
    if a.shape != ref_alpha.shape:
        a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize(ref_alpha.shape[::-1], Image.NEAREST)) > 0
    inter = (a & ref_alpha).sum(); uni = (a | ref_alpha).sum()
    return float(inter / max(uni, 1))


def load_views(a):
    """Vues depuis : une planche LPC (--sheet, cellules de 64 px, ligne 8-11) ; ou 4 images (--front...) ; ou un dossier
    `refs/` produit par `consolidate build` (fichiers *_front.png, *_back.png, *_left.png, *_right.png)."""
    if a.refs:
        v = {}
        for p in sorted(Path(a.refs).glob("*.png")):
            for k in VIEWS:
                if p.stem.endswith("_" + k): v[k] = Image.open(p)
        return v
    if a.sheet:
        sheets = [Image.open(p).convert("RGBA") for p in a.sheet]
        sh = sheets[0]
        for o in sheets[1:]: sh.alpha_composite(o)                       # calques LPC dans l'ordre donné
        c = a.cell; r0 = a.row0
        rows = {"back": r0, "left": r0 + 1, "front": r0 + 2, "right": r0 + 3}
        return {k: sh.crop((a.col * c, r * c, a.col * c + c, r * c + c)) for k, r in rows.items()}
    return {k: Image.open(getattr(a, k)) for k in VIEWS if getattr(a, k, None)}


def cmd(a):
    out = Path(a.output); out.mkdir(parents=True, exist_ok=True)
    views = load_views(a)
    if len(views) < 2:
        raise SystemExit("il faut au moins 2 vues (idéalement face, dos, gauche, droite)")
    miss = [v for v in VIEWS if v not in views]
    al = align_views(views, a.size)
    occ = carve(al, a.rounding or None, a.diag); F = faces(occ, al)
    nv, nf = save_obj_ply(F, str(out / a.name))
    iou = {}
    ang = {"front": 0, "right": 90, "back": 180, "left": 270}
    for v in al:
        r = render(F, occ.shape, ang[v], size=(a.size, a.size), scale=1.0, ss=4, foot=1.0)
        iou[v] = round(silhouette_iou(r, al[v][..., 3] > 0), 3)
    n = a.angles
    fr = [render(faces(occ, al, cam=360 * i / n), occ.shape, 360 * i / n, size=(a.out_size, a.out_size)) for i in range(n)]   # texturage dépendant de la caméra
    sheet = Image.new("RGBA", (a.out_size * n, a.out_size), (0, 0, 0, 0))
    for i, f in enumerate(fr): sheet.alpha_composite(f, (i * a.out_size, 0))
    sheet.save(out / f"{a.name}_turntable.png")
    print(f"[voxel] {int(occ.sum())} voxels, {nf} faces -> {out}/{a.name}.obj/.ply ; {n} angles -> {a.name}_turntable.png")
    print(f"[voxel] cohérence (IoU silhouette re-rendue / entrée) : {iou}" + (f" ; vues manquantes : {miss}" if miss else ""))
    return 0
