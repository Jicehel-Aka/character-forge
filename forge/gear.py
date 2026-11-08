"""Base physique des équipements : tenue, armure, couvre-chefs, lunettes, etc.

Chaque objet est décrit par des RÈGLES (emplacement, couche, zones du corps couvertes, taille en
« têtes », matière, masse), pas par un dessin. Cela donne :
  * `validate(outfit)` : détecte les tenues impossibles (deux casques, robe + pantalon, armure sous
    la chemise, tête non couverte alors qu'un casque exige un cou dégagé, etc.) ;
  * `fit(item, person_head_px)` : dimensions et position en pixels sur l'image du personnage,
    à partir de la hauteur de tête (même repère que props.py : taille = 7,5 têtes) ;
  * `describe(outfit)` : masse, protection, texte pour la fiche / la persona / les prompts 3D.

HONNÊTETÉ : les proportions viennent du canon d'anatomie artistique (7,5 têtes ; épaules ≈ 2 têtes) et
d'ordres de grandeur d'habillement. Ce sont des ESTIMATIONS écrites de mémoire, pas des mesures
vérifiées dans cette session : à ajuster dans CATALOG / LANDMARKS selon tes personnages.
Orques, nains, enfants : passer `build` (voir BUILDS) pour changer l'échelle des largeurs.
"""
from __future__ import annotations

import json
from pathlib import Path

# --- Corps : repères verticaux en hauteurs de tête depuis le sommet du crâne (canon 7,5 têtes) --------
LANDMARKS = {
    "crown": 0.0, "brow": 0.45, "chin": 1.0, "neck_base": 1.3, "shoulder": 1.5, "chest": 2.2,
    "waist": 3.0, "hip": 3.9, "crotch": 4.0, "mid_thigh": 4.7, "knee": 5.5, "calf": 6.3,
    "ankle": 7.2, "sole": 7.5, "wrist": 3.9, "hand_tip": 4.7,
}
# Largeurs en hauteurs de tête (épaules ≈ 2 têtes, hanches ≈ 1,5)
WIDTHS = {"head": 0.72, "neck": 0.4, "shoulder": 2.0, "chest": 1.7, "waist": 1.4, "hip": 1.55,
          "thigh": 0.7, "calf": 0.45, "upper_arm": 0.5, "forearm": 0.42}
# Gabarits : multiplicateurs de largeur (la hauteur reste en têtes ; l'orque est plus massif)
BUILDS = {"human": 1.0, "slim": 0.88, "stocky": 1.18, "orc": 1.3, "child": 1.0}

# --- Zones du corps ----------------------------------------------------------------------------------
ZONES = ("head", "face", "eyes", "neck", "torso", "shoulders", "upper_arms", "forearms", "hands",
         "waist", "hips", "thighs", "calves", "feet")
# Couches de dessous en dessus : une zone ne peut porter qu'UN objet par couche
LAYERS = {"under": 0, "base": 1, "mid": 2, "armor": 3, "outer": 4, "accessory": 5}

def _i(slot, layer, covers, y0, y1, w, kg, material, prot=0, requires=(), forbids=(), note=""):
    return dict(slot=slot, layer=layer, covers=list(covers), y=(y0, y1), width=w, mass_kg=kg,
                material=material, protection=prot, requires=list(requires), forbids=list(forbids),
                note=note)

