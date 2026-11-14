"""Monstres et objets procéduraux (docs/objets.js) : pour CHAQUE type du catalogue (et quelques variantes), charge l'objet par l'interface,
génère tous ses états, puis vérifie : aucune erreur JS, aucune image vide, images distinctes par animation, transitions cohérentes
(première image d'un état = dernière image de l'état précédent), ancre = bas du sprite, boîtes englobant tous les pixels, atlas
(meta.gameData, durées), paquet (gamedata.json + gamedata.h qui compile). Écrit aussi les captures de contrôle dans docs/exemples/previews/.

Lancer :  python3 tests/ui_objets.py            (serveur http local lancé par le script ; Chromium + playwright déjà installés)
Options : --taille 48 (cellule en px) ; --sans-captures ; --seulement coffre,slime"""
import argparse, base64, functools, http.server, io, json, os, subprocess, sys, tempfile, threading, zipfile
from playwright.sync_api import sync_playwright

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(RACINE, 'docs')
PREV = os.path.join(DOCS, 'exemples', 'previews')
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# variantes testées en plus des réglages par défaut : (type, paramètres)
VARIANTES = [('coffre', {'butin': False}), ('porte', {'type': 'charniere'}), ('bouton', {'forme': 'bouton'}), ('plateforme', {'trajet': .2}),
             ('volant', {'type': 'oiseau'}), ('quadrupede', {'paires': 3}), ('slime', {'couleur': '#d94fd1', 'largeur': 1.4}), ('crabe', {'pinces': 1.5})]

# analyse faite dans la page (les tableaux de pixels restent dans le navigateur)
JS_ANALYSE = """(prefixe)=>{
  const L=window._obj.library, out={};
  const hash=f=>{let h=2166136261;for(let j=0;j<f.mask.length;j++){if(f.mask[j]){h=Math.imul(h^f.rgba[j*4],16777619);h=Math.imul(h^f.rgba[j*4+1],16777619);h=Math.imul(h^f.rgba[j*4+2],16777619);h=Math.imul(h^j,16777619)}}return h>>>0};
  const n=f=>{let c=0;for(let j=0;j<f.mask.length;j++)c+=f.mask[j];return c};
  const dist=(a,b)=>{let u=0,d=0;for(let j=0;j<a.mask.length;j++){if(a.mask[j]||b.mask[j]){u++;if(a.mask[j]!==b.mask[j]||Math.abs(a.rgba[j*4]-b.rgba[j*4])+Math.abs(a.rgba[j*4+1]-b.rgba[j*4+1])+Math.abs(a.rgba[j*4+2]-b.rgba[j*4+2])>60)d++}}return u?d/u:0};
  for(const [name,R] of L){ if(!name.startsWith(prefixe))continue; const dirs={};
    for(const d of R.dirs){const fs=R.frames.filter(f=>f.d===d).sort((a,b)=>a.f-b.f);dirs[d]={n:fs.length,px:fs.map(n),h:fs.map(hash),
      bas:fs.map(f=>{let y=-1;for(let j=f.mask.length-1;j>=0;j--)if(f.mask[j]){y=Math.floor(j/R.T);break}return y}),
      dFirstLast:fs.length>1?dist(fs[0],fs[fs.length-1]):0}}
    out[name]={T:R.T,N:R.N,dirs}}
  return out}"""
JS_DIST = """([a,b,sens])=>{const L=window._obj.library,A=L.get(a),B=L.get(b),T=A.T;const fa=A.frames.filter(f=>f.d===A.dirs[0]).sort((p,q)=>p.f-q.f),fb=B.frames.filter(f=>f.d===B.dirs[0]).sort((p,q)=>p.f-q.f);
  const x=sens==='fin'?fa[fa.length-1]:fa[0],y=fb[0];
  // écart de silhouette tolérant à 1 px : part des pixels opaques de l'une sans voisin opaque (3x3) dans l'autre
  const loin=(m1,m2)=>{let n=0,c=0;for(let j=0;j<T*T;j++){if(!m1[j])continue;c++;const px=j%T,py=(j/T)|0;let ok=false;for(let dy=-1;dy<=1&&!ok;dy++)for(let dx=-1;dx<=1;dx++){const X=px+dx,Y=py+dy;if(X>=0&&Y>=0&&X<T&&Y<T&&m2[Y*T+X]){ok=true;break}}if(!ok)n++}return[n,c]};
  const[n1,c1]=loin(x.mask,y.mask),[n2,c2]=loin(y.mask,x.mask);return(n1+n2)/Math.max(1,c1+c2)}"""
