"""Étape 6 : de N images (rendus turntable, poses...) à une spritesheet RGB565 prête pour l'AKA.

Options de lisibilité pour les petits sprites : contraste/saturation (--boost), contour 1 px (--outline),
mode de réduction (--resample), tramage (--dither)."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .rgb565 import to_c_header, to_rgb565
from .spritesheet import build_spritesheet

RESAMPLE = {"lanczos": Image.LANCZOS, "box": Image.BOX, "nearest": Image.NEAREST}
BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) + 0.5) / 16 - 0.5
W_LUM = np.array([0.299, 0.587, 0.114], dtype=np.float32)


def boost(img: Image.Image, amount: float) -> Image.Image:
    """Étire le contraste sur les seuls pixels opaques, relève les tons sombres et la saturation."""
    if amount <= 0:
        return img
    a = np.asarray(img).astype(np.float32)
    m = a[..., 3] > 0
    if not m.any():
        return img
    rgb = a[..., :3]
    lum = rgb[m] @ W_LUM
    lo, hi = np.percentile(lum, 1), np.percentile(lum, 99)
    stretched = (rgb - lo) * (255.0 / max(hi - lo, 1.0))
    rgb = rgb * (1 - amount) + stretched * amount
    gray = (rgb @ W_LUM)[..., None]
    rgb = gray + (rgb - gray) * (1 + 0.5 * amount)
    rgb = 255.0 * (np.clip(rgb, 0, 255) / 255.0) ** (1.0 / (1 + 0.35 * amount))
    a[..., :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def outline(img: Image.Image, color=(24, 18, 28)) -> Image.Image:
    """Contour sombre de 1 px autour de la silhouette (agrandit l'image de 1 px de chaque côté)."""
    a = np.asarray(img)
    pad = np.pad(a, ((1, 1), (1, 1), (0, 0)))
    solid = pad[..., 3] > 0
    ring = ndimage.binary_dilation(solid, structure=ndimage.generate_binary_structure(2, 1)) & ~solid
    pad = pad.copy()
    pad[ring] = (*color, 255)
    return Image.fromarray(pad, "RGBA")


def build(frames_dir: Path, out: Path, name: str = "char", height: int = 64, colors: int = 32,
          columns: int = 8, little_endian: bool = True, dither="none",
          resample: str = "lanczos", boost_amount: float = 0.0, with_outline: bool = False) -> dict:
    if dither is True:
        dither = "fs"
    elif dither is False:
        dither = "none"
    files = sorted(Path(frames_dir).glob("*.png"))
    if not files:
        raise SystemExit(f"aucun PNG dans {frames_dir}")
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    frames = [Image.open(f).convert("RGBA") for f in files]

    # Même canevas pour toutes les images (bas-centre), puis même recadrage = animation stable
    W, H = max(f.width for f in frames), max(f.height for f in frames)
    canv = []
    for f in frames:
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        c.paste(f, ((W - f.width) // 2, H - f.height))
        canv.append(c)
    union = None
    for c in canv:
        bb = c.getchannel("A").point(lambda v: 255 if v >= 128 else 0).getbbox()
        if bb:
            union = bb if union is None else (min(union[0], bb[0]), min(union[1], bb[1]),
                                              max(union[2], bb[2]), max(union[3], bb[3]))
    if union is None:
        raise SystemExit("images entièrement transparentes")
    inner = height - (2 if with_outline else 0)  # le contour ajoute 1 px de chaque côté
    k = inner / (union[3] - union[1])
    size = (max(1, round((union[2] - union[0]) * k)), inner)
    frames = []
    for c in canv:
        f = c.crop(union).resize(size, RESAMPLE[resample])
        a = np.asarray(f).copy()
        a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
        f = boost(Image.fromarray(a, "RGBA"), boost_amount)
        frames.append(outline(f) if with_outline else f)

    # Palette partagée par toutes les images
    px = np.concatenate([np.asarray(f)[..., :3][np.asarray(f)[..., 3] > 0] for f in frames])
    ref = Image.new("RGB", (len(px), 1))
    ref.putdata([tuple(int(v) for v in p) for p in px])
    pal = ref.quantize(colors=colors, method=Image.MEDIANCUT)
    spread = 255.0 / max(colors ** (1 / 3), 2)
    quant = []
    for f in frames:
        alpha = f.getchannel("A")
        rgb = f.convert("RGB")
        if dither == "bayer":
            arr = np.asarray(rgb).astype(np.float32)
            h, w = arr.shape[:2]
            tile = np.tile(BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w, None]
            rgb = Image.fromarray(np.clip(arr + tile * spread, 0, 255).astype(np.uint8), "RGB")
        mode = Image.Dither.FLOYDSTEINBERG if dither == "fs" else Image.Dither.NONE
        q = rgb.quantize(palette=pal, dither=mode).convert("RGBA")
        q.putalpha(alpha)
        quant.append(q)

    sheet, meta = build_spritesheet(quant, columns=columns, bottom_align=True)
    sheet.save(out / f"{name}_sheet.png")
    raw = to_rgb565(sheet, little_endian)
    (out / f"{name}_sheet.raw").write_bytes(raw)
    n = len(quant)
    header = to_c_header(f"{name}_sheet", sheet, little_endian)
    header += (f"#define {name.upper()}_FRAMES {n}\n#define {name.upper()}_FRAME_W {meta['cell_w']}\n"
               f"#define {name.upper()}_FRAME_H {meta['cell_h']}\n#define {name.upper()}_COLUMNS {meta['columns']}\n")
    (out / f"{name}_sheet.h").write_text(header)

    used = sorted({q for f in quant for q in f.convert("RGB").getdata()})
    info = {"name": name, "frames": n, "angles_deg": [round(360 * i / n, 2) for i in range(n)],
            "cell": [meta["cell_w"], meta["cell_h"]], "columns": meta["columns"], "rows": meta["rows"],
            "endian": "LE" if little_endian else "BE", "transparent_key": "0xF81F",
            "palette_size": len(used), "options": {"resample": resample, "boost": boost_amount,
                                                   "outline": with_outline, "dither": dither},
            "sources": [f.name for f in files]}
    (out / f"{name}_sheet.json").write_text(json.dumps(info, indent=2))
    print(f"[sprites] {n} images {meta['cell_w']}x{meta['cell_h']} -> {out}/{name}_sheet.(png|raw|h|json), "
          f"{len(used)} couleurs")
    return info
