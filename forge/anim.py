"""Mode apprentissage des animations (2D -> bibliothèque -> sprites calculés pour un autre personnage).

Idée : une planche de sprites donne, image par image, la POSE du personnage (articulations). On en tire des
angles d'os dans le plan de la vue (indépendants des proportions), on moyenne plusieurs exemples d'un même type
(marche, coup de pied…) en un « modèle d'animation », puis on le rejoue sur un autre squelette (longueurs d'os
différentes) pour calculer toutes les poses d'une animation. Les poses peuvent ensuite :
  - être rendues en aperçu (bonhomme-bâton) ;
  - être exportées en angles par os (Mixamo) pour un modèle 3D rigué (script Blender, non testé ici) ;
  - piloter un découpage en parties 2D (à faire).
Les articulations viennent d'une annotation (page docs/anim.html, ou JSON d'un estimateur de pose lancé chez toi) :
l'estimation automatique n'est pas disponible ici (MediaPipe sans modèle téléchargeable), et à 40-80 px de haut
elle serait de toute façon peu fiable sur du pixel art.
LIMITE : une vue de côté ne donne que les angles dans le plan de l'image ; la profondeur (rotations hors plan,
vues de face/dos) n'est pas apprise."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

JOINTS = ["pelvis", "neck", "head", "shoulder_l", "elbow_l", "wrist_l", "shoulder_r", "elbow_r", "wrist_r",
          "hip_l", "knee_l", "ankle_l", "hip_r", "knee_r", "ankle_r"]
PARENT = {"neck": "pelvis", "head": "neck", "shoulder_l": "neck", "elbow_l": "shoulder_l", "wrist_l": "elbow_l",
          "shoulder_r": "neck", "elbow_r": "shoulder_r", "wrist_r": "elbow_r", "hip_l": "pelvis",
          "knee_l": "hip_l", "ankle_l": "knee_l", "hip_r": "pelvis", "knee_r": "hip_r", "ankle_r": "knee_r"}
BONES = list(PARENT)                      # un os = (parent -> articulation)
MIXAMO = {"pelvis": "mixamorig:Hips", "neck": "mixamorig:Neck", "head": "mixamorig:Head",
          "shoulder_l": "mixamorig:LeftArm", "elbow_l": "mixamorig:LeftForeArm", "wrist_l": "mixamorig:LeftHand",
          "shoulder_r": "mixamorig:RightArm", "elbow_r": "mixamorig:RightForeArm", "wrist_r": "mixamorig:RightHand",
          "hip_l": "mixamorig:LeftUpLeg", "knee_l": "mixamorig:LeftLeg", "ankle_l": "mixamorig:LeftFoot",
          "hip_r": "mixamorig:RightUpLeg", "knee_r": "mixamorig:RightLeg", "ankle_r": "mixamorig:RightFoot"}
# proportions par défaut (en longueur « tronc + jambe » = 1) ; os dessinés du parent vers l'articulation
DEFAULT_LEN = {"neck": .45, "head": .22, "shoulder_l": .08, "elbow_l": .30, "wrist_l": .26, "shoulder_r": .08,
               "elbow_r": .30, "wrist_r": .26, "hip_l": .05, "knee_l": .45, "ankle_l": .45, "hip_r": .05,
               "knee_r": .45, "ankle_r": .45}
REST = {"neck": -90, "head": -90, "shoulder_l": 0, "elbow_l": 90, "wrist_l": 90, "shoulder_r": 180, "elbow_r": 90,
        "wrist_r": 90, "hip_l": 0, "knee_l": 90, "ankle_l": 90, "hip_r": 180, "knee_r": 90, "ankle_r": 90}


def _ang(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def _wrap(d):
    return (d + 180) % 360 - 180


def lengths(frame):
    return {b: math.dist(frame[PARENT[b]], frame[b]) for b in BONES}


def scale_of(L):
    """Échelle du corps = tronc + moyenne des jambes (insensible aux bras et à la tête)."""
    leg = (L["knee_l"] + L["ankle_l"] + L["knee_r"] + L["ankle_r"]) / 2
    return max(L["neck"] + leg, 1e-6)


def validate_annotation(ann):
    """Contrôle de cohérence : os dont la longueur varie trop (erreur de clic ou raccourci de perspective)."""
    probs, F = [], ann["frames"]
    for i, f in enumerate(F):
        miss = [j for j in JOINTS if j not in f]
        if miss:
            probs.append(f"image {i} : articulations manquantes {miss}")
    ok = [f for f in F if all(j in f for j in JOINTS)]
    if len(ok) > 1:
        Ls = [lengths(f) for f in ok]
        for b in BONES:
            v = np.array([l[b] for l in Ls]); m = np.median(v)
            if m > 4:
                for i, x in enumerate(v):
                    if abs(x - m) > .35 * m:
                        probs.append(f"image {i} : os {b} = {x:.0f}px (médiane {m:.0f}px) -> clic douteux ou raccourci")
    return probs


def to_angles(ann):
    """Annotation -> angles d'os absolus (°, repère image, visage normalisé vers la droite) + trajet du bassin."""
    F = ann["frames"]
    mir = ann.get("facing", "right") == "left"
    ok = [f for f in F if all(j in f for j in JOINTS)]
    if not ok:
        raise ValueError("aucune image complètement annotée")
    L = {b: float(np.median([lengths(f)[b] for f in ok])) for b in BONES}
    S = scale_of(L)
    angs, root = [], []
    r0 = np.array(ok[0]["pelvis"], float)
    for f in ok:
        g = {j: ((-f[j][0] if mir else f[j][0]), f[j][1]) for j in JOINTS}
        angs.append([_ang(g[PARENT[b]], g[b]) for b in BONES])
        p = np.array(g["pelvis"], float); q = np.array(((-r0[0] if mir else r0[0]), r0[1]))
        root.append(((p - q) / S).tolist())
    return {"angles": angs, "root": root, "lengths_rel": {b: L[b] / S for b in BONES}, "scale": S}


