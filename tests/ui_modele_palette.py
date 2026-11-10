from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(viewport={'width':1300,'height':1000})
    pg.on('pageerror',lambda e:print('PAGEERR',e))
    pg.goto('http://127.0.0.1:8765/modele.html')
    pg.set_input_files('#file','/tmp/ext/fbx/viking_rigged.glb'); pg.wait_for_timeout(3000)
    pg.fill('#frames','3'); pg.select_option('#ndir','4'); pg.select_option('#size','64')
    pg.click('#xall')
    for _ in range(300):
        if 'palette commune' in pg.inner_text('#xmsg') or 'Erreur' in pg.inner_text('#prog'): break
        pg.wait_for_timeout(1000)
    print(pg.inner_text('#xmsg'))
    print(pg.evaluate('''()=>{const Rs=[..._test.library.values()];const k=R=>JSON.stringify(R.pal);const same=Rs.every(R=>k(R)===k(Rs[0]));
      let bad=0;const set=new Set(Rs[0].pal.map(p=>p.join()));for(const R of Rs)for(const f of R.frames)for(let j=0;j<R.T*R.T;j++)if(f.mask[j]&&!set.has([f.rgba[j*4],f.rgba[j*4+1],f.rgba[j*4+2]].join()))bad++;
      return {n:Rs.length,same,ncol:Rs[0].pal.length,bad}}'''))
    b.close()
