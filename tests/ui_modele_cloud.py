# Test d'interface : stockage permanent GitHub de la banque, API GitHub simulée (aucun accès réseau réel). Serveur : cd docs && python3 -m http.server 8765
from playwright.sync_api import sync_playwright
import json, base64, re
MON='/mnt/user-data/attachments/9dd98225-c655-5eeb-be5b-44607c5c472a/e4a92e23-monika_doki_doki_literature_club_ddlc.glb'
repos={'bank':{},'priv':{}}; PRIV={'bank':False,'priv':True}; repo=repos['bank']; prv=repos['priv']  # dépôts simulés : chemin -> octets
def handler(route):
    rq=route.request; u=rq.url; m=re.match(r'https://api.github.com/repos/([^/]+)/([^/]+)/contents/([^?]*)',u)
    cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}
    if rq.method=='OPTIONS': return route.fulfill(status=204,headers=cors)
    mr=re.match(r'https://api.github.com/repos/([^/]+)/([^/]+)$',u)
    if mr: return route.fulfill(status=200,headers=cors,content_type='application/json',body=json.dumps({'private':PRIV.get(mr.group(2),False),'permissions':{'push':True}}))
    if not m: return route.fulfill(status=404,headers=cors,body='{}')
    repo=repos[m.group(2)]; path=__import__('urllib.parse').parse.unquote(m.group(3)); auth=rq.headers.get('authorization')
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
    pg.fill('#cown','acme'); pg.fill('#crepo','bank'); pg.fill('#cprepo','priv'); pg.fill('#ctok','tok123'); pg.check('#con'); pg.click('#ctest'); pg.wait_for_timeout(800); print(pg.inner_text('#cmsg'))
    pg.set_input_files('#file',MON); pg.wait_for_timeout(4000); pg.click('#wfixalpha')
    pg.evaluate("window.prompt=()=>'jupe é/test'")
    print(pg.evaluate("_test.wdSavePiece(_test.WO.list[5],'bas').then(()=>'ok',e=>e.message)")); print(pg.inner_text('#wmsg'))
    print('privé :',list(prv),'public :',list(repo)); assert any(k.startswith('pieces/bas__jupe') for k in prv) and not any(k.startswith('pieces/') for k in repo)
    # nouvel appareil : stockage local vidé, la pièce revient du dépôt
    pg.evaluate("indexedDB.deleteDatabase('character-forge')"); pg.reload(); pg.wait_for_timeout(2000)
    print('mine',pg.evaluate("_test.wdMineLoad().then(()=>_test.WD.mine.map(x=>x.id))"))
    assert pg.evaluate("_test.WD.mine.length===1")
    buf=pg.evaluate("_test.STORE.get(_test.WD.mine[0].id).then(b=>b.byteLength)"); print('octets récupérés',buf); assert buf>1000
    pg.evaluate("_test.STORE.del(_test.WD.mine[0].id)"); pg.wait_for_timeout(500); assert not repo and not prv, (repo,prv)
    # sans jeton : lecture seule
    pg.fill('#ctok',''); pg.dispatch_event('#ctok','change'); pg.wait_for_timeout(300)
    r=pg.evaluate("_test.STORE.put('piece:haut:x',new ArrayBuffer(8)).then(()=>'ok',e=>e.message)"); print('sans jeton :',r,'|',pg.evaluate("_test.CLOUD.msg"))
    # animations : import .zip avec dépôt activé -> sauvegarde automatique, restauration après effacement local
    pg.fill('#ctok','tok123'); pg.dispatch_event('#ctok','change'); pg.wait_for_timeout(500)
    pg.select_option('#avis','public')
    pg.set_input_files('#fzip',['/tmp/ext/zt/packA.zip','/tmp/ext/zt/packB.zip'])
    for _ in range(120):
        if 'Dépôt GitHub' in pg.inner_text('#amsg'): break
        pg.wait_for_timeout(500)
    print(pg.inner_text('#amsg')); an=[k for k in repo if k.startswith('anims/')]; print('anims dans le dépôt :',an)
    assert 'anims/index.json' in repo and len([k for k in an if k.endswith('.fbx')])==3, an
    pg.evaluate("indexedDB.deleteDatabase('character-forge')"); pg.reload(); pg.wait_for_timeout(3000)
    n=pg.evaluate("_test.MYA.clips.length"); print('animations restaurées depuis le dépôt :',n); assert n==3
    pg.set_input_files('#file',MON); pg.wait_for_timeout(4000)
    pg.select_option('#apack','mine'); pg.evaluate("document.querySelector('#aall').click()"); pg.wait_for_timeout(7000); print(pg.inner_text('#amsg'))
    assert pg.evaluate("_test.clips.filter(c=>/Lead_Jab/.test(c.name)).length")==1
    # visibilité : un élément privé ne doit jamais atteindre le dépôt public
    pg.evaluate("_test.STORE.put('piece:haut:secret',new ArrayBuffer(16),'private')"); pg.wait_for_timeout(800)
    assert 'pieces/haut__secret.glb' in prv and 'pieces/haut__secret.glb' not in repo
    pg.evaluate("_test.STORE.setVis('piece:haut:secret','public')"); pg.wait_for_timeout(800)
    assert 'pieces/haut__secret.glb' in repo and 'pieces/haut__secret.glb' not in prv, (list(repo),list(prv))
    # dépôt « privé » en réalité public -> refus
    PRIV['priv']=False; pg.evaluate("_test.CLOUD.privOk=null")
    r=pg.evaluate("_test.STORE.put('piece:haut:s2',new ArrayBuffer(16),'private').then(()=>_test.CLOUD.msg,e=>e.message)"); print('privé sur dépôt public :',r)
    assert 'pieces/haut__s2.glb' not in repo and 'pieces/haut__s2.glb' not in prv
    print('OK'); b.close()
