"""Tests d'interface (Playwright) du site tel que publié sur GitHub Pages (docs/, SANS serveur d'API).

  python tests/ui_pages.py        ou        python -m pytest tests/ui_pages.py

Vérifie : toutes les pages se chargent sans erreur grave ; les liens internes mènent à un fichier existant ;
chaine3d.html redirige vers 3d.html ; l'app React détecte l'absence de serveur (bandeau, bouton IA désactivé) ;
le modal « Publier GitHub » affiche un message français (jamais le HTML brut d'une 404)."""
import re, sys
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _serve import CHROMIUM_ARGS, DOCS, serve_docs
from playwright.sync_api import sync_playwright

PAGES = ["index.html", "atelier.html", "modele.html", "3d.html", "chaine3d.html"]
# Bruits attendus : polices Google Fonts (réseau coupé en CI), 404 de ./api/health (absence de serveur gérée).
BENIGN = re.compile(r"fonts\.g(oogleapis|static)\.com|ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION|TUNNEL|PROXY|CERT)|/api/health|"
                    r"Failed to load resource|WebGL|GPU stall|GroupMarker", re.I)


def new_page(browser, errors):
    pg = browser.new_page(viewport={"width": 1400, "height": 1000})
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and not BENIGN.search(m.text) else None)
    return pg


def test_ui_pages():
    problems = []
    with serve_docs() as base, sync_playwright() as p:
        browser = p.chromium.launch(args=CHROMIUM_ARGS)

        # 1. chaque page se charge sans erreur grave ; 2. liens internes valides
        for name in PAGES:
            errors = []
            pg = new_page(browser, errors)
            pg.goto(f"{base}/{name}", wait_until="load")
            pg.wait_for_timeout(2500 if name == "index.html" else 800)
            problems += [f"{name}: {e}" for e in errors]
            if name == "chaine3d.html":
                if not pg.url.endswith("/3d.html"):
                    problems.append(f"chaine3d.html ne redirige pas vers 3d.html (url={pg.url})")
            hrefs = pg.eval_on_selector_all("a[href]", "els=>els.map(e=>e.getAttribute('href'))")
            for h in hrefs:
                if not h or h.startswith(("#", "mailto:", "javascript:")) or urlparse(h).scheme in ("http", "https"):
                    continue
                target = urldefrag(urljoin(f"{base}/{name}", h))[0].replace(base + "/", "").split("?")[0] or "index.html"
                if not (DOCS / target).exists():
                    problems.append(f"{name}: lien cassé -> {h}")
            pg.close()

        # 3. app React sans serveur : bandeau « mode statique », bouton IA désactivé
        errors = []
        pg = new_page(browser, errors)
        api_calls = []
        pg.on("request", lambda r: api_calls.append(r.url) if "/api/" in r.url else None)
        pg.goto(f"{base}/index.html", wait_until="load")
        pg.wait_for_selector("[data-testid=static-mode-banner]", timeout=15000)
        banner = pg.inner_text("[data-testid=static-mode-banner]")
        if "Mode statique" not in banner:
            problems.append(f"bandeau statique inattendu : {banner!r}")
        if not pg.is_disabled("button:has-text('Analyser par Agent IA')"):
            problems.append("le bouton « Analyser par Agent IA » devrait être désactivé sans serveur")
        if any("/api/" in u and "health" not in u for u in api_calls):
            problems.append(f"requêtes API inutiles sans serveur : {api_calls}")
        src = "\n".join(f.read_text(encoding="utf-8") for f in (DOCS.parent / "src").rglob("*.ts*"))
        if re.search(r"fetch\(\s*[`'\"]/api/", src):
            problems.append("chemin /api/ ABSOLU dans src/ (casse sous /character-forge/) : utiliser apiFetch('api/...')")

        # 4. modal GitHub : message français, pas de HTML brut
        pg.click("button:has-text('Publier GitHub')")
        pg.wait_for_selector("[data-testid=github-static-notice]", timeout=5000)
        pg.click("button:has-text('Télécharger Pack Pages')", force=True) if not pg.is_disabled("button:has-text('Télécharger Pack Pages')") else None
        modal_text = pg.inner_text("div.fixed.inset-0")
        for bad in ("<!DOCTYPE", "<html", "Cannot GET", "File not found", "Error response", "404"):
            if bad.lower() in modal_text.lower():
                problems.append(f"HTML/404 brut visible dans le modal GitHub : {bad!r}")
        if not pg.is_disabled("button:has-text('Télécharger Pack Pages')"):
            problems.append("le bouton de pack devrait être désactivé sans serveur")
        problems += [f"index.html (interactions): {e}" for e in errors]
        browser.close()

    assert not problems, "\n".join(problems)


if __name__ == "__main__":
    test_ui_pages()
    print("OK ui_pages : pages, liens, mode statique, modal GitHub")
