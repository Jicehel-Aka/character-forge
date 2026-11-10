# Test d'interface (Playwright) : python tests/ui_modele_export.py — serveur : cd docs && python3 -m http.server 8765 ; modèle : un GLB animé (chemin ci-dessous à adapter)
from playwright.sync_api import sync_playwright
import os, json, zipfile
os.makedirs('/tmp/ext/dl2',exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1000},accept_downloads=True)
    pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8765/modele.html')
    pg.set_input_files('#file','/tmp/ext/fbx/viking_rigged.glb'); pg.wait_for_timeout(4000)
    pg.fill('#frames','3'); pg.select_option('#ndir','4'); pg.select_option('#size','64')
    print('disabled before:',pg.is_disabled('#xzip'))
    pg.click('#xall')
    for _ in range(300):
        if 'bibliothèque' in pg.inner_text('#xmsg') or 'Erreur' in pg.inner_text('#prog'): break
        pg.wait_for_timeout(1000)
    print('MSG',pg.inner_text('#xmsg')); print('LIB',pg.inner_text('#xlib'))
    pg.screenshot(path='/tmp/ext/modele_page2.png',full_page=False)
    for bid in ['xzip','dlpng','xatlas','xgif','xframes','dlraw','dlh','dljson']:
        try:
            with pg.expect_download(timeout=240000) as d: pg.click('#'+bid)
            f=d.value; f.save_as('/tmp/ext/dl2/'+f.suggested_filename); print(bid,'->',f.suggested_filename,os.path.getsize('/tmp/ext/dl2/'+f.suggested_filename))
        except Exception as e: print(bid,'FAIL',str(e)[:120])
    pg.check('#xmag')
    with pg.expect_download() as d: pg.click('#dlpng')
    d.value.save_as('/tmp/ext/dl2/'+d.value.suggested_filename); print('mag ->',d.value.suggested_filename)
    b.close()
