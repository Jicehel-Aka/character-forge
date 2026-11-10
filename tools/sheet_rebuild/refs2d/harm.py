from PIL import Image
import numpy as np, pickle, scipy.ndimage as ndi
from scipy.cluster.vq import kmeans2
sheet=np.array(Image.open('/tmp/ext/fin/p_pre_row3.png').convert('RGB')).astype(int) if False else None
P=np.array(Image.open('/tmp/ext/fin/planche_ref_fighter.png').convert('RGB')).astype(int)
CW,CH=160,152
def isbg(a): return (a[...,0]>150)&(a[...,2]>150)&(a[...,1]<120)&(abs(a[...,0]-a[...,2])<90)
ref=[]
for r in [0,1,21,22]:
    cell=P[r*CH:(r+1)*CH]
    px=cell[~isbg(cell)]
    ref.append(px)
ref=np.concatenate(ref); lum=ref.mean(1); ref=ref[lum>45]
print('ref px',len(ref))
np.random.seed(0)
cent,_=kmeans2(ref.astype(float)[np.random.choice(len(ref),20000,replace=False)],28,seed=1,minit='++')
cent=cent[np.argsort(cent.mean(1))]
OUT=np.array((14,8,22))
def match_channels(src,ref):
    out=src.copy().astype(float)
    for ch in range(3):
        sv=np.sort(src[:,ch]);rv=np.sort(ref[:,ch])
        qs=np.searchsorted(sv,src[:,ch])/len(sv)
        out[:,ch]=np.interp(qs,np.linspace(0,1,len(rv)),rv)
    return out
N=pickle.load(open('news_e.pkl','rb'))
H=102;WID=1.10
res=[]
for s in N[:6]:
    rgb=s['rgb'];m=s['mask']
    h,w=m.shape;nh=H;nw=int(round(w*H/h*WID))
    im=Image.fromarray(rgb).resize((nw,nh),Image.LANCZOS)
    a=Image.fromarray((m*255).astype(np.uint8)).resize((nw,nh),Image.LANCZOS)
    a=np.array(a)>128;im=np.array(im).astype(float)
    a=ndi.binary_opening(a,iterations=1)
    inner=ndi.binary_erosion(a,iterations=1)
    px=im[inner]
    mp=match_channels(px,ref.astype(float))
    mp=0.8*mp+0.2*px
    dark=px.mean(1)<85
    mp[dark]=px[dark]*0.75+np.array((8,4,22))*0.25
    d=((mp[:,None,:]-cent[None])**2).sum(2);q=cent[d.argmin(1)]
    im[inner]=q
    # outline ring
    ring=ndi.binary_dilation(a,iterations=1)
    outl=ring&~inner
    im[outl]=OUT
    full=ring
    res.append(dict(src='N',y=0,x=0,rgb=im.astype(np.uint8),mask=full,f=1.0,tag=s['tag']))
for k in range(6): N[k]=res[k]
pickle.dump(N,open('news_h.pkl','wb'))
t=Image.new('RGB',(sum(r['mask'].shape[1]+6 for r in res)*3,H*3),(255,0,255));x=0
for r in res:
    z=r['rgb'].copy();z[~r['mask']]=(255,0,255);zi=Image.fromarray(z).resize((z.shape[1]*3,z.shape[0]*3),Image.NEAREST);t.paste(zi,(x,0));x+=zi.width+18
t.save('harm_prev.png')