# y = bornes verticales (repères LANDMARKS), width = largeur en têtes (ou clé de WIDTHS)
CATALOG = {
    # tête
    "cap":        _i("head", "mid", ["head"], "crown", "brow", "head", 0.1, "tissu", 0,
                     note="Casquette : couvre le crâne, visière ≈ 0,3 tête devant le front."),
    "headband":   _i("head", "accessory", [], "crown", "brow", "head", 0.03, "tissu", 0,
                     note="Bandeau : anneau serré à hauteur du front (ne couvre rien)."),
    "hood":       _i("head", "outer", ["head", "neck"], "crown", "neck_base", "head", 0.3, "tissu", 0,
                     note="Capuche : couvre crâne et cou, déborde ≈ 15 % de la largeur de tête."),
    "helmet_open": _i("head", "armor", ["head"], "crown", "brow", "head", 1.2, "acier", 4,
                      note="Casque ouvert (face libre) : ≈ 1,1 × la largeur de tête."),
    "helmet_full": _i("head", "armor", ["head", "face", "eyes"], "crown", "chin", "head", 2.2, "acier", 6,
                      forbids=["glasses", "cap", "hood"], note="Casque fermé : couvre visage et yeux."),
    "glasses":    _i("face", "accessory", ["eyes"], 0.45, 0.65, "head", 0.03, "verre/métal", 0,
                     forbids=["helmet_full"], note="Lunettes : largeur ≈ largeur de tête, sur la ligne des yeux."),
    "mask":       _i("face", "outer", ["face"], 0.6, "chin", "head", 0.1, "tissu", 0),
    # haut du corps
    "undershirt": _i("torso", "under", ["torso"], "shoulder", "hip", "chest", 0.15, "coton"),
    "shirt":      _i("torso", "base", ["torso", "upper_arms"], "shoulder", "hip", "chest", 0.3, "lin"),
    "tunic":      _i("torso", "base", ["torso", "upper_arms"], "shoulder", "mid_thigh", "chest", 0.6,
                     "laine", 0, forbids=["dress", "robe"],
                     note="Tunique : retombe sur le haut des cuisses mais se porte PAR-DESSUS le pantalon."),
    "gambeson":   _i("torso", "mid", ["torso", "upper_arms"], "shoulder", "hip", "chest", 3.0, "tissu matelassé", 2,
                     requires=["shirt|tunic|undershirt"]),
    "leather_armor": _i("torso", "armor", ["torso"], "shoulder", "hip", "chest", 4.0, "cuir", 3,
                        requires=["shirt|tunic|gambeson|undershirt"]),
    "breastplate": _i("torso", "armor", ["torso"], "shoulder", "waist", "chest", 6.0, "acier", 6,
                      requires=["shirt|tunic|gambeson"], forbids=["leather_armor", "mail"],
                      note="Plastron : ne couvre pas les bras ; porter par-dessus un gambison."),
    "mail":       _i("torso", "armor", ["torso", "upper_arms", "hips"], "shoulder", "mid_thigh", "chest", 9.0,
                     "mailles", 5, requires=["shirt|tunic|gambeson"], forbids=["breastplate", "leather_armor"]),
    "pauldrons":  _i("shoulders", "armor", ["shoulders"], "shoulder", "chest", "shoulder", 2.5, "acier", 4,
                     requires=["torso_armor_or_gambeson"], note="Épaulières : dépassent la largeur d'épaules de ≈ 10 %."),
    "vambraces":  _i("forearms", "armor", ["forearms"], "chest", "wrist", "forearm", 1.2, "cuir/acier", 3),
    "bracers":    _i("forearms", "accessory", ["forearms"], "waist", "wrist", "forearm", 0.4, "cuir", 1,
                     note="Brassards d'archer : poignet à mi-avant-bras."),
    "gloves":     _i("hands", "base", ["hands"], "wrist", "hand_tip", 0.4, 0.15, "cuir", 1),
    "gauntlets":  _i("hands", "armor", ["hands"], "wrist", "hand_tip", 0.45, 0.8, "acier", 4, forbids=["gloves"]),
    "cloak":      _i("back", "outer", ["shoulders"], "neck_base", "calf", "shoulder", 1.2, "laine", 0,
                     note="Cape : attachée au cou, tombe dans le dos jusqu'aux mollets."),
    "robe":       _i("torso", "outer", ["torso", "upper_arms", "forearms", "hips", "thighs", "calves"],
                     "neck_base", "ankle", "hip", 1.5, "laine", 0, forbids=["pants", "skirt", "dress", "tunic"]),
    "dress":      _i("torso", "base", ["torso", "upper_arms", "hips", "thighs", "calves"], "shoulder", "ankle",
                     "hip", 1.0, "tissu", 0, forbids=["pants", "skirt", "tunic", "shirt", "robe"]),
    # bas du corps
    "underwear":  _i("hips", "under", ["hips"], "hip", "crotch", "hip", 0.05, "coton"),
    "pants":      _i("legs", "base", ["hips", "thighs", "calves"], "waist", "ankle", "hip", 0.5, "toile", 0,
                     forbids=["dress", "robe", "skirt"]),
    "shorts":     _i("legs", "base", ["hips", "thighs"], "waist", "mid_thigh", "hip", 0.3, "toile", 0,
                     forbids=["pants", "dress", "robe", "skirt"]),
    "skirt":      _i("legs", "base", ["hips", "thighs"], "waist", "knee", "hip", 0.4, "tissu", 0,
                     forbids=["pants", "shorts", "dress", "robe"]),
    "greaves":    _i("calves", "armor", ["calves"], "knee", "ankle", "calf", 2.0, "acier", 4),
    "belt":       _i("waist", "accessory", ["waist"], "waist", "waist", "waist", 0.3, "cuir"),
    "boots":      _i("feet", "mid", ["feet", "calves"], "calf", "sole", "calf", 1.2, "cuir", 1,
                     note="Bottes : par-dessus le bas du pantalon."),
    "shoes":      _i("feet", "base", ["feet"], "ankle", "sole", "calf", 0.6, "cuir", 0, forbids=["boots"]),
    # porté / rangé
    "quiver":     _i("back", "accessory", [], "shoulder", "hip", 0.45, 0.8, "cuir", 0,
                     note="Carquois : contient des flèches ≈ 0,43 × la taille ; leur empennage dépasse de ≈ 0,15 tête."),
}
_TORSO_ARMOR = {"breastplate", "leather_armor", "mail", "gambeson"}

