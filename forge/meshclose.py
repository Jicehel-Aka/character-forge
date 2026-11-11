"""Fermeture de maillages 3D issus d'une acquisition par images (enveloppe visuelle, photogrammétrie, IA image -> 3D).

Ces maillages ont presque toujours : sommets en double aux coutures, triangles dégénérés ou en double, petites pièces flottantes
(« facettes non rattachées »), trous (bords ouverts : pieds, dessous, zones jamais vues) et normales incohérentes. Un auto-rig,
une impression ou un calcul de volume exigent une surface unique et fermée.

Chaîne (chaque étape est journalisée dans le rapport, rien n'est modifié en silence) :
  1. soudure des sommets confondus ; suppression des triangles dégénérés / en double ; arêtes partagées par plus de 2 triangles ;
  2. pièces flottantes : composantes connexes dont l'aire est inférieure à `min_area` × aire totale (la plus grande est toujours gardée) ;
  3. orientation cohérente de tous les triangles (propagation par arêtes) ;
  4. trous : chaque boucle de bord est comblée (découpe en « oreilles » dans son plan moyen, repli : éventail depuis le centre) ;
  5. si la surface n'est pas fermée et propre (arête partagée par exactement 2 triangles) : repli volumique — voxelisation, fermeture
     morphologique, remplissage, marching cubes — qui garantit une surface fermée au prix d'un peu de détail ;
  6. normales vers l'extérieur (volume signé positif) ; couleurs par sommet recopiées/interpolées."""
import json, struct
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree


def _tri_area(V, F):
    return 0.5 * np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1)


def stats(V, F):
    """Topologie : arêtes de bord (1 triangle), non-manifold (>2), composantes, fermé ?, caractéristique d'Euler."""
    if len(F) == 0:
        return dict(vertices=len(V), faces=0, boundary_edges=0, nonmanifold_edges=0, components=0, watertight=False, euler=0, boundary_loops=0)
    e = np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1)
    u, c = np.unique(e, axis=0, return_counts=True)
    used = np.unique(F); n = len(V)
    g = coo_matrix((np.ones(len(F) * 2), (np.r_[F[:, 0], F[:, 1]], np.r_[F[:, 1], F[:, 2]])), shape=(n, n))
    nc, lab = connected_components(g, directed=False)
    nc = len(np.unique(lab[used]))
    bnd = int((c == 1).sum()); nm = int((c > 2).sum())
    return dict(vertices=int(len(used)), faces=int(len(F)), boundary_edges=bnd, nonmanifold_edges=nm, components=int(nc),
                watertight=bool(bnd == 0 and nm == 0), euler=int(len(used) - len(u) + len(F)), boundary_loops=len(_loops(F)[0]))


def weld(V, F, C=None, tol=None):
    diag = float(np.linalg.norm(V.max(0) - V.min(0))) or 1.0
    tol = tol or diag * 1e-6
    key = np.round(V / tol).astype(np.int64)
    _, idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel()
    return V[idx], inv[F], (None if C is None else C[idx]), len(V) - len(idx)


def clean_faces(V, F):
    n0 = len(F)
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    diag = float(np.linalg.norm(V.max(0) - V.min(0))) or 1.0
    F = F[_tri_area(V, F) > 1e-12 * diag * diag]
    _, keep = np.unique(np.sort(F, axis=1), axis=0, return_index=True)
    F = F[np.sort(keep)]
    # arêtes partagées par plus de 2 triangles : on garde les 2 plus grands
    for _ in range(4):
        e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); fid = np.tile(np.arange(len(F)), 3)
        k = np.sort(e, axis=1); key = k[:, 0].astype(np.int64) * (len(V) + 1) + k[:, 1]
        u, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
        bad = np.nonzero(cnt > 2)[0]
        if not len(bad): break
        area = _tri_area(V, F); drop = set()
        order = np.argsort(inv, kind="stable"); inv_s = inv[order]; fid_s = fid[order]
        starts = np.searchsorted(inv_s, bad)
        for b, s in zip(bad, starts):
            fs = fid_s[s:s + cnt[b]]; fs = fs[np.argsort(-area[fs])]; drop.update(fs[2:].tolist())
        F = np.delete(F, sorted(drop), axis=0)
    return F, n0 - len(F)