# vérifie que tous les pixels opaques d'un état sont dans sa hurtbox (±1 px)
JS_BOITE = """([nom,x,y,w,h])=>{const R=window._obj.library.get(nom);let hors=0;for(const f of R.frames)for(let j=0;j<f.mask.length;j++)if(f.mask[j]){const px=j%R.T,py=(j/R.T)|0;if(px<x-1||px>x+w||py<y-1||py>y+h)hors++}return hors}"""


def serveur():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DOCS)
    h.log_message = lambda *a, **k: None
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=DOCS))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--taille', default='48'); ap.add_argument('--sans-captures', action='store_true'); ap.add_argument('--seulement', default='')
    a = ap.parse_args(); T = int(a.taille); seul = [x for x in a.seulement.split(',') if x]
    srv, port = serveur(); echecs = []; resume = []
    if not a.sans_captures: os.makedirs(PREV, exist_ok=True)
    def ko(msg): echecs.append(msg); print('  ECHEC', msg)

    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={'width': 1250, 'height': 1000}); erreurs = []
        pg.on('pageerror', lambda e: erreurs.append('pageerror ' + str(e)))
        pg.on('console', lambda m: erreurs.append('console ' + m.text) if m.type == 'error' else None)
        pg.goto(f'http://127.0.0.1:{port}/modele.html'); pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelector('#ocard').open=true")
        if not pg.evaluate("!!window.ObjetsForge && !!document.querySelector('#otype')"): ko('objets.js / section UI absents'); sys.exit(1)
        pg.select_option('#size', str(T))
        cat = pg.evaluate("window.ObjetsForge.catalogue()")
        cas = [(c['id'], {}, c['id']) for c in cat] + [(i, pr, i + '+' + ','.join(f'{k}={v}' for k, v in pr.items())) for i, pr in VARIANTES]
        if seul: cas = [c for c in cas if c[0] in seul]
        print(f'{len(cat)} types au catalogue, {len(cas)} cas, cellule {T} px')

        for tid, prm, libelle in cas:
            print('==', libelle)
            erreurs.clear()
            # --- chargement par l'interface (le formulaire est celui de l'utilisateur) ---
            pg.select_option('#otype', tid)
            for k, v in prm.items():
                sel = f'#op_{k}'
                t = pg.evaluate(f"document.querySelector('{sel}').type")
                if t == 'checkbox': pg.evaluate(f"document.querySelector('{sel}').checked={json.dumps(v)}")
                elif t == 'color' or t == 'number': pg.evaluate(f"document.querySelector('{sel}').value={json.dumps(str(v))}")
                else: pg.select_option(sel, str(v))
            pg.click('#oload'); pg.wait_for_timeout(150)
            msg = pg.inner_text('#omsg')
            if 'Échec' in msg: ko(f'{libelle} : chargement : {msg}'); continue
            info = pg.inner_text('#info')
            etats = pg.evaluate("window._obj.getM().userData.objet.etats.map(e=>({id:e.id,clip:e.clip,N:e.N,boucle:e.boucle,statique:e.statique,suivant:e.suivant}))")
            trans = pg.evaluate("window._obj.getM().userData.objet.transitions")
            nom = pg.evaluate("window._obj.getM().userData.objet.nom")
            nclips = pg.evaluate("window._obj.getClips().length")
            if nclips != len(etats): ko(f'{libelle} : {nclips} clips pour {len(etats)} états')
            if ' 0 os' not in info: ko(f'{libelle} : info inattendue « {info} »')
            # les clips sont dans la liste « Animation » existante
            opts = pg.evaluate("[...document.querySelectorAll('#clip option')].map(o=>o.textContent)")
            for e in etats:
                if not any(o.startswith(e['clip']) for o in opts): ko(f'{libelle} : clip « {e["clip"]} » absent de la liste Animation')
            # --- génération de tous les états ---
            pg.evaluate("document.querySelector('#oclear').checked=true")
            pg.click('#ogen')
            pg.wait_for_function("(()=>{const t=document.querySelector('#omsg').textContent;return t.includes('générés')||t.includes('Échec')})()", timeout=180000)
            msg = pg.inner_text('#omsg')
            if 'Échec' in msg: ko(f'{libelle} : génération : {msg}'); continue
            an = pg.evaluate(JS_ANALYSE, nom)
            # a) nombre d'images, b) images non vides, c) images distinctes
            for e in etats:
                nm = f'{nom}_{e["id"]}'
                if nm not in an: ko(f'{libelle} : état {e["id"]} absent de la bibliothèque'); continue
                for d, v in an[nm]['dirs'].items():
                    if v['n'] != e['N']: ko(f'{libelle}/{e["id"]}/{d} : {v["n"]} images au lieu de {e["N"]}')
                    if min(v['px']) < 3: ko(f'{libelle}/{e["id"]}/{d} : image (quasi) vide {v["px"]}')
                    dist = len(set(v['h']))
                    if not e['statique'] and dist < max(2, (e['N'] + 1) // 2): ko(f'{libelle}/{e["id"]}/{d} : seulement {dist} images distinctes sur {e["N"]}')
            # d) transitions : la 1re image de l'état d'arrivée ressemble à l'état de départ ; la fin d'un état ressemble à son suivant
            def dist(x, y, sens): return pg.evaluate(JS_DIST, [f'{nom}_{x}', f'{nom}_{y}', sens])
            tol = .30
            for e in etats:
                if e['suivant']:
                    r = dist(e['id'], e['suivant'], 'fin')
                    if r > tol: ko(f'{libelle} : fin de « {e["id"]} » ≠ début de « {e["suivant"]} » (écart {r:.2f})')
            for t in trans:
                r = dist(t['de'], t['vers'], 'debut')
                if r > tol: ko(f'{libelle} : « {t["de"]} » -> « {t["vers"]} » ({t["evenement"]}) incohérent : débuts différents (écart {r:.2f})')
            # e) données de jeu
            gd = pg.evaluate("window._obj.obDonnees()")
            if nom not in gd['objets']: ko(f'{libelle} : pas de gameData'); continue
            o = gd['objets'][nom]
            if set(o['etats']) != {e['id'] for e in etats}: ko(f'{libelle} : états du gameData {set(o["etats"])}')
            repos = o['etats'][o['etat_initial']]
            bas_reel = min(an[f'{nom}_{o["etat_initial"]}']['dirs'][d]['bas'][0] for d in an[f'{nom}_{o["etat_initial"]}']['dirs'])
            ancre_y = o['ancre']['y']
            sol = pg.evaluate("window._obj.getM().userData.objet.ancre3d[1]") == 0
            if sol and abs(bas_reel - ancre_y) > 3: ko(f'{libelle} : ancre y={ancre_y} mais bas du sprite à {bas_reel}')
            if not (0 <= o['ancre']['x'] <= T and 0 <= ancre_y <= T): ko(f'{libelle} : ancre hors cellule {o["ancre"]}')
            for ide, es in o['etats'].items():
                h = es['hurtbox']
                if not h: ko(f'{libelle}/{ide} : pas de hurtbox'); continue
                hors = pg.evaluate(JS_BOITE, [es['animation'], h['x'], h['y'], h['w'], h['h']])
                if hors: ko(f'{libelle}/{ide} : {hors} pixels hors de la hurtbox')
                if len(es['duree_ms']) != es['images']: ko(f'{libelle}/{ide} : durées ≠ images')
                if not es['statique'] and min(es['duree_ms']) <= 0: ko(f'{libelle}/{ide} : durée nulle')
                if es['collision'] not in ('solide', 'traversable', 'dangereux', 'declencheur', 'aucune'): ko(f'{libelle}/{ide} : collision « {es["collision"]} »')
                if 'hitbox' in es and not (es['hitbox'].get('w', 0) > 0): ko(f'{libelle}/{ide} : hitbox vide')
            for pt, v in o['points'].items():
                if not (-T <= v['x'] <= 2 * T and -T <= v['y'] <= 2 * T): ko(f'{libelle} : point {pt} aberrant {v}')
            # f) atlas + paquet
            at = json.loads(pg.evaluate("window._obj.atlasJSON()"))
            if 'gameData' not in at['meta']: ko(f'{libelle} : atlas sans meta.gameData')
            else:
                W, H = at['meta']['size']['w'], at['meta']['size']['h']
                for k, f in at['frames'].items():
                    fr = f['frame']
                    if fr['x'] + fr['w'] > W or fr['y'] + fr['h'] > H: ko(f'{libelle} : image {k} hors de la planche')
                for ide, es in o['etats'].items():
                    k = f'{es["animation"]}_{es["tag"].rsplit("_",1)[1]}_00'
                    if k not in at['frames']: ko(f'{libelle} : {k} absent de l\'atlas')
                    elif not es['statique'] and at['frames'][k]['duration'] != es['duree_ms'][0]: ko(f'{libelle} : durée atlas ≠ gameData pour {k}')
                    if es['tag'] not in {t['name'] for t in at['meta']['frameTags']}: ko(f'{libelle} : tag {es["tag"]} absent')
            resume.append((libelle, len(etats), sum(e['N'] for e in etats), o['cellule']['w'], o['px_par_unite']))
            # g) captures de contrôle (planche sur fond gris, agrandie x3 sans lissage)
            if not a.sans_captures:
                d = pg.evaluate("window._obj.sheetCanvasAll(false).toDataURL('image/png')")
                nomf = libelle.replace('+', '_').replace('=', '').replace(',', '_').replace('#', '').replace('.', '')
                brut = base64.b64decode(d.split(',')[1]); cible = os.path.join(PREV, f'{nomf}_{T}px.png')
                try:   # fond gris + agrandissement x3 sans lissage, pour juger la lisibilité à l'œil (sinon planche brute)
                    from PIL import Image
                    im = Image.open(io.BytesIO(brut)).convert('RGBA'); fond = Image.new('RGBA', im.size, (176, 178, 186, 255)); fond.alpha_composite(im)
                    fond.resize((im.width * 3, im.height * 3), Image.NEAREST).save(cible)
                except ImportError: open(cible, 'wb').write(brut)
            if erreurs: ko(f'{libelle} : erreurs JS : {erreurs[:3]}')

        # --- les boutons EXISTANTS marchent sur un objet : « Générer » (liste Animation), export paquet, atlas ---
        print('== boutons existants sur un objet (Générer / paquet ZIP)')
        erreurs.clear()
        pg.select_option('#otype', 'coffre'); pg.click('#oload'); pg.wait_for_timeout(200)
        idx = pg.evaluate("window._obj.getClips().findIndex(c=>c.name.endsWith('ouverture'))")
        pg.select_option('#clip', str(idx)); pg.evaluate("document.querySelector('#frames').value='5';document.querySelector('#ndir').value='1'")
        pg.click('#go'); pg.wait_for_function("document.querySelector('#prog').textContent.includes('images')||document.querySelector('#prog').textContent.includes('Erreur')", timeout=120000)
        prog = pg.inner_text('#prog'); print('  ', prog[:100])
        if 'Erreur' in prog: ko('bouton « Générer » sur un objet : ' + prog)
        if pg.evaluate("document.querySelector('#xzip').disabled"): ko('export ZIP inactif après Générer sur un objet')
        # paquet complet d'un objet généré par la section
        pg.evaluate("document.querySelector('#oclear').checked=true"); pg.click('#ogen')
        pg.wait_for_function("document.querySelector('#omsg').textContent.includes('générés')", timeout=120000)
        pg.select_option('#otype', 'slime'); pg.click('#oload'); pg.evaluate("document.querySelector('#oclear').checked=false"); pg.click('#ogen')
        pg.wait_for_function("document.querySelector('#omsg').textContent.includes('générés')", timeout=120000)
        fich = pg.evaluate("""window._obj.buildPackage(false).then(f=>f.filter(x=>/gamedata|\\.h$|atlas|meta/.test(x.name)&&!/frames/.test(x.name)).map(x=>{let s='';const u=new Uint8Array(x.data);for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));return{n:x.name,b:btoa(s)}}))""")
        noms = [f['n'] for f in fich]; print('  ', noms)
        for need in ('_gamedata.json', '_gamedata.h', '_atlas.json', '_meta.json'):
            if not any(n.endswith(need) for n in noms): ko('paquet : ' + need + ' absent')
        tmp = tempfile.mkdtemp()
        for f in fich:
            open(os.path.join(tmp, f['n']), 'wb').write(base64.b64decode(f['b']))
        gh = [n for n in noms if n.endswith('_gamedata.h')]
        if gh:
            try:
                gj = json.load(open(os.path.join(tmp, [n for n in noms if n.endswith('_gamedata.json')][0])))
                if not {'coffre', 'slime'} <= set(gj['objets']): ko(f'gamedata.json : objets {set(gj["objets"])}')
            except Exception as e: ko('gamedata.json illisible : ' + str(e))
            # le .h doit compiler (C99 : struct + tableaux)
            main = os.path.join(tmp, 't.c'); open(main, 'w').write(f'#include "{gh[0]}"\nint main(void){{return (int)(coffre_etats[0].images + slime_etats[0].images);}}\n')
            r = subprocess.run(['gcc', '-std=c99', '-Wall', '-fsyntax-only', main, '-I', tmp], capture_output=True, text=True)
            if r.returncode: ko('gamedata.h ne compile pas : ' + r.stderr[:600])
            else: print('   gamedata.h compile (gcc -std=c99 -Wall)')
        if erreurs: ko(f'erreurs JS : {erreurs[:3]}')
        b.close()

    print('\nRésumé : type, états, images, cellule, px/unité')
    for r in resume: print('  ', *r)
    srv.shutdown()
    if echecs:
        print(f'\n{len(echecs)} ÉCHEC(S)'); [print(' -', e) for e in echecs]; sys.exit(1)
    print('\nOK : tous les objets et monstres passent.')


if __name__ == '__main__':
    main()
