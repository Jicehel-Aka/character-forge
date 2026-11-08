"""Modification textuelle (FR/EN) d'une description de personnage : « sans la cape, cheveux plus longs, hache, peau plus foncée ».
Règles simples (mots-clés), pas de modèle de langage : ce qui n'est pas compris est renvoyé, jamais deviné."""
import colorsys, re, unicodedata

def _n(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")

GEAR = {"cape": "cloak", "cloak": "cloak", "manteau": "cloak", "ceinture": "belt", "belt": "belt", "bourse": "pouch", "pouch": "pouch",
        "sacoche": "pouch", "casque": "helmet", "helmet": "helmet", "helm": "helmet", "chapeau": "hat", "hat": "hat", "casquette": "cap",
        "capuche": "hood", "hood": "hood", "bouclier": "shield", "shield": "shield", "carquois": "quiver", "quiver": "quiver",
        "armure": "leather_armor", "armor": "leather_armor", "armour": "leather_armor", "bottes": "boots", "boots": "boots", "gants": "gloves", "gloves": "gloves"}
WEAPONS = {"arc": "bow", "bow": "bow", "epee": "sword", "sword": "sword", "hache": "axe", "axe": "axe", "lance": "spear", "spear": "spear",
           "baton": "staff", "staff": "staff", "marteau": "hammer", "hammer": "hammer", "masse": "mace", "mace": "mace"}
COLORS = {"noir": "#1c1a18", "black": "#1c1a18", "blanc": "#e8e4dc", "white": "#e8e4dc", "gris": "#7a7a80", "grey": "#7a7a80", "gray": "#7a7a80",
          "blanche": "#e8e4dc", "noire": "#1c1a18", "verte": "#3f7a35", "bleue": "#2f5aa0", "grise": "#7a7a80", "brune": "#5a3a22", "violette": "#6a3a8a", "roux": "#b4501e", "rousse": "#b4501e", "red-haired": "#b4501e", "rouge": "#a8262c", "red": "#a8262c", "brun": "#5a3a22", "marron": "#5a3a22", "brown": "#5a3a22",
          "blond": "#d2b45a", "blonde": "#d2b45a", "vert": "#3f7a35", "green": "#3f7a35", "bleu": "#2f5aa0", "blue": "#2f5aa0",
          "jaune": "#d8b830", "yellow": "#d8b830", "violet": "#6a3a8a", "purple": "#6a3a8a", "orange": "#d2701e", "rose": "#d2688a", "pink": "#d2688a"}
TARGET = {"peau": "skin", "skin": "skin", "cheveux": "hair", "hair": "hair", "cape": "cape", "cloak": "cape", "tissu": "cloth", "cloth": "cloth",
          "cuir": "leather", "leather": "leather", "acier": "steel", "steel": "steel"}
NEG = re.compile(r"\b(sans|retire|retirer|enleve|enlever|supprime|supprimer|without|remove|no)\b")
POS = re.compile(r"\b(avec|ajoute|ajouter|mets|mettre|donne|add|with|give)\b")


def _shade(hexc, f):
    h = hexc.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)); H, L, S = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb(H, min(0.95, max(0.05, L * f)), S); return "#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255))


