"""Consolider PLUSIEURS photos d'un même personnage en un jeu de références pour la 3D.

Flux :  consolidate analyze  -> rapport : vues présentes/manquantes, conflits entre images, QUESTIONS
        (tu réponds dans decisions.json, ou tu ajoutes des images, puis tu relances)
        consolidate build    -> jeu de références normalisé (même échelle, canevas 512x768 transparent),
                                tenue fusionnée validée par gear, plan d'entrée pour le générateur 3D.

Manifeste (JSON) :
{ "name": "Gorak",
  "images": { "a.png": {"view":"front","head_px":215,"attrs":{"helmet":"none","skin":"vert foncé"}},
              "b.png": {"view":"back"}, ... } }
  view : front | back | left | right | three_quarter | face | unknown
  head_px : hauteur de tête en pixels si connue (sinon estimée ≈ bbox/7,5 si corps entier)
  attrs : ce que l'image MONTRE (casque, couleur de peau, arme, tenue : liste d'objets de gear…)
Décisions (JSON) : { "attr": "nom_image.png" | "valeur" } ; "_primary": image de référence principale.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from . import gear
from .palette import extract_palette
from .segment import segment

VIEWS = ("front", "back", "left", "right", "three_quarter", "face", "unknown")
# Vues utiles selon le générateur (sources : README TRELLIS = multi-image sans réglage, qualité variable ;
# CharacterGen = UNE image d'entrée, il invente lui-même les 4 vues)
NEEDED_FULL = ("front", "back", "left", "right")
CANVAS = (512, 768)


def _hex2rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def analyze_image(path, model="isnet-general-use"):
    img = Image.open(path).convert("RGBA")
    cut = segment(img, model)
    a = np.asarray(cut)[..., 3] > 0
    ys, xs = np.where(a)
    if len(ys) == 0:
        return {"error": "aucun premier plan détecté"}, cut
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    H, W = a.shape
    edges = {"top": y0 <= 1, "bottom": y1 >= H - 1, "left": x0 <= 1, "right": x1 >= W - 1}
    bh = y1 - y0
    # cadrage : corps entier si ni haut ni bas ne touchent le cadre ; plan buste/taille si le bas est coupé
    if edges["bottom"] and bh / max(bh, 1) and (y1 - y0) < 1.9 * (x1 - x0):
        framing = "buste/taille" if (x1 - x0) > 0.5 * bh else "portrait"
    elif edges["bottom"]:
        framing = "coupé en bas"
    else:
        framing = "corps entier" if bh >= 1.6 * (x1 - x0) else "buste/taille"
    pal = extract_palette(cut, 6, a)
    return {"bbox": [x0, y0, x1 - x0, bh], "framing": framing, "edges_cut": [k for k, v in edges.items() if v],
            "palette": pal}, cut


def palette_distance(p1, p2):
    A = np.array([_hex2rgb(c) for c in p1]); B = np.array([_hex2rgb(c) for c in p2])
    d = np.linalg.norm(A[:, None] - B[None], axis=2)
    return float((d.min(1).mean() + d.min(0).mean()) / 2)


def analyze(manifest, base_dir, decisions=None, model="isnet-general-use"):
    decisions = decisions or {}
    imgs = manifest["images"]
    info, cuts = {}, {}
    for n in imgs:
        info[n], cuts[n] = analyze_image(Path(base_dir) / n, model)
    questions, requests, notes = [], [], []

    # 1) vues
    views = {n: imgs[n].get("view", "unknown") for n in imgs}
    for n, v in views.items():
        if v == "unknown":
            questions.append({"id": f"view:{n}", "text": f"Quelle vue montre {n} (front, back, left, right, three_quarter, face) ?"})
    have = {v for v in views.values() if v != "unknown"}
    full = [n for n in imgs if info[n].get("framing") == "corps entier"]
    for v in NEEDED_FULL:
        if v not in have:
            requests.append(f"Ajouter une image du personnage de {v} (de préférence en pied, fond uni, même tenue).")
    if not full:
        requests.append("Aucune image en pied : les jambes/pieds seront inventés par le modèle 3D. Ajouter une vue en pied.")
    if "face" not in have:
        requests.append("Optionnel : un gros plan du visage pour la texture de la tête.")

    # 2) même personnage ? (palettes très éloignées)
    names = list(imgs)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            d = palette_distance(info[names[i]]["palette"], info[names[j]]["palette"])
            info.setdefault("_dist", {})[f"{names[i]}|{names[j]}"] = round(d, 1)
            if d > 70:
                notes.append(f"{names[i]} et {names[j]} : palettes très différentes (écart {d:.0f}/441) — même personnage et même éclairage ?")

    # 3) conflits d'attributs : même attribut, valeurs différentes selon les images
    attrs = {}
    for n in imgs:
        for k, v in imgs[n].get("attrs", {}).items():
            attrs.setdefault(k, {})[n] = v
    resolved = {}
    for k, per in attrs.items():
        vals = {json.dumps(v, sort_keys=True) for v in per.values()}
        if len(vals) == 1:
            resolved[k] = next(iter(per.values()))
        elif k in decisions:
            d = decisions[k]
            resolved[k] = per[d] if d in per else d
        else:
            opts = [f"{n} : {v}" for n, v in per.items()]
            questions.append({"id": f"attr:{k}", "text": f"« {k} » diffère selon les images — laquelle garder ?",
                              "options": opts})
    # attribut vu sur une seule image = hérité tel quel, signalé
    for k, per in attrs.items():
        if len(per) == 1 and len(imgs) > 1:
            notes.append(f"« {k} » n'est visible que sur {next(iter(per))} : à confirmer sur les autres vues (ex. dos).")

    # 4) tenue : fusion et validation par la base physique
    outfit = resolved.get("outfit")
    gear_report = None
    if isinstance(outfit, list):
        gear_report = gear.describe(outfit)
        for e in gear_report["errors"]:
            questions.append({"id": "gear", "text": f"Tenue incohérente : {e}"})

    primary = decisions.get("_primary")
    if not primary:
        cand = [n for n in imgs if views[n] == "front"] or full or names
        primary = max(cand, key=lambda n: info[n]["bbox"][3] if "bbox" in info[n] else 0)
        notes.append(f"Image principale choisie automatiquement : {primary} (vue de face / la plus haute). Change-la avec _primary.")
    status = "BLOQUÉ (questions sans réponse)" if questions else ("INCOMPLET (vues manquantes)" if requests else "PRÊT")
    return {"name": manifest.get("name", ""), "status": status, "views": views, "images": info,
            "questions": questions, "requests": requests, "notes": notes, "resolved": resolved,
            "gear": gear_report, "primary": primary}, cuts


def _normalize(cut, head_px, target_head):
    """Mise à l'échelle commune (même hauteur de tête) puis centrage sur un canevas 512x768 transparent."""
    s = target_head / head_px if head_px else 1.0
    c = cut.resize((max(1, round(cut.width * s)), max(1, round(cut.height * s))), Image.LANCZOS)
    bb = c.getchannel("A").getbbox()
    c = c.crop(bb)
    W, H = CANVAS
    if c.height > H or c.width > W:  # sécurité : réduire si ça ne rentre pas
        r = min(W / c.width, H / c.height); c = c.resize((round(c.width * r), round(c.height * r)), Image.LANCZOS)
    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    out.alpha_composite(c, ((W - c.width) // 2, H - c.height - 8))
    return out, s


def build(manifest, base_dir, outdir, decisions=None, model="isnet-general-use"):
    rep, cuts = analyze(manifest, base_dir, decisions, model)
    outdir = Path(outdir); (outdir / "refs").mkdir(parents=True, exist_ok=True)
    imgs = manifest["images"]
    # hauteur de tête de référence : celle de l'image principale (connue ou estimée sur corps entier)
    def head(n):
        h = imgs[n].get("head_px")
        if h:
            return float(h)
        bb = rep["images"][n].get("bbox")
        return bb[3] / 7.5 if bb and rep["images"][n]["framing"] == "corps entier" else None
    target = head(rep["primary"]) or 60.0
    if target * 7.5 > CANVAS[1] - 16:
        target = (CANVAS[1] - 16) / 7.5
    plan = []
    for n, cut in cuts.items():
        h = head(n)
        if not h:
            plan.append({"image": n, "view": rep["views"][n], "used": False,
                         "reason": "échelle inconnue : donne head_px (hauteur de tête en px) pour l'utiliser avec les autres vues"})
            continue
        if rep["views"][n] == "unknown":
            plan.append({"image": n, "used": False, "reason": "vue inconnue"}); continue
        o, s = _normalize(cut, h, target)
        f = f"refs/{Path(n).stem}_{rep['views'][n]}.png"
        o.save(outdir / f)
        plan.append({"image": n, "view": rep["views"][n], "used": True, "file": f, "scale": round(s, 3)})
    g3d = {
        "trellis_multi_image": [p["file"] for p in sorted(plan, key=lambda p: ("front", "three_quarter", "left", "right", "back", "face").index(p["view"]) if p.get("used") and p["view"] in ("front", "three_quarter", "left", "right", "back", "face") else 9) if p.get("used")],
        "charactergen_single": next((p["file"] for p in plan if p["image"] == rep["primary"] and p.get("used")), None),
        "note": "TRELLIS (MIT, ≥16 Go GPU) accepte plusieurs images sans réglage dédié (qualité variable) ; CharacterGen n'en prend qu'une.",
    }
    rep["plan"] = plan; rep["3d_input"] = g3d
    (outdir / "consolidation.json").write_text(json.dumps(rep, indent=2, ensure_ascii=False))
    (outdir / "REPORT.md").write_text(report_md(rep))
    return rep


def report_md(r):
    L = [f"# Consolidation — {r['name']}  [{r['status']}]", "", "## Vues", *[f"- {n} : {v} ({r['images'][n].get('framing','?')})" for n, v in r["views"].items()]]
    if r["questions"]:
        L += ["", "## Questions (réponds dans decisions.json)"]
        for q in r["questions"]:
            L.append(f"- `{q['id']}` {q['text']}" + ("".join(f"\n    - {o}" for o in q.get("options", []))))
    if r["requests"]:
        L += ["", "## Images complémentaires demandées", *[f"- {x}" for x in r["requests"]]]
    if r["notes"]:
        L += ["", "## Remarques", *[f"- {x}" for x in r["notes"]]]
    if r.get("gear"):
        g = r["gear"]; L += ["", f"## Tenue fusionnée : {', '.join(g['items'])} — {g['mass_kg']} kg, protection {g['protection']}"]
    return "\n".join(L) + "\n"


def cmd(a):
    base = Path(a.manifest).parent
    man = json.loads(Path(a.manifest).read_text())
    dec = json.loads(Path(a.decisions).read_text()) if a.decisions else {}
    if a.action == "analyze":
        rep, _ = analyze(man, base, dec, a.model)
        print(report_md(rep))
    else:
        rep = build(man, base, a.output, dec, a.model)
        print(report_md(rep)); print(f"[consolidate] -> {a.output}")
    return 0
