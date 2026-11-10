from PIL import Image
import numpy as np,pickle,os
from scipy import ndimage as ndi
D=pickle.load(open('match.pkl','rb'));S=D['S'];O=D['O'];s_o=D['s_o'];assign=D['assign']
CW,CH=160,152
OV={(7,2):142,(7,3):44,(7,4):55,(7,5):141,
    (8,0):45,(8,1):46,(8,2):42,(8,3):106,(8,4):44,(8,5):46,
    (13,3):37,(13,4):55,(13,5):44}
for k,v in OV.items(): assign[k]=v
sheet=Image.new('RGB',(6*CW,23*CH),(255,0,255))
def sprite(s,corr=1.0):
    f=s['f']*corr;h,w=s['mask'].shape;nh,nw=round(h*f),round(w*f)
    rgb=Image.fromarray(s['rgb']).resize((nw,nh),Image.LANCZOS)
    m=ndi.binary_erosion(s['mask'],iterations=1)
    a=Image.fromarray((m*255).astype(np.uint8)).resize((nw,nh),Image.BILINEAR)
    a=np.array(a)>140
    r=np.array(rgb).astype(int)
    pink=(r[...,0]>170)&(r[...,2]>140)&(r[...,1]<110)
    a&=~pink
    return np.array(rgb),a
def wa(s):
    r=s['rgb'].astype(int);m=s['mask']&(r.min(2)>195);return max(m.sum()*s['f']**2,1)
ref=np.median([wa(x) for x in S])
g={j:np.sqrt(ref/wa(S[j])) for j in range(len(S))}
rowcorr={}
for row in range(23):
    v=[g[j] for (r_,c_),j in assign.items() if r_==row]
    rowcorr[row]=float(np.clip(np.median(v),0.88,1.12))
print({k:round(v,2) for k,v in rowcorr.items()})
used={}
for (r,c),j in assign.items():
    s=S[j];o=O[r,c]
    import os;MODE=os.environ.get('MODE','row')
    corr={'row':rowcorr[r],'none':1.0,'spr':float(np.clip(g[j]**0.7,0.9,1.1))}[MODE]
    rgb,a=sprite(s,corr)
    h,w=a.shape
    # original anchor: bottom and centroid-x of orig mask, scaled
    ox=(o['x']-o['cell'][1]+np.nonzero(o['mask'])[1].mean())*s_o
    oy=(o['y']-o['cell'][0]+o['mask'].shape[0])*s_o
    cx=np.nonzero(a)[1].mean()
    x0=int(round(ox-cx));y0=int(round(oy-h))
    x0=min(max(x0,0),CW-w);y0=min(max(y0,0),CH-h)
    tile=np.array(sheet.crop((c*CW,r*CH,(c+1)*CW,(r+1)*CH)))
    reg=tile[y0:y0+h,x0:x0+w];reg[a]=rgb[a];tile[y0:y0+h,x0:x0+w]=reg
    sheet.paste(Image.fromarray(tile),(c*CW,r*CH))
sheet.save(os.environ.get('OUT','planche_v1.png'));print(sheet.size)
# comparison: original (scaled) beside
o=Image.open('/tmp/ext/orig/sheet.png').convert('RGB').resize(sheet.size,Image.NEAREST)
for i,(y0,y1) in enumerate([(0,12),(11,23)]):
    B=Image.new('RGB',(sheet.width*2,(y1-y0)*CH));B.paste(o.crop((0,y0*CH,sheet.width,y1*CH)),(0,0));B.paste(sheet.crop((0,y0*CH,sheet.width,y1*CH)),(sheet.width,0))
    B.resize((B.width//2,B.height//2),Image.LANCZOS).save(f'cmp_v1_{i}.png')
