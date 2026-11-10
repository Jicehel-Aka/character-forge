# Test d'interface (Playwright) : ajout d'animations / de squelette dans modele.html
# serveur : cd docs && python3 -m http.server 8765 ; chemins ci-dessous à adapter
from playwright.sync_api import sync_playwright
import sys
A='/mnt/user-data/attachments/9dd98225-c655-5eeb-be5b-44607c5c472a/'
OUT='/tmp/ext/rt/'
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1100})
    pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8765/modele.html')
    # 1) modèle avec squelette (viking GLB) + animations Mixamo FBX
    pg.set_input_files('#file','/tmp/ext/fbx/viking_rigged.glb'); pg.wait_for_timeout(3000)
    print('INFO1',pg.inner_text('#info'))
    pg.set_input_files('#fanim',[A+'628ad087-Combo_Punch.fbx',A+'741cdefc-Receiving_A_Big_Uppercut.fbx',A+'c4cec749-Idle.fbx'])
    for _ in range(120):
        if '✓' in pg.inner_text('#rmsg') or '✗' in pg.inner_text('#rmsg'): break
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(3000)
    print('RMSG1\n'+pg.inner_text('#rmsg')); print('INFO1b',pg.inner_text('#info'))
    print('CLIPS',pg.evaluate('_test.clips.map(c=>c.name)'))
    pg.screenshot(path=OUT+'viking_punch.png')
    # 2) modèle sans os (danseuse) + squelette Mixamo + animation
    pg.set_input_files('#file','/tmp/ext/z/dancing_girl_in_kimono_3_1670864435/Dancing Girl 02.fbx'); pg.wait_for_timeout(5000)
    print('INFO2',pg.inner_text('#info'))
    if len(sys.argv)>1: b.close(); sys.exit()
    pg.set_input_files('#fskel',A+'65156306-Lead_Jab.fbx')
    for _ in range(240):
        t=pg.inner_text('#rmsg')
        if 'posé' in t or 'Échec' in t or 'déjà' in t or 'non reconnu' in t: break
        pg.wait_for_timeout(500)
    print('RMSG2\n'+pg.inner_text('#rmsg')); print('INFO2b',pg.inner_text('#info'))
    pg.set_input_files('#fanim',[A+'628ad087-Combo_Punch.fbx',A+'65156306-Lead_Jab.fbx'])
    for _ in range(120):
        if '✓' in pg.inner_text('#rmsg') or '✗' in pg.inner_text('#rmsg'): break
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(3000)
    print('RMSG3\n'+pg.inner_text('#rmsg'))
    pg.screenshot(path=OUT+'dancer_punch.png')
    b.close()
