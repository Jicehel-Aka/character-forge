"""Règles d'animation : ce qu'une animation DOIT montrer pour être juste, vérifié sur des frames.

Leçon du travail sur la planche de la combattante : une planche peut être propre (échelle, palette, cohérence) et
quand même fausse, parce que les poses ne font pas le mouvement annoncé (marche sans alternance des jambes, balayage
sans être accroupi, « tir » qui ressemble à un double coup de pied, chute avec un sprite couché faux...). Les
distances de silhouette ne voient pas ça. Ces règles, elles, sont écrites par type d'animation et mesurées.

Mesures par frame (sur la silhouette, indépendantes de l'échelle quand on donne la hauteur de référence) :
  h, w, asp = w/h, low = largeur du bas du sprite (20 % inférieurs) / h  -> écart des pieds,
  tipx = point le plus à droite (arme, main, pied), iou = recouvrement avec la frame suivante.
Chaque règle renvoie (ok, détail) et une consigne de correction. Voir RULES pour la liste et KINDS pour les noms.

  python -m forge animrules list
  python -m forge animrules check SHEET.png --cell 160x152 --kinds tools/sheet_rebuild/kinds.json
  python -m forge animrules check --frames DOSSIER --kind walk
Limites : une vue de côté uniquement ; « quelle jambe est devant » n'est pas lisible sur une silhouette (on mesure
l'alternance de l'écart des pieds, pas la latéralité) ; les seuils sont ceux d'un combattant de profil en pixel art."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


# ---------- mesures ----------
def mask_of(im, key=(255, 0, 255), tol=90):
    """Silhouette booléenne d'une frame RGBA (alpha) ou RGB (fond magenta de planche)."""
    a = np.asarray(im.convert("RGBA") if hasattr(im, "convert") else im)
    if a.shape[-1] == 4 and (a[..., 3] < 255).any():
        return a[..., 3] > 127
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    bg = (r > 150) & (b > 150) & (g < 120) & (abs(r - b) < tol)
    return ~bg


def measure(masks):
    """-> dict de tableaux numpy, une valeur par frame (les frames vides sont ignorées)."""
    M = {k: [] for k in ("h", "w", "asp", "low", "tipx", "top")}
    ms = [m for m in masks if m.any()]
    for m in ms:
        ys, xs = np.nonzero(m)
        h = ys.max() - ys.min() + 1; w = xs.max() - xs.min() + 1
        sub = m[int(ys.max() - 0.2 * h):ys.max() + 1]
        cx = np.nonzero(sub.any(0))[0]
        M["h"].append(h); M["w"].append(w); M["asp"].append(w / h)
        M["low"].append((cx.max() - cx.min() + 1) / h if len(cx) else 0.0)
        M["tipx"].append(xs.max()); M["top"].append(ys.min())
    out = {k: np.array(v, float) for k, v in M.items()}
    out["iou"] = np.array([(a & b).sum() / max((a | b).sum(), 1) for a, b in zip(ms[:-1], ms[1:])])
    return out


def cycles(a, eps=0.0):
    """Nombre d'inversions de sens d'une courbe (un aller-retour complet = 2)."""
    d = np.diff(a); d = d[np.abs(d) > eps]
    return int(np.sum(np.diff(np.sign(d)) != 0)) if len(d) > 1 else 0


# ---------- règles ----------
# (identifiant, texte, fonction(m, href) -> (ok, détail), consigne)
def _r(i, t, f, hint): return (i, t, f, hint)


def _alt(m, h):
    c = cycles(m["low"], 0.03)
    return c >= 2, f"{c} inversions de l'écart des pieds"


def _stable(thr=0.12):
    def f(m, h):
        r = np.ptp(m["h"]) / np.median(m["h"]); return r <= thr, f"hauteur varie de {r:.0%} (max {thr:.0%})"
    return f


def _crouch(n, frac=0.88):
    def f(m, h):
        k = int((m["h"] < frac * h).sum()); return k >= n, f"{k} frame(s) basse(s) (< {frac:.0%} de la garde)"
    return f


