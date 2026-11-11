// Prépare la garde-robe de modele.html à partir de packs CC0 (voir THIRD_PARTY.md) :
//   node build.mjs SRC_QUATERNIUS SRC_KAYKIT SORTIE   (nécessite @gltf-transform/core, functions, extensions)
// - pièces habillables (peau partagée par le rig Quaternius « Humanoid ») : corps/haut, jambes/bas, pieds/chaussures, tête, cheveux, sac
//   extraites de chaque personnage modulaire (Ultimate Modular Men / Women Pack) ;
// - accessoires rigides : armes, boucliers, couronnes, colliers, sacs... (Modular Weapons, Ultimate RPG, KayKit Adventurers).
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune, getBounds} from '@gltf-transform/functions';
import fs from 'fs';import path from 'path';
const [Q,K,OUT]=process.argv.slice(2);const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(OUT+'/parts',{recursive:true});fs.mkdirSync(OUT+'/items',{recursive:true});
const catalog={parts:[],items:[]};
const pretty=s=>s.replace(/_/g,' ').replace(/([a-z])([A-Z0-9])/g,'$1 $2').trim();
const SLOTS={Body:'haut',Legs:'bas',Feet:'chaussures',Head:'tete',Backpack:'sac'};
async function part(file,gender,char){
  for(const [suffix,slot] of Object.entries(SLOTS).concat([['Hair','cheveux']])){
    const doc=await io.read(file),root=doc.getRoot();let kept=0;
    for(const node of root.listNodes()){const m=node.getMesh();if(!m)continue;
      const nm=m.getName(),isHead=/_Head$/.test(nm),want=suffix==='Hair'?isHead:(suffix==='Backpack'?nm==='Backpack':nm.endsWith('_'+suffix));
      if(!want){node.setMesh(null).setSkin(null);continue}
      if(isHead){for(const p of m.listPrimitives()){const hair=/^Hair/i.test(p.getMaterial()?.getName()||'');if((suffix==='Hair')!==hair){m.removePrimitive(p);p.dispose()}}}
      if(m.listPrimitives().length)kept++;else node.setMesh(null).setSkin(null)}
    if(!kept)continue;
    await doc.transform(prune());
    const id=`${gender}_${char}_${slot}`.toLowerCase(),f=`parts/${id}.glb`;await io.write(path.join(OUT,f),doc);
    catalog.parts.push({id,slot,name:`${char} (${gender==='men'?'homme':'femme'})`,gender,source:'Quaternius Ultimate Modular '+(gender==='men'?'Men':'Women')+' Pack',file:f,kb:Math.round(fs.statSync(path.join(OUT,f)).size/1024)})}}
for(const g of ['men','women']){const d=`${Q}/modular_${g}`;for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.glb')))await part(path.join(d,f),g,f.replace('.glb',''))}
async function item(file,cat,src,id){
  const doc=await io.read(file);await doc.transform(prune());const b=getBounds(doc.getRoot().listScenes()[0]);
  const out=`items/${id}.glb`;await io.write(path.join(OUT,out),doc);
  catalog.items.push({id,cat,name:pretty(path.basename(file).replace(/\.(glb|gltf)$/,'')),source:src,file:out,min:b.min.map(v=>+v.toFixed(4)),max:b.max.map(v=>+v.toFixed(4)),kb:Math.round(fs.statSync(path.join(OUT,out)).size/1024)})}
const cat=n=>/shield/i.test(n)?'bouclier':/crown/i.test(n)?'couronne':/necklace/i.test(n)?'collier':/^(backpack|bag|pouch)$/i.test(n)?'sac':/glove/i.test(n)?'gant':/ring\d/i.test(n)?null:/(sword|axe|dagger|hammer|spear|scythe|bow|claymore|staff|wand|crossbow|dart|arrow)/i.test(n)?'arme':/^(book|spellbook|potion|mug|smokebomb|quiver)/i.test(n)?'objet':null;
const seen=new Set();
for(const f of fs.readdirSync(`${Q}/medieval_weapons_pack`).filter(x=>x.endsWith('.glb'))){const n=f.replace('.glb',''),c=cat(n);if(!c)continue;await item(`${Q}/medieval_weapons_pack/${f}`,c,'Quaternius Modular Weapons Pack','q_'+n.toLowerCase());seen.add(n.toLowerCase())}
const RPG=['Crown','Crown2','Necklace1','Necklace2','Necklace3','Backpack','Bag','Pouch','Glove','Armor_Leather','Armor_Metal','Armor_Golden','Armor_Black','Book1_Closed','Book3_Closed','Potion1_Filled','Potion5_Filled','Chalice','Skull','Scroll','Key1','Axe_small_Golden','Hammer_Double_Golden','Sword_big_Golden','Dagger_Golden','Bow_Golden'];
for(const n of RPG){const f=`${Q}/rpg_items_pack/${n}.glb`;if(!fs.existsSync(f))continue;const c=cat(n)||(/^Armor/.test(n)?'plastron':'objet');await item(f,c,'Quaternius Ultimate RPG Pack','r_'+n.toLowerCase())}
const kd=`${K}/addons/kaykit_character_pack_adventures/Assets/gltf`;
for(const f of fs.readdirSync(kd).filter(x=>x.endsWith('.gltf'))){const n=f.replace('.gltf','');if(/^(arrow|mug|smokebomb|spellbook_open|arrow_bundle)/.test(n)||/_color$/.test(n))continue;const c=cat(n);if(!c)continue;await item(`${kd}/${f}`,c,'KayKit Adventurers (Kay Lousberg)','k_'+n)}
fs.writeFileSync(path.join(OUT,'catalog.json'),JSON.stringify(catalog,null,1));
console.log('parts',catalog.parts.length,'items',catalog.items.length,'Mo',(catalog.parts.concat(catalog.items).reduce((a,x)=>a+x.kb,0)/1024).toFixed(1));
