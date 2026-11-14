"""Pack Godot (#xgodot) : le .tres doit être un SpriteFrames Godot 4 VALIDE (une AtlasTexture par case, frames remplies, durées, boucle).
Contrôles : (1) syntaxe/cohérence par notre propre analyseur ; (2) régions dans le PNG ; (3) import réel avec Godot 4 headless si un binaire est
trouvé (variable GODOT, ou `godot` dans le PATH, ou le binaire d'audit). Test : python3 tests/ui_sprites_godot.py"""
import io, os, re, shutil, subprocess, sys, tempfile, zipfile
sys.path.insert(0, os.path.dirname(__file__))
from _sprites_common import *
from PIL import Image

AUDIT = '/tmp/claude-0/-home-claude/9dd98225-c655-5eeb-be5b-44607c5c472a/scratchpad/audit/3d/godot/Godot_v4.5-stable_linux.x86_64'


def parse_tres(txt):
    """Analyseur minimal d'un .tres : renvoie (entête, ext_resources, sub_resources, animations). Lève ValueError si syntaxe invalide."""
    head = re.match(r'\[gd_resource type="SpriteFrames" load_steps=(\d+) format=3\]\n', txt)
    if not head:
        raise ValueError('entête gd_resource invalide')
    exts = dict(re.findall(r'\[ext_resource type="Texture2D" path="(res://[^"]+)" id="([^"]+)"\]', txt))
    exts = {i: p for p, i in exts.items()}
    subs = {}
    for m in re.finditer(r'\[sub_resource type="AtlasTexture" id="([^"]+)"\]\natlas = ExtResource\("([^"]+)"\)\nregion = Rect2\((\d+), (\d+), (\d+), (\d+)\)\n', txt):
        subs[m.group(1)] = (m.group(2), *map(int, m.group(3, 4, 5, 6)))
    if txt.count('[sub_resource') != len(subs):
        raise ValueError('sous-ressource mal formée')
    res = txt.split('[resource]\n', 1)[1]
    anims = []
    for m in re.finditer(r'\{\n"frames": \[(.*?)\],\n"loop": (true|false),\n"name": &"(\w+)",\n"speed": ([\d.]+)\n\}', res, re.S):
        fr = re.findall(r'\{\n"duration": ([\d.]+),\n"texture": SubResource\("([^"]+)"\)\n\}', m.group(1))
        anims.append(dict(frames=fr, loop=m.group(2) == 'true', name=m.group(3), speed=float(m.group(4))))
    return int(head.group(1)), exts, subs, anims


def godot_bin():
    for c in (os.environ.get('GODOT'), shutil.which('godot'), shutil.which('godot4'), AUDIT):
        if c and os.path.exists(c):
            return c


