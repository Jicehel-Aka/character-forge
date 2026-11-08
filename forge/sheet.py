"""Étape 2 : fiche de personnage (character.json + character_sheet.html).

Les champs d'apparence sont à remplir (par Claude en regardant l'image, ou à la main) ;
la palette et les boîtes des parties viennent de l'extraction."""
import copy
import html
import json
from pathlib import Path

TEMPLATE = {
    "name": "",
    "source_image": "",
    "palette": [],
    "parts": {},
    "appearance": {"species": "", "skin": "", "hair": "", "eyes": "", "build": "", "distinguishing": ""},
    "equipment": {"armor": "", "weapon": "", "accessories": ""},
    "personality": {"traits": [], "motivation": "", "flaw": ""},
    "voice": {"tone": "", "speech_habits": "", "examples": []},
    "backstory": "",
    "game": {"role": "", "faction": ""},
}

REQUIRED = [("appearance", "species"), ("appearance", "hair"), ("appearance", "eyes"),
            ("equipment", "weapon"), ("personality", "traits"), ("voice", "tone"), ("backstory", None)]


def sheet_path(extract_dir: Path) -> Path:
    return Path(extract_dir) / "character.json"


def init_sheet(extract_dir: Path, name: str = None, force: bool = False) -> Path:
    extract_dir = Path(extract_dir)
    p = sheet_path(extract_dir)
    if p.exists() and not force:
        print(f"[sheet] {p} existe déjà (--force pour recréer)")
        return p
    meta = json.loads((extract_dir / "metadata.json").read_text())
    data = copy.deepcopy(TEMPLATE)
    data["name"] = name or extract_dir.name
    data["source_image"] = meta["source"]
    data["palette"] = meta["palette"]
    data["parts"] = {k: v["bbox"] for k, v in meta.get("parts", {}).items()}
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"[sheet] modèle créé : {p}")
    return p


def missing(data: dict) -> list:
    out = []
    for sec, key in REQUIRED:
        v = data.get(sec) if key is None else data.get(sec, {}).get(key)
        if not v:
            out.append(sec if key is None else f"{sec}.{key}")
    return out


def render_html(extract_dir: Path) -> Path:
    extract_dir = Path(extract_dir)
    d = json.loads(sheet_path(extract_dir).read_text())
    e = html.escape

    def table(title, rows):
        body = "".join(f"<tr><th>{e(k)}</th><td>{e(', '.join(v) if isinstance(v, list) else str(v))}</td></tr>"
                       for k, v in rows.items())
        return f"<h3>{e(title)}</h3><table>{body}</table>"

    sw = "".join(f"<span title='{c}' style='display:inline-block;width:36px;height:36px;background:{c}'></span>"
                 for c in d["palette"])
    img = "<img src='cutout.png' style='max-height:420px;background:#777'>" if (extract_dir / "cutout.png").exists() else ""
    parts = "".join(f"<img src='assets/{Path(d['source_image']).stem}_{k}.png' title='{k}' "
                    f"style='max-height:120px;margin:4px;background:#777'>" for k in d["parts"])
    page = (
        "<meta charset=utf-8><style>body{font:14px sans-serif;max-width:900px;margin:20px auto}"
        "th{text-align:left;padding-right:12px;color:#555}</style>"
        f"<h1>{e(d['name'])}</h1>{img}<div>{sw}</div><div>{parts}</div>"
        + table("Apparence", d["appearance"]) + table("Équipement", d["equipment"])
        + table("Personnalité", d["personality"]) + table("Voix", d["voice"])
        + table("Jeu", d["game"]) + f"<h3>Histoire</h3><p>{e(d['backstory'])}</p>")
    out = extract_dir / "character_sheet.html"
    out.write_text(page)
    m = missing(d)
    print(f"[sheet] {out}" + (f" — champs à remplir : {', '.join(m)}" if m else " — fiche complète"))
    return out
