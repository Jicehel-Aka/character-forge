"""Écrit la banque d'objets générés par code (CC0, aucun fichier source) dans docs/bank/objets/ : un GLB animé par type (pièces nommées,
un clip par état, pas de squelette) + catalog.json. Ces GLB s'ouvrent avec « Ouvrir le modèle » de modele.html, ou dans Godot / Blender.
Les pistes d'échelle (squash & stretch, apparition) sont dans le GLB ; modele.html n'en garde que position et rotation à l'import d'un
fichier : pour le rendu complet des sprites, utiliser la section « Monstres & objets » (qui charge l'objet directement).
Lancer :  python3 tests/generer_banque_objets.py"""
import base64, functools, http.server, json, os, threading
from playwright.sync_api import sync_playwright
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); DOCS = os.path.join(RACINE, 'docs'); OUT = os.path.join(DOCS, 'bank', 'objets')
JS = """async()=>{const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');const F=window.ObjetsForge,res=[];
  for(const c of F.catalogue()){const O=F.creer(c.id,{});const buf=await new Promise((ok,ko)=>new GLTFExporter().parse(O.racine,ok,ko,{binary:true,animations:O.clips,onlyVisible:true}));
    let s='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));
    res.push({id:c.id,label:c.label,famille:c.famille,b:btoa(s),etats:O.etats.map(e=>({id:e.id,clip:e.clip,images:e.N,boucle:e.boucle,duree_s:e.dur,suivant:e.suivant})),vue:O.vue,cadre:O.cadre})}return res}"""
def main():
    os.makedirs(OUT, exist_ok=True)
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=DOCS)); threading.Thread(target=s.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]); pg = b.new_page()
        pg.goto(f'http://127.0.0.1:{s.server_address[1]}/modele.html'); pg.wait_for_timeout(1500)
        res = pg.evaluate(JS); cat = []
        for r in res:
            open(os.path.join(OUT, r['id'] + '.glb'), 'wb').write(base64.b64decode(r.pop('b'))); r['file'] = r['id'] + '.glb'; r['license'] = 'CC0 1.0 (généré par code, docs/objets.js)'; cat.append(r)
        json.dump({'objets': cat}, open(os.path.join(OUT, 'catalog.json'), 'w'), ensure_ascii=False, indent=1)
        print(len(cat), 'GLB écrits dans', OUT); b.close()
    s.shutdown()
if __name__ == '__main__': main()