def _tip(frac):
    def f(m, h):
        d = np.ptp(m["tipx"]) / h; return d >= frac, f"pointe avance de {d:.0%} de la hauteur"
    return f


def _motion(thr):
    def f(m, h):
        v = float(m["iou"].mean()) if len(m["iou"]) else 1.0; return v < thr, f"recouvrement moyen {v:.2f}"
    return f


def _count(key, op, thr, n, what):
    def f(m, h):
        v = m[key] / (h if key == "h" else 1.0)
        k = int((v > thr).sum() if op == ">" else (v < thr).sum()); return k >= n, f"{k} frame(s) {what}"
    return f


def _fall(m, h):
    ok = m["h"][-1] < 0.6 * m["h"][0] and bool((m["asp"][-2:] > 1.6).all())
    return ok, f"hauteur {m['h'][0]:.0f} -> {m['h'][-1]:.0f}, 2 dernières frames couchées : {bool((m['asp'][-2:] > 1.6).all())}"


def _getup(m, h):
    ok = m["asp"][0] > 1.6 and m["asp"][-1] < 1.0
    return ok, f"aspect début {m['asp'][0]:.1f}, fin {m['asp'][-1]:.1f}"


def _lying(n):
    def f(m, h):
        k = int((m["asp"] > 1.6).sum()); return k >= n, f"{k} frame(s) couchée(s)"
    return f


def _idle(m, h):
    r = np.ptp(m["h"]) / np.median(m["h"]); v = float(m["iou"].mean()) if len(m["iou"]) else 1
    return r <= 0.15 and v > 0.60, f"hauteur ±{r:.0%}, recouvrement {v:.2f} (> 0,60 : l'arme peut bouger, pas le corps)"


RULES = {
    "idle": [_r("calme", "garde/attente : corps quasi constant (respiration), seule l'arme bouge", _idle, "garder la même pose, ne varier que le buste/l'arme de 1-2 px")],
    "walk": [
        _r("alternance", "marche : l'écart des pieds s'ouvre et se referme (≥ 2 inversions) = jambes qui alternent", _alt, "cycle : contact, appui, passage, contact (autre jambe), appui, passage"),
        _r("hauteur", "la hauteur du corps reste stable (±12 %)", _stable(0.12), "recaler sur les pieds ; pas de sprite plus grand/petit"),
    ],
    "run": [
        _r("alternance", "course : mêmes jambes qui alternent (≥ 2 inversions)", _alt, "inclinaison avant, foulée plus large que la marche"),
        _r("hauteur", "la hauteur du corps reste stable (±20 %, la foulée s'abaisse)", _stable(0.20), "recaler sur les pieds"),
    ],
    "crouch": [_r("bas", "accroupi : ≥ 3 frames nettement plus basses que la garde", _crouch(3), "genoux fléchis, buste bas ; pas une garde légèrement penchée")],
    "crouch_sweep": [
        _r("bas", "balayage : ≥ 3 frames accroupies", _crouch(3), "s'accroupir d'abord, puis balayer"),
        _r("balayage", "l'arme/le bras avance d'au moins 15 % de la hauteur", _tip(0.15), "le balayage doit traverser l'espace devant le personnage"),
    ],
    "lunge": [_r("fente", "fente : ≥ 2 frames avec pieds très écartés", _count("low", ">", 1.0, 2, "en fente"), "jambe avant fléchie, arrière tendue, buste en avant")],
    "kick": [_r("pied", "coup de pied : ≥ 2 frames plus larges que hautes (jambe tendue)", _count("asp", ">", 1.0, 2, "avec jambe tendue"), "jambe entière et pied intacts ; sinon régénérer la pose")],
    "punch": [_r("portée", "coup/tir : la main avance d'au moins 12 % de la hauteur", _tip(0.12), "bras qui part du buste jusqu'à l'extension ; pas un double coup de pied")],
    "shot": [_r("portée", "attaque à distance : bras/arme qui avance (≥ 12 %)", _tip(0.12), "armer, tendre le bras, projectile/éclat devant la main")],
    "weapon_motion": [_r("arme", "arme visible qui bouge entre les frames (recouvrement moyen < 0,93)", _motion(0.93), "l'arme change de position/angle à chaque frame")],
    "spin": [_r("rotation", "attaque tournoyante : la silhouette change fortement (recouvrement < 0,90)", _motion(0.90), "au moins 3 orientations différentes du corps")],
    "dodge": [_r("bas", "esquive : au moins une frame accroupie/penchée", _crouch(1), "recul + buste bas")],
    "low_guard": [_r("garde basse", "garde basse stable : pieds écartés sur ≥ 4 frames", _count("low", ">", 0.65, 4, "pieds écartés"), "jambes écartées et fléchies sur toute la ligne")],
    "fall": [_r("chute", "chute : recul debout -> à genoux -> au sol (hauteur ↓ ≥ 40 %, 2 dernières frames couchées)", _fall, "utiliser des poses de sol ANATOMIQUEMENT justes (tête à un bout, jambes à l'autre)")],
    "ko": [_r("couché", "KO : tombe puis reste au sol (≥ 4 frames couchées)", _lying(4), "répéter la pose couchée avec une petite respiration")],
    "getup": [_r("relevé", "relevé : commence couché et finit debout", _getup, "couché -> à genoux -> debout")],
}
KINDS = sorted(RULES)


