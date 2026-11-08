"""Orchestrateur automatisable (pour un studio/IDE) : un seul appel, événements JSON, reprise après réponses.

  python -m forge job run manifest.json -o JOB [--decisions d.json] [--3d-cmd "CMD {input} {outdir}"] [--json]

Événements (une ligne JSON par événement avec --json) :
  {"type":"step","name":..,"status":"start|done|skip|fail","message":..}
  {"type":"question","id":..,"text":..,"options":[..]}      -> à poser à l'utilisateur
  {"type":"request","text":..}                               -> image complémentaire à demander
  {"type":"result","status":"done|needs_input|blocked","dir":..}
Codes de sortie : 0 terminé · 3 il manque des réponses (écrire decisions.json puis relancer) · 1 erreur.
Étapes : consolidation -> références -> GPU -> génération 3D (commande fournie, sinon scripts prêts) ->
turntable Blender (si Blender et maillage) -> sprites RGB565 (si frames).
Le lancement du générateur 3D est PARAMÉTRABLE (--3d-cmd) car l'appel sans écran de CharacterGen/TRELLIS
n'a pas été vérifié ; sans commande, l'étape produit les entrées et s'arrête proprement.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from . import gen3d, multiview


class Emitter:
    def __init__(self, as_json):
        self.j = as_json

    def __call__(self, **ev):
        if self.j:
            print(json.dumps(ev, ensure_ascii=False), flush=True)
        else:
            t = ev["type"]
            if t == "step":
                print(f"[{ev['status']:5s}] {ev['name']} {ev.get('message','')}", flush=True)
            elif t == "question":
                print(f"  ? {ev['text']}" + "".join(f"\n      - {o}" for o in ev.get("options", [])))
            elif t == "request":
                print(f"  + {ev['text']}")
            else:
                print(f"== {ev}")


def run(manifest_path, outdir, decisions_path=None, cmd3d=None, as_json=False, model="isnet-general-use"):
    emit = Emitter(as_json)
    outdir = Path(outdir); outdir.mkdir(parents=True, exist_ok=True)
    mp = Path(manifest_path)
    man = json.loads(mp.read_text())
    dec = json.loads(Path(decisions_path).read_text()) if decisions_path and Path(decisions_path).exists() else {}

    emit(type="step", name="consolidation", status="start")
    try:
        rep, _ = multiview.analyze(man, mp.parent, dec, model)
    except Exception as e:  # image illisible, rembg absent...
        emit(type="step", name="consolidation", status="fail", message=str(e))
        emit(type="result", status="error", dir=str(outdir)); return 1
    emit(type="step", name="consolidation", status="done", message=rep["status"])
    for r in rep["requests"]:
        emit(type="request", text=r)
    if rep["questions"]:
        for q in rep["questions"]:
            emit(type="question", **q)
        (outdir / "questions.json").write_text(json.dumps(rep["questions"], indent=2, ensure_ascii=False))
        emit(type="result", status="needs_input", dir=str(outdir)); return 3

    emit(type="step", name="references", status="start")
    rep = multiview.build(man, mp.parent, outdir, dec, model)
    used = [p for p in rep["plan"] if p.get("used")]
    emit(type="step", name="references", status="done", message=f"{len(used)} image(s) normalisée(s)")
    if not used:
        emit(type="result", status="blocked", dir=str(outdir)); return 3

    emit(type="step", name="gpu", status="done", message=gen3d.gpu_info())
    src = rep["3d_input"].get("charactergen_single")
    mesh_dir = outdir / "mesh"; mesh_dir.mkdir(exist_ok=True)
    if cmd3d and src:
        emit(type="step", name="3d", status="start", message=cmd3d)
        c = cmd3d.replace("{input}", str(outdir / src)).replace("{outdir}", str(mesh_dir))
        r = subprocess.run(c, shell=True)
        emit(type="step", name="3d", status="done" if r.returncode == 0 else "fail", message=f"code {r.returncode}")
        if r.returncode != 0:
            emit(type="result", status="error", dir=str(outdir)); return 1
    else:
        emit(type="step", name="3d", status="skip",
             message="pas de --3d-cmd : entrées prêtes dans refs/ (voir consolidation.json), lancer le générateur puis relancer")

    meshes = [p for p in mesh_dir.rglob("*") if p.suffix.lower() in (".glb", ".obj")]
    if meshes and (shutil.which("blender") or Path("blender").exists()):
        emit(type="step", name="turntable", status="start", message=meshes[0].name)
        from . import turntable
        try:
            turntable.render(meshes[0], outdir / "frames", 8, 128, None, 0)
            emit(type="step", name="turntable", status="done")
        except Exception as e:
            emit(type="step", name="turntable", status="fail", message=str(e))
    else:
        emit(type="step", name="turntable", status="skip", message="pas de maillage ou Blender introuvable")
    emit(type="result", status="done", dir=str(outdir))
    return 0
