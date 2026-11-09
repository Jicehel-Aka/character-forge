"""forge clips : ajoute des animations (FBX Mixamo, ou animation apprise `forge anim learn` -> BVH) à un GLB déjà rigué.
Le maillage, les poids et les accessoires (attachés aux os) sont conservés : le GLB reste la source de vérité."""
import base64, json, tempfile
from pathlib import Path
from .meshy import Session


def cmd(a):
    s = Session(a.model)
    try:
        clips = []; k = 0
        for c in (a.fbx or []):
            nm = Path(c).stem.split("-", 1)[-1]; import shutil; shutil.copy(c, s.tmp / f"c{k}.fbx"); clips.append({"name": nm, "url": f"c{k}.fbx", "kind": "fbx"}); k += 1
        leg = 77.0
        for c in (a.learned or []):
            from . import bvh
            m = json.loads(Path(c).read_text()); nm = a.name or m.get("type") or Path(c).stem
            bvh.write_bvh(m, s.tmp / f"c{k}.bvh", frames=m["n_frames"], height=100.0, fps=a.fps)
            Lr = m["lengths_rel"]; leg = 100.0 * (Lr["knee_l"] + Lr["ankle_l"])
            clips.append({"name": nm, "url": f"c{k}.bvh", "kind": "bvh", "sign": a.sign}); k += 1
        res = s.page.evaluate("o => window.addClips(o)", dict(model=s.name, clips=clips, k=1.0))
        Path(a.output).write_bytes(base64.b64decode(res.pop("glb"))); print("[clips]", json.dumps(res), "->", a.output)
    finally:
        s.close()
    return 0
