#!/usr/bin/env python3
"""Pose un squelette + des animations sur un modèle 3D, sans interface : GLB/FBX/OBJ -> GLB avec squelette.

Pilote docs/modele.html dans un Chromium sans écran (Playwright), donc exactement le même code que la page.

  python3 tools/rig_cli.py modele.glb sortie.glb --skeleton Mixamo.fbx [--anims a.fbx b.fbx] [--pack kaykit:Walking_A,Running_A]

--skeleton : FBX/GLB humanoïde servant de squelette (ignoré si le modèle en a déjà un et --keep-skeleton est donné)
--anims    : FBX/GLB d'animations à recibler (Mixamo, etc.)
--pack     : clips CC0 de la bibliothèque intégrée (ual ou kaykit), séparés par des virgules
"""
import argparse, os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('model'); ap.add_argument('out')
ap.add_argument('--skeleton'); ap.add_argument('--anims', nargs='*', default=[])
ap.add_argument('--pack', action='append', default=[], help='ual:Idle_Loop,Walk_Loop  ou  kaykit:Walking_A')
ap.add_argument('--keep-skeleton', action='store_true')
a = ap.parse_args()
docs = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs')
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=docs, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={'width': 1300, 'height': 1000})
        pg.on('pageerror', lambda e: print('ERREUR PAGE', e, file=sys.stderr))
        pg.goto(f'http://127.0.0.1:{port}/modele.html'); pg.wait_for_timeout(1500)
        pg.set_input_files('#file', a.model); pg.wait_for_timeout(5000)
        if a.skeleton and not a.keep_skeleton:
            pg.set_input_files('#fskel', a.skeleton)
            for _ in range(480):
                m = pg.inner_text('#rmsg')
                if 'posé' in m or 'Squelette non' in m or 'Pas de squelette' in m: break
                pg.wait_for_timeout(500)
            print(pg.inner_text('#rmsg').split('\n')[0])
        if a.anims:
            pg.set_input_files('#fanim', a.anims)
            for _ in range(400):
                t = pg.inner_text('#rmsg')
                if t.count('✓') + t.count('✗') >= len(a.anims): break
                pg.wait_for_timeout(500)
        for spec in a.pack:
            pid, _, names = spec.partition(':')
            pg.evaluate("([id,n])=>_test.anAdd(_test.AN.cat.packs.find(p=>p.id===id),n?n.split(','):undefined)", [pid, names]); pg.wait_for_timeout(3000)
        with pg.expect_download(timeout=300000) as d: pg.click('#bglb')
        d.value.save_as(a.out); print('écrit', a.out)
        b.close()
finally:
    srv.terminate()
