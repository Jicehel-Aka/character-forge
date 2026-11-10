"""Planche de sprites (pose.json de tools/pose_sprites.py) -> une animation apprise par ligne, prête pour `forge anim2d --learned`.
Usage : python tools/sheet_to_rows.py pose.json -o rows/ [--frames 6]
Chaque ligne de la planche (= un mouvement) devient rows/ligneNN.json : N images clés, une par colonne (non périodique).
Les images sans pose ou aux points douteux sont complétées par interpolation entre colonnes voisines.
Le modèle écrit est complété d'une image finale dupliquée : le moteur de rendu échantillonne alors exactement les images clés."""
import argparse, json, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from forge import anim, pose_import


def rows_from_pose(res, min_conf=0.25):
    rows = {}
    for r in res:
        if r: rows.setdefault(r["row"], {})[r["col"]] = r
    out = {}
    for ri, cols in sorted(rows.items()):
        n = max(cols) + 1
        K = np.full((n, 17, 3), np.nan)
        for c, r in cols.items():
            if not r.get("kp"): continue
            ox, oy = r["cell"]
            for j, (x, y, s) in enumerate(r["kp"]):
                if s >= min_conf: K[c, j] = (x - ox, y - oy, s)
        # interpolation temporelle des points manquants / douteux
        for j in range(17):
            for k in range(2):
                v = K[:, j, k]; ok = ~np.isnan(v)
                if ok.sum() == 0: continue
                K[:, j, k] = np.interp(np.arange(n), np.nonzero(ok)[0], v[ok])
        K[..., 2] = np.where(np.isnan(K[..., 2]), 0.5, K[..., 2])
        out[ri] = K
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("pose"); ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args(); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    res = json.loads(Path(a.pose).read_text()); rows = rows_from_pose(res)
    for ri, K in rows.items():
        ann = pose_import.from_coco([k.tolist() for k in K], loop=False)
        (out / f"ligne{ri + 1:02d}_annot.json").write_text(json.dumps(ann))
        m = anim.learn([ann], f"ligne{ri + 1:02d}", len(K), False)
        # image finale dupliquée (voir l'en-tête)
        m["angles"] = list(m["angles"]) + [m["angles"][-1]]; m["root"] = list(m["root"]) + [m["root"][-1]]
        m["n_frames"] = len(m["angles"]); m["periodic"] = False
        (out / f"ligne{ri + 1:02d}.json").write_text(json.dumps(m))
        print(f"ligne{ri + 1:02d} : {len(K)} images clés")


if __name__ == "__main__":
    main()
