"""Pont BVH : modèle appris -> BVH (rejouable par Animated Drawings / Blender) et BVH (mocap Mixamo, Quaternius...)
-> annotation de pose 2D pour `anim learn`.

Squelette écrit : noms Mixamo (Hips, Spine, Neck, Head, LeftArm...). Mouvement dans le plan de l'image seulement
(rotations autour de Z). NON vérifié : le chargement réel dans Animated Drawings (leurs fichiers de config n'ont pas
été lus) et l'écart exact avec un squelette Mixamo complet (Spine1/Spine2, clavicules, doigts)."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from . import anim

NODE_BONE = {"Spine": "neck", "Neck": "head", "LeftArm": "elbow_l", "LeftForeArm": "wrist_l",
             "RightArm": "elbow_r", "RightForeArm": "wrist_r", "LeftUpLeg": "knee_l", "LeftLeg": "ankle_l",
             "RightUpLeg": "knee_r", "RightLeg": "ankle_r"}
# nœud -> articulation de notre squelette (position)
NODE_JOINT = {"Hips": "pelvis", "Neck": "neck", "Head": "head", "LeftArm": "shoulder_l", "LeftForeArm": "elbow_l",
              "LeftHand": "wrist_l", "RightArm": "shoulder_r", "RightForeArm": "elbow_r", "RightHand": "wrist_r",
              "LeftUpLeg": "hip_l", "LeftLeg": "knee_l", "LeftFoot": "ankle_l", "RightUpLeg": "hip_r",
              "RightLeg": "knee_r", "RightFoot": "ankle_r"}


def _vec(L, angle_img):
    a = math.radians(angle_img)
    return (L * math.cos(a), -L * math.sin(a), 0.0)          # y image vers le bas -> y BVH vers le haut


def _tree(Lr, S):
    """(nom, parent, offset, a_une_rotation) dans l'ordre hiérarchique, en repos."""
    R = anim.REST; tor = _vec(Lr["neck"] * S, R["neck"]); add = lambda a, b: tuple(x + y for x, y in zip(a, b))
    T = [("Hips", None, (0, 0, 0)), ("Spine", "Hips", (0, 0, 0)), ("Neck", "Spine", tor),
         ("Head", "Neck", _vec(Lr["head"] * S, R["head"]))]
    for s, sd in (("Left", "l"), ("Right", "r")):
        sh = add(tor, _vec(Lr[f"shoulder_{sd}"] * S, R[f"shoulder_{sd}"]))
        T += [(f"{s}Arm", "Spine", sh), (f"{s}ForeArm", f"{s}Arm", _vec(Lr[f"elbow_{sd}"] * S, R[f"elbow_{sd}"])),
              (f"{s}Hand", f"{s}ForeArm", _vec(Lr[f"wrist_{sd}"] * S, R[f"wrist_{sd}"]))]
        T += [(f"{s}UpLeg", "Hips", _vec(Lr[f"hip_{sd}"] * S, R[f"hip_{sd}"])),
              (f"{s}Leg", f"{s}UpLeg", _vec(Lr[f"knee_{sd}"] * S, R[f"knee_{sd}"])),
              (f"{s}Foot", f"{s}Leg", _vec(Lr[f"ankle_{sd}"] * S, R[f"ankle_{sd}"]))]
    return T


def write_bvh(model, path, lengths_rel=None, height=100.0, fps=30, frames=None, prefix=""):
    Lr = lengths_rel or model["lengths_rel"]; S = height
    n = int(frames or model["n_frames"])
    A = anim._resample(model["angles"], n, model["periodic"]) if n != model["n_frames"] else np.array(model["angles"])
    Rt = anim._resample(model["root"], n, model["periodic"]) if n != model["n_frames"] else np.array(model["root"])
    T = _tree(Lr, S); kids = {}
    for nm, par, off in T:
        kids.setdefault(par, []).append((nm, off))
    bones = anim.BONES
    rest = {b: -anim.REST[b] for b in bones}                    # repos en repère BVH (y vers le haut)
    ch = [nm for nm, _, _ in T if nm in NODE_BONE]
    lines = ["HIERARCHY"]

    def emit(nm, off, depth):
        pad = "  " * depth
        is_root = depth == 0
        lines.append(f"{pad}{'ROOT' if is_root else 'JOINT'} {prefix}{nm}")
        lines.append(pad + "{")
        lines.append(f"{pad}  OFFSET {off[0]:.5f} {off[1]:.5f} {off[2]:.5f}")
        if is_root:
            lines.append(f"{pad}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation")
        else:
            lines.append(f"{pad}  CHANNELS 3 Zrotation Xrotation Yrotation")
        for cnm, coff in kids.get(nm, []):
            emit(cnm, coff, depth + 1)
        if nm in ("Hand_", ) or not kids.get(nm):
            lines.append(f"{pad}  End Site")
            lines.append(pad + "  {")
            lines.append(f"{pad}    OFFSET 0.00000 0.00000 0.00000")
            lines.append(pad + "  }")
        lines.append(pad + "}")
    emit("Hips", (0, 0, 0), 0)
    order = []
    def walk(nm):
        order.append(nm)
        for c, _ in kids.get(nm, []):
            walk(c)
    walk("Hips")
    par = {nm: p for nm, p, _ in T}
    lines += ["MOTION", f"Frames: {n}", f"Frame Time: {1.0 / fps:.6f}"]
    for i in range(n):
        delta = {}                                               # rotation Z locale par nœud
        acc = {}                                                 # rotation cumulée des parents
        vals = [Rt[i][0] * S, -Rt[i][1] * S, 0.0, 0.0, 0.0, 0.0]
        for nm in order[1:]:
            p = par[nm]; pa = acc.get(p, 0.0)
            if nm in NODE_BONE:
                b = NODE_BONE[nm]; absd = -A[i][bones.index(b)] - rest[b]
                loc = ((absd - pa + 180) % 360) - 180
                delta[nm] = loc; acc[nm] = pa + loc
            else:
                delta[nm] = 0.0; acc[nm] = pa
            vals += [delta[nm], 0.0, 0.0]
        lines.append(" ".join(f"{v:.5f}" for v in vals))
    Path(path).write_text("\n".join(lines) + "\n")
    return path


