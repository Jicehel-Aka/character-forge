"""Détourage du personnage par modèle IA (rembg) + alpha durci pour sprites."""
import numpy as np
from PIL import Image

_sessions = {}


def segment(img: Image.Image, model: str = "isnet-general-use", alpha_thr: int = 128) -> Image.Image:
    from rembg import remove, new_session
    if model not in _sessions:
        _sessions[model] = new_session(model)
    out = remove(img.convert("RGB"), session=_sessions[model]).convert("RGBA")
    a = np.asarray(out).copy()
    a[..., 3] = np.where(a[..., 3] >= alpha_thr, 255, 0)  # bord net, pas de halo
    return Image.fromarray(a, "RGBA")
