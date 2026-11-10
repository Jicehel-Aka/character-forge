from PIL import Image
import numpy as np, scipy.ndimage as ndi, pickle
D='/mnt/user-data/attachments/9dd98225-c655-5eeb-be5b-44607c5c472a/'
def mask_of(a):
    R,G,B=a[...,0],a[...,1],a[...,2]
    bg=(R>150)&(B>150)&(G<130)&(abs(R-B)<70)
    return ~bg
def comps(m,minarea=1500,dil=9):
    lab,n=ndi.label(ndi.binary_dilation(m,iterations=dil))
    out=[]
    for k in range(1,n+1):
        mm=(lab==k)&m
        if mm.sum()<minarea: continue
        ys,xs=np.nonzero(mm); out.append((xs.min(),ys.min(),xs.max()+1,ys.max()+1,mm))
    return out
res={}
# image 1 : rows 19-21 (bands), skip label column x<300
a1=np.array(Image.open(D+'2878d597-image.png').convert('RGB')).astype(int)
m1=mask_of(a1); m1[:,:300]=False
cs=comps(m1)
print('img1',len(cs))
# group by band using bottom y
cs.sort(key=lambda c:c[3])
bands=[[],[],[],[],[]]
edges=[0,210,400,600,790,1024]
for c in cs:
    cy=(c[1]+c[3])/2
    for b in range(5):
        if edges[b]<=cy<edges[b+1]: bands[b].append(c)
for b in range(5): print(b,len(bands[b]),[ (c[0],c[1],c[2],c[3]) for c in sorted(bands[b])])
res['img1']=(a1,bands)
# image 3: walk, skip label block (top-left y<200) and text (y>690)
a3=np.array(Image.open(D+'f8f4ab0f-image.png').convert('RGB')).astype(int)
m3=mask_of(a3); m3[:200,:320]=False; m3[690:,:]=False
c3=sorted(comps(m3,minarea=5000),key=lambda c:c[0])
print('img3',len(c3),[(c[0],c[1],c[2],c[3]) for c in c3])
res['img3']=(a3,c3)
pickle.dump(res,open('ext.pkl','wb'))