def remove_floating(V, F, min_area=0.01):
    """Supprime les composantes connexes minuscules (aire < min_area × aire totale). Retourne F, nombre de pièces, nombre de triangles."""
    if len(F) == 0: return F, 0, 0
    n = len(V)
    g = coo_matrix((np.ones(len(F) * 2), (np.r_[F[:, 0], F[:, 1]], np.r_[F[:, 1], F[:, 2]])), shape=(n, n))
    _, lab = connected_components(g, directed=False)
    fl = lab[F[:, 0]]; area = _tri_area(V, F)
    comps = np.unique(fl); ca = np.array([area[fl == c].sum() for c in comps]); tot = ca.sum()
    keep = comps[(ca >= min_area * tot) | (ca == ca.max())]
    k = np.isin(fl, keep)
    return F[k], int(len(comps) - len(keep)), int((~k).sum())


def orient(F, n):
    """Orientation cohérente par propagation à travers les arêtes partagées par 2 triangles. Retourne F, triangles retournés."""
    m = len(F)
    if m == 0: return F, 0
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); fid = np.tile(np.arange(m), 3)
    sgn = np.where(e[:, 0] < e[:, 1], 1, -1); k = np.sort(e, axis=1); key = k[:, 0].astype(np.int64) * (n + 1) + k[:, 1]
    order = np.argsort(key, kind="stable"); ks = key[order]
    same = ks[1:] == ks[:-1]
    i0 = order[:-1][same]; i1 = order[1:][same]
    # arête partagée par exactement 2 triangles seulement
    run = np.r_[ks[1:] != ks[:-1], True]; cnt = np.diff(np.r_[0, np.nonzero(run)[0] + 1])
    is2 = np.repeat(cnt == 2, cnt)[:-1][same] if False else None
    # (on recalcule proprement : début de chaque groupe de taille 2)
    starts = np.r_[0, np.nonzero(ks[1:] != ks[:-1])[0] + 1]; sizes = np.diff(np.r_[starts, len(ks)])
    g2 = starts[sizes == 2]
    a = order[g2]; b = order[g2 + 1]
    fa, fb = fid[a], fid[b]; need = (sgn[a] * sgn[b]) > 0   # même sens sur l'arête commune -> l'un des deux est à retourner
    nb = [[] for _ in range(m)]
    for x, y, nf in zip(fa.tolist(), fb.tolist(), need.tolist()): nb[x].append((y, nf)); nb[y].append((x, nf))
    flip = np.full(m, -1, np.int8); out = F.copy()
    for s in range(m):
        if flip[s] >= 0: continue
        flip[s] = 0; st = [s]
        while st:
            c = st.pop()
            for d, nf in nb[c]:
                if flip[d] < 0: flip[d] = flip[c] ^ int(nf); st.append(d)
    out[flip == 1] = out[flip == 1][:, [0, 2, 1]]
    return out, int((flip == 1).sum())


def _loops(F):
    """Boucles de bord (liste de listes de sommets, dans le sens des arêtes de bord existantes)."""
    if len(F) == 0: return [], 0
    d = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]).astype(np.int64)
    n = int(d.max()) + 1
    k = d[:, 0] * n + d[:, 1]; tw = d[:, 1] * n + d[:, 0]
    bd = d[~np.isin(k, tw)]
    nxt = {}
    for a, b in bd.tolist(): nxt.setdefault(a, []).append(b)
    loops = []; broken = 0
    for a0 in list(nxt.keys()):
        while nxt.get(a0):
            loop = [a0]; cur = nxt[a0].pop()
            ok = True
            while cur != a0:
                loop.append(cur)
                o = nxt.get(cur)
                if not o: ok = False; break
                cur = o.pop()
            if ok and len(loop) >= 3: loops.append(loop)
            else: broken += 1
    return loops, broken


