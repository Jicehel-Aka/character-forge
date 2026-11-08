"""Marionnette 2D : on découpe les 8 vues d'un personnage dessiné en pièces (tête, tronc, bras, jambes) d'après un squelette détecté,
puis on les ré-articule avec une animation apprise (forge anim) projetée dans chaque direction. Les pixels restent ceux de l'artiste.
1. squelette COCO par vue (YOLOv8-pose, outil externe) -> articulations forge ; 2. découpe en pièces par capsules + tête séparée ;
3. pose 3D (avant, haut, latéral) déduite de la pose 2D apprise, projetée pour chaque direction ; 4. pièces déformées (rotation + étirement
le long de l'os), dessinées de la plus éloignée à la plus proche ; 5. trous du tronc comblés."""
import math
import numpy as np
from PIL import Image
from scipy import ndimage

COCO = {"nose": 0, "sho_l": 5, "sho_r": 6, "elb_l": 7, "elb_r": 8, "wri_l": 9, "wri_r": 10, "hip_l": 11, "hip_r": 12, "kn_l": 13, "kn_r": 14, "an_l": 15, "an_r": 16}
BONE = {  # nom : (début, fin, rayon relatif à la hauteur, extension au-delà de la fin en fraction de la longueur)
    "torso": ("pelvis", "neck", 0.15, 0.0),
    "uarm_l": ("shoulder_l", "elbow_l", 0.060, 0.0), "farm_l": ("elbow_l", "wrist_l", 0.060, 0.45),
    "uarm_r": ("shoulder_r", "elbow_r", 0.060, 0.0), "farm_r": ("elbow_r", "wrist_r", 0.060, 0.45),
    "thigh_l": ("hip_l", "knee_l", 0.085, 0.0), "shin_l": ("knee_l", "ankle_l", 0.070, 0.35),
    "thigh_r": ("hip_r", "knee_r", 0.085, 0.0), "shin_r": ("knee_r", "ankle_r", 0.070, 0.35)}


def detect(cell, weights, scale=4):
    """cell RGBA recadrée -> dict articulation forge -> (x, y) en pixels de la cellule, ou None."""
    from ultralytics import YOLO
    model = YOLO(weights); w, h = cell.size; S = int(max(w, h) * 1.6); ox, oy = (S - w) // 2, (S - h) // 2
    bg = Image.new("RGBA", (S, S), (128, 128, 128, 255)); bg.alpha_composite(cell, (ox, oy))
    rr = model(np.array(bg.convert("RGB").resize((S * scale, S * scale), Image.LANCZOS)), conf=0.05, verbose=False)[0]
    if not len(rr.boxes): return None
    kp = rr.keypoints.data[int(rr.boxes.conf.argmax())].cpu().numpy(); P = lambda i: np.array([kp[i][0] / scale - ox, kp[i][1] / scale - oy])
    j = {n: P(i) for n, i in COCO.items()}
    out = {"shoulder_l": j["sho_l"], "shoulder_r": j["sho_r"], "elbow_l": j["elb_l"], "elbow_r": j["elb_r"], "wrist_l": j["wri_l"], "wrist_r": j["wri_r"],
           "hip_l": j["hip_l"], "hip_r": j["hip_r"], "knee_l": j["kn_l"], "knee_r": j["kn_r"], "ankle_l": j["an_l"], "ankle_r": j["an_r"]}
    out["pelvis"] = (out["hip_l"] + out["hip_r"]) / 2; out["neck"] = (out["shoulder_l"] + out["shoulder_r"]) / 2 + np.array([0, -0.02 * h]); out["head"] = j["nose"]
    return out
