# Test d'interface : bibliothèque d'animations CC0 sur un modèle Mixamo (serveur : cd docs && python3 -m http.server 8765)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1500})
    pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8765/modele.html'); pg.wait_for_timeout(1500)
    print('PACKS',pg.evaluate('AN=_test.AN, AN.cat.packs.map(p=>p.id+":"+p.clips.length)'))
    pg.set_input_files('#file','/tmp/ext/g3/monika.glb'); pg.wait_for_timeout(4000)
    for pk,n in (('ual',['Walk_Loop','Punch_Jab','Sword_Attack','Idle_Loop','Jump_Start','Spell_Simple_Shoot']),('kaykit',['Walking_A','Unarmed_Melee_Attack_Punch_A','Running_A','1H_Melee_Attack_Slice_Diagonal','Idle','Cheer'])):
        pg.evaluate('(a)=>_test.anAdd(_test.AN.cat.packs.find(p=>p.id===a[0]),a[1])',[pk,n])
        pg.wait_for_timeout(1500); print(pk, pg.inner_text('#amsg'))
    print(pg.evaluate('_test.clips.map(c=>c.name)'))
    pg.screenshot(path='/tmp/ext/rt/o/lib_page.png',full_page=True); b.close()
