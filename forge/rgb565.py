"""Conversion RGB565 / BGR565 (little-endian par défaut) + export en header C.

Convention commune avec docs/modele.html (même résultat octet pour octet) :
 - clé de transparence 0xF81F (magenta RGB565) : valeur 16 bits d'un pixel transparent dans le format choisi ;
 - un pixel OPAQUE dont la valeur égale la clé est décalé d'un cran de bleu (valeur ^ 1), sinon il serait pris pour transparent ;
 - l'échange d'octets (big-endian) s'applique à tout, clé comprise.
(src/utils/rgb565.ts de l'application React remplit le transparent en NOIR par défaut : divergence connue, à aligner côté React.)
"""
import numpy as np
from PIL import Image

TRANSPARENT_KEY = 0xF81F  # magenta en RGB565


def _words(img: Image.Image, bgr: bool, key: int) -> np.ndarray:
    a = np.asarray(img.convert("RGBA")).astype(np.uint16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    if bgr:
        r, b = b, r
    v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
    v = np.where((al >= 128) & (v == key), v ^ 1, v)
    return np.where(al < 128, key, v).astype(np.uint16)


def to_rgb565(img: Image.Image, little_endian: bool = True, bgr: bool = False, key: int = TRANSPARENT_KEY) -> bytes:
    return _words(img, bgr, key).astype("<u2" if little_endian else ">u2").tobytes()


def to_c_header(name: str, img: Image.Image, little_endian: bool = True, bgr: bool = False, key: int = TRANSPARENT_KEY) -> str:
    raw = to_rgb565(img, little_endian, bgr, key)
    dt = "<u2" if little_endian else ">u2"
    words = np.frombuffer(raw, dtype=dt)
    stored_key = key if little_endian else ((key & 255) << 8) | (key >> 8)   # valeur telle qu'écrite dans le tableau
    w, h = img.size
    lines = []
    for i in range(0, len(words), 12):
        lines.append("    " + ", ".join("0x%04X" % x for x in words[i:i + 12]) + ",")
    return (
        f"// {name}: {w}x{h}, {'BGR565' if bgr else 'RGB565'} {'LE' if little_endian else 'BE'}, "
        f"transparence = 0x{stored_key:04X}\n"
        f"#pragma once\n#include <stdint.h>\n"
        f"#define {name.upper()}_W {w}\n#define {name.upper()}_H {h}\n"
        f"static const uint16_t {name}[{w * h}] = {{\n" + "\n".join(lines) + "\n};\n"
    )
