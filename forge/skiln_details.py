"""Couche « détails » de la tenue, au-dessus de l'ossature SpriteKiln : pièces SDF qui manquent aux kits.
karate : kimono (revers en V, torse nu dans l'ouverture, manches courtes, avant-bras nus), ceinture nouée (nœud + deux pans),
bandeau (anneau + nœud + deux rubans qui flottent derrière), gants sans doigts (paume, manchette, doigts), oreilles, nez."""
import yaml


def _lighter(h, k=0.5):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return "#%02x%02x%02x" % tuple(int(x + (255 - x) * k) for x in c)


def karate(spec, col, extra, ramps_out, outdir, name, size):
    from .skiln_char import ramp
    ramps = dict(ramps_out); ramps["collar"] = ramp(_lighter(col.get("cloth", "#dfe6f4"), 0.35), hi=0.3)
    ramps["cuff"] = ramp(_lighter(col.get("gloves", "#2f5fc4"), 0.35))
    ramps["belt_k"] = ramp(col.get("leather", "#1c1c22"), hi=0.9)
    (outdir / f"{name}_palette.yaml").write_text(yaml.safe_dump({"ramps": ramps}, sort_keys=False))
    ramps["ink2"] = ["#0b0b10", "#14141c", "#1c1c28", "#262634", "#303044", "#3a3a52"]
    (outdir / f"{name}_palette.yaml").write_text(yaml.safe_dump({"ramps": ramps}, sort_keys=False))
    m = spec["materials"]; m["ink"] = {"ramp": "ink2", "emissive": True, "band": 0, "outline": False}; m["collar"] = {"ramp": "collar"}; m["cuff"] = {"ramp": "cuff"}; m["belt_k"] = {"ramp": "belt_k"}
    # --- chaussures blanches à semelle noire
    ramps["shoe"] = ramp(col.get("shoes", "#e8ecf4"), hi=0.3); ramps["sole"] = ramp("#202028", hi=0.9)
    (outdir / f"{name}_palette.yaml").write_text(yaml.safe_dump({"ramps": ramps}, sort_keys=False))
    m["boots"] = {"ramp": "shoe"}; m["sole"] = {"ramp": "sole"}
    spec.setdefault("parts", {})["boot_L"] = {"material": "boots"}
    extra["sole_L"] = {"material": "sole", "space": "sole_L", "blend": 0.01, "prims": [{"ellipsoid": {"c": [0, -0.075, 0.05], "r": [0.068, 0.016, 0.118]}}]}
    # --- visage : nez et oreilles du kit head
    for u in spec["use"]:
        if u.get("kit") == "head": u["with"].update({"nose": 0.7, "ears": 1})
    # --- kimono : revers en V sur la poitrine (torse nu dans l'ouverture)
    extra["chest_v"] = {"material": "skin", "space": "pelvis", "prims": [{"ellipsoid": {"c": [0, 0.5, 0.125], "r": [0.06, 0.12, 0.04]}}]}
    extra["lapel_a"] = {"material": "collar", "space": "pelvis", "prims": [{"cone": {"a": [0.085, 0.64, 0.085], "b": [-0.03, 0.16, 0.145], "r": [0.032, 0.024]}}]}
    extra["lapel_b"] = {"material": "collar", "space": "pelvis", "priority": 2, "prims": [{"cone": {"a": [-0.085, 0.64, 0.085], "b": [0.05, 0.16, 0.15], "r": [0.032, 0.024]}}]}
    extra["collar_back"] = {"material": "collar", "space": "pelvis", "prims": [{"cylinder": {"a": [0, 0.60, -0.02], "b": [0, 0.66, -0.02], "r": 0.1, "round": 0.01}}]}
    # manches courtes : le haut du bras seul reste en tissu, l'avant-bras est nu
    spec["parts"] = spec.get("parts", {})
    spec["parts"]["arm_L"] = {"prims": [{"sphere": {"c": "@shoulder_L", "r": 0.095}}, {"cone": {"a": "@shoulder_L", "b": "@elbow_L", "r": [0.085, 0.072]}}]}
    extra["forearm_L"] = {"material": "skin", "blend": 0.03, "prims": [{"cone": {"a": "@elbow_L", "b": "@wrist_L", "r": [0.062, 0.05]}}]}
    extra["sleeve_hem_L"] = {"material": "collar", "prims": [{"cone": {"a": "@shoulder_L", "b": "@elbow_L", "r": [0.0, 0.0]}}]}
    del extra["sleeve_hem_L"]
    # --- ceinture nouée : nœud sur le devant, deux pans
    extra["knot"] = {"material": "belt_k", "space": "pelvis", "priority": 2, "prims": [{"ellipsoid": {"c": [0.03, 0.115, 0.205], "r": [0.055, 0.045, 0.04]}}]}
    extra["tail_a"] = {"material": "belt_k", "space": "pelvis", "prims": [{"cone": {"a": [0.03, 0.10, 0.215], "b": [0.09, -0.16, 0.225], "r": [0.03, 0.022], "elongate": [0.01, 0, 0]}}]}
    extra["tail_b"] = {"material": "belt_k", "space": "pelvis", "prims": [{"cone": {"a": [0.02, 0.10, 0.215], "b": [-0.03, -0.20, 0.225], "r": [0.03, 0.02], "elongate": [0.01, 0, 0]}}]}
    # --- bandeau : anneau, nœud derrière, deux rubans
    extra["headband"] = {"material": "headband", "space": "head", "prims": [{"cylinder": {"a": [0, 0.232, -0.005], "b": [0, 0.278, -0.005], "r": 0.145, "round": 0.004}}]}
    extra.pop("headband_tail", None)
    extra["hb_knot"] = {"material": "headband", "space": "head", "priority": 2, "prims": [{"ellipsoid": {"c": [0.02, 0.24, -0.15], "r": [0.04, 0.035, 0.03]}}]}
    extra["hb_ribbon_a"] = {"material": "headband", "space": "head", "prims": [{"cone": {"a": [0.03, 0.24, -0.155], "b": [0.14, 0.01, -0.22], "r": [0.026, 0.015], "elongate": [0.012, 0, 0]}}]}
    extra["hb_ribbon_b"] = {"material": "headband", "space": "head", "prims": [{"cone": {"a": [0.01, 0.24, -0.155], "b": [0.04, -0.03, -0.27], "r": [0.026, 0.014], "elongate": [0.012, 0, 0]}}]}
    # --- gants sans doigts : paume bleue, manchette plus claire, doigts nus
    extra["glove_L"] = {"material": "gloves", "space": "wrist_L", "blend": 0.02, "prims": [
        {"ellipsoid": {"c": [0, 0, 0.06], "r": [0.066, 0.052, 0.075]}}]}
    extra["cuff_L"] = {"material": "cuff", "space": "wrist_L", "prims": [{"cylinder": {"a": [0, 0, -0.085], "b": [0, 0, -0.01], "r": 0.066, "round": 0.008}}]}
    extra["fingers_L"] = {"material": "skin", "space": "wrist_L", "blend": 0.01, "prims": [
        {"ellipsoid": {"c": [dx, 0.004, 0.14], "r": [0.0155, 0.015, 0.032]}} for dx in (-0.042, -0.014, 0.014, 0.042)]}
