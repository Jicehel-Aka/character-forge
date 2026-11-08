"""Étape 4 : préparation de la génération 3D avec CharacterGen (à lancer sur un PC avec GPU).

Ce module ne génère rien lui-même : il prépare l'image d'entrée et écrit les scripts de lancement.
Le README de CharacterGen ne documente qu'une interface web (webui.py), pas de ligne de commande."""
import shutil
import subprocess
from pathlib import Path

from PIL import Image

REPO = "https://github.com/zjp-shadow/CharacterGen"  # dépôt amont indiqué par le README du fork JimikoSK

BAT = f"""@echo off
REM Lance CharacterGen (Python 3.9 conseillé par le README). Exécuter depuis ce dossier.
if not exist CharacterGen git clone {REPO}
cd CharacterGen
if not exist .venv python -m venv .venv
call .venv\\Scripts\\activate.bat
pip install -r requirements.txt
REM Les poids se téléchargent depuis Hugging Face (zjpshadow/CharacterGen) au premier lancement.
python webui.py
REM Dans l'interface : charger ..\\charactergen_input.png (décocher Remove Background), générer les 4 vues
REM puis le mesh. Récupérer output.glb dans 3D_Stage\\outputs\\@date-heure\\ et le copier dans ..\\mesh\\
"""

SH = f"""#!/usr/bin/env bash
# Lance CharacterGen (Python 3.9 conseillé par le README). Exécuter depuis ce dossier.
set -e
[ -d CharacterGen ] || git clone {REPO}
cd CharacterGen
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python webui.py
# Dans l'interface : charger ../charactergen_input.png (décocher Remove Background), générer les 4 vues puis le mesh.
# Récupérer output.glb dans 3D_Stage/outputs/@date-heure/ et le copier dans ../mesh/
"""


def gpu_info() -> str:
    exe = shutil.which("nvidia-smi")
    if not exe:
        return "nvidia-smi introuvable : pas de GPU NVIDIA détecté sur cette machine"
    try:
        r = subprocess.run([exe, "--query-gpu=name,memory.total", "--format=csv,noheader"],
                           capture_output=True, text=True, timeout=15)
        return r.stdout.strip() or r.stderr.strip()
    except Exception as ex:  # pragma: no cover
        return f"nvidia-smi a échoué : {ex}"


def prepare(extract_dir: Path, size: int = 512) -> Path:
    extract_dir = Path(extract_dir)
    cut = Image.open(extract_dir / "cutout.png").convert("RGBA")
    bb = cut.getchannel("A").getbbox()
    if not bb:
        raise SystemExit("cutout.png est vide : relancer l'extraction avec --segment")
    crop = cut.crop(bb)
    ratio = crop.height / crop.width
    # Même préparation que l'app CharacterGen : bbox du personnage, centré sur un canevas 2:3
    # (512x768), fond transparent (l'interface attend une image « sans fond »).
    W, H = size, size * 3 // 2
    k = min(W / crop.width, H / crop.height) * 0.95
    crop = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.LANCZOS)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(crop, ((W - crop.width) // 2, (H - crop.height) // 2), crop)
    (extract_dir / "mesh").mkdir(exist_ok=True)
    out = extract_dir / "charactergen_input.png"
    canvas.save(out)
    (extract_dir / "run_charactergen.bat").write_bytes(BAT.replace("\n", "\r\n").encode("utf-8"))
    (extract_dir / "run_charactergen.sh").write_text(SH)
    print(f"[3d] entrée préparée : {out} ({W}x{H}, RGBA, fond transparent)")
    print(f"[3d] GPU : {gpu_info()}")
    if ratio < 1.3:
        print("[3d] ATTENTION : le personnage découpé est un plan buste/taille "
              f"(hauteur/largeur = {ratio:.2f}). CharacterGen est entraîné sur des personnages complets en "
              "style anime (VRoid) : résultat incertain, à tester (rien ne l'interdit dans l'article).")
    print("[3d] dans l'interface : décocher « Remove Background » (déjà détouré). Sortie attendue : "
          "3D_Stage/outputs/@date-heure/output.glb et output.obj (couleurs par sommet), A-pose, sans squelette.")
    print(f"[3d] scripts écrits : run_charactergen.bat / .sh dans {extract_dir}")
    return out
