"""Conversion RGB565 (little-endian par défaut) + export en header C."""
import numpy as np
from PIL import Image

TRANSPARENT_KEY = 0xF81F  # magenta en RGB565


def to_rgb565(img: Image.Image, little_endian: bool = True) -> bytes:
    a = np.asarray(img.convert("RGBA")).astype(np.uint16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
    v = np.where(al < 128, TRANSPARENT_KEY, v).astype("<u2" if little_endian else ">u2")
    return v.tobytes()


def to_c_header(name: str, img: Image.Image, little_endian: bool = True) -> str:
    raw = to_rgb565(img, little_endian)
    dt = "<u2" if little_endian else ">u2"
    words = np.frombuffer(raw, dtype=dt)
    w, h = img.size
    lines = []
    for i in range(0, len(words), 12):
        lines.append("    " + ", ".join("0x%04X" % x for x in words[i:i + 12]) + ",")
    return (
        f"// {name}: {w}x{h}, RGB565 {'LE' if little_endian else 'BE'}, "
        f"transparence = 0x{TRANSPARENT_KEY:04X}\n"
        f"#pragma once\n#include <stdint.h>\n"
        f"#define {name.upper()}_W {w}\n#define {name.upper()}_H {h}\n"
        f"static const uint16_t {name}[{w * h}] = {{\n" + "\n".join(lines) + "\n};\n"
    )
