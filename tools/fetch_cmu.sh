#!/usr/bin/env bash
# Récupère les BVH CMU (conversion cgspeed, dépôt Shriinivas/cmubvh, 2,1 Go) puis décompresse les clips voulus.
# Usage : tools/fetch_cmu.sh 07_01 90_05 144_20   (les numéros sont listés dans les README du dépôt)
set -e
[ -d cmubvh ] || git clone --depth 1 https://github.com/Shriinivas/cmubvh
mkdir -p bvh
for n in "$@"; do f=$(find cmubvh -name "$n.zip" | head -1); [ -n "$f" ] && unzip -o -q "$f" -d bvh || echo "introuvable: $n"; done
echo "BVH dans ./bvh ; ex. : python -m forge anim import-bvh bvh/07_01.bvh --forward auto --skip 1 --stride 2 --cycle -o annots"
