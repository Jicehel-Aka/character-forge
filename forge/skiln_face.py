"""Visage : un portrait net (hors planche, ex. illustration de la fiche) est projeté sur la pièce « head » du modèle.
1. repères du visage dans le portrait (yeux, nez, bouche, menton, oreille) <-> repères du modèle en coordonnées locales de la tête ;
2. caméra orthographique du portrait (lacet, inclinaison, échelle, décalage) par moindres carrés (deux hypothèses de côté, la meilleure gagne) ;
3. rendu du modèle dans cette caméra (fenêtre sur le visage), échantillonnage du portrait pixel par pixel dans le repère local de la tête, cellules fines.
Les yeux, sourcils, bouche et cicatrice sont donc peints (plus de pièces SDF « yeux » qui dépassent)."""
import json
from pathlib import Path
import numpy as np
import yaml
from PIL import Image

FACE_GROUPS = ("head", "nose", "ear_L", "ear_R")
# repères du modèle (repère local de la tête, avant échelle) ; x > 0 = côté « σ » (le côté proche de la caméra dans le portrait)
MODEL = {"eye_near": (0.078, 0.115, 0.09), "eye_far": (-0.078, 0.115, 0.09), "nose": (0.0, 0.092, 0.132), "mouth": (0.0, 0.035, 0.10),
         "chin": (0.0, 0.005, 0.088), "ear": (0.13, 0.10, -0.03)}


def head_frame(spec_path, size=256):
    from spritekiln import pipeline
    from spritekiln.anim import frames_of
    spec = pipeline.get_spec(str(spec_path), size); env, _m, _e = frames_of(spec, "idle", 0.0)[0]
    _b, groups, _f, cam = pipeline.render_buffers(spec, dict(env, yaw=0.0, dir="s"), 0.0)
    g = next(g for g in groups if g.name == "head"); o, R, s = g.frame; return np.asarray(o, float), np.asarray(R, float), np.asarray(s, float)


def _project(P_model, yaw, pitch, scale, tx, ty):
    c, s = np.cos(-yaw), np.sin(-yaw); Rwl = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    W = P_model @ Rwl                                              # monde = Rlw @ modèle
    p = pitch; R = np.array([1.0, 0, 0]); U = np.array([0.0, np.cos(p), -np.sin(p)])
    return np.stack([tx + (W @ R) / scale, ty - (W @ U) / scale], -1)


def fit(points, spec_path, size=256):
    """points : {eye_near, eye_far, nose, mouth, chin, ear} -> pixels du portrait. -> dict(yaw, pitch, scale, tx, ty, err, flip)"""
    from scipy.optimize import least_squares
    o, R, s = head_frame(spec_path, size); names = [k for k in MODEL if k in points]
    pix = np.array([points[k] for k in names], float); best = None
    for flip in (1, -1):
        loc = np.array([[flip * MODEL[k][0] if k in ("eye_near", "eye_far", "ear") else MODEL[k][0], MODEL[k][1], MODEL[k][2]] for k in names])
        Pm = o + (loc * s) @ R.T
        for y0 in np.radians((-80, -60, -40, -20, 20, 40, 60, 80)):
            f = lambda x: (_project(Pm, x[0], x[1], x[2], x[3], x[4]) - pix).ravel()
            r = least_squares(f, [y0, 0.05, 0.0012, pix[:, 0].mean(), pix[:, 1].mean() + Pm[:, 1].mean() / 0.0012],
                              bounds=([-1.6, -0.4, 2e-4, -3000, -4000], [1.6, 0.6, 1e-2, 3000, 4000]))
            e = float(np.sqrt((r.fun ** 2).mean()))
            if best is None or e < best["err"]: best = {"yaw": float(r.x[0]), "pitch": float(r.x[1]), "scale": float(r.x[2]), "tx": float(r.x[3]), "ty": float(r.x[4]), "err": e, "flip": flip}
    return best


def face_spec(spec_path, par, out_path, window, S=256):
    """Variante du spec dont la caméra regarde le visage comme le portrait : fenêtre (x0,y0,w) du portrait -> S x S pixels rendus."""
    o, R, s = head_frame(spec_path, S); c = np.cos(-par["yaw"]), np.sin(-par["yaw"]); cc, ss = c
    Rwl = np.array([[cc, 0, ss], [0, 1, 0], [-ss, 0, cc]]); x0, y0, w = window; f = w / S
    pitch = par["pitch"]; Rv = np.array([1.0, 0, 0]); Uv = np.array([0.0, np.cos(pitch), -np.sin(pitch)])
    H = (o + R @ (np.array([0, 0.14, 0.03]) * s)) @ Rwl                               # centre de la tête (monde, après lacet)
    ph = _project(((o + R @ (np.array([0, 0.14, 0.03]) * s))[None, :]), par["yaw"], pitch, par["scale"], par["tx"], par["ty"])[0]
    pw = np.array([x0 + w / 2, y0 + w / 2]); dx, dy = (ph - pw) / f; scale = par["scale"] * f
    C = H - dx * scale * Rv + dy * scale * Uv
    spec = yaml.safe_load(open(spec_path)); spec["size"] = S
    spec["camera"] = {"pitch": float(np.degrees(pitch)), "scale": float(scale), "center": [float(v) for v in C]}
    spec["palette"] = str(Path(spec_path).parent / Path(spec["palette"]).name); Path(out_path).write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    return Path(out_path)


def learn(learner, portrait, points, window, S=256, weight=6.0, cell=0.005):
    """Ajoute le portrait à l'apprentissage (pièces du visage uniquement)."""
    from .skiln_paint import gpoints
    spec = learner.spec; par = fit(points, spec); fs = face_spec(spec, par, spec.with_name(spec.stem + "_face.yaml"), window, S)
    gp = gpoints(fs, S, "idle", 0, float(np.degrees(par["yaw"])))
    x0, y0, w = window; img = Image.open(portrait).convert("RGB").crop((x0, y0, x0 + w, y0 + w)).resize((S, S), Image.LANCZOS); src = np.asarray(img)
    cam = gp["cam"]; nz = np.clip(-(gp["normal"] @ cam.D), 0, 1)
    for gi, name in enumerate(gp["names"]):
        if name not in FACE_GROUPS: continue
        m = (gp["gid"] == gi) & gp["hit"] & (nz > 0.2)
        if name in ("head", "nose"):                       # bas du visage : le fond sombre du portrait déborde sur le menton -> on ignore le très sombre sous la bouche
            lum = src.max(-1) / 255.0; m &= ~((lum < 0.30) & (gp["q"][..., 1] < 0.07))
        ys, xs = np.where(m)
        if not len(ys): continue
        key = np.round(gp["q"][ys, xs] / cell).astype(np.int32); col = src[ys, xs].astype(float); wgt = nz[ys, xs] * weight
        for k, c, ww in zip(map(tuple, key), col, wgt):
            a = learner.acc.setdefault((gi, k), [np.zeros(3), 0.0]); a[0] += c * ww; a[1] += ww
        learner.cells[gi] = cell
        if name in ("head", "nose"):                       # le visage est quasi symétrique : le côté vu du portrait est recopié en miroir sur l'autre
            near = gp["q"][ys, xs, 0] * par["flip"] > 0.005
            qm = gp["q"][ys, xs][near].copy(); qm[:, 0] = -qm[:, 0]; km = np.round(qm / cell).astype(np.int32)
            for k, c, ww in zip(map(tuple, km), col[near], wgt[near] * 0.7):
                a = learner.acc.setdefault((gi, k), [np.zeros(3), 0.0]); a[0] += c * ww; a[1] += ww
    return par
