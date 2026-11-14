"""Test de fumée de modele.html avec le mannequin d'exemple (aucun fichier externe) :
  python tests/ui_smoke_modele.py        ou        python -m pytest tests/ui_smoke_modele.py

Charge la page, clique « Essayer avec un exemple », génère une petite planche (4 directions x 2 images, 48 px)
et vérifie qu'elle n'est pas vide, sans erreur de page."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _serve import CHROMIUM_ARGS, serve_docs
from playwright.sync_api import sync_playwright


def test_smoke_modele():
    with serve_docs() as base, sync_playwright() as p:
        browser = p.chromium.launch(args=CHROMIUM_ARGS)
        page = browser.new_page(viewport={"width": 1300, "height": 1000})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{base}/modele.html", wait_until="load")
        page.click("#bexemple")
        # le clip Walk du mannequin apparaît dans la liste des animations une fois le modèle chargé
        page.wait_for_function("document.querySelector('#clip') && document.querySelector('#clip').options.length > 0", timeout=60000)
        page.fill("#frames", "2")
        page.select_option("#ndir", "4")
        page.select_option("#size", "48")
        page.click("#go")
        page.wait_for_function("document.querySelector('#sheet').width === 48", timeout=120000)
        info = page.evaluate("""()=>{const c=document.querySelector('#sheet');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return {w:c.width,h:c.height,opaque:n}}""")
        browser.close()
    assert not errors, errors
    assert info["opaque"] > 200, f"planche vide : {info}"


if __name__ == "__main__":
    test_smoke_modele()
    print("OK ui_smoke_modele")
