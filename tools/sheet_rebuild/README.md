# Reconstruction d'une planche à partir de planches de sprites générées
Usage (chemins à adapter dans les scripts) : `match2.py` (choix des images par ligne, Viterbi) → `compose.py` (planche, fond magenta pur) → `tests.py` (tests par animation) → `annot.py` (planche annotée avec les noms de `names.json`).
Les noms sont à éditer dans `names.json`. Des surcharges manuelles (`OV` dans `compose.py`) fixent les poses rares (coups de pied, tir).

## Méthode retenue (v3)
Les mouvements sont définis par des règles, pas par la ressemblance de silhouette : `seq.json` donne, pour chaque animation, les 6 images choisies dans le catalogue de poses (accroupi, fente, coup de pied, tir, couché…). `tests_mvt.py` vérifie les règles (accroupi, coup de pied, balayage, jambes qui alternent, couché/relevé, éventail qui bouge). `kp.py` / `match3.py` : extraction de pose (YOLOv8-pose) et appariement automatique, utile pour les lignes d'attente.

## Poses de référence 3D (v4)
`refs/` contient 10 rendus 3D de la combattante fournis par l'utilisateur (couchée ×2, recul ×2, à genoux, marche ×5).
`seg.py` puis `build_refs.py` les détourent et les retournent face à droite (`refs/refs.pkl`, indices 182–191 dans S).
Ils alimentent Marche (ligne 3), Chute (19), KO (20) et Relevé (21) via `seq.json`.

## Sprites 2D de remplacement (v5)
`refs2d/` : deux planches 2D fournies (marche 6 images ; chute/KO/relevé) ; `ext.py` + `build_new.py` extraient 24 sprites (indices 192–215 dans S).
`seq.json` : ligne 3 = 192–197, ligne 19 = 198–203, ligne 20 = 204–209, ligne 21 = 210–215. Les poses 3D de `refs/` ne sont plus utilisées.
`refs2d/harm.py` harmonise les 6 sprites de marche avec le combattant : hauteur 102 px, largeur ×1,10, transfert de couleurs (histogramme par canal) vers la palette des autres lignes (28 couleurs), contour sombre de 1 px.
`refs2d/enlarge.py` (avant `harm.py`) agrandit la tête des sprites de marche (×1,30, ancrée au cou, coupe à y=116 px de la source) pour égaler la taille de tête des autres lignes.
