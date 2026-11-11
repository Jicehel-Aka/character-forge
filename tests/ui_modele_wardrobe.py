# Test d'interface (Playwright) : garde-robe de modele.html. Serveur : cd docs && python3 -m http.server 8765
from playwright.sync_api import sync_playwright
import sys
OUT='/tmp/ext/rt/'
Q='/home/claude/qs/public/glb/'
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1000})
    pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8765/modele.html')
    ev=lambda js:pg.evaluate(js)
    # 1) Viking (rig Mixamo) : épée, bouclier, couronne, collier
    pg.set_input_files('#file','/tmp/ext/fbx/viking_rigged.glb'); pg.wait_for_timeout(3000)
    for i in ['q_sword','k_shield_round','r_crown2']:
        print(ev(f"(async()=>{{const e=_test.WD.CAT.items.find(x=>x.id=='{i}');await _test.wdAdd({{...e,kind:'item'}});return _test.WD.eq.length}})()"))
    ev("document.querySelector('#clip').value='2';document.querySelector('#clip').onchange({target:document.querySelector('#clip')})")
    pg.wait_for_timeout(1500); pg.screenshot(path=OUT+'w1.png',clip={'x':20,'y':130,'width':890,'height':660})
    # 2) personnage modulaire Quaternius : cheveux d'un autre, haut d'un autre
    pg.set_input_files('#file',Q+'modular_women/Casual.glb'); pg.wait_for_timeout(3000)
    print(pg.inner_text('#info'))
    for i in ['men_king_cheveux','men_king_haut','women_witch_bas','men_swat_chaussures']:
        print(ev(f"(async()=>{{const e=_test.WD.CAT.parts.find(x=>x.id=='{i}');await _test.wdAdd({{...e,kind:'part',cat:e.slot}});return _test.WD.eq.length}})()"))
    print(pg.inner_text('#wmsg'))
    pg.screenshot(path=OUT+'w2.png',clip={'x':20,'y':130,'width':890,'height':660})
    b.close()