def _resample(A, n, periodic):
    A = np.asarray(A, float); T = len(A)
    t_src = np.arange(T) / (T if periodic else max(T - 1, 1))
    t_dst = np.arange(n) / (n if periodic else max(n - 1, 1))
    out = np.zeros((n, A.shape[1]))
    for k in range(A.shape[1]):
        u = np.unwrap(np.radians(A[:, k]))
        if periodic:
            ts = np.append(t_src, 1.0); us = np.append(u, u[0] + (u[-1] - u[0] if abs(u[-1] - u[0]) > math.pi else 0))
            us[-1] = u[0] + (np.radians(_wrap(math.degrees(u[0] - u[-1]))) * -1 + u[-1] - u[0] if False else 0) + u[0] - u[0]
            us[-1] = u[0]
            out[:, k] = np.degrees(np.interp(t_dst, ts, np.append(u, u[0])))
        else:
            out[:, k] = np.degrees(np.interp(t_dst, t_src, u))
    return out


def learn(annotations, atype, n_frames=16, periodic=None, mirror_aug=False):
    """Plusieurs annotations d'un même type -> modèle moyen (angles circulaires) + écart-type."""
    exs = []
    for ann in annotations:
        d = to_angles(ann)
        per = ann.get("loop", False) if periodic is None else periodic
        exs.append((_resample(d["angles"], n_frames, per), np.array(_resample(d["root"], n_frames, per)), d, per))
    per = exs[0][3]
    A = np.stack([e[0] for e in exs])
    rad = np.radians(A)
    mean = np.degrees(np.arctan2(np.sin(rad).mean(0), np.cos(rad).mean(0)))
    std = np.degrees(np.sqrt(np.maximum(0, -2 * np.log(np.clip(np.hypot(np.sin(rad).mean(0), np.cos(rad).mean(0)), 1e-9, 1)))))
    root = np.stack([e[1] for e in exs]).mean(0)
    return {"type": atype, "n_frames": n_frames, "periodic": bool(per), "examples": len(exs), "bones": BONES,
            "angles": mean.tolist(), "std": std.tolist(), "root": root.tolist(),
            "lengths_rel": {b: float(np.mean([e[2]["lengths_rel"][b] for e in exs])) for b in BONES}}


def generate(model, frames=None, lengths_rel=None, height=64.0, origin=(0.0, 0.0), speed=1.0):
    """Modèle + squelette cible -> poses (liste de dict articulation -> [x, y]) en pixels."""
    n = model["n_frames"]; M = int(frames or n)
    per = model["periodic"]
    A = _resample(model["angles"], M, per) if M != n else np.array(model["angles"])
    R = _resample(model["root"], M, per) if M != n else np.array(model["root"])
    Lr = lengths_rel or model["lengths_rel"]
    S = height / 1.0  # échelle : tronc+jambe = height
    poses = []
    for i in range(M):
        p = {"pelvis": [origin[0] + R[i][0] * S * speed, origin[1] + R[i][1] * S]}
        for b, a in zip(BONES, A[i]):
            pp = p[PARENT[b]]; r = math.radians(a); L = Lr[b] * S
            p[b] = [pp[0] + L * math.cos(r), pp[1] + L * math.sin(r)]
        poses.append(p)
    return poses


