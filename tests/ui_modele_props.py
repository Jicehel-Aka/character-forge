# Test d'interface : objets d'un personnage (arme, chope, casque...) rangés dans la banque, accrochés à un autre personnage, retirés. Serveur : cd docs && python3 -m http.server 8765
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1200,'height':1000}); pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.goto('http://127.0.0.1:8765/modele.html'); pg.wait_for_timeout(1500)
    pg.evaluate("window.prompt=()=>'chope test'")
    pg.set_input_files('#file','docs/bank/barbarian.glb'); pg.wait_for_timeout(4000)
    r=pg.evaluate("_test.wdSavePiece(_test.WO.list.find(m=>m.name==='Mug'),'accessoire').then(()=>'ok',e=>e.message)"); print('sauvegarde',r,'|',pg.inner_text('#wmsg')[:160]); assert r=='ok'
    ks=pg.evaluate("_test.STORE.keys()"); print(ks); assert any('piece:accessoire:chope' in k for k in ks)
    # autre personnage
    pg.set_input_files('#file','docs/bank/knight.glb'); pg.wait_for_timeout(4000)
    pg.evaluate("_test.wdMineLoad()"); pg.wait_for_timeout(500)
    en=pg.evaluate("_test.WD.mine.map(x=>x.id)"); print('banque',en)
    pg.evaluate("_test.wdAdd?0:0")
    pg.evaluate("document.querySelector('[data-tab=mes]').click()"); pg.wait_for_timeout(200)
    pg.evaluate("document.querySelector('#wgrid .wdi').click()"); pg.wait_for_timeout(1500)
    print(pg.inner_text('#wmsg')[:200])
    r=pg.evaluate("(()=>{const it=_test.WD.eq[0];return it?[it.kind,it.wrapper.parent&&it.wrapper.parent.name,it.p.bone,_test.WO.list.some(m=>/chope/.test(m.name))]:null})()"); print('équipé',r); assert r and r[0]=='item' and r[3]
    # retirer via le panneau
    row=pg.query_selector('#wown [data-m]:has-text("chope") button[data-a="del"]'); assert row; row.click(); pg.wait_for_timeout(500)
    r=pg.evaluate("[_test.WD.eq.length,_test.WO.list.some(m=>/chope/.test(m.name))]"); print('après retrait',r); assert r==[0,False]
    # retirer une pièce du modèle lui-même
    n0=pg.evaluate("_test.WO.list.length"); row=pg.query_selector('#wown [data-m] button[data-a="del"]'); row.click(); pg.wait_for_timeout(400); n1=pg.evaluate("_test.WO.list.length"); print('pièces',n0,'->',n1); assert n1==n0-1
    print('OK'); b.close()
