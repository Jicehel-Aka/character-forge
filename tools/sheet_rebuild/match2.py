exec(open('match.py').read().split("r,c=linear_sum_assignment")[0])
import pickle,os
WF=float(os.environ.get('WF','0.8'))
from scipy.optimize import linear_sum_assignment
def bb(c):
    ys,xs=np.nonzero(c);return (xs.max()-xs.min()+1,ys.max()-ys.min()+1)
BC=[bb(c) if c is not None else (1,1) for c in cand];BT={k:bb(tgt[k]) for k in keys}
HR=112.0
for i,k in enumerate(keys):
    wo,ho=BT[k]
    for j,(wc,hc) in enumerate(BC):
        cost[i,j]+=WF*(abs(np.log(wc/hc)-np.log(wo/ho))+abs(hc-ho)/HR+abs(wc-wo)/HR)
assign={keys[i]:int(cost[i].argmin()) for i in range(len(keys))}
def ds(c): return ndi.gaussian_filter(c.astype(float),3)[::3,::3]
cd=[ds(c) if c is not None else np.zeros((50,50)) for c in cand]
N=len(cd);V=np.stack([x.ravel() for x in cd])
T=np.zeros((N,N))
for i in range(N):
    mn=np.minimum(V[i],V).sum(1);mx=np.maximum(V[i],V).sum(1);T[i]=1-mn/mx
def tt(a,b):
    A,B=ds(tgt[a]).ravel(),ds(tgt[b]).ravel();return 1-np.minimum(A,B).sum()/np.maximum(A,B).sum()
ci={k:i for i,k in enumerate(keys)}
LAM=0.6
SA=np.log(np.sqrt(np.array([max(c.sum(),1) if c is not None else 1 for c in cand],float)))
SO={k:np.log(np.sqrt(max(tgt[k].sum(),1))) for k in keys}
WS=4.0
for it in range(3):
    for row in range(23):
        ks=[(row,c) for c in range(6) if (row,c) in ci]
        if len(ks)<2: continue
        mine={assign[k] for k in ks}; others={assign[k] for k in assign if k[0]!=row}
        pool=[j for j in range(N) if cand[j] is not None]
        P=np.array(pool)
        # viterbi
        D=[cost[ci[ks[0]],P]];B=[]
        for t in range(1,len(ks)):
            tr=tt(ks[t-1],ks[t]);
            M=T[np.ix_(P,P)]
            pen=LAM*np.abs(M-tr)+WS*np.abs((SA[P][None,:]-SA[P][:,None])-(SO[ks[t]]-SO[ks[t-1]]))
            np.fill_diagonal(pen,5.0)           # pas deux fois le même d'affilée
            tot=D[-1][:,None]+pen
            B.append(tot.argmin(0));D.append(tot.min(0)+cost[ci[ks[t]],P])
        j=int(D[-1].argmin());seq=[j]
        for b in reversed(B): j=int(b[j]);seq.append(j)
        seq=seq[::-1]
        for k,j in zip(ks,seq): assign[k]=int(P[j])
tot=sum(cost[ci[k],j] for k,j in assign.items());print('cost',tot/len(assign))
pickle.dump(dict(assign=assign,keys=keys,S=S,O=O,s_o=s_o,cost=cost),open('match.pkl','wb'))