def _lm(v):
    return LANDMARKS[v] if isinstance(v, str) else float(v)

def _w(v):
    return WIDTHS[v] if isinstance(v, str) else float(v)


def validate(outfit):
    """Retourne (erreurs, avertissements) pour une liste de noms d'objets."""
    err, warn = [], []
    names = list(outfit)
    for n in names:
        if n not in CATALOG:
            err.append(f"objet inconnu : {n}")
    names = [n for n in names if n in CATALOG]
    if len(set(names)) != len(names):
        err.append("objet en double : " + ", ".join(sorted({n for n in names if names.count(n) > 1})))
    # une zone, une couche, un seul objet
    occ = {}
    for n in names:
        it = CATALOG[n]
        for z in it["covers"]:
            k = (z, it["layer"])
            if it["layer"] == "accessory":
                continue
            if k in occ:
                err.append(f"{n} et {occ[k]} occupent la même couche « {it['layer']} » sur « {z} »")
            else:
                occ[k] = n
    for n in names:
        it = CATALOG[n]
        for f in it["forbids"]:
            if f in names:
                err.append(f"{n} est incompatible avec {f}")
        for r in it["requires"]:
            if r == "torso_armor_or_gambeson":
                ok = bool(_TORSO_ARMOR & set(names))
            else:
                ok = any(x in names for x in r.split("|"))
            if not ok:
                err.append(f"{n} demande : {r.replace('|', ' ou ')} dessous")
        # ordre des couches : un objet sans dessous sur une zone couverte par une armure
    torso = [n for n in names if "torso" in CATALOG[n]["covers"]]
    if torso and not any(CATALOG[n]["layer"] in ("under", "base") for n in torso):
        warn.append("torse couvert sans vêtement de base (frottement : prévoir chemise ou gambison)")
    if not any("torso" in CATALOG[n]["covers"] for n in names):
        warn.append("torse nu")
    if not any(z in CATALOG[n]["covers"] for n in names for z in ("hips", "thighs")):
        warn.append("bassin non couvert (ajouter pantalon, jupe, robe ou short)")
    mass = sum(CATALOG[n]["mass_kg"] for n in names)
    if mass > 25:
        warn.append(f"masse portée {mass:.1f} kg : charge lourde pour une animation d'archer/éclaireur")
    return err, warn


def fit(item, head_px, build="human", top_px=0.0, center_x=0.0):
    """Boîte (x, y, w, h) en pixels de l'objet sur le personnage.

    head_px = hauteur de tête en pixels ; top_px = ordonnée du sommet du crâne ; center_x = axe du corps.
    """
    it = CATALOG[item]
    y0, y1 = (_lm(v) for v in it["y"])
    k = BUILDS.get(build, 1.0)
    w = _w(it["width"]) * k
    if it["slot"] in ("head", "face"):
        w *= 1.1 if item in ("helmet_open", "helmet_full", "hood") else 1.0
    if item == "pauldrons":
        w *= 1.1
    h = max(y1 - y0, 0.08)
    return (round(center_x - w * head_px / 2), round(top_px + y0 * head_px),
            round(w * head_px), round(h * head_px))


def describe(outfit, lang="fr"):
    err, warn = validate(outfit)
    names = [n for n in outfit if n in CATALOG]
    mass = sum(CATALOG[n]["mass_kg"] for n in names)
    prot = sum(CATALOG[n]["protection"] for n in names)
    mats = sorted({CATALOG[n]["material"] for n in names})
    return {"items": names, "mass_kg": round(mass, 1), "protection": prot, "materials": mats,
            "errors": err, "warnings": warn}


def load_outfits(path):
    return json.loads(Path(path).read_text())


def cmd(args):
    if args.action == "list":
        for n, it in CATALOG.items():
            print(f"{n:14s} {it['slot']:9s} couche={it['layer']:9s} {it['mass_kg']:5.1f} kg  prot={it['protection']}  {it['material']}")
        return 0
    outfit = args.items
    if args.file:
        outfit = load_outfits(args.file)[args.name]
    if args.action == "check":
        d = describe(outfit)
        print(json.dumps(d, ensure_ascii=False, indent=2))
        return 1 if d["errors"] else 0
    if args.action == "fit":
        for n in outfit:
            print(n, fit(n, args.head, args.build, args.top, args.center))
        return 0
