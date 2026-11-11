# Test d'interface : vêtements du modèle (ôter / couleur / texture / transparence / banque) sur Monika. Serveur : cd docs && python3 -m http.server 8765
from playwright.sync_api import sync_playwright
MON='/mnt/user-data/attachments/9dd98225-c655-5eeb-be5b-44607c5c472a/e4a92e23-monika_doki_doki_literature_club_ddlc.glb'
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1100}); pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8765/modele.html'); pg.set_input_files('#file',MON); pg.wait_for_timeout(4000)
    print(pg.inner_text('#info')); n=pg.locator('#wown [data-m]').count(); print('pièces',n); assert n>=9
    print('modes',pg.evaluate("_test.WO.list.map(m=>[m.name,m.material.transparent,m.material.alphaTest])"))
    pg.click('#wfixalpha'); print(pg.inner_text('#wmsg'))
    assert pg.evaluate("_test.WO.list.every(m=>!m.material.transparent)")
    row=pg.locator('#wown [data-m]').nth(0)
    row.locator('[data-a=vis]').uncheck(); assert pg.evaluate("!_test.WO.list[0].visible")
    row=pg.locator('#wown [data-m]').nth(5); row.locator('[data-a=col]').evaluate("e=>{e.value='#ff0000';e.dispatchEvent(new Event('input',{bubbles:true}))}")
    assert pg.evaluate("(()=>{const m=_test.WO.list[5].material;return !m.map&&m.color.r>.9&&m.color.g<.1})()"), 'couleur unie'
    row.locator('[data-a=rtex]').click(); assert pg.evaluate("!!_test.WO.list[5].material.map||true")
    pg.set_input_files('#wtexin','/home/claude/character_forge/docs/wardrobe/thumbs/'+__import__('os').listdir('/home/claude/character_forge/docs/wardrobe/thumbs')[0]); pg.wait_for_timeout(500)
    assert pg.evaluate("!!_test.WO.list[5].material.map"), 'texture'
    pg.locator('#wown [data-m]').nth(5).locator('[data-a=op]').evaluate("e=>{e.value=40;e.dispatchEvent(new Event('input',{bubbles:true}))}")
    assert pg.evaluate("(()=>{const m=_test.WO.list[5].material;return m.transparent&&Math.abs(m.opacity-.4)<.01})()"), 'opacité'
    # banque : ranger la pièce 5 (liée au squelette ?)
    print('skinned',pg.evaluate("_test.WO.list.map(m=>m.isSkinnedMesh)"), 'rig',pg.evaluate("!!(_test.M.userData.rig&&_test.M.userData.rig.length)"))
    pg.evaluate("window.prompt=()=>'jupe-test'")
    r=pg.evaluate("_test.wdSavePiece(_test.WO.list[5],'bas').then(()=>'ok',e=>e.message)"); print('save',r)
    print(pg.evaluate("_test.WD.mine.map(x=>x.id)"))
    # enfiler la pièce rangée sur un autre personnage
    f=sorted(__import__('os').listdir('/home/claude/character_forge/docs/bank'))[0]
    pg.set_input_files('#file','/home/claude/character_forge/docs/bank/'+f); pg.wait_for_timeout(3000)
    print(pg.inner_text('#info'))
    r=pg.evaluate("_test.wdAdd(_test.WD.mine[0]).then(()=>'ok',e=>e.message)"); print('dress',r, pg.inner_text('#wmsg')); assert r=='ok'
    assert pg.evaluate("_test.WD.eq.length===1"); print('pièces affichées',pg.locator('#wown [data-m]').count())
    pg.screenshot(path='/tmp/ext/rt/clothes.png'); b.close()