def _fill_loop(V, loop):
    """Triangule un trou. Retourne (triangles sur indices de V, point central éventuel)."""
    R = np.array(loop[::-1]); P = V[R]; n = len(R)
    if n == 3: return [(R[0], R[1], R[2])], None
    nrm = np.zeros(3)
    for i in range(n): nrm += np.cross(P[i], P[(i + 1) % n])
    ln = np.linalg.norm(nrm)
    if ln < 1e-20: return None, None
    nrm /= ln; ax = np.array([1., 0, 0]) if abs(nrm[0]) < .9 else np.array([0, 1., 0]); u = np.cross(nrm, ax); u /= np.linalg.norm(u); v = np.cross(nrm, u)
    Q = np.stack([P @ u, P @ v], 1); ids = list(range(n)); tris = []
    def cross(a, b, c): return (Q[b, 0] - Q[a, 0]) * (Q[c, 1] - Q[a, 1]) - (Q[b, 1] - Q[a, 1]) * (Q[c, 0] - Q[a, 0])
    def inside(p, a, b, c):
        d1 = cross(a, b, p); d2 = cross(b, c, p); d3 = cross(c, a, p)
        return d1 >= -1e-12 and d2 >= -1e-12 and d3 >= -1e-12
    def angmin(a, b, c):
        A = [P[a], P[b], P[c]]; s = [np.linalg.norm(A[1] - A[2]), np.linalg.norm(A[0] - A[2]), np.linalg.norm(A[0] - A[1])]
        if min(s) < 1e-15: return -1
        return min(np.arccos(np.clip((s[(i + 1) % 3] ** 2 + s[(i + 2) % 3] ** 2 - s[i] ** 2) / (2 * s[(i + 1) % 3] * s[(i + 2) % 3]), -1, 1)) for i in range(3))
    guard = 0
    while len(ids) > 3 and guard < 4 * n * n:
        guard += 1; best = None; m = len(ids)
        for i in range(m):
            a, b, c = ids[i - 1], ids[i], ids[(i + 1) % m]
            if cross(a, b, c) <= 1e-14: continue
            if any(inside(j, a, b, c) for j in ids if j not in (a, b, c) and not np.allclose(Q[j], Q[a]) and not np.allclose(Q[j], Q[b]) and not np.allclose(Q[j], Q[c])): continue
            q = angmin(a, b, c)
            if best is None or q > best[0]: best = (q, i)
            if m > 400: break
        if best is None: return None, None
        i = best[1]; tris.append((R[ids[i - 1]], R[ids[i]], R[ids[(i + 1) % m]])); ids.pop(i)
    tris.append((R[ids[0]], R[ids[1]], R[ids[2]]))
    return tris, None


def fill_holes(V, F, C=None, max_loop=None):
    """Comble toutes les boucles de bord. Retourne V, F, C, nombre de trous comblés, nombre de trous non traités."""
    loops, broken = _loops(F); filled = 0; skipped = broken
    newF = []; newV = []; newC = []; nv = len(V)
    for loop in loops:
        if max_loop and len(loop) > max_loop: skipped += 1; continue
        tris, _ = _fill_loop(V, loop)
        if tris is None:   # repli : éventail depuis le centre
            ctr = V[loop].mean(0); newV.append(ctr); 
            if C is not None: newC.append(C[loop].mean(0))
            c = nv + len(newV) - 1; R = loop[::-1]
            tris = [(R[i], R[(i + 1) % len(R)], c) for i in range(len(R))]
        newF.extend(tris); filled += 1
    if newV:
        V = np.vstack([V, np.array(newV)]); 
        if C is not None: C = np.vstack([C, np.array(newC)])
    if newF: F = np.vstack([F, np.array(newF, dtype=F.dtype)])
    return V, F, C, filled, skipped


def outward(V, F):
    """Normales vers l'extérieur : volume signé positif, composante par composante."""
    if len(F) == 0: return F, 0
    n = len(V); g = coo_matrix((np.ones(len(F) * 2), (np.r_[F[:, 0], F[:, 1]], np.r_[F[:, 1], F[:, 2]])), shape=(n, n))
    _, lab = connected_components(g, directed=False); fl = lab[F[:, 0]]
    vol = np.einsum("ij,ij->i", V[F[:, 0]], np.cross(V[F[:, 1]], V[F[:, 2]])) / 6.0
    out = F.copy(); fl_n = 0
    for c in np.unique(fl):
        k = fl == c
        if vol[k].sum() < 0: out[k] = out[k][:, [0, 2, 1]]; fl_n += 1
    return out, fl_n


