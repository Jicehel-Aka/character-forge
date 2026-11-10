from PIL import Image
import numpy as np, scipy.ndimage as ndi, pickle
out=[]
for i in range(10):
    im=Image.open(f'r{i}.png').convert('RGB'); a=np.array(im).astype(int)
    R,G,B=a[...,0],a[...,1],a[...,2]
    mx=a.max(2); mn=a.min(2); sat=mx-mn
    lum=a.mean(2)
    # foreground cues
    chroma = sat>28                         # green, skin, mint, purple hair highlights
    white = lum>165                         # boots, white belt
    purple = (B-G>10)&(R-G>4)&(lum<120)     # hair tint
    fg = chroma|white|purple
    fg = ndi.binary_opening(fg, iterations=1)
    # keep large components
    lab,n=ndi.label(ndi.binary_dilation(fg,iterations=6))
    sizes=ndi.sum(fg,lab,range(1,n+1))
    keep=np.zeros_like(fg)
    for k,s in enumerate(sizes,1):
        if s>150: keep|=(lab==k)&ndi.binary_dilation(fg,iterations=6)
    m=ndi.binary_closing(keep,iterations=5)
    m=ndi.binary_fill_holes(m)
    out.append(m)
    # preview
    prev=np.array(im).copy(); prev[~m]=(255,0,255)
    Image.fromarray(prev.astype(np.uint8)).resize((im.width*2,im.height*2),Image.NEAREST).save(f's{i}.png')
pickle.dump(out,open('m0.pkl','wb'))
