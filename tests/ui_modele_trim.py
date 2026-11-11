# Test d'interface : images inutiles retirées, alerte « 1 seule image », case du nom dans la planche. Serveur : cd docs && python3 -m http.server 8765
from playwright.sync_api import sync_playwright
MON='/mnt/user-data/attachments/9dd98225-c655-5eeb-be5b-44607c5c472a/0a2115ed-monika_squelette.glb'
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1100}); pg.on('pageerror',lambda e:print('PAGEERR',e))
    pg.goto('http://127.0.0.1:8765/modele.html'); pg.set_input_files('#file',MON); pg.wait_for_timeout(4000)
    pg.fill('#frames','12')
    # 1) clip bouclé deux fois (2 cycles dans le clip) -> la 2e moitié doit être retirée ; construit à partir d'une marche
    pg.evaluate("""(async()=>{await _test.anAdd(_test.AN.cat.packs[0],['Walk_Loop','Idle_Loop']);return _test.clips.map(c=>c.name)})()""")
    names=pg.evaluate("_test.clips.map(c=>c.name)"); print(names)
    # clip artificiel : 2 cycles d'une marche (tracks répétés) et un clip immobile
    pg.evaluate("""(()=>{const c=_test.clips.find(c=>/Walk_Loop/.test(c.name)),T=THREE_?0:0})()""") if False else None
    for tag,idx in (('walk',names.index('UAL · Walk_Loop')),('idle',names.index('UAL · Idle_Loop'))):
        pg.select_option('#clip',str(idx)); pg.evaluate("document.querySelector('#go').click()"); pg.wait_for_timeout(30000 if tag=='walk' else 1000)
        for _ in range(120):
            t=pg.inner_text('#prog')
            if 'couleurs' in t: break
            pg.wait_for_timeout(500)
        print(tag, pg.inner_text('#prog').replace('\n',' | '))
    # 2) clip immobile : 1 seule image -> alerte
    pg.evaluate("""(()=>{const c=_test.clips[0].clone();c.name='Statique';c.tracks=c.tracks.map(t=>{const k=t.clone();const n=k.values.length/k.times.length;for(let i=n;i<k.values.length;i++)k.values[i]=k.values[i%n];return k});_test.clips.push(c);const o=document.createElement('option');o.value=String(_test.clips.length-1);o.textContent='Statique';document.querySelector('#clip').appendChild(o)})()""")
    pg.select_option('#clip',str(len(names)+0)); pg.evaluate("document.querySelector('#go').click()")
    for _ in range(120):
        t=pg.inner_text('#prog')
        if 'couleurs' in t: break
        pg.wait_for_timeout(500)
    print('statique', pg.inner_text('#prog').replace('\n',' | '))
    # 3) planche avec étiquette
    pg.evaluate("_test.generate&&0")
    pg.click('#xmag') ; pg.evaluate("document.querySelector('#xmag').checked=true")
    d=pg.evaluate("""(()=>{store();return 0})()""") if False else None
    b.close()
