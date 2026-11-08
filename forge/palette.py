"""Extraction de palette (median cut via Pillow)."""
from PIL import Image


def extract_palette(img: Image.Image, n_colors: int = 16, mask=None):
    """Retourne la liste des couleurs dominantes ['#RRGGBB', ...], triées par fréquence."""
    rgba = img.convert("RGBA")
    # On ignore les pixels transparents et, si fourni, le fond (mask = premier plan)
    px = list(rgba.getdata())
    if mask is not None:
        flat = mask.reshape(-1)
        opaque = [p[:3] for p, m in zip(px, flat) if m and p[3] > 127]
    else:
        opaque = [p[:3] for p in px if p[3] > 127]
    if not opaque:
        return []
    tmp = Image.new("RGB", (len(opaque), 1))  # pas de pixels de remplissage
    tmp.putdata(opaque)
    q = tmp.quantize(colors=n_colors, method=Image.MEDIANCUT)
    pal = q.getpalette()[: n_colors * 3]
    counts = sorted(q.getcolors() or [], reverse=True)  # uniquement les index utilisés
    out = []
    for _, idx in counts:
        r, g, b = pal[idx * 3: idx * 3 + 3]
        out.append("#%02X%02X%02X" % (r, g, b))
    return out
