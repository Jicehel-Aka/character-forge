# Test d'interface : import de packs d'animations .zip (doublons, catégories, persistance, ajout au modèle). Serveur : cd docs && python3 -m http.server 8765
from playwright.sync_api import sync_playwright
import zipfile, os
A='/mnt/user-data/attachments/9dd98225-c655-5eeb-be5b-44607c5c472a/'
MON=A+'0a2115ed-monika_squelette.glb'
os.makedirs('/tmp/ext/zt',exist_ok=True)
with zipfile.ZipFile('/tmp/ext/zt/packA.zip','w') as z:
    z.write(A+'628ad087-Combo_Punch.fbx','Pack/628ad087-Combo_Punch.fbx'); z.write(A+'c4cec749-Idle.fbx','Pack/c4cec749-Idle.fbx')
    z.write(A+'628ad087-Combo_Punch.fbx','Pack/Combo_Punch copy.fbx'); z.writestr('__MACOSX/Pack/._Idle.fbx',b'junk'); z.write('/home/claude/character_forge/docs/anims/kaykit_adventurers.glb','Pack/kaykit_adventurers.glb')
with zipfile.ZipFile('/tmp/ext/zt/packB.zip','w') as z:
    z.write(A+'65156306-Lead_Jab.fbx','B/65156306-Lead_Jab.fbx'); z.write(A+'c4cec749-Idle.fbx','B/Idle.fbx')
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1100}); pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8765/modele.html'); pg.wait_for_timeout(2000)
    pg.set_input_files('#fzip',['/tmp/ext/zt/packA.zip','/tmp/ext/zt/packB.zip'])
    for _ in range(120):
        if 'ajoutée' in pg.inner_text('#amsg'): break
        pg.wait_for_timeout(500)
    print(pg.inner_text('#amsg'))
    names=pg.evaluate("_test.MYA.clips.map(c=>c.name+' ['+c.cat+']')"); print(names)
    assert len(names)==3, names
    print('pack :',pg.inner_text('#apack')[:200].replace('\n',' | '))
    # persistance
    pg.reload(); pg.wait_for_timeout(2500); print('après rechargement :',pg.evaluate("_test.MYA.clips.length")); assert pg.evaluate("_test.MYA.clips.length")==3
    # ajout au modèle (squelette de Monika)
    pg.set_input_files('#file',MON); pg.wait_for_timeout(4000)
    pg.select_option('#apack','mine'); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#aall').click()"); pg.wait_for_timeout(6000); print(pg.inner_text('#amsg'))
    print(pg.evaluate("_test.clips.map(c=>c.name)"))
    # réimport : tout doublon
    pg.set_input_files('#fzip',['/tmp/ext/zt/packB.zip']); pg.wait_for_timeout(3000); print(pg.inner_text('#amsg'))
    pg.screenshot(path='/tmp/ext/zt/zip.png'); b.close()
