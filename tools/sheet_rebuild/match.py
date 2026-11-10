from PIL import Image
import numpy as np,pickle
from scipy import ndimage as ndi
from scipy.optimize import linear_sum_assignment
o=np.array(Image.open('/tmp/ext/orig/sheet.png').convert('RGB')).astype(int)
bg=(o[...,0]>150)&(o[...,2]>150)&(o[...,1]<120)&(abs(o[...,0]-o[...,2])<90)
fg=ndi.binary_opening(~bg,iterations=1)
H,W=fg.shape;ch=H/23;cw=W/6
# original cell masks (bbox crop)
O={}
for r in range(23):
    for c in range(6):
        m=fg[int(r*ch):int((r+1)*ch),int(c*cw):int((c+1)*cw)]
        lab,n=ndi.label(ndi.binary_dilation(m,iterations=4))
        if n==0: O[r,c]=None;continue
        sizes=ndi.sum(m,lab,range(1,n+1)); k=np.argmax(sizes)+1
        mm=m&(lab==k); ys,xs=np.nonzero(mm)
        y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
        O[r,c]=dict(mask=mm[y0:y1,x0:x1],y=int(r*ch)+y0,x=int(c*cw)+x0,cell=(int(r*ch),int(c*cw)))
oh=np.median([O[0,c]['mask'].shape[0] for c in range(6)]);print('orig row1 height',oh,'cell',cw,ch)
S=pickle.load(open('sprites.pkl','rb'))
S=[s for s in S if s['mask'].sum()>1400]
print(len(S))
# source scales : normalise to A row1 height 112
def sc(s): return 1.0 if s['src']=='A' else 1.196
FIN=112.0
def norm_mask(m,h):  # resize mask to target height h (keep aspect) -> bool
    im=Image.fromarray((m*255).astype(np.uint8)); w=max(1,round(m.shape[1]*h/m.shape[0]))
    return np.array(im.resize((w,max(1,round(h))),Image.BILINEAR))>127
def canvas(m,size=(150,150)):
    # place bbox bottom-center on canvas, return bool (bottom-centred at centroid x)
    c=np.zeros(size,bool);h,w=m.shape
    if h>size[0] or w>size[1]: return None
    cx=int(np.nonzero(m)[1].mean());x0=size[1]//2-cx;y0=size[0]-1-h
    xs=max(0,x0);xe=min(size[1],x0+w)
    c[y0:y0+h,xs:xe]=m[:,xs-x0:xe-x0];return c
s_o=FIN/oh
cand=[];
for s in S:
    f=sc(s);m=norm_mask(s['mask'],s['mask'].shape[0]*f);s['f']=f;s['nm']=m;cand.append(canvas(m))
tgt={};
for k,v in O.items():
    if v is None: continue
    v['nm']=norm_mask(v['mask'],v['mask'].shape[0]*s_o);tgt[k]=canvas(v['nm'])
keys=[k for k in tgt if tgt[k] is not None];print(len(keys))
def blur(c): return ndi.gaussian_filter(c.astype(float),3)
cb=[blur(c) if c is not None else None for c in cand]
cost=np.full((len(keys),len(cand)),9.0)
for i,k in enumerate(keys):
    t=blur(tgt[k]);ts=t.sum()
    for j,c in enumerate(cb):
        if c is None: continue
        inter=np.minimum(t,c).sum();uni=np.maximum(t,c).sum()
        cost[i,j]=1-inter/uni
r,c=linear_sum_assignment(cost)
assign={keys[i]:j for i,j in zip(r,c)}
print('mean cost',cost[r,c].mean(),'best-independent',cost.min(1).mean())
pickle.dump(dict(assign=assign,keys=keys,S=S,O=O,s_o=s_o,cost=cost),open('match.pkl','wb'))
