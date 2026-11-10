# Reconstruction d'une planche à partir de planches de sprites générées
Usage (chemins à adapter dans les scripts) : `match2.py` (choix des images par ligne, Viterbi) → `compose.py` (planche, fond magenta pur) → `tests.py` (tests par animation) → `annot.py` (planche annotée avec les noms de `names.json`).
Les noms sont à éditer dans `names.json`. Des surcharges manuelles (`OV` dans `compose.py`) fixent les poses rares (coups de pied, tir).
