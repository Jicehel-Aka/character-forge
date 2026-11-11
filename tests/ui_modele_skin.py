# Test d'interface : nettoyage automatique des poids de peau d'un modèle abîmé (Cammy) — n'est appliqué que s'il réduit l'étirement.
# Modèle de test : le GLB squeletté de Cammy (non versionné : propriété d'un tiers) ; passer son chemin en argument. Serveur : cd docs && python3 -m http.server 8765
import sys
from playwright.sync_api import sync_playwright
F=sys.argv[1]
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(); pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.goto('http://127.0.0.1:8765/modele.html'); pg.wait_for_timeout(1500)
    pg.set_input_files('#file',F)
    for _ in range(90):
        pg.wait_for_timeout(1000); t=pg.inner_text('#rmsg')
        if 'Poids de peau' in t or 'Nettoyage' in t: break
    print(t)
    assert 'nettoyés' in t, t
    import re; m=re.search(r'\((\d+) → (\d+) sommet',t); a,c=int(m.group(1)),int(m.group(2)); assert c<=a*.7,(a,c)
    # relancer le nettoyage ne doit pas dégrader : le second passage garde ou améliore
    r=pg.evaluate("(()=>{const r=_test.skinFix(_test.M,false);return [r.before,r.after]})()"); print('2e passage',r); assert r[1]<=r[0]*1.05,r
    print('OK'); b.close()
