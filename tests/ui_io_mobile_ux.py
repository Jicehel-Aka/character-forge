# Test : mobile 390x844 (pas de défilement horizontal, cibles >= 40 px), cartes repliables, mode simple, infobulle des boutons d'export grisés.
# Serveur : cd docs && python3 -m http.server 8791 ; python3 tests/ui_io_mobile_ux.py   (captures dans le dossier affiché)
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from _io_helpers import *
JS_PETITS = """()=>{const o=[];document.querySelectorAll('button,select,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),summary').forEach(e=>{const r=e.getBoundingClientRect();if(r.width>0&&r.height>0&&r.height<39.5)o.push(e.tagName+'#'+e.id+' '+Math.round(r.height))});return o}"""
JS_DEBORDE = "()=>{const W=innerWidth,o=[];document.querySelectorAll('body *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>W+1&&getComputedStyle(e).position!=='fixed')o.push(e.tagName+'#'+e.id+' '+Math.round(r.right))});return o}"
with sync_playwright() as p:
    b, pg, errs = page(p, 390, 844)
    open_model(pg)
    check('mobile : pas de défilement horizontal', pg.evaluate('document.documentElement.scrollWidth') <= 390, 'scrollWidth=%s' % pg.evaluate('document.documentElement.scrollWidth'))
    d = pg.evaluate(JS_DEBORDE); check('mobile : aucun élément ne dépasse de l\'écran', not d, str(d[:5]))
    pt = pg.evaluate(JS_PETITS); check('mobile : boutons / listes / champs >= 40 px', not pt, str(pt[:6]))
    pg.screenshot(path=os.path.join(OUT, 'mobile_haut.png')); pg.screenshot(path=os.path.join(OUT, 'mobile_page.png'), full_page=True)
    # l'assistant liste bien les animations (catalogue chargé avant le dessin des sélecteurs)
    check('assistant : listes d\'animations remplies', pg.evaluate("document.querySelector('.zsrc').options.length")>10 and pg.evaluate("document.querySelector('.zsrc').value")=='ual:Idle_Loop')
    # cartes repliables
    h = pg.locator('#zcard>h2'); h.click()
    check('carte repliable : contenu masqué', not pg.is_visible('#zgo'))
    h.click(); check('carte repliable : contenu ré-affiché', pg.is_visible('#zgo'))
    # mode simple
    pg.check('#simple'); check('mode simple : cartes avancées masquées', not pg.is_visible('#wcard') and not pg.is_visible('#ccard') and pg.is_visible('#zcard') and pg.is_visible('#xcard'))
    check('mode simple : toujours pas de débordement', pg.evaluate('document.documentElement.scrollWidth') <= 390)
    pg.screenshot(path=os.path.join(OUT, 'mobile_simple.png'))
    pg.reload(); pg.wait_for_timeout(1200); check('mode simple mémorisé après rechargement', pg.is_checked('#simple') and not pg.is_visible('#wcard'))
    pg.uncheck('#simple')
    # boutons d'export grisés : explication
    pg.set_viewport_size({'width': 1300, 'height': 1000}); pg.reload(); pg.wait_for_timeout(1200)
    check('export grisé : infobulle explicative', 'bibliothèque vide' in (pg.get_attribute('#xzip', 'title') or '').lower() and pg.is_disabled('#xzip'), pg.get_attribute('#xzip', 'title') or '')
    check('export grisé : message visible', pg.is_visible('#xwhy'))
    open_model(pg); pg.fill('#frames', '2'); pg.select_option('#ndir', '4'); pg.select_option('#size', '48'); pg.click('#go')
    pg.wait_for_function("!document.querySelector('#xzip').disabled", timeout=120000)
    check('export dégrisé : message masqué, infobulle d\'origine rendue', not pg.is_visible('#xwhy') and 'bibliothèque vide' not in (pg.get_attribute('#xzip', 'title') or '').lower(), pg.get_attribute('#xzip', 'title') or '')
    check('aucune erreur JS', not errs, str(errs)[:300])
    b.close()
print('CAPTURES', OUT); sys.exit(1 if check.fails else 0)
