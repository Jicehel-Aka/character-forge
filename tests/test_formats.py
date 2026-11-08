"""Contrôles de format sans dépendance de test : python tests/test_formats.py
 - atlas : JSON Aseprite conforme aux champs requis (types de aseprite-atlas : frame, rotated, trimmed,
   spriteSourceSize, sourceSize, duration ; meta : app, version, image, format, size, scale, frameTags, slices)
 - COCO : fichier COCO complet (categories.keypoints, annotations [x,y,v]) et liste simple de 17 points."""
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from PIL import Image
from forge import atlas, pose_import, anim

def check_aseprite(d):
    for k in ("app", "version", "image", "format", "size", "scale", "frameTags", "slices"):
        assert k in d["meta"], f"meta.{k} manquant"
    fr = d["frames"].values() if isinstance(d["frames"], dict) else d["frames"]
    for f in fr:
        for k in ("frame", "rotated", "trimmed", "spriteSourceSize", "sourceSize", "duration"):
            assert k in f, f"frame.{k} manquant"
    for t in d["meta"]["frameTags"]:
        assert t["direction"] in ("forward", "reverse", "pingpong") and t["from"] <= t["to"]

with tempfile.TemporaryDirectory() as t:
    t = Path(t); (t / "f").mkdir()
    for i in range(4):
        im = Image.new("RGBA", (20 + i, 30), (0, 0, 0, 0)); im.paste((200, 50, 50, 255), (5, 5, 15, 29)); im.save(t / "f" / f"{i}.png")
    for arr in (False, True):
        atlas.export(t / "f", t / f"o{arr}", "w", 8, True, as_array=arr)
        check_aseprite(json.loads((t / f"o{arr}" / "w.json").read_text()))
print("aseprite : OK (hash et tableau)")

names = ["nose", "left_eye", "right_eye", "left_ear", "right_ear", "left_shoulder", "right_shoulder", "left_elbow",
         "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"]
pts = [(50, 10), (48, 8), (52, 8), (46, 10), (54, 10), (40, 30), (60, 30), (35, 45), (65, 45), (30, 60), (70, 60), (43, 70), (57, 70), (40, 90), (60, 90), (40, 110), (60, 110)]
coco = {"categories": [{"id": 1, "name": "person", "keypoints": names}],
        "images": [{"id": i, "file_name": f"frame_{i:03d}.png"} for i in range(3)],
        "annotations": [{"id": i, "image_id": i, "category_id": 1, "keypoints": [v for (x, y) in pts for v in (x + i, y, 2)], "num_keypoints": 17} for i in range(3)]}
ann = pose_import.from_coco_file(coco)
assert len(ann["frames"]) == 3 and anim.validate_annotation(ann) == [], anim.validate_annotation(ann)
print("coco complet : OK ->", len(ann["frames"]), "images,", len(anim.JOINTS), "articulations")