def character_lengths(ann_frame):
    """Longueurs d'os relatives d'un personnage, d'après UNE pose annotée (ex. repos)."""
    L = lengths(ann_frame); S = scale_of(L)
    return {b: L[b] / S for b in BONES}


def error_vs(model, ann):
    """Écart moyen (°) entre le modèle et un exemple (mesure de cohérence / d'apprentissage)."""
    d = to_angles(ann); per = model["periodic"]
    A = _resample(d["angles"], model["n_frames"], per)
    diff = (A - np.array(model["angles"]) + 180) % 360 - 180
    return float(np.abs(diff).mean()), {b: float(np.abs(diff[:, k]).mean()) for k, b in enumerate(BONES)}


def preview(poses, path, cell=(120, 140), cols=8, title=None):
    from PIL import Image, ImageDraw
    n = len(poses); rows = (n + cols - 1) // cols
    allp = np.array([[p[j] for j in JOINTS] for p in poses]); x0, y0 = allp.min((0, 1)); x1, y1 = allp.max((0, 1))
    s = min((cell[0] - 16) / max(x1 - x0, 1), (cell[1] - 16) / max(y1 - y0, 1))
    im = Image.new("RGB", (cell[0] * cols, cell[1] * rows), (24, 24, 22)); d = ImageDraw.Draw(im)
    for i, p in enumerate(poses):
        ox, oy = (i % cols) * cell[0], (i // cols) * cell[1]
        T = lambda q: (ox + 8 + (q[0] - x0) * s + (cell[0] - 16 - (x1 - x0) * s) / 2, oy + 8 + (q[1] - y0) * s)
        for b in BONES:
            col = (255, 140, 100) if b.endswith("_l") else (120, 190, 255) if b.endswith("_r") else (230, 230, 230)
            d.line([T(p[PARENT[b]]), T(p[b])], fill=col, width=3)
        h = T(p["head"]); d.ellipse([h[0] - 4, h[1] - 4, h[0] + 4, h[1] + 4], outline=(255, 255, 255))
        d.text((ox + 3, oy + 2), str(i), fill=(150, 150, 150))
    im.save(path); return path


def to_blender(model_or_poses_angles, path, frames_angles):
    """Angles par os (nom Mixamo) par image, avec la pose de repos : pour apply_clip.py (non testé)."""
    out = {"bones": {MIXAMO[b]: [row[k] for row in frames_angles] for k, b in enumerate(BONES)},
           "rest": {MIXAMO[b]: REST[b] for b in BONES}, "plane": "XZ (vue de côté ; y image = -z Blender)"}
    Path(path).write_text(json.dumps(out, indent=1)); return path


def cmd(a):
    out = Path(a.output); out.mkdir(parents=True, exist_ok=True)
    if a.action == "check":
        for f in a.inputs:
            ann = json.loads(Path(f).read_text()); pr = validate_annotation(ann)
            print(f"{f}: {len(ann['frames'])} images, " + ("OK" if not pr else f"{len(pr)} problème(s)"))
            for p in pr:
                print("  -", p)
    elif a.action == "learn":
        anns = [json.loads(Path(f).read_text()) for f in a.inputs]
        m = learn(anns, a.type, a.frames, True if a.loop else None)
        (out / f"{a.type}.json").write_text(json.dumps(m, indent=1))
        errs = [error_vs(m, an)[0] for an in anns]
        print(f"[anim] « {a.type} » appris sur {len(anns)} exemple(s), {m['n_frames']} images, périodique={m['periodic']}; écart moyen aux exemples : {np.mean(errs):.1f}°")
    elif a.action == "generate":
        m = json.loads(Path(a.inputs[0]).read_text())
        L = None
        if a.character:
            ch = json.loads(Path(a.character).read_text()); L = character_lengths(ch["frame"] if "frame" in ch else ch)
        poses = generate(m, a.frames, L, a.height)
        stem = f"{m['type']}_gen"
        (out / f"{stem}.json").write_text(json.dumps(poses, indent=1))
        preview(poses, out / f"{stem}.png")
        print(f"[anim] {len(poses)} poses -> {out / (stem + '.png')}")
    return 0
