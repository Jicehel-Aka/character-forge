"""Assistant sprites : personnage de la banque -> plateforme -> 8 actions -> bibliothèque ; contrôle du squelette.
Lancer : cd docs && python3 -m http.server 8765 (autre terminal), puis python3 tests/ui_modele_wizard.py"""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1000}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:8765/modele.html'); pg.wait_for_timeout(2500)
    pg.select_option('#zchar','b:rogue'); pg.click('#zload'); pg.wait_for_timeout(5000)
    pg.click('#zgo')
    for _ in range(900):
        m=pg.inner_text('#zmsg')
        if 'action(s) générée' in m or m.startswith('Échec'): break
        pg.wait_for_timeout(500)
    print(m)
    n=pg.evaluate('_test.library.size'); assert n==8,n
    r=pg.evaluate('(()=>{const r=_test.rigAnalyse(true);return r.badAfter})()'); assert r<=5,r
    assert not errs,errs
    print('OK')
    b.close()
