"""Assemblage de sprites en spritesheet à grille régulière."""
from PIL import Image


def build_spritesheet(crops, columns=8, bottom_align=True):
    """crops: liste d'Image RGBA. Retourne (sheet, meta)."""
    if not crops:
        return None, {}
    cw = max(c.width for c in crops)
    ch = max(c.height for c in crops)
    cols = min(columns, len(crops))
    rows = (len(crops) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cw, rows * ch), (0, 0, 0, 0))
    frames = []
    for i, c in enumerate(crops):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        ox = cx + (cw - c.width) // 2
        oy = cy + (ch - c.height if bottom_align else (ch - c.height) // 2)
        sheet.paste(c, (ox, oy))
        frames.append({"index": i, "cell": [cx, cy, cw, ch], "sprite": [ox, oy, c.width, c.height]})
    return sheet, {"cell_w": cw, "cell_h": ch, "columns": cols, "rows": rows, "frames": frames}
