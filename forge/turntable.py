"""Étape 5 : rendu turntable via Blender en ligne de commande."""
import glob
import shutil
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).parent / "blender" / "render_turntable.py"


def find_blender(explicit: str = None):
    if explicit:
        return explicit
    exe = shutil.which("blender")
    if exe:
        return exe
    for pat in (r"C:\Program Files\Blender Foundation\Blender*\blender.exe",
                "/usr/bin/blender", "/Applications/Blender.app/Contents/MacOS/Blender"):
        hits = sorted(glob.glob(pat))
        if hits:
            return hits[-1]
    return None


def render(mesh: Path, out_dir: Path, angles: int = 8, size: int = 128, blender: str = None,
           frame_step: int = 0) -> Path:
    exe = find_blender(blender)
    if not exe:
        raise SystemExit("Blender introuvable : l'installer ou passer --blender CHEMIN")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [exe, "-b", "--python", str(SCRIPT), "--", str(Path(mesh).resolve()), str(out_dir.resolve()),
           str(angles), str(size), str(frame_step)]
    print("[turntable]", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print(f"[turntable] {angles} vues dans {out_dir}")
    return out_dir
