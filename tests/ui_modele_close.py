# Test d'interface : fermeture du maillage (closeGeometry) sur une sphère trouée + facette flottante + doublons
# serveur : cd docs && python3 -m http.server 8765
from playwright.sync_api import sync_playwright
JS = """async()=>{
 const T=await import('three');
 const g=new T.SphereGeometry(1,32,24);                      // sommets dupliqués à la couture : soudure testée
 const idx=Array.from(g.index.array),keep=[];const P=g.attributes.position,c=new T.Vector3();
 for(let t=0;t<idx.length;t+=3){c.set(0,0,0);for(let k=0;k<3;k++)c.add(new T.Vector3().fromBufferAttribute(P,idx[t+k]));c.divideScalar(3);
   if(c.distanceTo(new T.Vector3(1,0,0))<.45||c.distanceTo(new T.Vector3(0,-1,0))<.3)continue;keep.push(idx[t],idx[t+1],idx[t+2])}
 // facette flottante : 3 sommets neufs loin de la sphère
 const n=P.count,pos=new Float32Array(P.array.length+9);pos.set(P.array);pos.set([5,5,5, 5.1,5,5, 5,5.1,5],P.array.length);
 const g2=new T.BufferGeometry();g2.setAttribute('position',new T.BufferAttribute(pos,3));
 const nm=new Float32Array(pos.length);nm.set(g.attributes.normal.array);g2.setAttribute('normal',new T.BufferAttribute(nm,3));
 const uv=new Float32Array(pos.length/3*2);uv.set(g.attributes.uv.array);g2.setAttribute('uv',new T.BufferAttribute(uv,2));
 g2.setIndex(keep.concat([n,n+1,n+2]));
 const r=window._test.closeGeometry(g2);
 // vérification : toute arête (positions soudées) partagée par exactement 2 triangles
 const p=g2.attributes.position,I=g2.index.array,q=v=>Math.round(v*1e5),key=i=>q(p.getX(i))+','+q(p.getY(i))+','+q(p.getZ(i)),E=new Map();
 for(let t=0;t<I.length;t+=3)for(let k=0;k<3;k++){const a=key(I[t+k]),b=key(I[t+(k+1)%3]),e=a<b?a+'|'+b:b+'|'+a;E.set(e,(E.get(e)||0)+1)}
 let bad=0;E.forEach(v=>{if(v!==2)bad++});
 let far=0;for(let i=0;i<p.count;i++)if(p.getX(i)>4)far++;
 return {r,bad,tris:I.length/3,uvlen:g2.attributes.uv.count===p.count,normal:g2.attributes.normal.count===p.count}}"""
with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(); pg.on('pageerror',lambda e:print('PAGEERR',e))
    pg.goto('http://127.0.0.1:8765/modele.html'); pg.wait_for_timeout(1500)
    r=pg.evaluate(JS); print(r)
    assert r['bad']==0 and r['r']['holes']==2 and r['r']['floating']==1 and r['uvlen'] and r['normal'], r
    print('OK'); b.close()
