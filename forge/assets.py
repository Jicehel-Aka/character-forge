"""Étape 1 : extraction 2D (détourage, éléments, parties nommées, palette, RGB565)."""
import html
import json
from pathlib import Path

from PIL import Image

from .extract import extract_elements, foreground_mask
from .palette import extract_palette
from .rgb565 import to_c_header, to_rgb565
from . import props as propsmod
from .segment import segment
from .spritesheet import build_spritesheet


def fit(img: Image.Image, max_size: int) -> Image.Image:
    if max_size <= 0 or max(img.size) <= max_size:
        return img
    r = max_size / max(img.size)
    return img.resize((max(1, round(img.width * r)), max(1, round(img.height * r))), Image.NEAREST)


def save_item(out: Path, name: str, crop: Image.Image, a, info: dict) -> dict:
    crop.save(out / "assets" / f"{name}.png")
    info.update({"name": name, "file": f"assets/{name}.png"})
    if not a.no_rgb565:
        small = fit(crop, a.max_size)
        le = not a.big_endian
        (out / "rgb565" / f"{name}.raw").write_bytes(to_rgb565(small, le))
        (out / "rgb565" / f"{name}.h").write_text(to_c_header(name, small, le))
        info["rgb565"] = {"file": f"rgb565/{name}.raw", "size": list(small.size),
                          "endian": "LE" if le else "BE"}
    return info


def run(path: Path, out: Path, a) -> dict:
    """Traite une image. `a` : objet avec les options (voir cli.add_extract_args)."""
    img = Image.open(path).convert("RGBA")
    out.mkdir(parents=True, exist_ok=True)
    (out / "assets").mkdir(exist_ok=True)
    (out / "rgb565").mkdir(exist_ok=True)
    orig = img
    if a.segment:
        img = segment(img, a.model, a.alpha_thr)
    if getattr(a, "props", None):
        spec = json.loads(Path(a.props).read_text()).get(path.name)
        if spec:
            img = propsmod.apply(img, spec, orig)
            print(f"[props] {path.name}: {len(spec.get('props', []))} accessoire(s), "
                  f"{len(spec.get('erase', []))} zone(s) effacée(s)")
    if a.segment or getattr(a, "props", None):
        img.save(out / "cutout.png")

    palette = extract_palette(img, a.colors, foreground_mask(img, a.tol))
    elements = extract_elements(img, a.tol, a.merge, a.min_area)

    items, crops = [], []
    stem = path.stem.replace("-", "_").replace(" ", "_")
    for i, (crop, info) in enumerate(elements):
        items.append(save_item(out, f"{stem}_{i:03d}", crop, a, info))
        crops.append(crop)

    parts_meta = {}
    if a.parts:
        spec = json.loads(Path(a.parts).read_text()).get(path.name, {})
        for pname, (x, y, w, h) in spec.items():
            region = img.crop((x, y, x + w, y + h))
            bb = region.getchannel("A").getbbox()
            if not bb:
                continue
            info = {"bbox": [x + bb[0], y + bb[1], bb[2] - bb[0], bb[3] - bb[1]]}
            parts_meta[pname] = save_item(out, f"{stem}_{pname}", region.crop(bb), a, info)

    sheet, sheet_meta = build_spritesheet(crops)
    if sheet:
        sheet.save(out / "spritesheet.png")

    meta = {"source": path.name, "size": list(img.size), "palette": palette,
            "elements": items, "parts": parts_meta, "spritesheet": sheet_meta}
    (out / "metadata.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    (out / "palette.json").write_text(json.dumps({"palette": palette}, indent=2))

    cards = "".join(
        f"<div style='display:inline-block;margin:6px;text-align:center;font:12px sans-serif'>"
        f"<img src='{html.escape(e['file'])}' style='background:#888;image-rendering:pixelated;max-height:240px'>"
        f"<br>{e['name']}<br>{e['bbox']}</div>" for e in items + list(parts_meta.values()))
    sw = "".join(f"<span style='display:inline-block;width:32px;height:32px;background:{c}' title='{c}'></span>"
                 for c in palette)
    (out / "report.html").write_text(
        f"<meta charset=utf-8><h2>{html.escape(path.name)} — {len(items)} éléments, "
        f"{len(parts_meta)} parties</h2><div>{sw}</div><hr>{cards}")
    print(f"[extract] {path.name}: {len(items)} éléments, {len(parts_meta)} parties, "
          f"{len(palette)} couleurs -> {out}")
    return meta
