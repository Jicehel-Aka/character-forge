# Aides communes aux tests io/sécurité de modele.html (Playwright + validateur glTF).
# Variables d'environnement :
#   CF_URL       adresse de modele.html (défaut http://127.0.0.1:8791/modele.html) ; serveur : cd docs && python3 -m http.server 8791
#   GLTF_TOOLS   dossier contenant node_modules/{gltf-validator,@gltf-transform/cli} (hors dépôt) ; sans lui, les tests de validation sont ignorés
import os, json, subprocess, tempfile
from playwright.sync_api import sync_playwright

URL = os.environ.get('CF_URL', 'http://127.0.0.1:8791/modele.html')
TOOLS = os.environ.get('GLTF_TOOLS', '')
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
OUT = tempfile.mkdtemp(prefix='cf_io_')

def page(p, w=1300, h=1000, **kw):
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': w, 'height': h}, accept_downloads=True, **kw)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    return b, pg, errs

def open_model(pg, bouton='#bexemple'):
    pg.goto(URL); pg.wait_for_timeout(1200)
    pg.click(bouton); pg.wait_for_function('window._test && _test.M', timeout=30000); pg.wait_for_timeout(800)

def validate(path):
    """Retourne (erreurs, avertissements, messages) du validateur glTF officiel, ou None s'il n'est pas installé."""
    if not TOOLS or not os.path.isdir(os.path.join(TOOLS, 'node_modules', 'gltf-validator')): return None
    js = ("import v from 'gltf-validator';import fs from 'fs';"
          "const r=await v.validateBytes(new Uint8Array(fs.readFileSync(process.argv[2])),{maxIssues:2000});"
          "console.log(JSON.stringify({e:r.issues.numErrors,w:r.issues.numWarnings,m:r.issues.messages.filter(x=>x.severity===0).slice(0,5).map(x=>x.code+' '+x.pointer)}))")
    f = os.path.join(TOOLS, '_val.mjs'); open(f, 'w').write(js)
    o = subprocess.run(['node', f, path], capture_output=True, text=True, cwd=TOOLS)
    d = json.loads(o.stdout.strip().splitlines()[-1]); return d['e'], d['w'], d['m']

def check(name, ok, detail=''):
    print(('OK   ' if ok else 'ECHEC'), name, detail); 
    if not ok: check.fails += 1
check.fails = 0
