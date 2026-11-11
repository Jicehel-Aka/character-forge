// Prépare la bibliothèque d'animations de modele.html (docs/anims/) à partir de packs CC0.
// usage : node build.mjs UAL.gltf KNIGHT.glb OUT_DIR   (nécessite @gltf-transform/core|extensions|functions)
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune} from '@gltf-transform/functions';
import fs from 'fs';
const [ual,knight,out]=process.argv.slice(2);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const cat=n=>{n=n.toLowerCase();
  if(/death|die|dead/.test(n))return'Mort / chute';
  if(/hit|block|dodge|roll/.test(n))return'Esquive / coups reçus';
  if(/attack|punch|kick|stab|slice|chop|sword|spin|throw|aim|shoot|reload|pistol/.test(n))return'Combat / armes';
  if(/spell|magic/.test(n))return'Magie';
  if(/jump|fall/.test(n))return'Sauts';
  if(/walk|run|jog|sprint|strafe|crouch|swim|climb|push|driving/.test(n))return'Déplacements';
  if(/idle|pose/.test(n))return'Repos';
  return'Divers'};
const packs=[
 {id:'ual',label:'Universal Animation Library (Quaternius)',src:ual,file:'ual_standard.glb',author:'Quaternius',license:'CC0 1.0',url:'https://quaternius.com/packs/universalanimationlibrary.html',mirror:'github.com/j-ponzo/gltf-universal-animation-library'},
 {id:'kaykit',label:'KayKit Character Animations (Kay Lousberg)',src:knight,file:'kaykit_adventurers.glb',author:'Kay Lousberg',license:'CC0 1.0',url:'https://kaylousberg.itch.io/kaykit-character-animations',mirror:'github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0'}];
fs.mkdirSync(out,{recursive:true});const cat_=[];
for(const p of packs){const d=await io.read(p.src);const r=d.getRoot();
  for(const m of r.listMaterials()){for(const k of['BaseColorTexture','NormalTexture','OcclusionTexture','EmissiveTexture','MetallicRoughnessTexture'])m['set'+k](null)}
  for(const t of r.listTextures())t.dispose();
  const clips=[];
  for(const a of r.listAnimations()){let t=0;for(const s of a.listSamplers())t=Math.max(t,s.getInput().getMax([])[0]);
    if(t<0.15||/t-?pose/i.test(a.getName())){a.dispose();continue}clips.push({name:a.getName(),dur:+t.toFixed(2),cat:cat(a.getName())})}
  await d.transform(prune());await io.write(out+'/'+p.file,d);
  cat_.push({id:p.id,label:p.label,file:p.file,author:p.author,license:p.license,url:p.url,mirror:p.mirror,kb:Math.round(fs.statSync(out+'/'+p.file).size/1024),clips});
  console.log(p.id,clips.length,'clips',cat_.at(-1).kb,'Ko')}
fs.writeFileSync(out+'/catalog.json',JSON.stringify({packs:cat_},null,1));
