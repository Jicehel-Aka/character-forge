"""Génère l'exemple de bout en bout « jeu de plateforme AKA » dans docs/exemples/plateforme_aka/ :
héros (mannequin CC0) + slime + coffre + levier + porte -> UNE planche commune (palette commune), atlas Aseprite avec meta.gameData,
gamedata.json, gamedata.h (états, durées, boîtes), en-têtes RGB565 par animation ; puis compile et lance le C++ d'exemple sur PC
(rendu 320x240 dans un fichier, sans console) pour vérifier la lecture des animations.

Lancer :  python3 tests/generer_exemple_plateforme.py        (serveur http local lancé par le script)"""
import base64, functools, http.server, io, json, os, subprocess, sys, threading
from playwright.sync_api import sync_playwright

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(RACINE, 'docs'); OUT = os.path.join(DOCS, 'exemples', 'plateforme_aka'); PREV = os.path.join(DOCS, 'exemples', 'previews')
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
BASE = 'plateforme'; T = '48'
HEROS = [('idle', 'ual:Idle_Loop', 4), ('marche', 'ual:Walk_Loop', 6), ('saut', 'kaykit:Jump_Full_Short', 6), ('degat', 'kaykit:Hit_A', 4)]   # (nom, clip, images)
OBJETS = [('slime', {}), ('coffre', {}), ('levier', {}), ('porte', {})]


def serveur():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=DOCS))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]


def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)
    srv, port = serveur()
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1300, 'height': 1000}); err = []
        pg.on('pageerror', lambda e: err.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/modele.html'); pg.wait_for_timeout(2000)
        pg.select_option('#size', T)
        pg.evaluate("document.querySelector('#colors').value='64'")   # palette commune de 64 couleurs (héros + objets)
        # 1. héros : mannequin + 4 actions (sources fixées explicitement)
        pg.click('#bexemple'); pg.wait_for_function("document.querySelector('#info').textContent.includes('mannequin')", timeout=60000); pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelector('#ztype').dispatchEvent(new Event('change',{bubbles:true}))")   # redessine les lignes une fois le catalogue d'animations chargé
        pg.evaluate("""(H)=>{const rows=[...document.querySelectorAll('#zacts .zr')];
          rows.forEach((r,i)=>{const on=i<H.length;r.querySelector('.zon').checked=on;if(on){r.querySelector('.zlab').value=H[i][0];const s=r.querySelector('.zsrc');s.value=H[i][1];r.querySelector('.zdir').value='e';r.querySelector('.zn').value=H[i][2]}});
          document.querySelector('#zacts').dispatchEvent(new Event('change',{bubbles:true}))}""", [list(h) for h in HEROS])
        pg.click('#zgo')
        pg.wait_for_function("(()=>{const t=document.querySelector('#zmsg').textContent;return t.includes('générée')||t.startsWith('Échec')})()", timeout=300000)
        print('héros :', pg.inner_text('#zmsg')[:160].replace('\n', ' | '))
        # 2. objets et monstres dans la MÊME bibliothèque
        pg.evaluate("document.querySelector('#ocard').open=true")
        for tid, prm in OBJETS:
            pg.select_option('#otype', tid); pg.click('#oload'); pg.wait_for_timeout(200)
            pg.evaluate("document.querySelector('#oclear').checked=false"); pg.click('#ogen')
            pg.wait_for_function("(()=>{const t=document.querySelector('#omsg').textContent;return t.includes('générés')||t.includes('Échec')})()", timeout=180000)
            print(tid, ':', pg.inner_text('#omsg')[:110].replace('\n', ' '))
        pg.click('#xpal'); pg.wait_for_timeout(500)       # une palette pour tout (héros + objets)
        pg.evaluate("document.querySelector('#info').textContent='%s · exemple'" % BASE)   # nom de base des fichiers
        fich = pg.evaluate("""window._obj.buildPackage(false).then(f=>f.filter(x=>!/^frames\\//.test(x.name)&&!/\\.raw$/.test(x.name)).map(x=>{let s='';const u=new Uint8Array(x.data);for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));return{n:x.name,b:btoa(s)}}))""")
        for f in fich:
            open(os.path.join(OUT, f['n']), 'wb').write(base64.b64decode(f['b']))
        print(len(fich), 'fichiers écrits dans', OUT)
        if err: print('ERREURS JS', err); sys.exit(1)
        b.close()
    srv.shutdown()
    # aperçu de la planche (fond gris, x3)
    try:
        from PIL import Image
        im = Image.open(os.path.join(OUT, f'{BASE}_planche.png')).convert('RGBA'); f = Image.new('RGBA', im.size, (176, 178, 186, 255)); f.alpha_composite(im)
        f.resize((im.width * 2, im.height * 2), Image.NEAREST).save(os.path.join(PREV, 'exemple_plateforme_planche_x2.png'))
    except ImportError: pass
    # 3. C++ d'exemple compilé et lancé sur PC (rendu dans un fichier PPM), vérifie la lecture de gamedata.h
    src = os.path.join(OUT, 'exemple_aka.cpp')
    if os.path.exists(src):
        exe = os.path.join(OUT, '_exemple_hote')
        r = subprocess.run(['g++', '-std=c++17', '-Wall', '-Wextra', '-DHOTE', src, '-I', OUT, '-o', exe], capture_output=True, text=True)
        if r.returncode: print('COMPILATION C++ ÉCHOUÉE\n', r.stderr[:2000]); sys.exit(1)
        r = subprocess.run([exe, os.path.join(OUT, '_scene.ppm')], capture_output=True, text=True, cwd=OUT); print(r.stdout)
        if r.returncode: print('exécution échouée', r.stderr); sys.exit(1)
        try:
            from PIL import Image
            Image.open(os.path.join(OUT, '_scene.ppm')).resize((640, 480), Image.NEAREST).save(os.path.join(PREV, 'exemple_aka_scene_hote.png'))
        except ImportError: pass
        for t in ('_exemple_hote', '_scene.ppm'):
            try: os.remove(os.path.join(OUT, t))
            except OSError: pass
    print('OK')


if __name__ == '__main__':
    main()