ok = Check()
with page() as pg:
    load_mannequin(pg)
    pg.fill('#frames', '4')
    for idx in (2, 1):                         # deux animations différentes
        pg.select_option('#clip', index=idx)
        pg.evaluate("document.querySelector('#fdur').value=" + ('80' if idx == 2 else '110'))
        generate(pg)
    pg.select_option('#size', '64')
    n_rows = pg.evaluate("_sprites.layoutOf(false).rows.length")
    with pg.expect_download() as d:
        pg.click('#xgodot')
    z = zipfile.ZipFile(io.BytesIO(open(d.value.path(), 'rb').read()))
    names = z.namelist()
    print('contenu du zip :', names)
    tres_name = [n for n in names if n.endswith('.tres')][0]
    png_name = [n for n in names if n.endswith('_spritesheet.png')][0]
    tres = z.read(tres_name).decode()
    png = Image.open(io.BytesIO(z.read(png_name)))
    ok(not pg.errs, 'aucune erreur JS')
    try:
        steps, exts, subs, anims = parse_tres(tres)
        ok(True, '.tres : syntaxe valide (analyseur maison)')
    except ValueError as e:
        ok(False, '.tres : syntaxe : ' + str(e)); ok.done()
    nframes = sum(len(a['frames']) for a in anims)
    ok(len(anims) == n_rows, f'une animation par ligne « nom_direction » ({len(anims)} == {n_rows})')
    ok(nframes > 0 and all(a['frames'] for a in anims), f'aucun "frames": [] vide ({nframes} images au total)')
    ok(len(subs) == nframes, f'une AtlasTexture par image ({len(subs)} == {nframes})')
    ok(steps == len(exts) + len(subs) + 1, f'load_steps correct ({steps} == {len(exts)}+{len(subs)}+1)')
    ok(all(i in subs for a in anims for _, i in a['frames']), 'toutes les textures de frames existent')
    ok(all(a in exts for a, *_ in subs.values()), 'tous les atlas référencent une ext_resource')
    ok(all(exts[v[0]].endswith(png_name) for v in subs.values()), 'ext_resource = le PNG du pack')
    W, H = png.size
    ok(all(x + w <= W and y + h <= H and w == 64 and h == 64 for _, x, y, w, h in subs.values()), f'régions dans la planche {W}×{H} (cases 64×64)')
    ok(W == 64 * max(len(a['frames']) for a in anims), 'pas de colonne d\'étiquettes dans le pack moteur')
    # les régions tombent sur des images non vides
    px = png.convert('RGBA')
    vides = sum(1 for _, x, y, w, h in subs.values() if px.crop((x, y, x + w, y + h)).getbbox() is None or px.crop((x, y, x + w, y + h)).getchannel('A').getbbox() is None)
    ok(vides == 0, f'aucune case vide ({vides})')
    ok(any(abs(a['speed'] - 12.5) < .01 for a in anims) and any(abs(a['speed'] - 9.09) < .01 for a in anims), 'vitesse = 1000/durée (80 ms -> 12.5, 110 ms -> 9.09) : ' + str(sorted({a['speed'] for a in anims})))
    ok(all(all(abs(float(du) - 1.0) < 1e-6 for du, _ in a['frames']) for a in anims), 'durée relative par image = 1.0')

    # boucle par animation : saut / attaque / coup / mort = pas de boucle ; idle / marche / course = boucle
    loops = pg.evaluate("Object.fromEntries(['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Jump_Full_Short','Punch_Jab','Hit_A','Death01','Climb_Ladder'].map(n=>[n,_sprites.loopOf(n)]))")
    ok(loops == {'Idle_Loop': True, 'Walk_Loop': True, 'Jog_Fwd_Loop': True, 'Jump_Full_Short': False, 'Punch_Jab': False, 'Hit_A': False, 'Death01': False, 'Climb_Ladder': True}, 'boucle par défaut selon le nom : ' + str(loops))

    # réglage de la boucle dans l'interface -> .tres
    pg.evaluate("document.querySelector('.dlp').click()")
    t2 = pg.evaluate("_sprites.godotTres(_sprites.layoutOf(false),['x.png'])")
    ok(t2.count('"loop": false') > 0 and parse_tres(t2)[3] is not None, 'case « boucle » décochée -> "loop": false dans le .tres')

    # atlas JSON : frameTags forward + loop + ancrages + collision
    import json
    aj = json.loads(z.read([n for n in names if n.endswith('aseprite_atlas.json')][0]))
    tags = aj['meta']['frameTags']
    ok(all(t['direction'] == 'forward' and isinstance(t['loop'], bool) for t in tags), 'frameTags : direction forward + loop')
    f0 = next(iter(aj['frames'].values()))
    ok({'feet', 'hand', 'muzzle'} <= set(f0['anchors']) and f0['collision']['w'] > 0, 'image : ancrages (pieds/main/tir) + collision : ' + str(f0['anchors']))
    ok({v['duration'] for v in aj['frames'].values()} == {80, 110}, 'durées par image dans l\'atlas : ' + str({v['duration'] for v in aj['frames'].values()}))

    # import réel dans Godot (si disponible)
    g = godot_bin()
    if not g:
        print('INFO  Godot introuvable : import réel non exécuté (définir GODOT=/chemin/godot)')
    else:
        proj = tempfile.mkdtemp(prefix='cf_godot_')
        open(os.path.join(proj, 'project.godot'), 'w').write('config_version=5\n[application]\nconfig/name="cf"\n')
        for n in (tres_name, png_name):
            open(os.path.join(proj, n), 'wb').write(z.read(n))
        open(os.path.join(proj, 'check.gd'), 'w').write('''extends SceneTree
func _init():
\tvar sf = load("res://%s")
\tif sf == null:
\t\tprint("RESULT load_failed"); quit(1); return
\tvar tot = 0
\tvar ok = 0
\tvar loops = 0
\tfor n in sf.get_animation_names():
\t\ttot += sf.get_frame_count(n)
\t\tif sf.get_animation_loop(n): loops += 1
\t\tfor i in sf.get_frame_count(n):
\t\t\tvar t = sf.get_frame_texture(n, i)
\t\t\tif t != null and t.get_width() == 64 and t.get_height() == 64: ok += 1
\tprint("RESULT anims=", sf.get_animation_names().size(), " frames=", tot, " textures_ok=", ok, " loops=", loops, " speed0=", sf.get_animation_speed(sf.get_animation_names()[0]))
\tquit()
''' % tres_name)
        subprocess.run([g, '--headless', '--path', proj, '--import'], capture_output=True, timeout=180)
        r = subprocess.run([g, '--headless', '--path', proj, '--script', 'res://check.gd'], capture_output=True, text=True, timeout=180)
        line = [l for l in r.stdout.splitlines() if l.startswith('RESULT')]
        print('Godot :', line[0] if line else (r.stdout + r.stderr)[-400:])
        m = re.search(r'anims=(\d+) frames=(\d+) textures_ok=(\d+)', line[0] if line else '')
        ok(bool(m) and int(m.group(1)) == n_rows and int(m.group(2)) == nframes and int(m.group(3)) == nframes, 'Godot 4 : toutes les images ont une texture 64×64 valide')
        shutil.rmtree(proj, ignore_errors=True)
ok.done()
