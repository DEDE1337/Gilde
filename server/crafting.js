/* Professions: mining, herbalism and skinning yield real Classic materials (armory-items.json, materials) every few minutes,
   alchemy brews the duel bag's potions from their real recipes (Wowhead spell tooltips), and a small market lets players sell
   whole stacks to each other. Vials come from the merchant. Cooldowns, yields and prices are this game's own rules. */
import {randomInt} from 'node:crypto';
import {route,fail,now,id,int,oneOf,rateLimit,notify} from './core.js';
import {DATA,characterOf} from './armory.js';
import {balanceOf,book,transaction,addPotions,potionsOf} from './gold.js';
import {grantXp,progressOf,POTIONS} from './progression.js';
import {bumpTask} from './daily.js';

export const MATERIALS=DATA.materials||{},RECIPES=DATA.recipes||[];
export const GATHER_KINDS={mining:'Bergbau',herbalism:'Kräuterkunde',skinning:'Kürschnerei'};
export const GATHER_MS=120e3,MAX_LISTINGS=10,MAX_PRICE=100000,MAX_STACK=200;
// Merchant prices: selling pays by the level a material turns up at, vials cost a fixed price.
export const sellValue=m=>m.vendor?0:1+Math.floor((m.level||1)/8);
export const VIAL_PRICE={3372:5,8925:15};

const levelOf=(db,userId)=>{const c=characterOf(db,userId);return c?progressOf(db,c.id).level:1};
const have=(db,userId,itemId)=>db.prepare('SELECT count FROM materials WHERE user_id=? AND item_id=?').get(userId,itemId)?.count||0;
export const addMaterial=(db,userId,itemId,count)=>db.prepare('INSERT INTO materials(user_id,item_id,count) VALUES (?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET count=count+excluded.count').run(userId,itemId,count);
const take=(db,userId,itemId,count)=>{if(Number(db.prepare('UPDATE materials SET count=count-? WHERE user_id=? AND item_id=? AND count>=?').run(count,userId,itemId,count).changes)!==1)fail(409,`Dafür fehlt dir ${MATERIALS[itemId]?.name||'Material'}.`)};
// What a gathering trip finds: one of the materials the level allows, newer ones more often, one to three pieces.
export function gatherDraw(kind,level,rand=randomInt){
 const open=Object.values(MATERIALS).filter(m=>m.gather===kind&&m.level<=level),weights=open.map((m,i)=>i+1),total=weights.reduce((a,b)=>a+b,0);
 let pick=rand(total);for(let i=0;i<open.length;i++){if((pick-=weights[i])<0)return{itemId:open[i].id,count:1+rand(3)}}
 return{itemId:open[0].id,count:1}
}

