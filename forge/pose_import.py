"""Import de points-clés d'un estimateur de pose externe (format COCO-17) -> annotation `anim`.
Les estimateurs cités (ex. bizarre-pose-estimator : Docker + GPU) se lancent chez toi ; ce module lit leur JSON.
Entrée : liste d'images, chacune = liste de 17 [x, y] ou [x, y, confiance] dans l'ordre COCO :
nez, œil g/d, oreille g/d, épaule g/d, coude g/d, poignet g/d, hanche g/d, genou g/d, cheville g/d."""
import json
from pathlib import Path

COCO = ["nose", "eye_l", "eye_r", "ear_l", "ear_r", "shoulder_l", "shoulder_r", "elbow_l", "elbow_r", "wrist_l",
        "wrist_r", "hip_l", "hip_r", "knee_l", "knee_r", "ankle_l", "ankle_r"]


def _mid(a, b):
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]


def from_coco(frames, min_conf=0.2, loop=False, facing="right"):
    out, low = [], 0
    for kp in frames:
        d = {n: p for n, p in zip(COCO, kp)}
        if any(len(p) > 2 and p[2] < min_conf for p in d.values()):
            low += 1
        g = lambda n: [d[n][0], d[n][1]]
        f = {"pelvis": _mid(g("hip_l"), g("hip_r")), "neck": _mid(g("shoulder_l"), g("shoulder_r")), "head": g("nose")}
        for s in ("l", "r"):
            f[f"shoulder_{s}"] = g(f"shoulder_{s}"); f[f"elbow_{s}"] = g(f"elbow_{s}"); f[f"wrist_{s}"] = g(f"wrist_{s}")
            f[f"hip_{s}"] = g(f"hip_{s}"); f[f"knee_{s}"] = g(f"knee_{s}"); f[f"ankle_{s}"] = g(f"ankle_{s}")
        out.append(f)
    return {"facing": facing, "loop": loop, "frames": out, "low_confidence_frames": low}


ALIAS = {"left_eye": "eye_l", "right_eye": "eye_r", "left_ear": "ear_l", "right_ear": "ear_r",
         "left_shoulder": "shoulder_l", "right_shoulder": "shoulder_r", "left_elbow": "elbow_l",
         "right_elbow": "elbow_r", "left_wrist": "wrist_l", "right_wrist": "wrist_r", "left_hip": "hip_l",
         "right_hip": "hip_r", "left_knee": "knee_l", "right_knee": "knee_r", "left_ankle": "ankle_l",
         "right_ankle": "ankle_r"}


def from_coco_file(data, person=0, **kw):
    """Fichier COCO complet (images + annotations + categories) -> annotation `anim`, une image par entrée d'`images`
    triée par nom de fichier (ex. frame_000.png, frame_001.png...). Les points v=0 (non annotés) comptent comme
    faible confiance. L'ordre des points est lu dans categories[0].keypoints si présent, sinon l'ordre COCO-17."""
    names = COCO
    cats = data.get("categories") or []
    if cats and cats[0].get("keypoints"):
        names = [ALIAS.get(n, n) for n in cats[0]["keypoints"]]
        miss = [n for n in COCO if n not in names]
        if miss:
            raise ValueError(f"points manquants dans categories.keypoints : {miss}")
    imgs = sorted(data["images"], key=lambda i: i.get("file_name", str(i["id"])))
    by = {}
    for a in data["annotations"]:
        if a.get("keypoints"):
            by.setdefault(a["image_id"], []).append(a)
    frames = []
    for im in imgs:
        anns = by.get(im["id"], [])
        if len(anns) <= person:
            continue
        k = anns[person]["keypoints"]
        d = {n: [k[3 * j], k[3 * j + 1], 1.0 if k[3 * j + 2] > 0 else 0.0] for j, n in enumerate(names)}
        frames.append([d[n] for n in COCO])
    return from_coco(frames, **kw)
