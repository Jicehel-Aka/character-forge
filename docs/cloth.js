/* Dessin des vêtements sur le modèle : chaque objet du catalogue (gear.js) est tracé en aplat ombré + contour,
   à l'emplacement donné par les repères anatomiques (hauteur de tête mesurée). Pas de reconstruction : formes schématiques. */
(function(){
const COL={tissu:"#6f86b5",coton:"#c9c3b2",lin:"#d8cfb4",laine:"#8a6f58",toile:"#a89a78",cuir:"#7b4f2c","cuir/acier":"#6c5a4a",acier:"#a7b0ba",mailles:"#80878f","tissu matelassé":"#9a8a6a","verre/métal":"#9fd3e6"};
const OVR={cloak:"#7a2630",robe:"#4b3a78",dress:"#9a3a5a",skirt:"#3f6a55",pants:"#4a4f66",shorts:"#5a5f4a",boots:"#5a3a22",shoes:"#4a3a2a",belt:"#4a2f18",quiver:"#6b4426",gloves:"#6a4a2a",glasses:"#222",hood:"#3d5a45",cap:"#3b5ba5",headband:"#b83a3a",undershirt:"#e8e4d8",shirt:"#d8d2c0",tunic:"#5a7a4a"};
function defColor(n,it){return OVR[n]||COL[it.material]||"#888888"}
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const clamp=v=>v<0?0:v>255?255:v;
function compose(m,names,colors,opt){
 const G=window.GEAR;if(!G||!m.head||!names.length)return null;
 const W=m.cut.width,Hh=m.cut.height,src=m.cut.getContext("2d").getImageData(0,0,W,Hh).data,sil=new Uint8Array(W*Hh);
 let bx0=W,bx1=0,by0=Hh;for(let y=0,k=0;y<Hh;y++)for(let x=0;x<W;x++,k++)if(src[k*4+3]>32){sil[k]=1;if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y}
 if(bx1<bx0)return null;
 const H=m.head,top=m.headTop??by0,cx=opt.cx||(bx0+bx1)/2,K=G.builds[opt.build]||1,LM=G.landmarks,WD=G.widths;
 const Y=l=>top+(typeof l==="string"?LM[l]:l)*H,Wd=v=>(typeof v==="string"?WD[v]:v)*H*K;
 // centre de la tête mesuré sur la silhouette
 let hs=0,hn=0;for(let y=Math.max(0,Math.round(top));y<Math.min(Hh,Math.round(top+H));y++)for(let x=0;x<W;x++)if(sil[y*W+x]){hs+=x;hn++}
 const hcx=hn?hs/hn:cx,torsoHalf=Wd("chest")/2,hipHalf=Wd("hip")/2,shW=Wd("shoulder")/2;
 const sJ=[[cx-shW*.9,Y("shoulder")+.2*H],[cx+shW*.9,Y("shoulder")+.2*H]];
 const armD=(x,y)=>Math.min(Math.hypot(x-sJ[0][0],y-sJ[0][1]),Math.hypot(x-sJ[1][0],y-sJ[1][1]));
 const isArm=(x,y)=>Math.abs(x-cx)>torsoHalf*.98&&y>=Y("shoulder")-.25*H&&y<=Y("hand_tip")+.4*H&&Math.abs(x-cx)<shW*4;
 const part={
  head:(x,y)=>y>=Y("crown")&&y<=Y("chin")+.05*H&&Math.abs(x-hcx)<=.6*Wd("head"),
  face:(x,y)=>y>=Y(.6)&&y<=Y("chin")&&Math.abs(x-hcx)<=.6*Wd("head"),eyes:(x,y)=>y>=Y(.4)&&y<=Y(.7)&&Math.abs(x-hcx)<=.6*Wd("head"),
  neck:(x,y)=>y>=Y("chin")&&y<=Y("neck_base")+.1*H&&Math.abs(x-hcx)<=.35*H,
  torso:(x,y)=>y>=Y("shoulder")-.15*H&&Math.abs(x-cx)<=torsoHalf,
  upper_arms:(x,y)=>isArm(x,y)&&armD(x,y)<1.5*H,forearms:(x,y)=>isArm(x,y)&&armD(x,y)>=1.5*H&&armD(x,y)<2.4*H,hands:(x,y)=>isArm(x,y)&&armD(x,y)>=2.4*H&&armD(x,y)<3.4*H,
  hips:(x,y)=>y>=Y("hip")&&y<=Y("crotch")+.1*H&&Math.abs(x-cx)<=hipHalf*1.1,
  thighs:(x,y)=>y>=Y("crotch")&&y<=Y("knee")&&Math.abs(x-cx)<=hipHalf*1.1,calves:(x,y)=>y>=Y("knee")&&y<=Y("ankle")+.1*H&&Math.abs(x-cx)<=hipHalf*1.1,
  feet:(x,y)=>y>=Y("ankle")-.1*H&&Math.abs(x-cx)<=hipHalf*1.6,shoulders:()=>false};
 const mk=()=>({c:document.createElement("canvas")}),mkc=()=>{const c=document.createElement("canvas");c.width=W;c.height=Hh;return c};
 const behind=mkc(),front=mkc(),bg=behind.getContext("2d"),fg=front.getContext("2d");
 const out={behind:bg.createImageData(W,Hh),front:fg.createImageData(W,Hh)};
 const layerOrder=n=>G.layers[G.catalog[n].layer]||0;
 [...names].sort((a,b)=>layerOrder(a)-layerOrder(b)).forEach(n=>{const it=G.catalog[n];if(!it)return;
  const col=hex((colors&&colors[n])||defColor(n,it)),isBehind=n==="cloak"||n==="quiver",D=isBehind?out.behind:out.front,M=new Uint8Array(W*Hh);
  const y0=Y(it.y[0]),y1=Y(it.y[1]),ys=Math.max(0,Math.floor(y0)),ye=Math.min(Hh-1,Math.ceil(y1));
  const ell=(ex,ey,rx,ry,ya,yb)=>{for(let y=Math.max(0,Math.floor(ey-ry));y<=Math.min(Hh-1,Math.ceil(ey+ry));y++){if(ya!=null&&(y<ya||y>yb))continue;const t=(y-ey)/ry,half=rx*Math.sqrt(Math.max(0,1-t*t));for(let x=Math.max(0,Math.floor(ex-half));x<=Math.min(W-1,Math.ceil(ex+half));x++)M[y*W+x]=1}};
  const trap=(ya,yb,wa,wb,xc)=>{for(let y=Math.max(0,Math.floor(ya));y<=Math.min(Hh-1,Math.ceil(yb));y++){const t=(y-ya)/Math.max(1,yb-ya),half=(wa+(wb-wa)*t)/2;for(let x=Math.max(0,Math.floor(xc-half));x<=Math.min(W-1,Math.ceil(xc+half));x++)M[y*W+x]=1}};
  const rows=(pred)=>{for(let y=ys;y<=ye;y++)for(let x=0;x<W;x++)if(sil[y*W+x]&&pred(x,y))M[y*W+x]=1};
  const covered=(x,y)=>it.covers.some(c=>part[c]&&part[c](x,y));
  if(n==="cloak"){trap(Y("neck_base"),Y("calf"),Wd("shoulder")*.9,Wd("hip")*1.6,cx)}
  else if(n==="quiver"){const qx=cx+shW*.55,qw=.42*H;for(let y=Math.round(Y("shoulder")-.4*H);y<=Math.round(Y("hip"));y++){const sh=(y-Y("shoulder"))*.18;for(let x=Math.round(qx-qw/2+sh);x<=Math.round(qx+qw/2+sh);x++)if(x>=0&&x<W&&y>=0&&y<Hh)M[y*W+x]=1}}
  else if(n==="belt"){const yb=Y("waist"),hh=Math.max(2,Math.round(.22*H));for(let y=Math.round(yb-hh/2);y<=Math.round(yb+hh/2);y++)for(let x=0;x<W;x++)if(y>=0&&y<Hh&&sil[y*W+x]&&Math.abs(x-cx)<=torsoHalf*1.05)M[y*W+x]=1}
  else if(n==="pauldrons"){sJ.forEach(([sx,sy])=>ell(sx*1.0+(sx<cx?-.1:.1)*H,sy-.1*H,.62*H,.5*H))}
  else if(n==="cap"||n==="helmet_open"||n==="helmet_full"||n==="hood"||n==="headband"){
   const rx=.6*Wd("head")*(n==="hood"?1.2:n.startsWith("helmet")?1.12:1.04),ey=Y(n==="headband"?.35:"crown")+.35*H;
   if(n==="headband"){for(let y=Math.round(Y(.3));y<=Math.round(Y(.5));y++)for(let x=0;x<W;x++)if(sil[y*W+x]&&Math.abs(x-hcx)<=rx)M[y*W+x]=1}
   else{ell(hcx,Y("crown")+.45*H,rx,.6*H,Y("crown")-.15*H,n==="cap"||n==="helmet_open"?Y("brow"):n==="helmet_full"?Y("chin")+.02*H:Y("neck_base"));
    if(n==="hood"||n==="helmet_full"){for(let y=Math.round(Y("brow"));y<=Math.round(n==="hood"?Y("neck_base"):Y("chin"));y++)for(let x=0;x<W;x++)if((sil[y*W+x])&&Math.abs(x-hcx)<=rx)M[y*W+x]=1}
    if(n==="cap"){for(let x=Math.round(hcx-rx*.1);x<=Math.round(hcx+rx*1.25);x++)for(let y=Math.round(Y("brow")-.05*H);y<=Math.round(Y("brow")+.06*H);y++)if(x>=0&&x<W&&y>=0&&y<Hh)M[y*W+x]=1}}}
  else if(n==="glasses"){const yy=Y(.55);for(const s of[-1,1])ell(hcx+s*.2*Wd("head"),yy,.16*H,.11*H);for(let x=Math.round(hcx-.06*H);x<=Math.round(hcx+.06*H);x++)M[Math.round(yy)*W+x]=1}
  else if(n==="mask"){for(let y=Math.round(Y(.6));y<=Math.round(Y("chin"));y++)for(let x=0;x<W;x++)if(sil[y*W+x]&&Math.abs(x-hcx)<=.55*Wd("head"))M[y*W+x]=1}
  else{rows(covered);
   if(n==="skirt"||n==="robe"||n==="dress"){const hem=n==="skirt"?Y("knee"):Y("ankle"),f=n==="skirt"?1.3:n==="dress"?1.6:1.8;trap(Y("waist"),hem,Wd("hip")*.95,Wd("hip")*f,cx)}
   if(n==="tunic")trap(Y("hip"),Y("mid_thigh"),Wd("hip")*1.05,Wd("hip")*1.2,cx)
   if(n==="boots"||n==="shoes"){for(let y=ys;y<=Math.min(Hh-1,Math.round(Y("sole")+.12*H));y++)for(let x=0;x<W;x++)if(sil[y*W+x]&&Math.abs(x-cx)<=hipHalf*1.9&&y>=Y(n==="boots"?"calf":"ankle"))M[y*W+x]=1}}
  // épaisseur selon la couche (vêtements épais débordent un peu de la silhouette)
  const thick=Math.round(H*({under:0,base:.02,mid:.04,armor:.06,outer:.07,accessory:0}[it.layer]||0)*(["pauldrons","helmet_open","helmet_full","cap","hood","glasses","mask","belt","headband","cloak","quiver","skirt","robe","dress","boots"].includes(n)?0:1));
  if(thick>0){const M2=M.slice();for(let y=ys;y<=ye;y++)for(let x=0;x<W;x++)if(M[y*W+x])for(let t=1;t<=thick;t++){if(x-t>=0)M2[y*W+x-t]=1;if(x+t<W)M2[y*W+x+t]=1}M.set(M2)}
  if(it.layer==="under")for(let k=0;k<W*Hh;k++)if(M[k]&&!sil[k])M[k]=0;
  // ombrage + contour
  for(let y=0;y<Hh;y++){let xa=-1,xb=-1;for(let x=0;x<W;x++)if(M[y*W+x]){if(xa<0)xa=x;xb=x}if(xa<0)continue;
   for(let x=xa;x<=xb;x++){const k=y*W+x;if(!M[k])continue;const t=(x-xa)/Math.max(1,xb-xa);let f=1.14-.34*t;
    const dn=y+1<Hh?M[k+W]:0,up=y>0?M[k-W]:0,l=x>0?M[k-1]:0,r=x<W-1?M[k+1]:0;if(!dn)f*=.72;
    let edge=0;const nb=[up?k-W:-1,dn?-2:k+W,l?-3:k-1,r?-4:k+1];
    [[y>0,k-W,up],[y+1<Hh,k+W,dn],[x>0,k-1,l],[x<W-1,k+1,r]].forEach(([ok,kk,inM])=>{if(inM)return;if(!ok||(!sil[kk]&&!D.data[kk*4+3]&&!out.front.data[kk*4+3]))edge=Math.max(edge,2);else edge=Math.max(edge,1)});
    const o=k*4,base=edge===2?.42:edge===1?.62:f;D.data[o]=clamp(col[0]*base);D.data[o+1]=clamp(col[1]*base);D.data[o+2]=clamp(col[2]*base);D.data[o+3]=255}}
  if(n==="belt"){const bxx=Math.round(cx),byy=Math.round(Y("waist"));for(let y=byy-2;y<=byy+2;y++)for(let x=bxx-2;x<=bxx+2;x++)if(x>=0&&y>=0&&x<W&&y<Hh){const o=(y*W+x)*4;D.data[o]=214;D.data[o+1]=178;D.data[o+2]=70;D.data[o+3]=255}}
 });
 bg.putImageData(out.behind,0,0);fg.putImageData(out.front,0,0);return{behind,front};
}
window.CLOTH={compose,defColor};
})();
