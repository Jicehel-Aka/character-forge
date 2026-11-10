"""Détection de pose (COCO-17) sur une planche de sprites, avec YOLOv8-pose (AGPL-3.0 — outil externe, non redistribué).
Usage : python tools/pose_sprites.py planche.png --cols 6 --key ff00ff --weights y.pt -o out/
Les sprites sont petits : cadrage serré + marge + agrandissement, sinon rien n'est détecté (testé : 0/36 sans, 36/36 avec)."""
import argparse, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

SK = [(5, 7), (7, 9), (6, 8), (8, 10), (11, 13), (13, 15), (12, 14), (14, 16), (5, 6), (11, 12), (5, 11), (6, 12), (0, 5), (0, 6)]


def bands(alpha):
    rows = alpha.any(1); out = []; y = 0; H = len(rows)
    while y < H:
        if rows[y]:
            y0 = y
            while y < H and rows[y]: y += 1
            out.append((y0, y))
        else: y += 1
    return [b for b in out if b[1] - b[0] >= 15]   # ignore les traits parasites de 1-2 px entre les lignes


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("sheet"); ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--key", default=None, help="couleur de fond à rendre transparente (hex)"); ap.add_argument("--weights", required=True)
    ap.add_argument("-o", "--out", required=True); ap.add_argument("--scale", type=int, default=4)
    a = ap.parse_args()
    from ultralytics import YOLO
    model = YOLO(a.weights); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    im = Image.open(a.sheet).convert("RGBA"); arr = np.array(im)
    if a.key:
        k = [int(a.key[i:i + 2], 16) for i in (0, 2, 4)]; arr[(np.abs(arr[..., :3].astype(int) - k).sum(-1) < 40), 3] = 0
    sh = Image.fromarray(arr); W, H = sh.size; cw = W // a.cols
    res = []; ov = sh.copy(); d = ImageDraw.Draw(ov)
    for r, (y0, y1) in enumerate(bands(arr[..., 3] > 0)):
        for c in range(a.cols):
            box = (c * cw, y0, (c + 1) * cw, y1); cell = sh.crop(box); bb = cell.getbbox()
            if not bb: res.append(None); continue
            t = cell.crop(bb); w, h = t.size; S = int(max(w, h) * 1.6); ox, oy = (S - w) // 2, (S - h) // 2
            bg = Image.new("RGBA", (S, S), (128, 128, 128, 255)); bg.alpha_composite(t, (ox, oy))
            big = np.array(bg.convert("RGB").resize((S * a.scale, S * a.scale), Image.LANCZOS))
            rr = model(big, conf=0.05, verbose=False)[0]
            if not len(rr.boxes): res.append({"row": r, "col": c, "kp": None}); continue
            i = int(rr.boxes.conf.argmax()); kp = rr.keypoints.data[i].cpu().numpy()   # (17,3) en px agrandis
            pts = [[float(box[0] + bb[0] + (x / a.scale - ox)), float(box[1] + bb[1] + (y / a.scale - oy)), float(s)] for x, y, s in kp]
            res.append({"row": r, "col": c, "cell": [box[0], box[1]], "kp": pts, "box_conf": float(rr.boxes.conf[i])})
            for p, q in SK:
                if pts[p][2] > .3 and pts[q][2] > .3: d.line([tuple(pts[p][:2]), tuple(pts[q][:2])], fill=(0, 255, 0, 255), width=1)
    json.dump(res, open(out / "pose.json", "w")); ov.save(out / "overlay.png")
    ok = sum(1 for r in res if r and r.get("kp")); tot = sum(1 for r in res if r)
    print(f"{ok}/{tot} images avec pose ; -> {out}/pose.json, overlay.png")


if __name__ == "__main__":
    main()
