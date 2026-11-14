# Test : un nom malveillant (os, animations, pièces, banque, packs importés) n'exécute AUCUN JavaScript ; la CSP ne casse pas la page.
# Serveur : cd docs && python3 -m http.server 8791 ; python3 tests/ui_io_xss.py
import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from _io_helpers import *
EVIL = '<img src=x onerror="window.__pwn=(window.__pwn||0)+1">'
EVIL2 = '"><svg onload="window.__pwn=(window.__pwn||0)+1"><b '
with sync_playwright() as p:
    b, pg, errs = page(p); csp = []
    pg.on('console', lambda m: csp.append(m.text) if 'Content Security Policy' in m.text else None)
    # catalogue de banque distant empoisonné (le fichier est dans un dépôt public)
    cat = {'characters': [{'id': EVIL2, 'name': EVIL, 'source': EVIL, 'file': 'knight.glb'}]}
    pg.route('**/bank/catalog.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(cat)))
    open_model(pg)
    pg.wait_for_function("document.querySelector('#zchar').innerHTML.includes('optgroup')")
    # os, animation, pièce portant un nom malveillant
    pg.evaluate("""([E,E2])=>{const T=_test.THREE,g=new T.Group(),bone=new T.Bone();bone.name=E;
      const m=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());m.name=E;g.add(bone);g.add(m);
      const clip=new T.AnimationClip(E,1,[new T.VectorKeyframeTrack(E+'.position',[0,1],[0,0,0,0,1,0])]);
      _test.setup(g,[clip],E+'.glb');
      _test.MYA.clips.push({key:E,name:E,dur:1,cat:E2,vis:'private'});_test.anPackSelect('mine');
      _test.WZ.acts[0].label=E;_test.WZ.acts[0].src='clip:'+E;_test.drawActs();
      _test.WD.mine=[{id:E2,name:E,slot:E,idb:E2,vis:'private',kind:'part'}];_test.WD.tab='mes';_test.wdTabs();_test.wdPanel();
      _test.WD.eq.push({kind:'part',slotLabel:E,name:E},{kind:'item',name:E,p:{bone:'',scale:1,off:[0,0,0]}});_test.wdRows()}""", [EVIL, EVIL2])
    pg.wait_for_timeout(1500)
    pwn = pg.evaluate('window.__pwn||0')
    check('aucun JavaScript exécuté par les noms malveillants', pwn == 0, 'window.__pwn=%s' % pwn)
    inj = pg.evaluate("document.querySelectorAll('img[src=\"x\"],svg[onload],[onerror]').length")
    check('aucun élément injecté', inj == 0, str(inj))
    # le nom s'affiche littéralement (texte), dans chaque liste concernée
    for sel, nom in [('#clip', 'liste des animations'), ('#zchar', 'banque (catalog.json)'), ('#zacts', 'actions du lot'), ('#wown', 'pièces du modèle'), ('#wgrid', 'garde-robe « Ma banque »'), ('#weq', 'équipement'), ('#alist', 'animations importées')]:
        t = pg.evaluate("s=>document.querySelector(s).textContent+[...document.querySelectorAll(s+' option')].map(o=>o.textContent).join()", sel)
        check('nom affiché tel quel : ' + nom, '<img' in t, t[:60].replace('\n', ' '))
    # la CSP ne bloque rien d'utile sur le parcours normal (ouverture + animations + export)
    open_model(pg)
    pg.fill('#frames', '2'); pg.select_option('#ndir', '4'); pg.select_option('#size', '48'); pg.click('#xall')
    pg.wait_for_function("document.querySelector('#xmsg').textContent.includes('bibliothèque')||document.querySelector('#prog').textContent.includes('Erreur')", timeout=180000)
    check('génération de planches sous CSP', 'bibliothèque' in pg.inner_text('#xmsg'), pg.inner_text('#xmsg')[:80])
    check('aucune violation de CSP', not csp, str(csp[:2]))
    check('aucune erreur JS', not errs, str(errs)[:300])
    check('avertissement sur le jeton affiché', pg.is_visible('#ctokwarn'))
    b.close()
sys.exit(1 if check.fails else 0)
