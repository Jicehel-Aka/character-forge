"""forge/rgb565.py : RGB565 / BGR565, little/big endian, clé de transparence configurable, collision clé/pixel opaque.
Même convention que docs/modele.html (voir tests/ui_sprites_export.py). Test : python3 tests/test_rgb565.py"""
import struct, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from PIL import Image
from forge.rgb565 import to_rgb565, to_c_header, TRANSPARENT_KEY

im = Image.new("RGBA", (4, 1))
im.putdata([(255, 0, 0, 255), (0, 0, 255, 255), (255, 0, 255, 255), (9, 9, 9, 0)])   # rouge, bleu, magenta OPAQUE, transparent

def words(raw, le):
    return struct.unpack(("<" if le else ">") + "4H", raw)

le = words(to_rgb565(im), True)
assert le[0] == 0xF800 and le[1] == 0x001F, le                       # RGB565 : rouge puis bleu
assert le[3] == TRANSPARENT_KEY == 0xF81F                           # transparent = clé
assert le[2] == 0xF81E, "magenta opaque = clé : doit être décalé (sinon il serait transparent)"
be = words(to_rgb565(im, little_endian=False), False)
assert be == le, "big-endian : mêmes valeurs, octets échangés"
assert to_rgb565(im, True) == b"".join(struct.pack("<H", v) for v in le)
assert to_rgb565(im, False) == b"".join(struct.pack(">H", v) for v in le)
bgr = words(to_rgb565(im, bgr=True), True)
assert bgr[0] == 0x001F and bgr[1] == 0xF800, bgr                    # BGR565 : rouge et bleu permutés
assert bgr[3] == 0xF81F
key = words(to_rgb565(im, key=0x0000), True)
assert key[3] == 0x0000 and key[0] == 0xF800, key
h = to_c_header("spr", im, little_endian=False, key=0x1234)
assert "BE" in h and "transparence = 0x3412" in h and "0x3412" in h, h   # clé écrite telle que stockée (octets échangés)
assert "BGR565" in to_c_header("spr", im, bgr=True)
print("rgb565.py : RGB565/BGR565, LE/BE, clé configurable, collision clé -> OK")