def voxel_close(V, F, C=None, res=160, close=3, smooth=0.8, seed=0):
    """Repli : voxelisation de la surface, fermeture morphologique, remplissage, marching cubes. Garantit une surface fermée."""
    from scipy import ndimage as ndi
    from skimage import measure
    lo = V.min(0); hi = V.max(0); diag = float(np.linalg.norm(hi - lo)); pitch = diag / res; pad = (close + 3) * pitch
    shape = np.ceil((hi - lo + 2 * pad) / pitch).astype(int) + 1; org = lo - pad
    rng = np.random.default_rng(seed); area = _tri_area(V, F); cnt = np.maximum(1, np.ceil(area / (pitch * pitch) * 6)).astype(int)
    tri = np.repeat(np.arange(len(F)), cnt); r1 = rng.random(len(tri)); r2 = rng.random(len(tri)); f = r1 + r2 > 1; r1[f] = 1 - r1[f]; r2[f] = 1 - r2[f]
    P = V[F[tri, 0]] + r1[:, None] * (V[F[tri, 1]] - V[F[tri, 0]]) + r2[:, None] * (V[F[tri, 2]] - V[F[tri, 0]])
    ijk = np.floor((np.vstack([P, V]) - org) / pitch).astype(int)
    vol = np.zeros(shape, bool); vol[ijk[:, 0], ijk[:, 1], ijk[:, 2]] = True
    vol = ndi.binary_dilation(vol, iterations=close); vol = ndi.binary_fill_holes(vol); vol = ndi.binary_erosion(vol, iterations=close)
    lab, nl = ndi.label(vol)
    if nl > 1:
        sz = ndi.sum(vol, lab, range(1, nl + 1)); vol = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s >= 0.02 * sz.max()])
    fv = ndi.gaussian_filter(vol.astype(np.float32), smooth)
    v2, f2, _, _ = measure.marching_cubes(fv, 0.5, spacing=(pitch,) * 3); v2 = v2 + org
    C2 = None
    if C is not None: C2 = C[cKDTree(V).query(v2)[1]]
    return v2, f2.astype(np.int64), C2


def close(V, F, C=None, min_area=0.01, mode="auto", res=160, max_loop=None, log=None):
    """V (n,3), F (m,3), C (n,k) couleurs par sommet facultatives. mode : 'fill' (trous seulement), 'voxel' (repli volumique), 'auto'.
    Retourne V, F, C, rapport (dict)."""
    V = np.asarray(V, float); F = np.asarray(F, np.int64); rep = {"before": stats(V, F), "steps": []}
    def note(s):
        rep["steps"].append(s)
        if log: log("  " + s)
    if mode == "voxel":
        V, F, C = voxel_close(V, F, C, res=res); note(f"fermeture volumique : {len(V)} sommets, {len(F)} triangles")
    else:
        V, F, C, nw = weld(V, F, C)
        if nw: note(f"{nw} sommet(s) confondu(s) soudé(s)")
        F, nd = clean_faces(V, F)
        if nd: note(f"{nd} triangle(s) dégénéré(s), en double ou en excès sur une arête supprimé(s)")
        F, npc, nft = remove_floating(V, F, min_area)
        if npc: note(f"{npc} pièce(s) flottante(s) ({nft} triangles, < {min_area * 100:g} % de l'aire) supprimée(s)")
        F, nflip = orient(F, len(V))
        if nflip: note(f"{nflip} triangle(s) retourné(s) (orientation cohérente)")
        V, F, C, nf, ns = fill_holes(V, F, C, max_loop)
        if nf or ns: note(f"{nf} trou(s) comblé(s)" + (f", {ns} non traité(s)" if ns else ""))
        F, _ = orient(F, len(V))
        s = stats(V, F)
        if mode == "auto" and not s["watertight"]:
            note(f"surface encore ouverte ({s['boundary_edges']} arêtes de bord, {s['nonmanifold_edges']} non-manifold) : repli volumique")
            V, F, C = voxel_close(V, F, C, res=res); note(f"fermeture volumique : {len(V)} sommets, {len(F)} triangles")
    F, nf2 = outward(V, F)
    # sommets inutilisés
    used = np.unique(F); remap = -np.ones(len(V), np.int64); remap[used] = np.arange(len(used)); V = V[used]; F = remap[F]; C = None if C is None else C[used]
    rep["after"] = stats(V, F)
    return V, F, C, rep


