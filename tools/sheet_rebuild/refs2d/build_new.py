import pickle, numpy as np
E=pickle.load(open('ext.pkl','rb'))
N=[]
def add(a,c,f,tag):
    x0,y0,x1,y1,m=c
    N.append(dict(src='N',y=0,x=0,rgb=a[y0:y1,x0:x1].astype(np.uint8).copy(),mask=m[y0:y1,x0:x1].copy(),f=f,tag=tag))
a3,c3=E['img3']; hw=np.median([c[3]-c[1] for c in c3]); f3=102/hw
for i,c in enumerate(c3): add(a3,c,f3,f'walk{i+1}')
a1,bands=E['img1']; f1=102/149
for b in range(3):
    for i,c in enumerate(sorted(bands[b],key=lambda c:c[0])): add(a1,c,f1,f'r{19+b}_{i+1}')
pickle.dump(N,open('news.pkl','wb')); print(len(N),f3,f1)
