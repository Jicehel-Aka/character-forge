exec(open('match.py').read().split("r,c=linear_sum_assignment")[0])
import pickle,json,os
Kc=pickle.load(open('kp_cand.pkl','rb'))
P=json.load(open('/tmp/ext/orig/pose/pose.json'))
Hn=112.0
def feats(k,bottom,H,mask_cx):
    """k: (17,3) coords locaux (px de l'image), bottom: y du sol (bas du masque), H: échelle. -> vecteur ou None"""
    if k is None: return None
    k=k.copy();c=k[:,2]
    def pt(i,j=None):
        if j is None: return k[i,:2]
        return (k[i,:2]+k[j,:2])/2
    hip=pt(11,12);sh=pt(5,6)
    wr=sorted([k[9,:2],k[10,:2]],key=lambda p:p[0]);an=sorted([k[15,:2],k[16,:2]],key=lambda p:p[0])
    kn=sorted([k[13,:2],k[14,:2]],key=lambda p:p[0])
    f=[(bottom-hip[1])/H,(bottom-sh[1])/H,(sh[0]-hip[0])/H,(bottom-k[0,1])/H]
    for a in an: f+=[(a[0]-hip[0])/H,(bottom-a[1])/H]
    for q in kn: f+=[(q[0]-hip[0])/H,(bottom-q[1])/H]
    for w in wr: f+=[(w[0]-sh[0])/H,(bottom-w[1])/H-(bottom-sh[1])/H]
    return np.array(f)
W=np.array([2.0,1.0,1.0,0.8, 1.2,1.5,1.2,1.5, .6,.6,.6,.6, 1.2,1.2,1.2,1.2])
FC=[]
for j,s in enumerate(S):
    h=s['mask'].shape[0]*s['f']; f=s['f']
    k=Kc[j].copy()*np.array([f,f,1]) if Kc[j] is not None else None
    FC.append(feats(k,h,Hn,None))

FO={};
for p in P:
    if not p or not p.get('kp'): continue
    r,c=p['row'],p['col'];o=O.get((r,c))
    if o is None or r>=23: continue
    k=np.array(p['kp']);FO[r,c]=feats(k,o['y']+o['mask'].shape[0],oh,None)
# lissage temporel médian des features originales par ligne (3 images) pour atténuer les erreurs de pose
FOs={}
for r in range(23):
    ks=[(r,c) for c in range(6) if (r,c) in FO and FO[r,c] is not None]
    for i,k in enumerate(ks):
        nb=[FO[ks[j]] for j in range(max(0,i-1),min(len(ks),i+2))]
        FOs[k]=np.median(np.stack(nb),0)
Hn=112.0
fc_ok=[j for j in range(len(S)) if FC[j] is not None]
cost2=np.full((len(keys),len(S)),9.0)
for i,k in enumerate(keys):
    f0=FOs.get(k)
    for j in fc_ok:
        if f0 is None: cost2[i,j]=cost[i,j];continue
        d=FC[j]-f0;cost2[i,j]=float(np.sqrt((W*d*d).sum()/W.sum()))*3.0+0.4*cost[i,j]
def cls(f):
    h=f[0];lift=max(f[5],f[7]);reach=f[14]
    return (0 if h<0.33 else (2 if h>0.50 else 1), 0 if lift<0.17 else (1 if lift<0.30 else 2), 0 if reach<0.25 else (1 if reach<0.42 else 2))
PEN=[2.5,1.8,1.0]
for i,k in enumerate(keys):
    f0=FOs.get(k)
    if f0 is None: continue
    c0=cls(f0)
    for j in fc_ok:
        cj=cls(FC[j])
        cost2[i,j]+=sum(PEN[a]*abs(c0[a]-cj[a]) for a in range(3))
ci={k:i for i,k in enumerate(keys)}
N=len(S)
Fm=np.stack([FC[j] if FC[j] is not None else np.zeros(16) for j in range(N)])
LAM=float(os.environ.get('LAM','1.5'))
assign={}
for row in range(23):
    ks=[(row,c) for c in range(6) if (row,c) in ci]
    pool=np.array([j for j in range(N) if FC[j] is not None])
    D=[cost2[ci[ks[0]],pool]];B=[]
    for t in range(1,len(ks)):
        a,b=ks[t-1],ks[t]
        do=(FOs[b]-FOs[a]) if (a in FOs and b in FOs) else np.zeros(16)
        dd=Fm[pool][None,:,:]-Fm[pool][:,None,:]       # [prev,next]
        pen=LAM*np.sqrt(((W*(dd-do)**2).sum(2))/W.sum())
        np.fill_diagonal(pen,3.0)
        tot=D[-1][:,None]+pen
        B.append(tot.argmin(0));D.append(tot.min(0)+cost2[ci[ks[t]],pool])
    j=int(D[-1].argmin());seq=[j]
    for b in reversed(B): j=int(b[j]);seq.append(j)
    seq=seq[::-1]
    for k,jj in zip(ks,seq): assign[k]=int(pool[jj])
print('cost moyen',np.mean([cost2[ci[k],j] for k,j in assign.items()]))
pickle.dump(dict(assign=assign,keys=keys,S=S,O=O,s_o=s_o,cost=cost,cost2=cost2,FC=FC,FOs=FOs),open('match.pkl','wb'))
