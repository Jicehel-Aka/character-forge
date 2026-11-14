"""Mesure temps + mémoire de la génération de sprites (Playwright). Usage :
   python3 tests/mesure_sprites.py                 -> version courante (docs/)
   DOCS_DIR=/chemin/vers/ancien/docs python3 tests/mesure_sprites.py   -> comparer avec une ancienne version (tailles PC ajoutées au menu par le script)
Chaque ligne : taille de case, images, secondes, heap JS (Mo) après génération, pic de heap (Mo)."""
import os, sys, time
sys.path.insert(0, os.path.dirname(__file__))
from _sprites_common import *

CAS = [('48', 6, 8), ('64', 6, 8), ('128', 6, 8), ('256', 6, 8), ('512', 6, 8), ('512', 24, 8)]
with page() as pg:
    load_mannequin(pg)
    pg.select_option('#clip', index=2)
    pg.evaluate("for(const v of [256,512]){if(![...document.querySelectorAll('#size option')].some(o=>+o.value===v)){const o=document.createElement('option');o.textContent=v;document.querySelector('#size').appendChild(o)}}")
    pg.fill('#colors', '32')
    for size, n, nd in CAS:
        pg.select_option('#size', size); pg.fill('#frames', str(n)); pg.select_option('#ndir', str(nd))
        pg.evaluate("window.__peak=0;window.__iv=setInterval(()=>{window.__peak=Math.max(window.__peak,performance.memory.usedJSHeapSize)},100)")
        t = time.time(); m = generate(pg); dt = time.time() - t
        heap, peak = pg.evaluate("[Math.round(performance.memory.usedJSHeapSize/2**20),Math.round(Math.max(window.__peak,performance.memory.usedJSHeapSize)/2**20)]"); pg.evaluate("clearInterval(window.__iv)")
        print(f'{size:>4} px  {n*nd:>4} images  {dt:6.2f} s  heap {heap:>5} Mo  pic {peak:>5} Mo  | {m[:60]}')
    print('erreurs JS :', pg.errs)
