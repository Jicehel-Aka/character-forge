"""Utilitaire des tests UI : sert docs/ avec `python -m http.server` sur un port libre (aucun serveur d'API :
c'est exactement la situation de GitHub Pages)."""
import contextlib, socket, subprocess, sys, time, urllib.request
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"
CHROMIUM_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def serve_docs(port: int = 0):
    port = port or free_port()
    proc = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "-d", str(DOCS)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(base + "/index.html", timeout=1).read(1)
                break
            except Exception:
                time.sleep(0.1)
        yield base
    finally:
        proc.terminate()
        proc.wait(timeout=5)
