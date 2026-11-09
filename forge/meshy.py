"""Source 3D (Meshy, ou tout GLB/FBX/OBJ) -> sprites pixel art dans les 8 directions.
Rendu avec three.js dans Chromium sans tête (caméra orthographique inclinée comme SpriteKiln, lumière fixe dans le monde), animations du fichier
(clips d'un GLB riggé/animé par Meshy) ; puis réduction pixel art (aire, palette commune, contour 1 px) avec forge.pixdown.
CLI : forge meshy modele.glb --info | -o dir --size 64 --dirs s,se,e,... [--anim Nom --frames 8] [--ss 4]"""
import base64, http.server, io, json, os, shutil, subprocess, tempfile, threading
from functools import partial
from pathlib import Path
import numpy as np
from PIL import Image

DIRS = {"s": 0, "se": 45, "e": 90, "ne": 135, "n": 180, "nw": -135, "w": -90, "sw": -45}
THREE = "three@0.160.0"
ASSETS = Path(__file__).resolve().parent.parent / "tools" / "meshy"


def _three_dir():
    cache = Path(os.environ.get("FORGE_CACHE", Path.home() / ".cache" / "forge")) / "three"
    if not (cache / "node_modules" / "three").exists():
        cache.mkdir(parents=True, exist_ok=True); (cache / "package.json").write_text("{}")
        subprocess.run(["npm", "install", THREE], cwd=cache, check=True, capture_output=True)
    return cache


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


class Session:
    """Page de rendu : sert render.html + three.js + le modèle, ouvre Chromium."""
    def __init__(self, model, texture=None):
        self.tmp = Path(tempfile.mkdtemp(prefix="forge_meshy_"))
        shutil.copy(ASSETS / "render.html", self.tmp / "index.html"); (self.tmp / "node_modules").symlink_to(_three_dir() / "node_modules")
        self.name = "model" + Path(model).suffix.lower(); shutil.copy(model, self.tmp / self.name)
        if texture: shutil.copy(texture, self.tmp / "tex.png")
        self.texture = "tex.png" if texture else None
        for extra in Path(model).parent.glob("*.mtl"): shutil.copy(extra, self.tmp / extra.name)
        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), partial(_Quiet, directory=str(self.tmp)))
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        from playwright.sync_api import sync_playwright
        self.pw = sync_playwright().start()
        self.br = self.pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        self.page = self.br.new_page(); self.page.on("pageerror", lambda e: print("[meshy] erreur page:", e))
        self.page.goto(f"http://127.0.0.1:{self.srv.server_address[1]}/index.html"); self.page.wait_for_function("window.ready === true", timeout=60000)

    def inspect(self, name=None): return self.page.evaluate("u => window.inspect(u)", name or self.name)

    def render(self, size, dirs, anim=None, frames=1, yaw_offset=0, **kw):
        opt = dict(url=self.name, size=size, dirs=[{"name": d, "yaw": DIRS[d] + yaw_offset} for d in dirs], anim=anim, frames=frames, classes=True, texture=self.texture, texmap=getattr(self, 'texmap', None), donor=getattr(self, 'donor', None), headFrac=kw.pop('head_frac', 0.82), headScale=kw.pop('head_scale', 1.0), donorYaw=kw.pop('donor_yaw', 0.0), headDrop=kw.pop('head_drop', 0.0), headNames=kw.pop('head_names', None), tmax=kw.pop('tmax', None), **kw)
        res = self.page.evaluate("o => window.render(o)", opt)
        out = {}
        self.cls = {}
        for f in res["frames"]:
            out[(f["dir"], f["frame"])] = Image.open(io.BytesIO(base64.b64decode(f["png"].split(",", 1)[1]))).convert("RGBA")
            if f.get("cls"): self.cls[(f["dir"], f["frame"])] = Image.open(io.BytesIO(base64.b64decode(f["cls"].split(",", 1)[1]))).convert("RGBA")
        return out, res

    def close(self):
        try: self.br.close(); self.pw.stop(); self.srv.shutdown()
        finally: shutil.rmtree(self.tmp, ignore_errors=True)


