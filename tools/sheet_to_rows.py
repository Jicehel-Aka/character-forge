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


PAIRS = [(5, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16)]   # épaule, coude, poignet, hanche, genou, cheville (g/d, ordre COCO)
LIMBS = [((5, 7, 9), (6, 8, 10)), ((11, 13, 15), (12, 14, 16))]   # bras, jambes


def repair(K):
    """Corrige les erreurs typiques d'une pose estimée sur des sprites en 3/4 : gauche/droite échangés d'une image à l'autre
    (on garde la continuité avec l'image précédente) et points aberrants (os trop longs ou trop courts -> interpolés)."""
    K = K.copy(); n = len(K)
    for t in range(1, n):
        for A, B in LIMBS:
            keep = sum(np.linalg.norm(K[t, i, :2] - K[t - 1, i, :2]) for i in A) + sum(np.linalg.norm(K[t, i, :2] - K[t - 1, i, :2]) for i in B)
            swap = sum(np.linalg.norm(K[t, b, :2] - K[t - 1, a, :2]) for a, b in zip(A, B)) + sum(np.linalg.norm(K[t, a, :2] - K[t - 1, b, :2]) for a, b in zip(A, B))
            if swap < keep:
                for a, b in zip(A, B): K[t, [a, b]] = K[t, [b, a]]
    # os aberrants : longueur hors de [0,5 ; 1,6] x médiane -> point remplacé par l'interpolation des voisins
    for chain in [(5, 7, 9), (6, 8, 10), (11, 13, 15), (12, 14, 16)]:
        for a, b in zip(chain, chain[1:]):
            L = np.linalg.norm(K[:, b, :2] - K[:, a, :2], axis=1); med = np.median(L)
            bad = (L < 0.5 * med) | (L > 1.6 * med)
            if bad.any() and (~bad).sum() >= 2:
                for k in range(2): K[bad, b, k] = np.interp(np.nonzero(bad)[0], np.nonzero(~bad)[0], K[~bad, b, k])
    return K


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
        out[ri] = repair(K)
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
