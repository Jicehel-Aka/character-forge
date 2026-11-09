"""forge anim2d : GLB rigué + animations -> planches de sprites 2D sur fond magenta pur (255,0,255), prêtes pour un jeu.
Les animations viennent du GLB (--anim NOM|all), de FBX Mixamo (--fbx) ou d'animations apprises (--learned) ; le GLB n'est pas modifié.
Préréglages : platformer / combat (droite+gauche, vue de profil), adventure4 (bas, gauche, droite, haut), adventure8 (8 directions).
Cadrage commun à toutes les animations (échelle et pieds constants), palette partagée, couleurs RGB565."""
import base64, json, shutil, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps

MAGENTA = (255, 0, 255)
# ligne = (nom, direction rendue, miroir ?) ; la direction « w » du moteur de rendu regarde vers la droite de l'écran
PRESETS = {
    "platformer": dict(pitch=0.0, rows=[("right", "w", False), ("left", "w", True)]),
    "combat": dict(pitch=0.0, rows=[("right", "w", False), ("left", "w", True)]),
    "adventure4": dict(pitch=25.0, rows=[("down", "s", False), ("left", "w", True), ("right", "w", False), ("up", "n", False)]),
    "adventure8": dict(pitch=25.0, rows=[("down", "s", False), ("down_right", "sw", False), ("right", "w", False), ("up_right", "nw", False),
                                         ("up", "n", False), ("up_left", "nw", True), ("left", "w", True), ("down_left", "sw", True)]),
}


def _with_extra_clips(model, fbx, learned, fps, sign, tmp):
    """GLB temporaire = GLB + clips externes (le fichier d'origine n'est pas touché)."""
    if not (fbx or learned): return model
    from . import clips as C
    import argparse
    out = Path(tmp) / "avec_clips.glb"
    C.cmd(argparse.Namespace(model=str(model), fbx=fbx, learned=learned, name=None, fps=fps, sign=sign, output=str(out)))
    return str(out)


def cmd(a):
    from .meshy import Session
    from . import pixdown
    tmp = tempfile.mkdtemp(prefix="forge_anim2d_")
    try:
        model = _with_extra_clips(a.model, a.fbx, a.learned, a.fps, a.sign, tmp)
        preset = PRESETS[a.preset]; rows = preset["rows"]; pitch = a.pitch if a.pitch is not None else preset["pitch"]
        s = Session(model)
        try:
            names = [c["name"] for c in s.inspect()["clips"]]
            ext = [Path(c).stem.split("-", 1)[-1] for c in (a.fbx or [])] + [(json.loads(Path(c).read_text()).get("type") or Path(c).stem) for c in (a.learned or [])]
            if a.anim == ["all"] or (not a.anim and not ext): want = list(names)
            else: want = list(a.anim or []) + [n for n in ext if n not in (a.anim or [])]
            miss = [n for n in want if n not in names]
            if miss: raise SystemExit(f"clips introuvables : {miss} (disponibles : {names})")
            big = min(1024, max(a.size * a.ss, 768)); render_dirs = sorted({r[1] for r in rows}); H = None; imgs = {}; cls = {}
            for nm in want:
                kw = dict(pitch=pitch, margin=a.margin); 
                if H: kw["height"] = H
                im, res = s.render(big, render_dirs, nm, a.frames, **kw)
                H = H or res["height"]; print(f"[anim2d] {nm}: {len(im)} images")
                for (d, f), v in im.items():
                    imgs[(nm, d, f)] = v
                    if (d, f) in getattr(s, "cls", {}): cls[(nm, d, f)] = s.cls[(d, f)]
        finally:
            s.close()
        # lignes (avec miroirs)
        full, fcls = {}, {}
        for nm in want:
            for (rname, d, mir) in rows:
                for f in range(a.frames):
                    v = imgs[(nm, d, f)]; c = cls.get((nm, d, f))
                    full[(nm, rname, f)] = ImageOps.mirror(v) if mir else v
                    if c is not None: fcls[(nm, rname, f)] = ImageOps.mirror(c) if mir else c
        # cadrage commun (échelle et pieds constants pour toutes les animations)
        boxes = [v.getchannel("A").point(lambda x: 255 if x > 16 else 0).getbbox() for v in full.values()]; boxes = [b for b in boxes if b]
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes); x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        side = max(x1 - x0, y1 - y0) * (1 + 2 * a.pad); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        crop = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2)); tgt = a.size * a.ss
        arrs = {k: pixdown.shrink(v.crop(crop).resize((tgt, tgt), Image.LANCZOS), a.size, sharpen=0.35) for k, v in full.items()}
        if a.separate and fcls:
            for k, c in fcls.items():
                c = c.crop(crop).resize((a.size, a.size), Image.NEAREST)
                ids = (np.asarray(c.convert("RGBA"))[..., 0].astype(int) + 15) // 30; ids[np.asarray(c)[..., 3] == 0] = 0
                arrs[k] = pixdown.separate(arrs[k], ids.astype(np.uint8))
        allpx = np.concatenate([x[x[..., 3] > 0][:, :3] for x in arrs.values()]).astype(np.uint8)
        pal = Image.fromarray(allpx[None, ...]).quantize(a.colors, Image.MEDIANCUT)
        pp = np.array(pal.getpalette()[:3 * a.colors], dtype=np.uint8).reshape(-1, 3)
        pp = np.stack([(pp[:, 0] >> 3) << 3 | (pp[:, 0] >> 5), (pp[:, 1] >> 2) << 2 | (pp[:, 1] >> 6), (pp[:, 2] >> 3) << 3 | (pp[:, 2] >> 5)], 1)   # RGB565 -> RGB888
        pp[(pp == np.array(MAGENTA)).all(1)] = (248, 0, 248)
        out = Path(a.output); out.mkdir(parents=True, exist_ok=True); (out / "frames").mkdir(exist_ok=True); meta = dict(preset=a.preset, size=a.size, directions=[r[0] for r in rows], background="#FF00FF", animations={})
        for nm in want:
            sheet = Image.new("RGB", (a.size * a.frames, a.size * len(rows)), MAGENTA)
            for ri, (rname, _, _) in enumerate(rows):
                for f in range(a.frames):
                    x = arrs[(nm, rname, f)]; x = pixdown.outline(x) if a.outline else x
                    q = np.asarray(Image.fromarray(x[..., :3]).quantize(palette=pal, dither=Image.NONE)).astype(int)
                    rgb = pp[np.clip(q, 0, len(pp) - 1)].astype(np.uint8); al = x[..., 3] > 0
                    cell = np.zeros((a.size, a.size, 4), np.uint8); cell[..., :3] = rgb; cell[..., 3] = np.where(al, 255, 0)
                    Image.fromarray(cell, "RGBA").save(out / "frames" / f"{nm}_{rname}_{f}.png")
                    bg = np.zeros((a.size, a.size, 3), np.uint8); bg[:] = MAGENTA; bg[al] = rgb[al]
                    sheet.paste(Image.fromarray(bg), (f * a.size, ri * a.size))
            sheet.save(out / f"{nm}_sheet.png"); meta["animations"][nm] = dict(frames=a.frames, fps=a.fps_play, loop=True, file=f"{nm}_sheet.png")
        (out / "anim2d.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
        print(f"[anim2d] {len(want)} animation(s) x {len(rows)} directions x {a.frames} images, cellule {a.size}px -> {out}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return 0
