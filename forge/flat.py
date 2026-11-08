"""Planches de sprites : découpe en cellules, export « à plat » retravaillable et réintégration.

  slice SHEET -o DIR          : détecte la grille (lignes/colonnes sans pixel), écrit frames/*.png + sheet.json
  flatten SHEET -o DIR -f 4   : agrandit à plat (pixels carrés, facteur entier) + palette.json + meta.json
                                -> retravailler flat.png dans un éditeur (Aseprite, Krita, Photoshop...)
  reintegrate EDITED -m meta  : revient à la résolution d'origine, recolle sur la palette, restaure la clé
                                de transparence -> planche prête pour l'AKA (puis RGB565 via forge sprites)
Honnêteté : sans nouvelle information, agrandir ne crée pas de détail ; le gain est de pouvoir REPEINDRE à une
résolution confortable puis revenir sans perte. Une planche déjà lissée (anti-aliasing) se réduit moins proprement."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def load(path, tol=24):
    """-> (RGBA, clé) ; clé = couleur de fond uniforme si l'image n'a pas d'alpha utile."""
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)
    if (a[..., 3] < 255).any() and (a[..., 3] == 0).mean() > 0.02:
        return im, None
    c = [tuple(a[y, x, :3]) for y, x in ((0, 0), (0, -1), (-1, 0), (-1, -1))]
    key = max(set(c), key=c.count)
    d = np.abs(a[..., :3].astype(int) - np.array(key)).sum(2)
    out = a.copy()
    out[..., 3] = np.where(d <= tol, 0, 255)
    return Image.fromarray(out, "RGBA"), tuple(int(v) for v in key)


def _bands(v, min_gap=3, min_size=6):
    runs, s = [], None
    for i, x in enumerate(v):
        if x and s is None:
            s = i
        if not x and s is not None:
            runs.append([s, i]); s = None
    if s is not None:
        runs.append([s, len(v)])
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [tuple(r) for r in merged if r[1] - r[0] >= min_size]


def slice_sheet(path, out, alpha_thr=16, min_gap=None, limit=0):
    im, key = load(path)
    a = np.asarray(im)
    m = a[..., 3] > alpha_thr
    gap = min_gap or max(3, im.width // 600)
    rows, cols = _bands(m.any(1), gap), _bands(m.any(0), gap)
    out = Path(out); (out / "frames").mkdir(parents=True, exist_ok=True)
    cells, n = [], 0
    for ri, (y0, y1) in enumerate(rows):
        for ci, (x0, x1) in enumerate(cols):
            sub = m[y0:y1, x0:x1]
            if not sub.any():
                continue
            ys, xs = np.where(sub)
            bb = [x0 + int(xs.min()), y0 + int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]
            f = f"frames/r{ri:03d}_c{ci:02d}.png"
            if not limit or n < limit:
                im.crop((bb[0], bb[1], bb[0] + bb[2], bb[1] + bb[3])).save(out / f)
            cells.append({"row": ri, "col": ci, "bbox": bb, "file": f})
            n += 1
    meta = {"source": Path(path).name, "size": list(im.size), "key": key, "rows": len(rows), "cols": len(cols),
            "row_bands": rows, "col_bands": cols, "cells": cells}
    (out / "sheet.json").write_text(json.dumps(meta, indent=1))
    return meta


def flatten(path, out, factor=4, colors=64):
    im, key = load(path)
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    a = np.asarray(im).copy()
    op = a[..., 3] > 0
    a[~op] = (0, 0, 0, 0)
    a[op, 3] = 255                                       # alpha binaire : pas de demi-teintes à réduire
    pal = sorted({tuple(int(v) for v in p) for p in a[op][:, :3]})
    if len(pal) > colors:                               # source bruitée/compressée : palette réduite et assumée
        q = Image.fromarray(a[..., :3], "RGB").quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        a[..., :3] = np.asarray(q.convert("RGB"))
        pal = sorted({tuple(int(v) for v in p) for p in a[op][:, :3]})
    big = Image.fromarray(a, "RGBA").resize((im.width * factor, im.height * factor), Image.NEAREST)
    big.save(out / "flat.png")
    meta = {"source": Path(path).name, "orig_size": list(im.size), "factor": factor, "key": key or [255, 0, 255],
            "had_key": key is not None, "palette": ["#%02x%02x%02x" % p for p in pal]}
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    (out / "palette.json").write_text(json.dumps({"palette": meta["palette"]}, indent=1))
    return meta


def reintegrate(edited, meta_path, out, snap=True):
    meta = json.loads(Path(meta_path).read_text())
    W, H = meta["orig_size"]; f = meta["factor"]
    a = np.asarray(Image.open(edited).convert("RGBA")).astype(np.int32)
    if a.shape[1] != W * f or a.shape[0] != H * f:
        im = Image.fromarray(a.astype(np.uint8), "RGBA").resize((W * f, H * f), Image.NEAREST)
        a = np.asarray(im).astype(np.int32)
    blk = a.reshape(H, f, W, f, 4).transpose(0, 2, 1, 3, 4).reshape(H, W, f * f, 4)
    opaque = (blk[..., 3] >= 128)
    vote = opaque.sum(2) * 2 >= f * f
    w = opaque[..., None]
    mean = (blk[..., :3] * w).sum(2) / np.maximum(w.sum(2), 1)       # moyenne des pixels opaques du bloc
    rgb = mean.round().astype(np.int32)
    if snap:
        pal = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in meta["palette"]])
        flat_px = rgb.reshape(-1, 3)
        idx = np.empty(len(flat_px), np.int64)
        for i in range(0, len(flat_px), 20000):                       # par blocs : pas de tableau géant
            d = ((flat_px[i:i + 20000, None, :] - pal[None]) ** 2).sum(2)
            idx[i:i + 20000] = d.argmin(1)
        rgb = pal[idx].reshape(H, W, 3)
    out_a = np.zeros((H, W, 4), np.uint8)
    out_a[..., :3] = np.where(vote[..., None], rgb, 0)
    out_a[..., 3] = np.where(vote, 255, 0)
    res = Image.fromarray(out_a, "RGBA")
    res.save(out)
    if meta.get("had_key"):                                            # re-remplit la clé de transparence
        bg = Image.new("RGBA", res.size, tuple(meta["key"]) + (255,)); bg.alpha_composite(res)
        bg.convert("RGB").save(Path(out).with_name(Path(out).stem + "_key.png"))
    return res


def cmd(a):
    if a.action == "slice":
        m = slice_sheet(a.sheet, a.output, limit=a.limit)
        print(f"[slice] {m['rows']} lignes x {m['cols']} colonnes, {len(m['cells'])} cellules -> {a.output}")
    elif a.action == "flatten":
        m = flatten(a.sheet, a.output, a.factor, a.colors)
        print(f"[flatten] {m['orig_size']} x{m['factor']} -> {a.output}/flat.png ({len(m['palette'])} couleurs)")
    else:
        reintegrate(a.sheet, a.meta, a.output, not a.no_snap)
        print(f"[reintegrate] -> {a.output}")
    return 0
