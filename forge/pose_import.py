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
