from PIL import Image
import numpy as np, scipy.ndimage as ndi, pickle
M=pickle.load(open('m0.pkl','rb'))
R=[]
for i in range(10):
    rgb=np.array(Image.open(f'r{i}.png').convert('RGB'))
    m=ndi.binary_erosion(M[i],iterations=2)
    lum=rgb.astype(int).mean(2); sat=rgb.max(2).astype(int)-rgb.min(2)
    edge=m&~ndi.binary_erosion(m,iterations=5)
    m&=~(edge&(lum<75)&(sat<22))
    m=ndi.binary_opening(m,iterations=1)
    lab,n=ndi.label(m)
    if n>1:
        sz=ndi.sum(m,lab,range(1,n+1)); m=lab==(1+int(np.argmax(sz)))
    ys,xs=np.nonzero(m); y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    rgb=rgb[y0:y1,x0:x1][:,::-1].copy(); m=m[y0:y1,x0:x1][:,::-1].copy()   # flip -> face right
    R.append(dict(src='R',y=0,x=0,rgb=rgb,mask=m,ref=i))
    print(i,m.shape)
pickle.dump(R,open('refs.pkl','wb'))
# contact
W=sum(r['mask'].shape[1]+10 for r in R);H=max(r['mask'].shape[0] for r in R)
sh=Image.new('RGB',(W,H),(255,0,255));x=0
for r in R:
    t=r['rgb'].copy();t[~r['mask']]=(255,0,255);sh.paste(Image.fromarray(t),(x,0));x+=r['mask'].shape[1]+10
sh.save('refs_contact.png');print(sh.size)
