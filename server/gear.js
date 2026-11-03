/* BiS lists, personal item status, guild wishlist, professions and craft requests. Items and recipes are always resolved by Wowhead ID. */
import {route,fail,text,int,oneOf,webUrl,now,id,notify,characterOwned,publicCharacter,CLASSES,SLOTS} from './core.js';
import {resolveWowhead} from '../worker/wowhead.js';

const ITEM_STATUS=['owned','needed','wishlist','equipped','obsolete'],CRAFT=['open','accepted','progress','done','cancelled'];
export const PROFESSIONS=['Alchemie','Schmiedekunst','Verzauberkunst','Ingenieurskunst','Lederverarbeitung','Schneiderei','Kräuterkunde','Bergbau','Kürschnerei','Kochen','Angeln','Erste Hilfe'];

export function bisProgress(db,listId,characterId){
 const rows=db.prepare('SELECT slot,item_id FROM bis_items WHERE list_id=? AND alternative=0').all(listId);
 const gear=new Set(db.prepare('SELECT item_id FROM character_gear WHERE character_id=?').all(characterId).map(g=>g.item_id));
 const items=new Set(db.prepare(`SELECT item_id FROM character_items WHERE character_id=? AND status IN ('owned','equipped')`).all(characterId).map(g=>g.item_id));
 const slots=[...new Set(rows.map(r=>r.slot))];
 return{done:slots.filter(s=>rows.some(r=>r.slot===s&&(gear.has(r.item_id)||items.has(r.item_id)))).length,total:slots.length}
}
export function registerGearRoutes(db,env){
 const item=async itemId=>{try{return{id:itemId,...await resolveWowhead(env,'item',itemId)}}catch{return{id:itemId,name:`Item ${itemId}`,missing:true}}};
 const spell=spellId=>resolveWowhead(env,'spell',spellId);
 const latestPatch=()=>db.prepare(`SELECT id,version FROM patches WHERE status='approved' ORDER BY released_on DESC LIMIT 1`).get();
 const listView=async l=>{const latest=latestPatch();return{id:l.id,classId:l.class_id,className:CLASSES[l.class_id],spec:l.spec,version:l.version,sourceName:l.source_name,sourceUrl:l.source_url,reviewedAt:l.reviewed_at,outdatedSince:latest&&latest.id!==l.reviewed_patch_id?latest.version:null,items:await Promise.all(db.prepare('SELECT * FROM bis_items WHERE list_id=? ORDER BY alternative').all(l.id).map(async r=>({slot:r.slot,alternative:!!r.alternative,note:r.note,item:await item(r.item_id)})))}};
 route('GET','/api/items/:id','public',async({params})=>{const n=int(params.id,'Item',1,99999999);try{return{item:{id:n,...await resolveWowhead(env,'item',n)}}}catch(e){fail(404,e.message)}});
 route('GET','/api/spells/:id','public',async({params})=>{const n=int(params.id,'Rezept',1,99999999);try{return{spell:{id:n,...await spell(n)}}}catch(e){fail(404,e.message)}});
 route('GET','/api/abilities/:classId','public',async({params})=>{
  const classId=int(params.classId,'Klasse',1,11);if(!CLASSES[classId])fail(400,'Klasse ist ungültig.');
  const out=[];for(const spellId of (await env.seedAbilities())[classId]){try{const s=await spell(spellId);if(s.requiredClass===CLASSES[classId])out.push({id:spellId,name:s.name,icon:s.icon,level:s.requiredLevel,tooltip:s.tooltip})}catch{}}
  return{abilities:out.sort((a,b)=>(a.level||0)-(b.level||0)||a.name.localeCompare(b.name,'de'))}
 });
 route('GET','/api/characters/:id/gear','member',async({user,params})=>{
  const c=characterOwned(db,user,params.id),gear=db.prepare('SELECT slot,item_id FROM character_gear WHERE character_id=?').all(c.id),items=await Promise.all(gear.map(async g=>({slot:g.slot,item:await item(g.item_id)}))),stats={};
  for(const{item:i}of items)for(const[k,v]of Object.entries(i.stats||{}))if(!['dps','speed','dmgmin1','dmgmax1'].includes(k))stats[k]=(stats[k]||0)+v;
  return{items,stats}
 });

 route('GET','/api/bis','public',async({query})=>{const cid=query.get('classId');return{lists:await Promise.all((cid?db.prepare('SELECT * FROM bis_lists WHERE class_id=? ORDER BY spec,version').all(int(cid,'Klasse',1,11)):db.prepare('SELECT * FROM bis_lists ORDER BY class_id,spec').all()).map(listView))}});
 route('POST','/api/bis','bis',({user,body})=>{
  const classId=int(body.classId,'Klasse',1,11);if(!CLASSES[classId])fail(400,'Klasse ist ungültig.');
  const lid=id();db.prepare('INSERT INTO bis_lists(id,class_id,spec,version,source_name,source_url,reviewed_at,reviewed_patch_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)').run(lid,classId,text(body.spec,'Spezialisierung',{min:2,max:30}),text(body.version,'Version',{min:1,max:40}),text(body.sourceName,'Quelle',{min:2,max:80}),webUrl(body.sourceUrl,'Quellenadresse'),now(),latestPatch()?.id||null,user.id);return{id:lid}
 });
 route('DELETE','/api/bis/:id','bis',({params})=>{db.prepare('DELETE FROM bis_lists WHERE id=?').run(params.id);return{ok:true}});
 route('POST','/api/bis/:id/items','bis',async({params,body})=>{
  const list=db.prepare('SELECT id FROM bis_lists WHERE id=?').get(params.id)||fail(404,'Liste nicht gefunden.'),itemId=int(body.itemId,'Item',1,99999999),slot=oneOf(body.slot,SLOTS,'Slot');
  try{await resolveWowhead(env,'item',itemId)}catch(e){fail(400,e.message)}
  db.prepare('INSERT OR REPLACE INTO bis_items(list_id,slot,item_id,alternative,note) VALUES (?,?,?,?,?)').run(list.id,slot,itemId,body.alternative?1:0,text(body.note??'','Hinweis',{max:200}));return{ok:true}
 });
 route('DELETE','/api/bis/:id/items/:slot/:item','bis',({params})=>{db.prepare('DELETE FROM bis_items WHERE list_id=? AND slot=? AND item_id=?').run(params.id,params.slot,Number(params.item));return{ok:true}});
 route('POST','/api/bis/:id/reviewed','bis',({params})=>{db.prepare('UPDATE bis_lists SET reviewed_at=?,reviewed_patch_id=? WHERE id=?').run(now(),latestPatch()?.id||null,params.id);return{ok:true}});
 route('GET','/api/characters/:id/bis/:list','member',({user,params})=>{const c=characterOwned(db,user,params.id);return{progress:bisProgress(db,params.list,c.id),statuses:Object.fromEntries(db.prepare('SELECT item_id,status FROM character_items WHERE character_id=?').all(c.id).map(r=>[r.item_id,r.status]))}});
 route('PUT','/api/characters/:id/items/:item','member',({user,params,body})=>{
  const c=characterOwned(db,user,params.id),itemId=int(params.item,'Item',1,99999999);
  if(body.status===null){db.prepare('DELETE FROM character_items WHERE character_id=? AND item_id=?').run(c.id,itemId);return{ok:true}}
  db.prepare('INSERT INTO character_items VALUES (?,?,?,?) ON CONFLICT(character_id,item_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at').run(c.id,itemId,oneOf(body.status,ITEM_STATUS,'Itemstatus'),now());return{ok:true}
 });
 route('GET','/api/wishlist/mine','member',async({user})=>({items:await Promise.all(db.prepare(`SELECT i.item_id,i.status,c.id character_id,c.name,c.class_id FROM character_items i JOIN characters c ON c.id=i.character_id WHERE c.user_id=? AND i.status IN ('needed','wishlist')`).all(user.id).map(async r=>({status:r.status,character:{id:r.character_id,name:r.name,classId:r.class_id},item:await item(r.item_id)})))}));
 route('GET','/api/wishlist/guild','raids',async()=>({items:await Promise.all(db.prepare(`SELECT i.item_id,i.status,c.* FROM character_items i JOIN characters c ON c.id=i.character_id WHERE i.status IN ('needed','wishlist') ORDER BY i.item_id`).all().map(async r=>{const data=await item(r.item_id),seed=(await env.seedCatalog()).items.find(x=>x.id===r.item_id);return{status:r.status,character:publicCharacter(r),item:data,instance:seed?(await env.seedCatalog()).dungeons.find(d=>d.id===seed.dungeon)?.name:null,boss:data.droppedBy||null}}))}));

 route('GET','/api/professions','public',()=>({professions:PROFESSIONS}));
 route('GET','/api/characters/:id/professions','member',({user,params})=>{const c=characterOwned(db,user,params.id);return{professions:db.prepare('SELECT profession,skill,specialization FROM character_professions WHERE character_id=?').all(c.id),recipes:db.prepare('SELECT spell_id,profession,rare FROM character_recipes WHERE character_id=?').all(c.id)}});
 route('PUT','/api/characters/:id/professions/:name','member',({user,params,body})=>{const c=characterOwned(db,user,params.id),name=oneOf(params.name,PROFESSIONS,'Beruf');db.prepare('INSERT INTO character_professions VALUES (?,?,?,?) ON CONFLICT(character_id,profession) DO UPDATE SET skill=excluded.skill,specialization=excluded.specialization').run(c.id,name,int(body.skill,'Berufsstufe',1,300),text(body.specialization??'','Spezialisierung',{max:40}));return{ok:true}});
 route('DELETE','/api/characters/:id/professions/:name','member',({user,params})=>{const c=characterOwned(db,user,params.id);db.prepare('DELETE FROM character_professions WHERE character_id=? AND profession=?').run(c.id,params.name);db.prepare('DELETE FROM character_recipes WHERE character_id=? AND profession=?').run(c.id,params.name);return{ok:true}});
 route('POST','/api/characters/:id/recipes','member',async({user,params,body})=>{
  const c=characterOwned(db,user,params.id),spellId=int(body.spellId,'Rezept-ID',1,99999999),profession=oneOf(body.profession,PROFESSIONS,'Beruf');
  if(!db.prepare('SELECT 1 FROM character_professions WHERE character_id=? AND profession=?').get(c.id,profession))fail(400,'Dieser Charakter hat den Beruf noch nicht.');
  let data;try{data=await spell(spellId)}catch(e){fail(400,e.message)}
  if(!data.creates&&!data.reagents.length)fail(400,'Diese ID ist kein Herstellungsrezept.');
  db.prepare('INSERT OR REPLACE INTO character_recipes VALUES (?,?,?,?)').run(c.id,spellId,profession,body.rare?1:0);return{recipe:{id:spellId,...data}}
 });
 route('DELETE','/api/characters/:id/recipes/:spell','member',({user,params})=>{const c=characterOwned(db,user,params.id);db.prepare('DELETE FROM character_recipes WHERE character_id=? AND spell_id=?').run(c.id,Number(params.spell));return{ok:true}});
 route('GET','/api/crafters','member',async({query})=>{
  const q=(query.get('q')||'').trim().toLowerCase(),profession=query.get('profession')||'';
  const rows=db.prepare(`SELECT r.spell_id,r.profession,r.rare,c.*,p.skill,p.specialization FROM character_recipes r JOIN characters c ON c.id=r.character_id JOIN character_professions p ON p.character_id=r.character_id AND p.profession=r.profession WHERE (?='' OR r.profession=?)`).all(profession,profession);
  const out=[];for(const r of rows){let data;try{data=await spell(r.spell_id)}catch{continue}if(q&&!`${data.name} ${data.creates?.name||''}`.toLowerCase().includes(q))continue;out.push({recipe:{id:r.spell_id,...data},rare:!!r.rare,profession:r.profession,skill:r.skill,specialization:r.specialization,character:publicCharacter(r)})}
  return{results:out.slice(0,100)}
 });
 route('GET','/api/crafts','member',()=>({requests:db.prepare(`SELECT q.*,u.username requester,w.username crafter FROM craft_requests q JOIN users u ON u.id=q.requester_id LEFT JOIN users w ON w.id=q.crafter_id ORDER BY q.status='open' DESC,q.updated_at DESC LIMIT 200`).all()}));
 route('POST','/api/crafts','member',async({user,body})=>{
  const itemId=body.itemId?int(body.itemId,'Item',1,99999999):null;let name=text(body.itemName??'','Gegenstand',{max:100});
  if(itemId){try{name=(await resolveWowhead(env,'item',itemId)).name}catch(e){fail(400,e.message)}}
  if(!name)fail(400,'Gib einen Gegenstand an.');
  const rid=id();db.prepare('INSERT INTO craft_requests(id,requester_id,item_id,item_name,quantity,materials,comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(rid,user.id,itemId,name,int(body.quantity??1,'Menge',1,1000),text(body.materials??'','Materialien',{max:500}),text(body.comment??'','Kommentar',{max:500}),now(),now());return{id:rid}
 });
 route('PUT','/api/crafts/:id','member',({user,params,body})=>{
  const r=db.prepare('SELECT * FROM craft_requests WHERE id=?').get(params.id)||fail(404,'Anfrage nicht gefunden.'),status=oneOf(body.status,CRAFT,'Status');
  const owner=r.requester_id===user.id,crafter=r.crafter_id===user.id;
  if(status==='cancelled'){if(!owner&&!crafter)fail(403,'Nur Beteiligte dürfen abbrechen.')}
  else if(status==='accepted'){if(r.status!=='open')fail(409,'Diese Anfrage ist bereits vergeben.');if(owner)fail(400,'Eigene Anfragen kannst du nicht annehmen.')}
  else if(!crafter)fail(403,'Nur der Handwerker darf den Status ändern.');
  db.prepare('UPDATE craft_requests SET status=?,crafter_id=?,updated_at=? WHERE id=?').run(status,status==='accepted'?user.id:r.crafter_id,now(),r.id);
  notify(db,r.requester_id,`Handwerksanfrage „${r.item_name}“: ${({open:'offen',accepted:'angenommen',progress:'in Bearbeitung',done:'abgeschlossen',cancelled:'abgebrochen'})[status]}.`,'crafting',`craft:${r.id}:${status}`);
  return{ok:true}
 });
}