def read_bvh(path):
    """-> (noms, fps, positions[frames][nom] = (x, y, z)) par cinématique directe."""
    txt = Path(path).read_text().replace("\r", "").split("\n")
    nodes, stack, i = [], [], 0
    while i < len(txt):
        t = txt[i].split()
        if t and t[0] in ("ROOT", "JOINT"):
            nodes.append({"name": t[1].split(":")[-1], "parent": stack[-1] if stack else None, "off": None, "ch": []})
            stack.append(len(nodes) - 1)
        elif t and t[0] == "End":
            stack.append(-1)
        elif t and t[0] == "OFFSET" and stack and stack[-1] >= 0:
            nodes[stack[-1]]["off"] = np.array(list(map(float, t[1:4])))
        elif t and t[0] == "CHANNELS" and stack and stack[-1] >= 0:
            nodes[stack[-1]]["ch"] = t[2:]
        elif t == ["}"]:
            stack.pop()
        elif t and t[0] == "MOTION":
            i += 1; break
        i += 1
    nfr = int(txt[i].split()[1]); dt = float(txt[i + 1].split()[2]); rows = [list(map(float, l.split())) for l in txt[i + 2:i + 2 + nfr] if l.strip()]
    def rot(ax, d):
        c, s = math.cos(math.radians(d)), math.sin(math.radians(d))
        return {"X": np.array([[1, 0, 0], [0, c, -s], [0, s, c]]), "Y": np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
                "Z": np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[ax]
    out = []
    for row in rows:
        k = 0; W = {}; Rw = {}
        for idx, nd in enumerate(nodes):
            pos = np.zeros(3); R = np.eye(3)
            for c in nd["ch"]:
                v = row[k]; k += 1
                if c.endswith("position"):
                    pos["XYZ".index(c[0])] += v
                else:
                    R = R @ rot(c[0], v)
            if nd["parent"] is None:
                W[idx] = nd["off"] + pos; Rw[idx] = R
            else:
                p = nd["parent"]; W[idx] = W[p] + Rw[p] @ nd["off"]; Rw[idx] = Rw[p] @ R
        out.append({nodes[i]["name"]: W[i] for i in W})
    return [n["name"] for n in nodes], 1.0 / dt if dt else 30.0, out


def to_annotation(path, forward="x", flip=False, loop=False, scale=100.0, node_map=None, stride=1):
    """BVH -> annotation 2D de profil (x = avant, y = bas) prête pour `anim learn`."""
    names, fps, frames = read_bvh(path)
    nm = node_map or NODE_JOINT
    alias = {"HeadTop_End": "Head"} if "HeadTop_End" in names else {}
    out = []
    for fr in frames[::stride]:
        f = {}
        if forward == "auto":   # de profil par rapport au corps (hanches), sur chaque image : pas de dérive de cap
            up = np.array([0.0, 1.0, 0.0]); hv = np.array(fr["LeftUpLeg"]) - np.array(fr["RightUpLeg"]); hv[1] = 0
            fwd = np.cross(hv, up); fwd /= (np.linalg.norm(fwd) or 1.0); root = np.array(fr["Hips"])
            for node, joint in nm.items():
                src = "HeadTop_End" if (node == "Head" and "HeadTop_End" in fr) else node
                if src in fr:
                    p = np.array(fr[src]); f[joint] = [float(np.dot(p - root, fwd)) * (-1 if flip else 1), float(-p[1])]
            out.append(f); continue
        for node, joint in nm.items():
            src = "HeadTop_End" if (node == "Head" and "HeadTop_End" in fr) else node
            if src not in fr:
                continue
            p = fr[src]; x = p["xyz".index(forward)] * (-1 if flip else 1)
            f[joint] = [float(x), float(-p[1])]
        out.append(f)
    return {"facing": "right", "loop": loop, "fps": fps / stride, "frames": out}
