"""forge bank : banque de personnages (manifeste JSON) + greffe de tête entre personnages.
  forge bank list
  forge bank render NOM [--head AUTRE] [--frames N] [--size 64] [-o dossier]   # NOM = corps (et animation), AUTRE = tête greffée"""
import json, subprocess, sys
from pathlib import Path

DEFAULT = Path(__file__).resolve().parent.parent / "exemple" / "bank.json"


def load(path=None):
    b = json.loads(Path(path or DEFAULT).read_text()); b["root"] = Path(b["root"]); return b


def _args(bank, name):
    c = bank["characters"][name]; r = bank["root"]
    return c, str(r / c["model"]), (str(r / c["texdir"]) if c.get("texdir") else None)


def cmd(a):
    bank = load(a.bank)
    if a.action == "list":
        for n, c in bank["characters"].items():
            print(f"{n:14} {'rig' if c.get('rig', True) else 'statique':9} clip={c.get('clip', '-')}  {c['model']}")
        return 0
    c, model, tex = _args(bank, a.name)
    out = a.output or f"bank_{a.name}" + (f"_tete_{a.head}" if a.head else "")
    cmd_ = [sys.executable, "-m", "forge", "meshy", model, "--size", str(a.size), "--dirs", a.dirs, "--frames", str(a.frames), "-o", out]
    if c.get("clip"): cmd_ += ["--anim", c["clip"]]
    if c.get("tmax"): cmd_ += ["--tmax", str(c["tmax"])]
    if tex: cmd_ += ["--texdir", tex]
    if c.get("texture"): cmd_ += ["--texture", str(bank["root"] / c["texture"])]
    if a.head:
        d, dmodel, dtex = _args(bank, a.head); cmd_ += ["--donor", dmodel, "--donor-yaw", str(d.get("head_yaw", 0))]
        if dtex: cmd_ += ["--donor-texdir", dtex]
    import os
    env = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parent.parent) + os.pathsep + os.environ.get("PYTHONPATH", ""))
    return subprocess.run(cmd_, env=env).returncode
