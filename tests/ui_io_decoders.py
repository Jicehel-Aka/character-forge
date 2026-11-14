# Test : un GLB compressé (Draco, Meshopt) s'ouvre, se range, s'exporte ; les décodeurs sont 100 % locaux (aucune requête externe).
# Les GLB sont produits à la volée par gltf-transform (GLTF_TOOLS = dossier avec node_modules/.bin/gltf-transform).
import sys, os, subprocess; sys.path.insert(0, os.path.dirname(__file__))
from _io_helpers import *
if not TOOLS: print('SKIP : GLTF_TOOLS absent'); sys.exit(0)
G = os.path.join(TOOLS, 'node_modules', '.bin', 'gltf-transform'); ROOT = os.path.join(os.path.dirname(__file__), '..', 'docs')
fich = {}
for src in ('exemple/mannequin.glb', 'bank/knight.glb'):
    for mode in ('draco', 'meshopt'):
        out = os.path.join(OUT, os.path.basename(src)[:-4] + '_' + mode + '.glb')
        subprocess.run([G, 'optimize', os.path.join(ROOT, src), out, '--compress', mode, '--texture-compress', 'false'], capture_output=True, check=True)
        fich[os.path.basename(out)] = out
with sync_playwright() as p:
    b, pg, errs = page(p); externes = []
    pg.on('request', lambda r: externes.append(r.url) if not r.url.startswith(('http://127.0.0.1', 'blob:', 'data:')) else None)
    pg.goto(URL); pg.wait_for_timeout(1200)
    for nom, f in fich.items():
        pg.set_input_files('#file', f)
        try: pg.wait_for_function("t=>{const i=document.querySelector('#info');return i.textContent.includes(t)||i.classList.contains('bad')}", arg=nom, timeout=30000)
        except Exception: pass
        info = pg.inner_text('#info'); ok = 'impossible' not in info and 'triangles' in info
        check('ouverture ' + nom, ok, info[:90])
        if ok:
            # export (attributs quantifiés après Meshopt) : le squelette existe déjà -> bglb
            pg.check('#bglba') if pg.evaluate('_test.clips.length') else None
            with pg.expect_download(timeout=60000) as d: pg.click('#bglb')
            g = os.path.join(OUT, 'exp_' + nom); d.value.save_as(g)
            v = validate(g); check('  export de ' + nom + ' valide', (v is None) or v[0] == 0, str(v))
    check('aucune requête externe (CDN)', not externes, str(externes[:3]))
    check('aucune erreur JS', not errs, str(errs)[:300])
    b.close()
sys.exit(1 if check.fails else 0)
