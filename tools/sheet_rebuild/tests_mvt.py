import sys,json,numpy as np
from PIL import Image
names=json.load(open('names.json'))
im=np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int);CW,CH=160,152
F=~((im[...,0]>150)&(im[...,2]>150)&(im[...,1]<120)&(abs(im[...,0]-im[...,2])<90))
def box(m):
    ys,xs=np.nonzero(m);return ys.min(),ys.max(),xs.min(),xs.max()
R={}
for r in range(23):
    fr=[F[r*CH:(r+1)*CH,c*CW:(c+1)*CW] for c in range(6)];b=[box(f) for f in fr]
    h=np.array([x[1]-x[0]+1 for x in b]);w=np.array([x[3]-x[2]+1 for x in b])
    low=[]   # écart des pieds : largeur du bas du sprite (20 % inférieurs)
    for f,(y0,y1,x0,x1) in zip(fr,b):
        hh=y1-y0+1;sub=f[int(y1-0.2*hh):y1+1];xs=np.nonzero(sub.any(0))[0];low.append((xs.max()-xs.min()+1)/hh if len(xs) else 0)
    iou=[(fr[i]&fr[i+1]).sum()/max((fr[i]|fr[i+1]).sum(),1) for i in range(5)]
    # position du point le plus à droite (éventail / main) par ligne haute
    R[r]=dict(h=h,w=w,asp=w/h,low=np.array(low),iou=np.array(iou),tipx=np.array([x[3] for x in b]))
Href=np.median([R[0]['h'].max(),R[1]['h'].max(),R[22]['h'].max()])
def sc(a): return int(np.sum(np.diff(np.sign(np.diff(a)))!=0))
checks=[
 (3,'les jambes alternent (écart des pieds qui s\'ouvre et se referme ≥ 2 fois)',lambda d:sc(d['low'])>=2),
 (4,'les jambes alternent (écart des pieds ≥ 2 cycles)',lambda d:sc(d['low'])>=2),
 (5,'au moins 3 images accroupies (hauteur < 88 % de la garde)',lambda d:(d['h']<0.88*Href).sum()>=3),
 (5,'balayage : l\'éventail avance (pointe la plus à droite varie ≥ 15 px)',lambda d:np.ptp(d['tipx'])>=15),
 (6,'fente : au moins 2 images en fente basse (écart des pieds large)',lambda d:(d['low']>1.0).sum()>=2),
 (7,'l\'éventail bouge (silhouette change entre images, IoU moyen < 0,93)',lambda d:d['iou'].mean()<0.93),
 (8,'au moins 2 images de coup de pied (largeur > hauteur)',lambda d:(d['asp']>1.0).sum()>=2),
 (9,'le bras/la main avance (pointe à droite varie ≥ 12 px)',lambda d:np.ptp(d['tipx'])>=12),
 (10,'l\'éventail bouge (IoU moyen < 0,93)',lambda d:d['iou'].mean()<0.93),
 (11,'l\'éventail bouge (IoU moyen < 0,93)',lambda d:d['iou'].mean()<0.93),
 (12,'une image accroupie (esquive)',lambda d:(d['h']<0.85*Href).sum()>=1),
 (13,'l\'éventail s\'ouvre/avance (pointe varie ≥ 15 px)',lambda d:np.ptp(d['tipx'])>=15),
 (14,'au moins 2 images de coup de pied (largeur > hauteur)',lambda d:(d['asp']>1.0).sum()>=2),
 (15,'rotation : silhouette change fortement (IoU moyen < 0,9)',lambda d:d['iou'].mean()<0.9),
 (16,'position basse stable : pieds écartés sur ≥ 4 images',lambda d:(d['low']>0.65).sum()>=4),
 (18,'au moins 3 images accroupies',lambda d:(d['h']<0.88*Href).sum()>=3),
 (19,'chute : descend progressivement (la dernière image plus basse que la première de ≥ 15 %) et aucune image couchée anatomiquement fausse',lambda d:d['h'][-1]<0.85*d['h'][0] and (d['asp']>1.6).sum()==0),
 (20,'couché sur toutes les images (≥ 5)',lambda d:(d['asp']>1.6).sum()>=5),
 (21,'part du sol et se relève (1re image couchée, dernière debout)',lambda d:d['asp'][0]>1.6 and d['asp'][-1]<1.0),
]
ok=0;fails=[]
for n,txt,fn in checks:
    r=fn(R[n-1]);ok+=r
    print(('OK    ' if r else 'ÉCHEC '),f'{n:2d} {names[n-1]:32s} {txt}')
    if not r: fails.append(n)
print(f'\n{ok}/{len(checks)} règles de mouvement respectées',('— échecs: '+str(fails)) if fails else '')
