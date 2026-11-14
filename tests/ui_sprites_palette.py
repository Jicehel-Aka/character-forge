"""Palettes rétro : appariement perceptuel (OKLab) + tramage ordonné de Bayer ; palette conservée à l'export ; libellés vrais.
Test : python3 tests/ui_sprites_palette.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from _sprites_common import *

ok = Check()
with page() as pg:
    # --- libellés : le nombre de teintes affiché est celui de la table
    labels = pg.evaluate("Object.fromEntries([...document.querySelectorAll('#palpreset option')].map(o=>[o.value,o.textContent]))")
    counts = pg.evaluate("Object.fromEntries(Object.entries(_sprites.RETRO).map(([k,v])=>[k,v.cols.length]))")
    print('menu :', labels)
    for k, n in counts.items():
        ok(f'({n} teintes)' in labels[k], f'menu « {labels[k]} » = {n} teintes réelles dans la table')
    ok('54' not in labels['nes'], 'plus de « NES (54 teintes) » inventé')
    ok('full' in labels, 'option « Pleine couleur (sans palette) » présente')

    # --- qualité : le tramage rapproche la moyenne locale de la couleur voulue (dégradé de gris sur Game Boy)
    r = pg.evaluate("""()=>{const pal=_sprites.RETRO.gameboy.cols,res={};
      const L=c=>_sprites.toOklab(c[0],c[1],c[2])[0];
      const Ls=pal.map(L),lo=Math.min(...Ls),hi=Math.max(...Ls);      // seuls les gris que la palette peut encadrer comptent (hors plage, aucun tramage ne peut aider)
      for(const mode of [['none',0],['bayer4',1],['bayer8',1],['bayer4',0]]){const q=_sprites.makeQuantizer(pal,{dither:mode[0],strength:mode[1]});let err=0,n=0;
        for(let g=0;g<=255;g+=3){if(L([g,g,g])<lo||L([g,g,g])>hi)continue;let s=0;for(let y=0;y<8;y++)for(let x=0;x<8;x++)s+=L(pal[q(g,g,g,x,y)]);err+=Math.abs(s/64-L([g,g,g]));n++}
        res[mode.join(':')]=err/n}
      return res}""")
    print('erreur moyenne de luminosité (OKLab L) sur dégradé gris, Game Boy :', {k: round(v, 4) for k, v in r.items()})
    ok(r['bayer4:1'] < r['none:0'] * .5, 'Bayer 4×4 réduit l\'erreur de luminosité locale de plus de moitié')
    ok(r['bayer8:1'] < r['none:0'] * .5, 'Bayer 8×8 idem')
    ok(abs(r['bayer4:0'] - r['none:0']) < 1e-9, 'force 0 = pas de tramage')
    # appariement perceptuel : un bleu moyen doit aller vers une teinte de luminosité proche, pas vers le gris du plus proche RVB
    p = pg.evaluate("""()=>{const q=_sprites.makeQuantizer(_sprites.RETRO.pico8.cols,{dither:'none',strength:0});return _sprites.RETRO.pico8.cols[q(60,100,210,0,0)]}""")
    ok(p[2] > p[0] and p[2] > 100, f'bleu (60,100,210) -> PICO-8 reste bleu : {p}')

    # --- génération : Game Boy + tramage ; toutes les couleurs sont dans la palette, volume conservé
    load_mannequin(pg)
    pg.select_option('#clip', index=2); pg.fill('#frames', '4'); pg.select_option('#ndir', '4')
    pg.select_option('#palpreset', 'gameboy')
    ok(pg.input_value('#dither') == 'bayer4', 'choisir une palette rétro active le tramage Bayer 4×4 (modifiable)')
    msg = generate(pg)
    ok('Game Boy' in msg and '4 couleurs' in msg, 'message de génération : ' + msg[:80])
    info = pg.inner_text('#sinfo')
    ok('Game Boy' in info and 'RGB565' not in info, 'info de planche = vrai nom de palette : ' + info)
    used = pg.evaluate("""()=>{const R=_sprites.result,s=new Set();for(const f of R.frames)for(let j=0;j<R.T*R.T;j++)if(f.mask[j])s.add(f.rgba.slice(j*4,j*4+3).join());return[s.size,R.pal.length,[...s].every(c=>R.pal.some(p=>p.join()===c))]}""")
    ok(used[2] and used[0] >= 3, f'couleurs utilisées ⊂ palette Game Boy ({used[0]} sur {used[1]} teintes utilisées)')

    # --- la palette est CONSERVÉE à l'export (bug : unifyPalette recalculait 32 couleurs)
    pg.select_option('#clip', index=1); generate(pg)
    pg.click('#xpal')
    npal = pg.evaluate("[...new Set(_sprites.library.values())].map(R=>R.pal.length)")
    ok(npal and all(n == 4 for n in npal), f'« Unifier la palette » garde 4 couleurs (au lieu de 32) : {npal}')
    ok('4 couleurs' in pg.inner_text('#xmsg'), 'message : ' + pg.inner_text('#xmsg'))
    cols = pg.evaluate("""()=>{const s=new Set();_sprites.library.forEach(R=>R.frames.forEach(f=>{for(let j=0;j<R.T*R.T;j++)if(f.mask[j])s.add(f.rgba.slice(j*4,j*4+3).join())}));return s.size}""")
    ok(cols <= 4, f'pixels de toute la bibliothèque : {cols} couleurs distinctes')
    with pg.expect_download() as d:
        pg.click('#dljson')
    meta = json.load(open(d.value.path()))
    ok(len(meta['palette']) == 4 and meta['palette_name'] == 'Game Boy', 'meta.json : 4 couleurs, palette_name=Game Boy')
    with pg.expect_download() as d:
        pg.click('#dlh')
    h = open(d.value.path()).read()
    import re
    words = {int(x, 16) for x in re.findall(r'0x([0-9A-F]{4})', h.split('{', 1)[1])}
    ok(len(words - {0xF81F}) <= 4, f'.h : {len(words - {0xF81F})} couleurs RGB565 + transparence')

    # --- RGB565 par défaut inchangé : pas de tramage, couleurs exactes en RGB565
    pg.select_option('#palpreset', 'rgb565')
    ok(pg.input_value('#dither') == 'none', 'retour à RGB565 : tramage désactivé')
    generate(pg)
    bad = pg.evaluate("""()=>{const R=_sprites.result;let b=0;for(const f of R.frames)for(let j=0;j<R.T*R.T;j++)if(f.mask[j]){const r=f.rgba[j*4],g=f.rgba[j*4+1],bl=f.rgba[j*4+2];
      const v=((r>>3)<<11)|((g>>2)<<5)|(bl>>3),w=[((v>>11)&31)*255/31|0,((v>>5)&63)*255/63|0,(v&31)*255/31|0];if(w[0]!==r||w[1]!==g||w[2]!==bl)b++}return b}""")
    ok(bad == 0, 'RGB565 : 0 couleur hors grille 5/6/5')
    ok('RGB565 quantifié' in pg.inner_text('#sinfo'), 'info : « RGB565 quantifié » pour la palette Gamebuino')
    ok(not pg.errs, 'aucune erreur JS ' + str(pg.errs))
ok.done()
