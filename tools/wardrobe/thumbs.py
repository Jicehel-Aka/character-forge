"""Vignettes de la garde-robe (docs/wardrobe/thumbs/*.png) : python tools/wardrobe/thumbs.py
Serveur requis : cd docs && python3 -m http.server 8765 (Playwright + Chromium)."""
import base64, json, os, sys
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'wardrobe')
os.makedirs(OUT + '/thumbs', exist_ok=True)
cat = json.load(open(OUT + '/catalog.json'))
entries = [(i['id'], i['file'], 'item') for i in cat['items']] + [(p['id'], p['file'], p['slot']) for p in cat['parts']]
JS = """async(list)=>{
 const THREE=await import('three'),{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const R=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});R.setSize(144,144,false);R.setClearColor(0,0);R.outputColorSpace=THREE.SRGBColorSpace;
 const sc=new THREE.Scene();sc.add(new THREE.HemisphereLight(0xffffff,0x8890a0,1.2));const d=new THREE.DirectionalLight(0xffffff,1.8);d.position.set(-3,5,4);sc.add(d);
 const out={};const L=new GLTFLoader();
 for(const [id,file,kind] of list){const g=await L.loadAsync('wardrobe/'+file);const o=g.scene;sc.add(o);o.updateMatrixWorld(true);
   const b=new THREE.Box3().setFromObject(o,true),c=b.getCenter(new THREE.Vector3()),s=b.getSize(new THREE.Vector3()),r=Math.max(s.x,s.y,s.z)*.62;
   let cam;
   if(kind==='item'&&s.y>s.x*1.6){cam=new THREE.OrthographicCamera(-r,r,r,-r,.01,1000);o.rotation.z=-.5;o.updateMatrixWorld(true);const b2=new THREE.Box3().setFromObject(o,true);c.copy(b2.getCenter(new THREE.Vector3()));const s2=b2.getSize(new THREE.Vector3());const rr=Math.max(s2.x,s2.y,s2.z)*.58;cam.left=-rr;cam.right=rr;cam.top=rr;cam.bottom=-rr}
   else cam=new THREE.OrthographicCamera(-r,r,r,-r,.01,1000);
   cam.position.set(c.x+r*1.2,c.y+r*.9,c.z+r*3+5);cam.lookAt(c);cam.updateProjectionMatrix();
   if(kind==='item'&&s.y<=s.x*1.6){o.rotation.y=-.5;o.updateMatrixWorld(true)}
   R.render(sc,cam);out[id]=R.domElement.toDataURL('image/png');sc.remove(o)}
 return out}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(); pg.on('pageerror', lambda e: print('PAGEERR', e))
    pg.goto('http://127.0.0.1:8765/modele.html')
    for k in range(0, len(entries), 40):
        res = pg.evaluate(JS, entries[k:k + 40])
        for i, u in res.items(): open(f'{OUT}/thumbs/{i}.png', 'wb').write(base64.b64decode(u.split(',')[1]))
        print(k + 40, '/', len(entries)); sys.stdout.flush()
    b.close()
