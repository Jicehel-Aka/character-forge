"""Contrôles qualité d'un dossier de frames/sprites (idée reprise de pipelines de sprites générés :
chaque contrôle échoué produit une consigne de correction précise, pas un simple rejet).

Contrôles : cadre (personnage coupé), poussières (petits îlots isolés), taille constante entre frames,
position des pieds stable (pas de saut), nombre de couleurs, alpha binaire."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def check_frame(path, max_colors=24):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)
    al = a[..., 3]
    fg = al > 0
    out = {"file": Path(path).name, "issues": []}
    if not fg.any():
        out["issues"].append(("vide", "image sans premier plan : régénérer ou revoir le détourage")); return out
    ys, xs = np.where(fg)
    H, W = fg.shape
    bb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    out["bbox"] = [int(v) for v in bb]
    cut = [n for n, c in (("haut", bb[1] <= 0), ("bas", bb[3] >= H), ("gauche", bb[0] <= 0), ("droite", bb[2] >= W)) if c]
    if cut:
        out["issues"].append(("cadre", f"personnage coupé par le bord {', '.join(cut)} : agrandir le canevas ou recadrer"))
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        small = int((sizes < max(4, 0.002 * fg.sum())).sum())
        if small:
            out["issues"].append(("poussières", f"{small} îlot(s) isolé(s) : relancer avec --min-area ou nettoyer"))
    if ((al > 0) & (al < 255)).any():
        out["issues"].append(("alpha", "pixels semi-transparents : durcir l'alpha (--alpha-thr) pour un export RGB565"))
    cols = len({tuple(p) for p in a[fg][:, :3]})
    out["colors"] = cols
    if cols > max_colors:
        out["issues"].append(("couleurs", f"{cols} couleurs > {max_colors} : réduire la palette (sprites --colors)"))
    return out


def run(folder, max_colors=24):
    files = sorted(Path(folder).glob("*.png"))
    rep = [check_frame(f, max_colors) for f in files]
    boxes = [r["bbox"] for r in rep if "bbox" in r]
    if len(boxes) > 1:
        hs = np.array([b[3] - b[1] for b in boxes]); feet = np.array([b[3] for b in boxes])
        if hs.max() > 1.15 * np.median(hs) or hs.min() < 0.85 * np.median(hs):
            for r in rep:
                if "bbox" in r and abs((r["bbox"][3] - r["bbox"][1]) - np.median(hs)) > 0.15 * np.median(hs):
                    r["issues"].append(("taille", "hauteur différente des autres frames : normaliser l'échelle"))
        if feet.max() - feet.min() > 0.06 * np.median(hs):
            for r in rep:
                if "bbox" in r and abs(r["bbox"][3] - np.median(feet)) > 0.06 * np.median(hs):
                    r["issues"].append(("pieds", "ligne des pieds décalée : recaler les frames sur les pieds"))
    return rep


def cmd(a):
    rep = run(a.folder, a.max_colors)
    bad = 0
    for r in rep:
        for kind, msg in r["issues"]:
            bad += 1; print(f"{r['file']}: [{kind}] {msg}")
    print(f"[qa] {len(rep)} image(s), {bad} problème(s)")
    if a.json:
        Path(a.json).write_text(json.dumps(rep, indent=2, ensure_ascii=False, default=str))
    return 1 if bad else 0
