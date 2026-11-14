"""Aides communes aux tests Playwright de docs/modele.html (sprites).
Usage : python3 tests/ui_sprites_xxx.py   (démarre son propre serveur HTTP sur docs/)."""
import contextlib, http.server, os, socketserver, threading
from playwright.sync_api import sync_playwright

DOCS = os.environ.get('DOCS_DIR') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs')   # DOCS_DIR : comparer avec une autre version
ROOT = os.path.abspath(os.path.join(DOCS, '..'))
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info']


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DOCS, **k)

    def log_message(self, *a):
        pass


@contextlib.contextmanager
def page(viewport=(1300, 1000)):
    """Ouvre modele.html (serveur local éphémère), charge le mannequin ; erreurs JS -> liste `errs`."""
    srv = socketserver.TCPServer(('127.0.0.1', 0), _Quiet)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        pg = b.new_page(viewport={'width': viewport[0], 'height': viewport[1]}, accept_downloads=True)
        pg.errs = []
        pg.on('pageerror', lambda e: pg.errs.append(str(e)[:300]))
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/modele.html')
        pg.wait_for_load_state('networkidle')
        try:
            yield pg
        finally:
            b.close()
            srv.shutdown()


def load_mannequin(pg):
    pg.click('#bexemple')
    pg.wait_for_function('()=>window._test&&_test.M', timeout=30000)
    pg.wait_for_timeout(1500)


def generate(pg, timeout=600000):
    """Clique « Générer » et attend la fin ; renvoie le texte de #prog."""
    pg.evaluate("document.querySelector('#prog').textContent=''")
    pg.click('#go')
    pg.wait_for_function("()=>{const t=document.querySelector('#prog').textContent;return /couleur|Erreur|vide|⚠|Refus/.test(t)}", timeout=timeout)
    return pg.inner_text('#prog')


class Check:
    """Petit compteur de vérifications (affiche OK/ÉCHEC, code retour != 0 si échec)."""
    def __init__(self):
        self.bad = 0

    def __call__(self, cond, label):
        print(('OK    ' if cond else 'ÉCHEC ') + label)
        if not cond:
            self.bad += 1

    def done(self):
        print('=> ' + ('tout passe' if not self.bad else f'{self.bad} échec(s)'))
        raise SystemExit(1 if self.bad else 0)
