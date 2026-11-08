# Bibliothèque d'animations de départ (apprise sur de vraies données de capture)

| Modèle | Source | Apprentissage |
|---|---|---|
| `walk.json` | CMU 07_01, 07_02, 08_01 (marche) | 3 cycles détectés (65, 65, 60 images à 60 Hz), phases alignées, 16 images, périodique ; écart moyen entre exemples et modèle : 9,1° |
| `jump_kick.json` | CMU 90_05 (coup de pied sauté), images 30-100 | 1 exemple, 16 images, non périodique |

Provenance : base de capture de mouvement de l'université Carnegie-Mellon, conversion BVH de B. Hahne (cgspeed),
reprise dans le dépôt Shriinivas/cmubvh. Le README de ce dépôt cite : « CMU places no restrictions on the use of
the original dataset, and I (Bruce) place no additional restrictions on the use of this particular BVH conversion. »
Les BVH d'origine (2,1 Go) ne sont pas copiés ici : `tools/fetch_cmu.sh`. `source_annotations/` contient les poses 2D de profil
extraites. Limites : un seul sujet pour le coup de pied ; la vue de profil perd la profondeur (os raccourcis quand
un membre pointe vers la caméra : `anim check` les signale, sans gravité) ; `*_apercu.png` = bonhommes-bâton, pas
des sprites.