def report_text(r):
    b, a = r["before"], r["after"]
    return (f"avant : {b['boundary_edges']} arêtes de bord ({b['boundary_loops']} trou(s)), {b['nonmanifold_edges']} non-manifold, {b['components']} pièce(s) ; "
            f"après : {a['boundary_edges']} arêtes de bord, {a['nonmanifold_edges']} non-manifold, {a['components']} pièce(s), "
            + ("surface FERMÉE" if a["watertight"] else "NON fermée"))


# ---------- lecture / écriture ----------
def read_mesh(path):
    """OBJ (v / f, couleurs « v x y z r g b » possibles) ou GLB (toutes les primitives fusionnées, COLOR_0 si présent). Retourne V, F, C."""
    p = str(path).lower()
    if p.endswith(".obj"):
        V = []; C = []; F = []
        for ln in open(path, errors="ignore"):
            t = ln.split()
            if not t: continue
            if t[0] == "v": V.append([float(x) for x in t[1:4]]); C.append([float(x) for x in t[4:7]] if len(t) >= 7 else None)
            elif t[0] == "f":
                ix = [int(x.split("/")[0]) for x in t[1:]]; ix = [i - 1 if i > 0 else len(V) + i for i in ix]
                for i in range(1, len(ix) - 1): F.append([ix[0], ix[i], ix[i + 1]])
        Cn = np.array(C, float) if C and all(c is not None for c in C) else None
        return np.array(V, float), np.array(F, np.int64), Cn
    if p.endswith(".glb"):
        b = open(path, "rb").read(); L = struct.unpack("<I", b[12:16])[0]; js = json.loads(b[20:20 + L]); off = 20 + L + 8; binb = b[off:]
        CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}; NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
        def acc(i):
            a = js["accessors"][i]; bv = js["bufferViews"][a["bufferView"]]; nc = NC[a["type"]]; dt = np.dtype(CT[a["componentType"]]); st = bv.get("byteStride", 0) or nc * dt.itemsize
            o = bv.get("byteOffset", 0) + a.get("byteOffset", 0); cnt = a["count"]
            raw = np.frombuffer(binb, np.uint8, count=st * (cnt - 1) + nc * dt.itemsize, offset=o)
            arr = np.lib.stride_tricks.as_strided(raw, shape=(cnt, nc * dt.itemsize), strides=(st, 1)).copy().view(dt).reshape(cnt, nc)
            if a.get("normalized"): arr = arr / float(np.iinfo(dt).max)
            return arr
        Vs = []; Fs = []; Cs = []; base = 0
        for me in js["meshes"]:
            for pr in me["primitives"]:
                v = acc(pr["attributes"]["POSITION"]).astype(float); f = acc(pr["indices"]).reshape(-1, 3).astype(np.int64) if "indices" in pr else np.arange(len(v)).reshape(-1, 3)
                Vs.append(v); Fs.append(f + base); base += len(v)
                Cs.append(acc(pr["attributes"]["COLOR_0"]).astype(float)[:, :3] if "COLOR_0" in pr["attributes"] else None)
        C = np.vstack(Cs) if all(c is not None for c in Cs) else None
        return np.vstack(Vs), np.vstack(Fs), C
    raise ValueError("format non géré (OBJ ou GLB)")


def vertex_normals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]); N = np.zeros_like(V)
    for k in range(3): np.add.at(N, F[:, k], fn)
    return (N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-20))


def write_mesh(path, V, F, C=None):
    p = str(path).lower()
    if p.endswith(".obj"):
        with open(path, "w") as f:
            for i, v in enumerate(V): f.write("v %.6f %.6f %.6f" % tuple(v) + ((" %.4f %.4f %.4f" % tuple(C[i][:3])) if C is not None else "") + "\n")
            for t in F: f.write("f %d %d %d\n" % (t[0] + 1, t[1] + 1, t[2] + 1))
        return
    from .hull import write_glb
    Cc = np.ones((len(V), 3), np.float32) if C is None else np.asarray(C, np.float32)[:, :3]
    write_glb(path, V.astype(np.float32), vertex_normals(V, F).astype(np.float32), Cc, F.astype(np.uint32))


def cmd(a):
    V, F, C = read_mesh(a.input)
    V2, F2, C2, r = close(V, F, C, min_area=a.min_area, mode=a.mode, res=a.res, log=print)
    write_mesh(a.output, V2, F2, C2); print(report_text(r)); print("écrit", a.output)
    return 0 if r["after"]["watertight"] else 2
