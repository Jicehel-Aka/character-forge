"""Petites tailles : (5) membres fins renforcés à 48 px ; (6) pieds sur une ligne de sol commune + ancrage exporté.
Test : python3 tests/ui_sprites_small.py"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from _sprites_common import *

MESURE = """()=>{const R=_sprites.result,T=R.T,bot={};let interior=0,total=0,feetY=new Set(),feetOk=true;
  for(const f of R.frames){let b=-1;for(let y=0;y<T;y++)for(let x=0;x<T;x++)if(f.mask[y*T+x])b=Math.max(b,y);bot[f.d]=Math.max(bot[f.d]??-1,b);feetY.add(f.anch.feet.y)
    for(let y=1;y<T-1;y++)for(let x=1;x<T-1;x++){const j=y*T+x;if(!f.mask[j])continue;total++;if(f.mask[j-1]&&f.mask[j+1]&&f.mask[j-T]&&f.mask[j+T])interior++}}
  return{bot:Object.values(bot),interior,total,feetY:[...feetY],ground:R.ground}}"""
ok = Check()
with page() as pg:
    load_mannequin(pg)
    pg.select_option('#clip', index=2); pg.fill('#frames', '6')
    # ---- 5. épaisseur minimale des membres à 48 px : pixels « intérieurs » (hors contour) = membres qui ne sont plus de simples traits
    pg.select_option('#size', '48')
    res = {}
    for thin in (False, True):
        pg.evaluate(f"document.querySelector('#thin').checked={str(thin).lower()}"); generate(pg); res[thin] = pg.evaluate(MESURE)
    gain = res[True]['interior'] / res[False]['interior']
    print(f"48 px : pixels intérieurs {res[False]['interior']} -> {res[True]['interior']} (x{gain:.2f}) ; opaques {res[False]['total']} -> {res[True]['total']}")
    ok(gain > 1.25, f'membres fins renforcés à 48 px : +{(gain-1)*100:.0f} % de pixels intérieurs (les traits de 1 px ne sont plus « mangés » par le contour)')
    ok(res[True]['total'] / res[False]['total'] < 1.3, 'sans grossir le personnage de plus de 30 % (surface opaque)')
    ok(pg.is_disabled('#thin') is False, 'option active à 48 px')
    pg.select_option('#size', '192')
    ok(pg.is_disabled('#thin'), 'option inactive en mode PC')
    pg.select_option('#size', '64')

    # ---- 6. pieds : ligne de sol commune
    pg.select_option('#palpreset', 'rgb565'); pg.select_option('#ndir', '8')
    for size in ('48', '64'):
        pg.select_option('#size', size)
        sp = {}
        for feet in (False, True):
            pg.evaluate(f"document.querySelector('#feet').checked={str(feet).lower()}"); generate(pg); r = pg.evaluate(MESURE)
            sp[feet] = max(r['bot']) - min(r['bot'])
            if feet:
                anchor = r
        print(f'{size} px : écart de la ligne de sol entre directions : {sp[False]} px (avant) -> {sp[True]} px (après) ; bas par direction {anchor["bot"]}')
        ok(sp[False] >= 2 and sp[True] <= 1, f'{size} px : écart entre directions {sp[False]} -> {sp[True]} px (≤ 1)')
        ok(len(anchor['feetY']) == 1, f'{size} px : ancrage « pieds » y identique pour toutes les images ({anchor["feetY"]}) = ligne de sol {anchor["ground"]}')
        ok(abs(anchor['feetY'][0] - max(anchor['bot']) - 1) <= 1.5, f'{size} px : l\'ancrage est bien sous le bas des pieds ({anchor["feetY"][0]} vs {max(anchor["bot"])+1})')
    ok(not pg.errs, 'aucune erreur JS ' + str(pg.errs))
ok.done()