def check(kind, masks, href=None):
    """-> liste de dicts {id, ok, texte, détail, consigne}. href : hauteur d'une garde debout (défaut : frame la plus haute)."""
    if kind not in RULES: raise KeyError(f"type inconnu : {kind} (voir {', '.join(KINDS)})")
    m = measure(masks)
    if len(m["h"]) == 0: return [dict(id="vide", ok=False, texte="frames vides", détail="", consigne="vérifier le détourage")]
    h = float(href or m["h"].max())
    out = []
    for i, t, f, hint in RULES[kind]:
        ok, d = f(m, h); out.append(dict(id=i, ok=bool(ok), texte=t, détail=d, consigne=hint))
    return out


# ---------- ligne d'une planche ----------
def sheet_rows(path, cell, cols=None):
    im = Image.open(path).convert("RGB"); cw, ch = cell
    cols = cols or im.width // cw
    return [[mask_of(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))) for c in range(cols)] for r in range(im.height // ch)]


def cmd(a):
    if a.action == "list":
        for k in KINDS:
            print(f"{k}:")
            for i, t, _, hint in RULES[k]: print(f"  - {t}\n      si faux : {hint}")
        return 0
    if a.frames:
        masks = [mask_of(Image.open(p)) for p in sorted(Path(a.frames).glob("*.png"))]
        jobs = [("-", a.kind, masks)]
    else:
        cw, ch = (int(v) for v in a.cell.lower().split("x"))
        rows = sheet_rows(a.sheet, (cw, ch)); kinds = json.load(open(a.kinds))
        jobs = [(k, v["kind"] if isinstance(v, dict) else v, rows[int(k) - 1]) for k, v in kinds.items() if int(k) <= len(rows)]
    href = a.href
    if href is None and not a.frames:        # hauteur de garde = médiane des lignes de type idle
        hs = [measure(m)["h"].max() for k, kind, m in jobs if kind == "idle"]; href = float(np.median(hs)) if hs else None
    bad = tot = 0
    for k, kind, masks in jobs:
        for r in check(kind, masks, href):
            tot += 1; bad += not r["ok"]
            print(f"{'OK    ' if r['ok'] else 'ÉCHEC '} {k:>3} {kind:<14} {r['texte']}  [{r['détail']}]" + ("" if r["ok"] else f"\n        -> {r['consigne']}"))
    print(f"{tot - bad}/{tot} règles respectées")
    return 1 if bad else 0
