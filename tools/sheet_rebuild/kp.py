import pickle,numpy as np
from PIL import Image
from ultralytics import YOLO
S=pickle.load(open('match.pkl','rb'))['S']
m=YOLO('/tmp/ext/pose/y.pt');K=[]
for j,s in enumerate(S):
    h,w=s['mask'].shape;SZ=int(max(w,h)*1.4);bg=np.full((SZ,SZ,3),128,np.uint8);ox,oy=(SZ-w)//2,(SZ-h)//2
    t=s['rgb'].copy();t[~s['mask']]=128;bg[oy:oy+h,ox:ox+w]=t
    big=np.array(Image.fromarray(bg).resize((640,640),Image.LANCZOS));r=m(big,conf=0.05,verbose=False)[0]
    if not len(r.boxes): K.append(None);continue
    i=int(r.boxes.conf.argmax());k=r.keypoints.data[i].cpu().numpy().copy();k[:,0]=k[:,0]/640*SZ-ox;k[:,1]=k[:,1]/640*SZ-oy;K.append(k)
print(sum(k is not None for k in K),len(K));pickle.dump(K,open('kp_cand.pkl','wb'))
