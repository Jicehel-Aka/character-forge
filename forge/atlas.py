"""Export moteur d'une animation : atlas aligné + JSON compatible Aseprite + manifest (FPS, boucle, pivot des pieds).
Idées reprises de PerfectPixel Studio (MIT) : centrage sur le centre de masse alpha, pivot aux pieds, manifest par
animation, aperçu GIF. Le format JSON est le format « hash » d'Aseprite (frames, meta, frameTags)."""
import json
from pathlib import Path

import numpy as np
from PIL import Image


def _com_x(im):
    a = np.asarray(im.getchannel("A")).astype(float)
    if a.sum() == 0:
        return im.width / 2
    return float((a.sum(0) * np.arange(im.width)).sum() / a.sum())


def export(frames_dir, out, name="anim", fps=12, loop=True, columns=0, as_array=False):
    files = sorted(Path(frames_dir).glob("*.png"))
    ims = []
    for f in files:
        im = Image.open(f).convert("RGBA"); bb = im.getchannel("A").getbbox()
        if bb:
            ims.append((f.stem, im.crop(bb)))
    if not ims:
        raise ValueError("aucune image avec un premier plan")
    cw = max(2 * max(_com_x(i), i.width - _com_x(i)) for _, i in ims); cw = int(np.ceil(cw)) + 2
    ch = max(i.height for _, i in ims) + 2
    cols = columns or len(ims); rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0)); fr = {}; gif = []
    for k, (n, im) in enumerate(ims):
        cell = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        x = int(round(cw / 2 - _com_x(im))); y = ch - 1 - im.height     # pieds sur la dernière ligne, centre de masse centré
        cell.alpha_composite(im, (x, y))
        ox, oy = (k % cols) * cw, (k // cols) * ch
        sheet.alpha_composite(cell, (ox, oy)); gif.append(cell)
        fr[f"{name}_{k:03d}"] = {"frame": {"x": ox, "y": oy, "w": cw, "h": ch}, "rotated": False, "trimmed": False,
                                  "spriteSourceSize": {"x": 0, "y": 0, "w": cw, "h": ch}, "sourceSize": {"w": cw, "h": ch},
                                  "duration": int(round(1000 / fps))}
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    sheet.save(out / f"{name}.png")
    meta = {"app": "character-forge", "version": "1", "image": f"{name}.png", "format": "RGBA8888",
            "size": {"w": sheet.width, "h": sheet.height}, "scale": "1",
            "frameTags": [{"name": name, "from": 0, "to": len(ims) - 1, "direction": "forward"}],
            "layers": [{"name": "Layer", "opacity": 255, "blendMode": "normal"}], "slices": []}
    frames_out = [dict(filename=k, **v) for k, v in fr.items()] if as_array else fr   # json-array ou json-hash (Aseprite)
    (out / f"{name}.json").write_text(json.dumps({"frames": frames_out, "meta": meta}, indent=1))
    (out / "manifest.json").write_text(json.dumps({name: {"frames": len(ims), "fps": fps, "loop": loop, "cell": [cw, ch],
                                                       "pivot": [cw / 2, ch - 1], "pivot_note": "pieds, centre de masse"}}, indent=1))
    pal = []
    for c in gif:  # aperçu GIF à fond transparent
        bg = Image.new("RGBA", c.size, (255, 0, 255, 255)); bg.alpha_composite(c); pal.append(bg.convert("RGB"))
    pal[0].save(out / f"{name}.gif", save_all=True, append_images=pal[1:], duration=int(1000 / fps), loop=0 if loop else 1)
    return {"frames": len(ims), "cell": [cw, ch]}
