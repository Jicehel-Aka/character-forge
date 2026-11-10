import sys,json,pickle,numpy as np
from PIL import Image
from scipy import ndimage as ndi
sheet=sys.argv[1];names=json.load(open('names.json'))
im=np.array(Image.open(sheet).convert('RGB')).astype(int)
CW,CH=160,152
D=pickle.load(open('match.pkl','rb'));cost=D['cost'];keys=D['keys'];ci={k:i for i,k in enumerate(keys)};assign=D['assign']
o=np.array(Image.open('/tmp/ext/orig/sheet.png').convert('RGB')).astype(int)
def fgm(a): return ~((a[...,0]>150)&(a[...,2]>150)&(a[...,1]<120)&(abs(a[...,0]-a[...,2])<90))
F=fgm(im);Fo=fgm(o);oh,ow=Fo.shape;och,ocw=oh/23,ow/6
def st(m):
    ys,xs=np.nonzero(m)
    return dict(a=m.sum(),b=ys.max(),t=ys.min(),l=xs.min(),r=xs.max(),cx=xs.mean()) if len(ys) else None
LOOP={0,1,2,15,21,22}   # animations bouclées
rep=[];allok=True
for r in range(23):
    cells=[im[r*CH:(r+1)*CH,c*CW:(c+1)*CW] for c in range(6)]
    S=[st(F[r*CH:(r+1)*CH,c*CW:(c+1)*CW]) for c in range(6)]
    O=[st(Fo[int(r*och):int((r+1)*och),int(c*ocw):int((c+1)*ocw)]) for c in range(6)]
    res={}
    res['6 images non vides']=all(s and s['a']>1500 for s in S)
    res['fond magenta pur']=all(((c==[255,0,255]).all(2)|(abs(c-[255,0,255]).sum(2)>150)).all() for c in cells)
    res['sprite non coupé']=all(s['t']>0 and s['l']>0 and s['r']<CW-1 and s['b']<CH-1 for s in S)
    sc=lambda x:np.sqrt(x['a'])
    ds=[abs(np.log(sc(S[i+1])/sc(S[i]))) for i in range(5)];do=[abs(np.log(sc(O[i+1])/sc(O[i]))) for i in range(5)]
    res['échelle stable']=all(abs(a-b)<0.35 for a,b in zip(ds,do))
    db=[abs(S[i+1]['b']-S[i]['b']) for i in range(5)];dbo=[abs(O[i+1]['b']-O[i]['b'])*1.577 for i in range(5)]
    res['sol stable']=max(db)<=max(dbo)+10
    dx=[abs(S[i+1]['cx']-S[i]['cx']) for i in range(5)];dxo=[abs(O[i+1]['cx']-O[i]['cx'])*1.325 for i in range(5)]
    res['déplacement horiz.']=max(dx)<=max(dxo)+14
    res['pas d\'image doublée']=all(not np.array_equal(cells[i],cells[i+1]) for i in range(5))
    c_r=np.mean([cost[ci[(r,c)],assign[(r,c)]] for c in range(6) if (r,c) in ci])
    res['pose proche de l\'original']=c_r<0.45
    # cohérence de style : vert dominant moyen
    cols=[np.median(c[(F[r*CH:(r+1)*CH,k*CW:(k+1)*CW])&(c[...,1]>c[...,0]+25)&(c[...,1]>c[...,2]+10)],axis=0) for k,c in enumerate(cells)]
    res['style homogène']=float(np.max(np.std(np.array(cols),axis=0)))<9
    if r in LOOP:
        j=abs(sc(S[0])/sc(S[5])-1);res['boucle (6→1) fluide']=j<=max(do)+0.08 and abs(S[0]['cx']-S[5]['cx'])<=max(dxo)+14
    ok=all(res.values());allok&=ok
    rep.append((r+1,names[r],res,round(float(c_r),2)))
bad=[(n,k) for n,nm,res,c in rep for k,v in res.items() if not v]
print(sheet,'—',23-len({n for n,_ in bad}),'/ 23 animations sans alerte')
for n,nm,res,c in rep:
    f=[k for k,v in res.items() if not v]
    print(f'{n:2d} {nm:34s} dist={c:.2f}',' OK' if not f else ' ALERTE: '+', '.join(f))
json.dump([(n,[k for k,v in res.items() if not v]) for n,nm,res,c in rep],open('alertes.json','w'))
