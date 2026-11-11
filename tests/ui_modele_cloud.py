# Test d'interface : stockage permanent GitHub de la banque, API GitHub simulée (aucun accès réseau réel). Serveur : cd docs && python3 -m http.server 8765
from playwright.sync_api import sync_playwright
import json, base64, re
MON='/mnt/user-data/attachments/9dd98225-c655-5eeb-be5b-44607c5c472a/e4a92e23-monika_doki_doki_literature_club_ddlc.glb'
repo={}   # chemin -> octets
def handler(route):
    rq=route.request; u=rq.url; m=re.match(r'https://api.github.com/repos/([^/]+)/([^/]+)/contents/([^?]*)',u)
    cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}
    if rq.method=='OPTIONS': return route.fulfill(status=204,headers=cors)
    if not m: return route.fulfill(status=200,headers=cors,content_type='application/json',body=json.dumps({'private':False,'permissions':{'push':True}}))
    path=__import__('urllib.parse').parse.unquote(m.group(3)); auth=rq.headers.get('authorization')
    if rq.method=='GET':
        if path in repo:
            if 'raw' in rq.headers.get('accept',''): return route.fulfill(status=200,headers=cors,body=repo[path])
            return route.fulfill(status=200,headers=cors,content_type='application/json',body=json.dumps({'sha':'s%d'%len(repo[path]),'type':'file'}))
        items=[{'name':k.split('/',1)[1],'type':'file','sha':'s'} for k in repo if k.startswith(path+'/')]
        if items: return route.fulfill(status=200,headers=cors,content_type='application/json',body=json.dumps(items))
        return route.fulfill(status=404,headers=cors,content_type='application/json',body='{"message":"Not Found"}')
    if rq.method in('PUT','DELETE'):
        if auth!='Bearer tok123': return route.fulfill(status=401,headers=cors,content_type='application/json',body='{"message":"Bad credentials"}')
        b=json.loads(rq.post_data)
        if rq.method=='PUT': repo[path]=base64.b64decode(b['content'])
        else: repo.pop(path,None)
        return route.fulfill(status=200,headers=cors,content_type='application/json',body='{}')
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    ctx=b.new_context(viewport={'width':1300,'height':1100}); ctx.route('https://api.github.com/**',handler)
    pg=ctx.new_page(); pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('CONSOLE',m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:8765/modele.html'); pg.wait_for_timeout(1500)
    pg.fill('#cown','acme'); pg.fill('#crepo','bank'); pg.fill('#ctok','tok123'); pg.check('#con'); pg.click('#ctest'); pg.wait_for_timeout(800); print(pg.inner_text('#cmsg'))
    pg.set_input_files('#file',MON); pg.wait_for_timeout(4000); pg.click('#wfixalpha')
    pg.evaluate("window.prompt=()=>'jupe é/test'")
    print(pg.evaluate("_test.wdSavePiece(_test.WO.list[5],'bas').then(()=>'ok',e=>e.message)")); print(pg.inner_text('#wmsg'))
    print('dépôt :',list(repo)); assert any(k.startswith('pieces/bas__jupe') for k in repo) and repo[list(repo)[0]][:4]==b'glTF'
    # nouvel appareil : stockage local vidé, la pièce revient du dépôt
    pg.evaluate("indexedDB.deleteDatabase('character-forge')"); pg.reload(); pg.wait_for_timeout(2000)
    print('mine',pg.evaluate("_test.wdMineLoad().then(()=>_test.WD.mine.map(x=>x.id))"))
    assert pg.evaluate("_test.WD.mine.length===1")
    buf=pg.evaluate("_test.STORE.get(_test.WD.mine[0].id).then(b=>b.byteLength)"); print('octets récupérés',buf); assert buf>1000
    pg.evaluate("_test.STORE.del(_test.WD.mine[0].id)"); pg.wait_for_timeout(500); assert not repo, repo
    # sans jeton : lecture seule
    pg.fill('#ctok',''); pg.dispatch_event('#ctok','change'); pg.wait_for_timeout(300)
    r=pg.evaluate("_test.STORE.put('piece:haut:x',new ArrayBuffer(8)).then(()=>'ok',e=>e.message)"); print('sans jeton :',r,'|',pg.evaluate("_test.CLOUD.msg"))
    print('OK'); b.close()
