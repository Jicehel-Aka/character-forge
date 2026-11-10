# Reconstruction d'une planche à partir de planches de sprites générées
Usage (chemins à adapter dans les scripts) : `match2.py` (choix des images par ligne, Viterbi) → `compose.py` (planche, fond magenta pur) → `tests.py` (tests par animation) → `annot.py` (planche annotée avec les noms de `names.json`).
Les noms sont à éditer dans `names.json`. Des surcharges manuelles (`OV` dans `compose.py`) fixent les poses rares (coups de pied, tir).

## Méthode retenue (v3)
Les mouvements sont définis par des règles, pas par la ressemblance de silhouette : `seq.json` donne, pour chaque animation, les 6 images choisies dans le catalogue de poses (accroupi, fente, coup de pied, tir, couché…). `tests_mvt.py` vérifie les règles (accroupi, coup de pied, balayage, jambes qui alternent, couché/relevé, éventail qui bouge). `kp.py` / `match3.py` : extraction de pose (YOLOv8-pose) et appariement automatique, utile pour les lignes d'attente.
