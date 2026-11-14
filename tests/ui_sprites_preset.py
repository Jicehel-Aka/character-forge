"""Préréglage « plateforme » : chaque ligne de l'assistant doit montrer SA source (pas « Monter à l'échelle » partout).
Cause du bug : la source du préréglage n'était pas une <option> tant que le catalogue d'animations n'était pas chargé ;
le menu retombait sur sa 1re option, et « Générer » lisait ces valeurs. Test : python3 tests/ui_sprites_preset.py"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from _sprites_common import *

ATTENDU = ['ual:Idle_Loop', 'ual:Walk_Loop', 'ual:Jog_Fwd_Loop', 'kaykit:Jump_Full_Short', 'ual:Jump_Loop', 'proc:ladder', 'proc:rope', 'kaykit:Hit_A']
LIRE = "[...document.querySelectorAll('#zacts .zsrc')].map(s=>s.value)"
ok = Check()
with page() as pg:
    ok(pg.evaluate(LIRE) == ATTENDU, 'au chargement (avant le catalogue) : 8 sources du préréglage plateforme = ' + str(pg.evaluate(LIRE)))
    pg.wait_for_function("document.querySelectorAll('#zacts .zsrc')[0].querySelectorAll('optgroup').length>2", timeout=15000)   # catalogue arrivé
    ok(pg.evaluate(LIRE) == ATTENDU, 'catalogue chargé : sources inchangées')
    ok(pg.evaluate("[...document.querySelectorAll('#zacts .zsrc')].every(s=>s.selectedOptions[0].textContent.length>0)"), 'chaque menu affiche un libellé')
    ok(pg.evaluate("[...document.querySelectorAll('#zacts .zsrc')].filter(s=>/échelle/.test(s.selectedOptions[0].textContent)).length") == 1, 'une seule ligne « Monter à l\'échelle » (la ligne Échelle)')
    # readActs (appelé par « Générer » et « Ajouter une action ») relit les menus : les valeurs doivent rester justes
    pg.click('#zaddact')
    ok(pg.evaluate(LIRE)[:8] == ATTENDU, 'après readActs (clic Ajouter) : sources toujours justes')
    pg.select_option('#ztype', 'adv')
    ok(pg.evaluate(LIRE)[:5] == ATTENDU[:5], 'type « aventure » : sources justes')
    ok(not pg.errs, 'aucune erreur JS ' + str(pg.errs))
ok.done()