def texmap_from_dir(session, texdir, prefix="tex", model=None):
    """Associe chaque matériau du modèle à une image 'diffuse/base color' du dossier (nom du matériau contenu dans le nom du fichier)."""
    import re
    norm = lambda t: re.sub(r"[^a-z0-9]", "", t.lower())
    bad = re.compile(r"normal|opacity|ambient|occlusion|specular|shadow|rough|metal|height|bump|mask", re.I)
    cands = [p for p in Path(texdir).rglob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg") and not bad.search(p.name)]
    out = {}
    for m in session.inspect(model)["materials"]:
        nm = norm(m)
        if not nm or nm == "outline": continue
        hit = [p for p in cands if nm in norm(p.name)]
        hit.sort(key=lambda p: (not re.search(r"diffuse|basecolor|base_color|albedo", p.name, re.I), len(p.name)))
        if hit:
            dst = f"{prefix}_{len(out)}{hit[0].suffix.lower()}"; shutil.copy(hit[0], session.tmp / dst); out[m] = dst
    return out


def cmd(a):
    s = Session(a.model, getattr(a, 'texture', None))
    if getattr(a, 'texdir', None):
        s.texmap = texmap_from_dir(s, a.texdir); print(f"[meshy] textures associées : {s.texmap}")
    s.donor = None
    if getattr(a, 'donor', None):
        ext = Path(a.donor).suffix.lower(); shutil.copy(a.donor, s.tmp / ("donor" + ext)); dm = None
        if getattr(a, 'donor_texdir', None):
            tmp = Session.__new__(Session); tmp.tmp = s.tmp; tmp.page = s.page
            dm = texmap_from_dir(tmp, a.donor_texdir, "dtex", "donor" + ext); print(f"[meshy] textures du donneur : {dm}")
        s.donor = dict(url="donor" + ext, texmap=dm, headNames=getattr(a, 'donor_head_names', None), headFrac=a.head_frac)
    try:
        if a.info:
            i = s.inspect(); print(json.dumps(i, indent=1, ensure_ascii=False)); return 0
        from . import pixdown, skiln_paint as K
        out = Path(a.output); out.mkdir(parents=True, exist_ok=True); dirs = a.dirs.split(",")
        big = min(1024, max(a.size * a.ss, 768))
        imgs, res = s.render(big, dirs, a.anim, a.frames, yaw_offset=a.yaw_offset, pitch=a.pitch, margin=a.margin, head_frac=a.head_frac, head_scale=a.head_scale, donor_yaw=a.donor_yaw, head_drop=a.head_drop, head_names=a.head_names, tmax=a.tmax)
        if res.get('compose'): print('[meshy] greffe :', json.dumps(res['compose']))
        print(f"[meshy] clip {res['clip']!r}, hauteur modèle {res['height']:.2f}, {len(imgs)} images en {big} px")
        # cadrage serré : boîte englobante de toutes les images (même recadrage partout -> échelle et pieds constants), personnage plein cadre
        boxes = [im.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox() for im in imgs.values()]; boxes = [b for b in boxes if b]
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes); x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        side = max(x1 - x0, y1 - y0) * (1 + 2 * a.pad); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        crop = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2)); tgt = a.size * a.ss
        imgs = {k: v.crop(crop).resize((tgt, tgt), Image.LANCZOS) for k, v in imgs.items()}
        clsm = {k: v.crop(crop).resize((a.size, a.size), Image.NEAREST) for k, v in getattr(s, "cls", {}).items()}
        arrs = {k: pixdown.shrink(v, a.size, sharpen=0.35) for k, v in imgs.items()}
        cmaps = {}
        for k, v in clsm.items():
            ids = (np.asarray(v.convert("RGBA"))[..., 0].astype(int) + 15) // 30; ids[np.asarray(v)[..., 3] == 0] = 0; cmaps[k] = ids.astype(np.uint8)
            if a.separate: arrs[k] = pixdown.separate(arrs[k], cmaps[k])
        allpx = np.concatenate([x[x[..., 3] > 0][:, :3] for x in arrs.values()]).astype(np.uint8)
        pal = Image.fromarray(allpx[None, ...]).quantize(a.colors, Image.MEDIANCUT)
        for (d, f), x in arrs.items():
            x = pixdown.outline(x) if a.outline else x
            q = np.asarray(Image.fromarray(x[..., :3]).quantize(palette=pal, dither=Image.NONE).convert("RGB")).copy(); r = np.dstack([q, x[..., 3]]); r[x[..., 3] == 0] = 0
            nm = f"{a.anim or 'pose'}_{d}_{f}"
            Image.fromarray(r, "RGBA").save(out / f"{nm}.png"); imgs[(d, f)].save(out / f"{nm}_big.png")
            if (d, f) in cmaps: Image.fromarray(cmaps[(d, f)], "L").save(out / f"{nm}_cls.png")
        print(f"[meshy] -> {out}"); return 0
    finally: s.close()