def apply(desc, text):
    d = {**desc, "colors": dict(desc.get("colors", {})), "gear": list(desc.get("gear", [])), "hair": dict(desc.get("hair", {}))}
    done, unknown = [], []
    for seg in re.split(r"[,;]| et | and ", text):
        s = _n(seg).strip()
        if not s: continue
        words = re.findall(r"[a-z\-]+", s); hit = False
        neg = bool(NEG.search(s)); pos = bool(POS.search(s))
        # équipement et armes
        for w in words:
            if w in GEAR and not any(t in words for t in ("cheveux", "hair", "peau", "skin")) or (w in GEAR and (neg or pos)):
                g = GEAR[w]
                if neg and g in d["gear"]: d["gear"].remove(g); done.append(f"retire {g}"); hit = True
                elif not neg and g not in d["gear"] and not re.search(r"(plus|more|less|moins)\s+(fonce|clair|dark|light)", s) and not _color(words):
                    d["gear"].append(g); done.append(f"ajoute {g}"); hit = True
            if w in WEAPONS and WEAPONS[w] != "bow" or w in WEAPONS and w in ("arc", "bow"):
                if neg: d["weapon"] = None; done.append("sans arme"); hit = True
                else: d["weapon"] = WEAPONS[w]; done.append(f"arme : {WEAPONS[w]}"); hit = True
        if re.search(r"sans arme|unarmed|no weapon", s): d["weapon"] = None; done.append("sans arme"); hit = True
        # cheveux
        hr = d["hair"]
        if re.search(r"chauve|bald", s): hr["style"] = "bald"; done.append("chauve"); hit = True
        elif re.search(r"queue de cheval|ponytail", s): hr["style"] = "ponytail"; done.append("queue de cheval"); hit = True
        elif re.search(r"chignon|\bbun\b", s): hr["style"] = "bun"; done.append("chignon"); hit = True
        if re.search(r"cheveux|hair|coiffure", s):
            L = hr.get("length", 0.3)
            if re.search(r"tres long|very long|long.*(dos|back)", s): hr["length"] = 2.0; hr["locks"] = 2.0; done.append("cheveux très longs"); hit = True
            elif re.search(r"plus long|longer|longs|long\b", s): hr["length"] = min(2.0, L + 0.7); hr["locks"] = min(2.0, hr.get("locks", 0.8) + 0.5); done.append(f"cheveux plus longs ({hr['length']:.1f})"); hit = True
            elif re.search(r"plus court|shorter|courts|short|court\b", s): hr["length"] = max(0.0, L - 0.3); hr["locks"] = max(0.0, hr.get("locks", 0.8) - 0.4); done.append("cheveux plus courts"); hit = True
            if re.search(r"vol(ume)?\w* (plus|more)|plus (de )?volume|fuller|volumineux", s): hr["volume"] = min(1.5, hr.get("volume", 1) + 0.3); done.append("plus de volume"); hit = True
            if re.search(r"sans frange|no (fringe|bangs)", s): hr["fringe"] = 0.0; done.append("sans frange"); hit = True
            elif re.search(r"frange|fringe|bangs", s): hr["fringe"] = 1.0; done.append("frange"); hit = True
        # couleurs
        c = _color(words); tgt = next((TARGET[w] for w in words if w in TARGET), None)
        if tgt and (c or re.search(r"fonce|sombre|dark|clair|light|pale", s)) and not (neg and tgt == "cape" and not c):
            cur = d["colors"].get(tgt, "#808080")
            if c: d["colors"][tgt] = c; done.append(f"{tgt} -> {c}"); hit = True
            else:
                f = 0.75 if re.search(r"fonce|sombre|dark", s) else 1.3; d["colors"][tgt] = _shade(cur, f); done.append(f"{tgt} {'plus foncé' if f < 1 else 'plus clair'}"); hit = True
        # tenue / ceinture : couleur du tissu ou du cuir
        c2 = _color(words)
        if c2 and re.search(r"tenue|habit|vetement|kimono|gi\b|outfit|clothes", s): d["colors"]["cloth"] = c2; done.append(f"tenue -> {c2}"); hit = True
        elif c2 and re.search(r"ceinture|belt", s) and not hit: d["colors"]["leather"] = c2; done.append(f"ceinture/cuir -> {c2}"); hit = True
        if re.search(r"peau (claire|pale)|pale skin|fair skin", s): d["colors"]["skin"] = "#ecc4a0"; done.append("peau claire"); hit = True
        if re.search(r"combattante|femme|fille|female|woman|girl", s):
            d["build"] = "slim"; d["head"] = {**d.get("head", {}), "jaw": 0.3, "width": 0.95, "chin": 0.4}; done.append("silhouette féminine (mince, mâchoire fine)"); hit = True
        if re.search(r"combattant\b|homme|male\b|\bman\b", s): done.append("silhouette masculine (inchangée)"); hit = True
        # corpulence
        for pat, b in ((r"costaud|stocky|massif|muscl", "stocky"), (r"mince|slim|fin\b", "slim"), (r"\borc\b", "orc"), (r"humain|human", "human"), (r"enfant|child", "child")):
            if re.search(pat, s): d["build"] = b; done.append(f"corpulence : {b}"); hit = True
        if not hit: unknown.append(seg.strip())
    return d, done, unknown


def _color(words):
    for w in words:
        for v in (w, w.rstrip("s"), w[:-1] if w.endswith("e") else w, w.rstrip("s")[:-1] if w.rstrip("s").endswith("e") else w):
            if v in COLORS: return COLORS[v]       # accords : noirs, blanche, rousse...
    return None
