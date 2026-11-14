"""Exports : (7) RGB565/BGR565 + little/big endian + transparence configurable dans .raw/.h ; (8) durée par animation ;
(9) aperçu à l'échelle de l'écran AKA ; (10) avertissement « images identiques supprimées ». Test : python3 tests/ui_sprites_export.py"""
import io, json, os, re, struct, sys, zipfile
sys.path.insert(0, os.path.dirname(__file__))
from _sprites_common import *

ok = Check()
with page() as pg:
    load_mannequin(pg)
    pg.select_option('#clip', index=2); pg.fill('#frames', '3'); pg.select_option('#ndir', '4'); pg.select_option('#size', '48')
    generate(pg)
    px = pg.evaluate("""()=>{const R=_sprites.result,out=[];R.dirs.forEach(d=>R.frames.filter(f=>f.d===d).sort((a,b)=>a.f-b.f).forEach(f=>{for(let j=0;j<R.T*R.T;j++)out.push(f.mask[j]?[f.rgba[j*4],f.rgba[j*4+1],f.rgba[j*4+2]]:null)}));return out}""")
    ok(len(px) > 0 and any(p is None for p in px), f'{len(px)} pixels de référence lus dans la page')

    def attendu(bgr, be, key):
        w = []
        for p in px:
            if p is None:
                v = key
            else:
                r, g, b = p[::-1] if bgr else p
                v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
                if v == key:
                    v ^= 1
            w.append(v)
        return struct.pack((">" if be else "<") + f"{len(w)}H", *w)

    def telecharge(bouton):
        with pg.expect_download() as d:
            pg.click(bouton)
        return open(d.value.path(), 'rb').read()

    for fmt, endian, key in (('rgb565', 'le', 'F81F'), ('bgr565', 'le', 'F81F'), ('rgb565', 'be', 'F81F'), ('bgr565', 'be', '0001')):
        pg.select_option('#pixfmt', fmt); pg.select_option('#endian', endian); pg.fill('#transp', key)
        raw = telecharge('#dlraw')
        ok(raw == attendu(fmt == 'bgr565', endian == 'be', int(key, 16)), f'.raw {fmt} {endian} transparence 0x{key} : {len(raw)} octets identiques à la référence')
        h = telecharge('#dlh').decode()
        words = [int(x, 16) for x in re.findall(r'0x([0-9A-F]{4})', h.split('{', 1)[1])]
        ref = struct.unpack((">" if endian == 'be' else "<") + f"{len(px)}H", attendu(fmt == 'bgr565', endian == 'be', int(key, 16)))
        # le tableau C contient les valeurs 16 bits telles que stockées (échangées en big-endian)
        sw = (lambda v: ((v & 255) << 8) | (v >> 8)) if endian == 'be' else (lambda v: v)
        ok(words == [sw(v) for v in ref] and (fmt.upper() in h.split('\n')[0]), f'.h {fmt} {endian} : valeurs identiques ; entête : ' + h.split('\n')[0][-60:])
    pg.select_option('#pixfmt', 'rgb565'); pg.select_option('#endian', 'le'); pg.fill('#transp', 'F81F')
    # défaut inchangé : RGB565 little-endian, clé 0xF81F, comme forge/rgb565.py
    ok(telecharge('#dlraw') == attendu(False, False, 0xF81F), 'défaut = RGB565 little-endian, transparence 0xF81F (aligné sur forge/rgb565.py)')
    # collision : un pixel opaque magenta pur (valeur = clé) est décalé
    col = pg.evaluate("""()=>{const R=_sprites.result,f=R.frames[0];const j=[...f.mask].indexOf(1);f.rgba[j*4]=255;f.rgba[j*4+1]=0;f.rgba[j*4+2]=255;const w=_sprites.wordsOf(R,{bgr:false,be:false,key:0xF81F});
      const order=[];R.dirs.forEach(d=>R.frames.filter(g=>g.d===d).sort((a,b)=>a.f-b.f).forEach(g=>order.push(g)));return w[order.indexOf(f)*R.T*R.T+j]}""")
    ok(col == 0xF81E, f'magenta opaque (= clé) décalé en 0x{col:04X} (reste opaque)')

    # ---- 8. durées par animation, boucle, aperçu
    pg.evaluate("document.querySelector('#fdur').value=200"); pg.select_option('#clip', index=1); generate(pg)
    ok(pg.evaluate("_sprites.result.ms") == 200, 'durée par image réglable avant génération (200 ms)')
    ms = pg.evaluate("[...document.querySelectorAll('#xdurs .dms')].map(i=>i.value)")
    ok(sorted(ms) == ['110', '200'], f'durées listées par animation dans « Exporter » : {ms}')
    pg.evaluate("(()=>{const i=document.querySelectorAll('#xdurs .dms')[0];i.value=50;i.dispatchEvent(new Event('change',{bubbles:true}))})()")
    zb = telecharge('#xatlas')
    atlas = json.loads(zb)
    durs = {v['duration'] for v in atlas['frames'].values()}
    ok(durs == {50, 200}, f'atlas : duration par image = durée de son animation : {durs} (110 ms fixes avant)')
    ok(all(isinstance(t['loop'], bool) and t['direction'] == 'forward' for t in atlas['meta']['frameTags']), 'frameTags : forward + loop')
    f = next(iter(atlas['frames'].values()))
    ok(f['collision']['w'] > 0 and f['anchors']['feet']['y'] > 0 and f['anchors']['hand'] and f['anchors']['muzzle'], 'atlas : ancrages pieds / main / tir + collision par image')

    # ---- 9. aperçu AKA 320x240
    pg.check('#akaon')
    pg.wait_for_timeout(300)
    info = pg.inner_text('#akainfo')
    dims = pg.evaluate("(()=>{const c=document.querySelector('#aka');return[c.width,c.height,c.hidden]})()")
    px_nonbg = pg.evaluate("(()=>{const c=document.querySelector('#aka'),d=c.getContext('2d').getImageData(0,0,320,240).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]!==74&&d[i]!==79)n++;return n})()")
    ok(dims == [320, 240, False] and px_nonbg > 300, f'aperçu 320×240 affiché avec le personnage ({px_nonbg} px) : {info}')

    # ---- 10. avertissement images identiques
    pg.evaluate("(()=>{const o=[...document.querySelectorAll('#clip option')];const i=o.findIndex(x=>/idle/i.test(x.textContent));if(i>=0)document.querySelector('#clip').selectedIndex=i})()")
    pg.fill('#frames', '6'); pg.check('#trim'); t = generate(pg)
    print('génération :', t[:300].replace('\n', ' | '))
    res = pg.evaluate("[_sprites.result.N0,_sprites.result.N]")
    if res[1] < res[0]:
        ok('→' in t and 'décoche' in t, f'avertissement visible : {res[0]} → {res[1]} images, avec le moyen de les garder')
    else:
        print('INFO  cette animation ne perd pas d\'images ; vérification sur une pose seule')
    pg.evaluate("document.querySelector('#clip').value=''"); pg.fill('#frames', '6')
    t = generate(pg)
    ok('6 → 1' in t and '⚠' in t and 'décoche' in t, 'pose seule : « 6 → 1 images » en alerte ⚠ + conseil : ' + t.replace('\n', ' | ')[:230])
    ok(not pg.errs, 'aucune erreur JS ' + str(pg.errs))
ok.done()
