"""Mode « Sprites PC » : tailles 192/256/384/512, rendu interne 2× la case, alpha doux, pleine couleur, contour proportionnel,
planche paginée, garde-fous mémoire, exports console désactivés/avertis. Test : python3 tests/ui_sprites_pc.py"""
import io, json, os, sys, zipfile
sys.path.insert(0, os.path.dirname(__file__))
from _sprites_common import *

ok = Check()
with page() as pg:
    sizes = pg.evaluate("[...document.querySelectorAll('#size option')].map(o=>+o.value)")
    ok(sizes == [48, 64, 96, 128, 192, 256, 384, 512], f'#size propose 48…128 + 192/256/384/512 : {sizes}')
    ok(pg.get_attribute('#colors', 'max') == '256', '#colors plafond relevé à 256 (au lieu de 64)')
    load_mannequin(pg)
    pg.select_option('#clip', index=2); pg.fill('#frames', '6'); pg.select_option('#ndir', '4')
    pg.select_option('#size', '256')
    ok(pg.input_value('#palpreset') == 'full', 'choisir une taille PC propose « pleine couleur » automatiquement')
    ok(pg.is_disabled('#sep'), '« séparer bras / jambes » inactif en mode PC')
    msg = generate(pg)
    ok('pleine couleur' in msg and not pg.errs, 'génération 256 px pleine couleur : ' + msg[:70] + ' ' + str(pg.errs))

    st = pg.evaluate("""()=>{const R=_sprites.result,T=R.T,al=new Set();let partial=0,opaque=0,cols=new Set(),rep=0,rows=0;
      for(const f of R.frames){for(let j=0;j<T*T;j++){const a=f.rgba[j*4+3];if(a>0&&a<255)partial++;if(a===255){opaque++;if(cols.size<5000)cols.add(f.rgba.slice(j*4,j*4+3).join())}al.add(a)}}
      // lignes identiques à la précédente à l'intérieur de la silhouette (signe d'un agrandissement) : mesure sur une image
      const f=R.frames.find(f=>f.d==='e'&&f.f===1);let y0=T,y1=0;for(let y=0;y<T;y++)for(let x=0;x<T;x++)if(f.mask[y*T+x]){y0=Math.min(y0,y);y1=Math.max(y1,y)}
      for(let y=y0+1;y<=y1;y++){let same=true;for(let x=0;x<T&&same;x++)for(let c=0;c<4;c++)if(f.rgba[(y*T+x)*4+c]!==f.rgba[((y-1)*T+x)*4+c]){same=false;break}rows++;if(same)rep++}
      return{partial,opaque,distinctAlpha:al.size,cols:cols.size,full:R.full,pal:R.pal.length,soft:R.soft,rep,rows,T}}""")
    print('mesures :', st)
    ok(st['soft'] and st['partial'] > 200 and st['distinctAlpha'] > 8, f'alpha doux : {st["partial"]} pixels semi-transparents, {st["distinctAlpha"]} niveaux d\'alpha (binaire avant)')
    ok(st['full'] and st['pal'] == 0 and st['cols'] > 200, f'pleine couleur : pas de palette, {st["cols"]}+ couleurs distinctes (pas de medianCut / to565)')
    ok(st['rep'] / st['rows'] < .2, f'pas de lignes dupliquées (suréchantillonnage réel) : {st["rep"]}/{st["rows"]} lignes identiques')

    # contour proportionnel (noir pur) : largeur de la bande sombre au bord
    pg.select_option('#size', '128'); pg.select_option('#palpreset', 'full')
    res = {}
    for size in ('128', '256'):
        pg.select_option('#size', size); pg.select_option('#palpreset', 'full'); pg.check('#olblack'); pg.fill('#olpct', '2'); generate(pg)
        res[size] = pg.evaluate("""()=>{const R=_sprites.result,T=R.T,f=R.frames.find(f=>f.d==='e'&&f.f===1);const runs=[];
          for(let y=0;y<T;y++){let x=0;while(x<T&&!f.mask[y*T+x])x++;if(x>=T)continue;let n=0;while(x+n<T&&f.mask[y*T+x+n]&&f.rgba[(y*T+x+n)*4]+f.rgba[(y*T+x+n)*4+1]+f.rgba[(y*T+x+n)*4+2]<12)n++;runs.push(n)}
          runs.sort((a,b)=>a-b);return runs[runs.length>>1]}""")
    print('épaisseur du contour (px) :', res)
    ok(res['256'] >= res['128'] * 1.5 and res['128'] >= 2, f'contour proportionnel à la case (2 % : médiane {res["128"]} px à 128, {res["256"]} px à 256)')
    pg.uncheck('#olblack'); pg.fill('#olpct', '1.2')

    # exports console
    pg.select_option('#size', '256'); pg.select_option('#palpreset', 'full'); generate(pg)
    ok(pg.is_disabled('#dlraw') and pg.is_disabled('#dlh') and pg.is_disabled('#xgif'), '.raw / .h / GIF désactivés en pleine couleur')
    ok('palette' in (pg.get_attribute('#dlraw', 'title') or ''), 'info-bulle : ' + str(pg.get_attribute('#dlraw', 'title'))[:70])
    pg.select_option('#palpreset', 'rgb565'); generate(pg)
    ok(not pg.is_disabled('#dlraw'), 'avec palette RGB565, .raw reste possible…')
    pg.click('#dlraw')
    pg.wait_for_timeout(500)
    ok('⚠' in pg.inner_text('#xmsg') and 'console' in pg.inner_text('#xmsg'), '… mais avec avertissement : ' + pg.inner_text('#xmsg')[:90])

    # garde-fous mémoire (estimation avant de lancer)
    plans = pg.evaluate("[_sprites.memoryPlan(64,8,6),_sprites.memoryPlan(512,8,24),_sprites.memoryPlan(512,8,60),_sprites.memoryPlan(512,8,200)].map(p=>[p.level,Math.round(p.bytes/2**20)])")
    print('plans mémoire (niveau, Mo) :', plans)
    ok([p[0] for p in plans] == ['ok', 'ok', 'warn', 'refuse'], 'niveaux ok / ok / avertir / refuser selon l\'estimation')
    pg.select_option('#size', '512'); pg.fill('#frames', '200'); pg.select_option('#ndir', '8')
    ok('trop' in pg.inner_text('#pcnote') or 'refus' in pg.inner_text('#pcnote').lower(), 'note sous les réglages : ' + pg.inner_text('#pcnote')[-110:])
    pg.click('#go'); pg.wait_for_function("document.querySelector('#prog').textContent.startsWith('Refus')", timeout=5000)
    t = pg.inner_text('#prog')
    ok('Go' in t and 'Réduis' in t, 'refus AVANT le rendu, avec proposition : ' + t[:190])
    pg.fill('#frames', '6')

    # pagination
    pg.select_option('#size', '256'); pg.select_option('#palpreset', 'full'); pg.select_option('#ndir', '4'); pg.select_option('#clip', index=2); generate(pg)
    pg.select_option('#clip', index=1); generate(pg)
    pg.evaluate("_sprites.SPR.PAGE_PIXELS=1.5e6")        # simule un navigateur plus limité
    L = pg.evaluate("(()=>{const L=_sprites.layoutOf();return{n:L.pages.length,rows:L.rows.length,W:L.W,H:L.pages.map(p=>p.H),px:L.pages.map(p=>p.W*p.H)}})()")
    print('pagination simulée :', L)
    ok(L['n'] >= 2 and all(p <= 1.5e6 for p in L['px']) and sum(h // 256 for h in L['H']) == L['rows'], 'planche coupée en pages (lignes entières), chacune ≤ limite')
    with pg.expect_download() as d:
        pg.click('#dlpng')
    z = zipfile.ZipFile(io.BytesIO(open(d.value.path(), 'rb').read()))
    ok(len(z.namelist()) == L['n'] and all(n.endswith('.png') for n in z.namelist()), 'Planche PNG : un zip de ' + str(len(z.namelist())) + ' PNG')
    with pg.expect_download() as d:
        pg.click('#xatlas')
    za = zipfile.ZipFile(io.BytesIO(open(d.value.path(), 'rb').read()))
    nfr = sum(len(json.loads(za.read(n))['frames']) for n in za.namelist())
    ok(len(za.namelist()) == L['n'], f'atlas : un JSON par page ({len(za.namelist())})')
    tot = pg.evaluate("[..._sprites.library.values()].reduce((a,R)=>a+R.frames.length,0)")
    ok(nfr == tot, f'toutes les images sont dans un atlas ({nfr} == {tot})')
    tres = pg.evaluate("_sprites.godotTres(_sprites.layoutOf(false),['a_1.png','a_2.png'])")
    ok('2_sheet' in tres and f'load_steps={tot + 2 + 1}' in tres, '.tres multi-pages : une ext_resource par page, load_steps exact')
    pg.evaluate("_sprites.SPR.PAGE_PIXELS=64e6")
    # cas réel gros : 8 animations × 8 directions × 12 images en 512 px (mise en page seule, images factices)
    big = pg.evaluate("""()=>{const lib=_sprites.library;lib.clear();const dirs=['s','se','e','ne','n','nw','w','sw'];
      for(let a=0;a<8;a++){const frames=[];for(const d of dirs)for(let i=0;i<12;i++)frames.push({d,f:i,mask:[],rgba:[]});lib.set('a'+a,{T:512,N:12,dirs,frames,ms:110})}
      const L=_sprites.layoutOf();return{n:L.pages.length,W:L.W,side:Math.max(...L.pages.map(p=>p.H)),px:Math.max(...L.pages.map(p=>p.W*p.H))}}""")
    print('8 anims × 8 dir × 12 img en 512 px :', big)
    ok(big['n'] >= 3 and big['px'] <= 64e6 and big['side'] <= 16384, f'512 px : {big["n"]} pages, chacune ≤ 64 Mpx et ≤ 16384 px de côté')

    # paquet complet en mode PC pleine couleur : planche + atlas + images, SANS .raw / .h / GIF (exigent une palette)
    pg.evaluate("_sprites.library.clear()")
    pg.select_option('#size', '192'); pg.select_option('#palpreset', 'full'); pg.fill('#frames', '3'); pg.select_option('#ndir', '4'); pg.select_option('#clip', index=2); generate(pg)
    with pg.expect_download() as d:
        pg.click('#xzip')
    zz = zipfile.ZipFile(io.BytesIO(open(d.value.path(), 'rb').read())); nm = zz.namelist()
    print('paquet PC :', len(nm), 'fichiers')
    ok(not any(n.endswith(('.raw', '.h', '.gif')) for n in nm), 'paquet PC pleine couleur : pas de .raw / .h / GIF')
    ok(any(n.endswith('_planche.png') for n in nm) and any(n.endswith('_atlas.json') for n in nm) and any(n.startswith('frames/') for n in nm), 'planche + atlas + images séparées présents')
    from PIL import Image
    im = Image.open(io.BytesIO(zz.read([n for n in nm if n.endswith('_planche.png')][0])))
    ok(im.mode == 'RGBA' and im.getchannel('A').getextrema() == (0, 255) and len({a for a in im.getchannel('A').getdata()}) > 20, 'planche PNG RGBA avec alpha doux (' + str(len({a for a in im.getchannel('A').getdata()})) + ' niveaux)')
    ok(not pg.errs, 'aucune erreur JS ' + str(pg.errs))
ok.done()
