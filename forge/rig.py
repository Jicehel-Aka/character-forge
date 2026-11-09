"""forge rig : maillage statique en T-pose (FBX) + squelette Mixamo -> GLB skinné, accessoires (hache/bouclier) séparés et attachés aux mains,
clips Mixamo embarqués. Poids = plus proches voisins du maillage de référence (squelette Mixamo)."""
import base64, json, shutil
from pathlib import Path
from .meshy import Session


def cmd(a):
    s = Session(a.model, a.texture)
    try:
        shutil.copy(a.skeleton, s.tmp / "skel.fbx"); clips = []
        for k, c in enumerate(a.clips or []):
            nm = Path(c).stem.split("-", 1)[-1] if "-" in Path(c).stem else Path(c).stem
            shutil.copy(c, s.tmp / f"clip{k}.fbx"); clips.append({"name": nm, "url": f"clip{k}.fbx"})
        opt = dict(model=s.name, skeleton="skel.fbx", texture=("tex.png" if a.texture else None), noprops=getattr(a,"noprops",False), armDown=getattr(a,"arm_down",0), fit=getattr(a,"fit",False), clips=clips, knn=a.knn,
                   axe=json.loads(a.axe) if a.axe else None, shield=json.loads(a.shield) if a.shield else None, axeBone=a.axe_bone, shieldBone=a.shield_bone)
        res = s.page.evaluate("o => window.rig(o)", opt)
        Path(a.output).write_bytes(base64.b64decode(res.pop("glb")))
        print("[rig]", json.dumps(res), "->", a.output)
    finally:
        s.close()
    return 0
