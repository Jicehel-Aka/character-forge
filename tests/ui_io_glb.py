# Test : export GLB animé valide (0 erreur au validateur glTF), poids/quaternions normalisés, bug rigAnalyse.
# Serveur : cd docs && python3 -m http.server 8791 ; GLTF_TOOLS=<dossier avec node_modules/gltf-validator> python3 tests/ui_io_glb.py
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from _io_helpers import *

def telecharge(pg, bouton, nom):
    with pg.expect_download(timeout=180000) as d: pg.click(bouton)
    f = os.path.join(OUT, nom); d.value.save_as(f); return f

with sync_playwright() as p:
    b, pg, errs = page(p); cons = []
    pg.on('console', lambda m: cons.append(m.text) if m.type == 'error' else None)
    # 1) mannequin d'exemple + ses animations
    open_model(pg)
    pg.check('#bglba'); f1 = telecharge(pg, '#bglb', 'mannequin.glb')
    v = validate(f1)
    if v: check('mannequin (#bexemple) : 0 erreur glTF', v[0] == 0, str(v))
    else: print('SKIP validateur absent')
    # 2) mannequin sans os -> squelette standard (53 os, poids calculés) + 45 animations UAL
    pg.evaluate("""async()=>{const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const g=await new GLTFLoader().loadAsync('exemple/mannequin.glb');
      const T=_test.THREE,grp=new T.Group();g.scene.traverse(o=>{if(o.isMesh){const m=new T.Mesh(o.geometry.clone(),o.material);m.geometry.deleteAttribute('skinIndex');m.geometry.deleteAttribute('skinWeight');m.applyMatrix4(o.matrixWorld);grp.add(m)}});
      _test.setup(grp,[],'sans_os.glb')}""")
    pg.click('#bskeld'); pg.wait_for_function("_test.M.userData.rig&&_test.M.userData.rig.length>40", timeout=120000)
    n = pg.evaluate("""async()=>{const P=_test.AN.cat.packs.find(p=>p.id==='ual');await _test.anAdd(P,P.clips.map(c=>c.name));return _test.clips.length}""")
    print('animations ajoutées :', n)
    pg.check('#bglba'); f2 = telecharge(pg, '#bglb', 'autorig.glb')
    v = validate(f2)
    if v: check('auto-rig + %d animations : 0 erreur glTF' % n, v[0] == 0, str(v))
    # 3) Knight de la banque + animations KayKit (attributs entrelacés : ancien bug rigAnalyse)
    open_model(pg)
    pg.select_option('#zchar', 'b:knight'); pg.click('#zload'); pg.wait_for_function("_test.M&&_test.M.name!==undefined&&/knight/i.test(document.querySelector('#info').textContent)", timeout=30000)
    n = pg.evaluate("""async()=>{const P=_test.AN.cat.packs.find(p=>p.id!=='ual');await _test.anAdd(P,P.clips.map(c=>c.name));return _test.clips.length}""")
    r = pg.evaluate("(()=>{try{_test.rigAnalyse(true);return 'ok'}catch(e){return e.message}})()")
    check('rigAnalyse sur le Knight (attributs entrelacés)', r == 'ok', r)
    pg.check('#rchkauto'); pg.check('#bglba'); f3 = telecharge(pg, '#bglb', 'knight.glb')
    check('export Knight sans avertissement « Contrôle du squelette ignoré »', 'ignoré' not in pg.inner_text('#rmsg'), pg.inner_text('#rmsg')[:120])
    v = validate(f3)
    if v: check('Knight + %d animations : 0 erreur glTF' % n, v[0] == 0, str(v))
    check('aucune erreur JS', not errs and not cons, str(errs + cons)[:300])
    b.close()
print('FICHIERS', OUT); sys.exit(1 if check.fails else 0)