export function registerCraftingRoutes(db){
 const cooldowns=userId=>Object.fromEntries(Object.keys(GATHER_KINDS).map(k=>{const t=db.prepare('SELECT at FROM gather_times WHERE user_id=? AND kind=?').get(userId,k)?.at||0;return[k,Math.max(0,t+GATHER_MS-Date.now())]}));
 const listing=(r,userId)=>({id:r.id,itemId:r.item_id,count:r.count,price:r.price,seller:r.seller,own:r.seller_id===userId,each:Math.round(r.price/r.count*10)/10});
 const view=userId=>({
  level:levelOf(db,userId),balance:balanceOf(db,userId),cooldowns:cooldowns(userId),gatherMs:GATHER_MS,kinds:GATHER_KINDS,
  materials:Object.fromEntries(db.prepare('SELECT item_id,count FROM materials WHERE user_id=? AND count>0').all(userId).map(r=>[r.item_id,r.count])),
  catalog:Object.values(MATERIALS).map(m=>({...m,sell:sellValue(m),buy:VIAL_PRICE[m.id]||null})),
  recipes:RECIPES.map(r=>({...r,potionName:POTIONS[r.potion]?.name,icon:POTIONS[r.potion]?.icon})),potions:potionsOf(db,userId),
  market:db.prepare('SELECT a.*,u.username seller FROM material_auctions a JOIN users u ON u.id=a.seller_id ORDER BY a.item_id,a.price*1.0/a.count LIMIT 200').all().map(r=>listing(r,userId))
 });
 route('GET','/api/materials','member',({user})=>view(user.id));
 route('POST','/api/gather','member',({user,body})=>{
  rateLimit('gather:'+user.id,30,60e3);
  const kind=oneOf(body.kind,Object.keys(GATHER_KINDS),'Beruf'),character=characterOf(db,user.id)||fail(400,'Leg erst einen Charakter an.');
  const level=progressOf(db,character.id).level,found=gatherDraw(kind,level);
  transaction(db,()=>{
   const last=db.prepare('SELECT at FROM gather_times WHERE user_id=? AND kind=?').get(user.id,kind)?.at||0;
   if(last+GATHER_MS>Date.now())fail(409,`${GATHER_KINDS[kind]} geht wieder in ${Math.ceil((last+GATHER_MS-Date.now())/1000)} Sekunden.`);
   db.prepare('INSERT INTO gather_times(user_id,kind,at) VALUES (?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET at=excluded.at').run(user.id,kind,Date.now());
   addMaterial(db,user.id,found.itemId,found.count)
  });
  const xp=Math.round(2+level*.2),levelUp=grantXp(db,character.id,xp,'gather');bumpTask(db,user.id,'gather');
  return{...view(user.id),found:{...found,name:MATERIALS[found.itemId].name},xp,levelUp}
 });
 route('POST','/api/materials/sell','member',({user,body})=>{
  const m=MATERIALS[int(body.itemId,'Material',1,1e6)]||fail(400,'Dieses Material kennt der Händler nicht.'),count=int(body.count,'Anzahl',1,MAX_STACK*10);
  if(m.vendor)fail(400,'Phiolen nimmt der Händler nicht zurück.');
  transaction(db,()=>{take(db,user.id,m.id,count);book(db,user.id,sellValue(m)*count,'material-sell',String(m.id))});
  return{...view(user.id),sold:sellValue(m)*count}
 });
 route('POST','/api/materials/buy','member',({user,body})=>{
  const itemId=int(body.itemId,'Material',1,1e6),price=VIAL_PRICE[itemId]||fail(400,'Das führt der Händler nicht.'),count=int(body.count,'Anzahl',1,MAX_STACK);
  transaction(db,()=>{if(balanceOf(db,user.id)<price*count)fail(400,`Dafür fehlen dir ${price*count-balanceOf(db,user.id)} Gold.`);book(db,user.id,-price*count,'material-buy',String(itemId));addMaterial(db,user.id,itemId,count)});
  return view(user.id)
 });
 route('POST','/api/brew','member',({user,body})=>{
  rateLimit('brew:'+user.id,60,60e3);
  const recipe=RECIPES.find(r=>r.potion===body.potion)||fail(400,'Dieses Rezept gibt es nicht.'),count=int(body.count??1,'Anzahl',1,20);
  transaction(db,()=>{for(const [itemId,need] of recipe.reagents)take(db,user.id,itemId,need*count);addPotions(db,user.id,recipe.potion,count)});
  const character=characterOf(db,user.id),levelUp=character?grantXp(db,character.id,3*count,'brew'):0;bumpTask(db,user.id,'brew',count);
  return{...view(user.id),brewed:{potion:recipe.potion,count},levelUp}
 });
 route('POST','/api/materials/auctions','member',({user,body})=>{
  rateLimit('mat-list:'+user.id,30,60e3);
  const m=MATERIALS[int(body.itemId,'Material',1,1e6)]||fail(400,'Dieses Material gibt es nicht.'),count=int(body.count,'Anzahl',1,MAX_STACK),price=int(body.price,'Preis',1,MAX_PRICE);
  if(db.prepare('SELECT COUNT(*) n FROM material_auctions WHERE seller_id=?').get(user.id).n>=MAX_LISTINGS)fail(409,`Mehr als ${MAX_LISTINGS} Angebote gleichzeitig gehen nicht.`);
  transaction(db,()=>{take(db,user.id,m.id,count);db.prepare('INSERT INTO material_auctions(id,seller_id,item_id,count,price,created_at) VALUES (?,?,?,?,?,?)').run(id(),user.id,m.id,count,price,now())});
  return view(user.id)
 });
 route('POST','/api/materials/auctions/:id/buy','member',({user,params})=>{
  const a=db.prepare('SELECT * FROM material_auctions WHERE id=?').get(params.id)||fail(404,'Das Angebot gibt es nicht mehr.');
  if(a.seller_id===user.id)fail(400,'Das ist dein eigenes Angebot.');
  transaction(db,()=>{
   if(balanceOf(db,user.id)<a.price)fail(400,`Dafür fehlen dir ${a.price-balanceOf(db,user.id)} Gold.`);
   if(Number(db.prepare('DELETE FROM material_auctions WHERE id=?').run(a.id).changes)!==1)fail(409,'Das Angebot ist schon weg.');
   book(db,user.id,-a.price,'material-market',a.id);book(db,a.seller_id,a.price,'material-market',a.id);addMaterial(db,user.id,a.item_id,a.count)
  });
  notify(db,a.seller_id,`${user.username} hat ${a.count}× ${MATERIALS[a.item_id]?.name||'Material'} für ${a.price} Gold gekauft.`,'gather','mat-sold:'+a.id);
  return view(user.id)
 });
 route('DELETE','/api/materials/auctions/:id','member',({user,params})=>{
  const a=db.prepare('SELECT * FROM material_auctions WHERE id=? AND seller_id=?').get(params.id,user.id)||fail(404,'Dieses Angebot hast du nicht.');
  transaction(db,()=>{if(Number(db.prepare('DELETE FROM material_auctions WHERE id=?').run(a.id).changes)!==1)fail(409,'Das Angebot ist schon weg.');addMaterial(db,user.id,a.item_id,a.count)});
  return view(user.id)
 });
}
