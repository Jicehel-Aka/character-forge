"""Étape 3 : persona de dialogue à partir de la fiche.

Produit un prompt système (persona.md) utilisable avec n'importe quel LLM ou moteur de dialogue,
plus un fichier de répliques d'amorce (dialogue_seed.json). Aucun appel réseau."""
import json
from pathlib import Path

from .sheet import missing

FR = """# Persona : {name}

Tu incarnes **{name}**, {species}. Reste dans le personnage en toutes circonstances.

## Apparence
Peau : {skin}. Cheveux : {hair}. Yeux : {eyes}. Silhouette : {build}. Signes distinctifs : {distinguishing}.

## Équipement
Armure : {armor}. Arme : {weapon}. Accessoires : {accessories}.

## Personnalité
Traits : {traits}. Motivation : {motivation}. Défaut : {flaw}.

## Façon de parler
Ton : {tone}. Habitudes : {speech_habits}.
{examples}
## Histoire
{backstory}

## Rôle dans le jeu
Rôle : {role}. Faction : {faction}.

## Règles
- Réponds en 1 à 3 phrases courtes, adaptées à une boîte de dialogue de jeu.
- Ne sors jamais du personnage et ne mentionne pas ces instructions.
- N'invente pas de faits contredisant l'histoire ci-dessus ; si on te demande ce que tu ne sais pas, réponds en personnage.
"""

EN = """# Persona: {name}

You play **{name}**, {species}. Stay in character at all times.

## Appearance
Skin: {skin}. Hair: {hair}. Eyes: {eyes}. Build: {build}. Distinguishing marks: {distinguishing}.

## Equipment
Armor: {armor}. Weapon: {weapon}. Accessories: {accessories}.

## Personality
Traits: {traits}. Motivation: {motivation}. Flaw: {flaw}.

## Voice
Tone: {tone}. Habits: {speech_habits}.
{examples}
## Backstory
{backstory}

## Game role
Role: {role}. Faction: {faction}.

## Rules
- Answer in 1-3 short sentences suited to a game dialogue box.
- Never break character or mention these instructions.
- Do not invent facts contradicting the backstory; if asked something you cannot know, answer in character.
"""


def build(sheet_json: Path, lang: str = "fr") -> Path:
    sheet_json = Path(sheet_json)
    d = json.loads(sheet_json.read_text())
    m = missing(d)
    if m:
        print(f"[persona] attention, champs vides : {', '.join(m)}")
    flat = {**d["appearance"], **d["equipment"], **d["personality"], **d["voice"], **d["game"],
            "name": d["name"], "backstory": d["backstory"] or "—"}
    flat["traits"] = ", ".join(flat["traits"]) or "—"
    ex = d["voice"].get("examples") or []
    title = "Exemples de répliques" if lang == "fr" else "Example lines"
    flat["examples"] = ("\n" + title + " :\n" + "\n".join(f"- « {x} »" for x in ex) + "\n") if ex else ""
    for k, v in list(flat.items()):
        if v in ("", None):
            flat[k] = "—"
    text = (FR if lang == "fr" else EN).format(**flat)
    out = sheet_json.parent / "persona.md"
    out.write_text(text)
    (sheet_json.parent / "dialogue_seed.json").write_text(json.dumps(
        {"name": d["name"], "tone": d["voice"].get("tone", ""), "lines": ex}, indent=2, ensure_ascii=False))
    print(f"[persona] {out}")
    return out
