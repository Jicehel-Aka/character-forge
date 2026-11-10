import pickle,numpy as np
from PIL import Image
K=1.30;CUT=116
N=pickle.load(open('news.pkl','rb'))
for s in N[:6]:
    rgb=s['rgb'];m=s['mask'];h,w=m.shape
    r=rgb.astype(int);R,G,B=r[...,0],r[...,1],r[...,2]
    skin=m&(R>170)&(G>110)&(B>80)&(R>G+15)&(G>B)&(R-B>40)
    ys,xs=np.nonzero(skin[55:100]);cx=float(xs.mean())
    head=Image.fromarray(rgb[:CUT]);hm=Image.fromarray((m[:CUT]*255).astype(np.uint8))
    nh,nw=round(CUT*K),round(w*K)
    head=np.array(head.resize((nw,nh),Image.LANCZOS));hm=np.array(hm.resize((nw,nh),Image.LANCZOS))>128
    pad=nh-CUT                      # growth upward
    cxs=cx*K;shift=int(round(cxs-cx))   # head x offset so that face centre stays put
    W2=max(w,nw-shift)+max(0,shift) ;ox=shift
    # canvas: body at (ox_b, pad), head at (0,0) shifted so face centre aligned
    left=max(0,int(round(cxs-cx)))
    CW_=max(w+left,nw)
    out=np.zeros((h+pad,CW_,3),np.uint8);om=np.zeros((h+pad,CW_),bool)
    out[pad:,left:left+w]=rgb;om[pad:,left:left+w]=m
    out[pad+CUT:,left:left+w]=rgb[CUT:];  # body intact
    # body rows < CUT replaced by head
    om[pad:pad+CUT,left:left+w]=False
    hx0=0
    sel=hm
    reg=out[0:nh,hx0:hx0+nw];reg[sel]=head[sel];out[0:nh,hx0:hx0+nw]=reg
    om[0:nh,hx0:hx0+nw]|=sel
    # re-add body part that sticks out above CUT? (none: rows<CUT of body belong to head)
    ys,xs=np.nonzero(om);y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    s['rgb']=out[y0:y1,x0:x1];s['mask']=om[y0:y1,x0:x1]
    print(s['tag'],s['mask'].shape)
pickle.dump(N,open('news_e.pkl','wb'))
