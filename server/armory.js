/* Waffenkammer: treasure chests, item shop, inventory, equipment and the auction house. Items are real WoW Classic items from
   armory-items.json (built by scripts/build-armory.mjs); every draw, price and stat is decided here, the browser only shows it. */
import {readFileSync} from 'node:fs';
import {randomInt} from 'node:crypto';
import {route,fail,now,id,int,rateLimit,notify,CLASSES} from './core.js';
import {discord} from './discord.js';
import {balanceOf,book,transaction,grantStartGold,START_GOLD} from './gold.js';

const DATA=JSON.parse(readFileSync(new URL('./armory-items.json',import.meta.url),'utf8'));
export const ITEMS=DATA.items,CHESTS=DATA.chests,SHOP=new Set(DATA.shop);
const RARITIES=['uncommon','rare','epic','legendary'];
export const BASE_STATS={leben:400,angriff:20,verteidigung:5,krit:5};
const BAG_LIMIT=200,OPEN_LISTINGS=20,MAX_PRICE=1000000;
export const buyPrice=item=>item.value*(item.quality==='legendary'?6:3);
export const sellPrice=item=>Math.max(1,Math.floor(item.value/3));

// Classic proficiencies, kept simple: armour type and weapon type decide who may wear what.
const ALL=Object.keys(CLASSES).map(Number);
const ARMOR={Stoff:ALL,Leder:[1,2,3,4,7,11],Kette:[1,2,3,7],Platte:[1,2]};
const WEAPON={
 Schwert:{one:[1,2,3,4,8,9],two:[1,2,3]},Axt:{one:[1,2,3,7],two:[1,2,3,7]},Streitkolben:{one:[1,2,4,5,7,11],two:[1,2,7,11]},
 Dolch:{one:[1,3,4,5,7,8,9,11]},Faustwaffe:{one:[1,3,4,7,11]},Stab:{two:[1,3,5,7,8,9,11]},Stangenwaffe:{two:[1,2,3]},
 Bogen:{ranged:[1,3,4]},Armbrust:{ranged:[1,3,4]},Schusswaffe:{ranged:[1,3,4]},Zauberstab:{ranged:[5,8,9]},Wurfwaffe:{ranged:[1,4]},Schild:{shield:[1,2,7]}
};
const DUAL_WIELD=[1,3,4];
export function allowedClasses(item){
 if(!item.slot)return[];
 let list=ALL;
 if(ARMOR[item.type])list=ARMOR[item.type];
 else if(WEAPON[item.type]){const w=WEAPON[item.type];list=item.type==='Schild'?w.shield:item.slot==='ranged'?w.ranged:item.slot==='twohand'?w.two:w.one;list||=[]}
 if(item.classes){const named=Object.entries(CLASSES).filter(([,n])=>item.classes.includes(n)).map(([k])=>+k);list=list.filter(c=>named.includes(c))}
 return list
}
// Equipment slots an item may go into, in order of preference.
export function slotsFor(item,classId){
 switch(item.slot){
  case 'ring':return['ring1','ring2'];
  case 'trinket':return['trinket1','trinket2'];
  case 'onehand':return DUAL_WIELD.includes(classId)?['mainhand','offhand']:['mainhand'];
  case 'twohand':return['mainhand'];
  default:return item.slot?[item.slot]:[]
 }
}

export function characterOf(db,userId){
 const user=db.prepare('SELECT main_character_id FROM users WHERE id=?').get(userId);
 return db.prepare('SELECT id,name,surname,class_id,race,level,gender FROM characters WHERE id=? AND user_id=?').get(user?.main_character_id,userId)
  ||db.prepare('SELECT id,name,surname,class_id,race,level,gender FROM characters WHERE user_id=? ORDER BY created_at LIMIT 1').get(userId)
}
// Base values plus every equipped item the character's class may actually use.
export function statsOf(db,userId){
 const character=characterOf(db,userId),stats={...BASE_STATS};
 for(const row of db.prepare('SELECT item_id FROM inventory WHERE user_id=? AND slot IS NOT NULL').all(userId)){
  const item=ITEMS[row.item_id];if(!item||!character||!allowedClasses(item).includes(character.class_id))continue;
  for(const k of Object.keys(stats))stats[k]+=item.game[k]
 }
 stats.krit=Math.min(50,Math.round(stats.krit*10)/10);
 return{character,stats}
}
const ownItem=(db,userId,uid)=>db.prepare('SELECT * FROM inventory WHERE id=? AND user_id=?').get(String(uid||''),userId)||fail(404,'Diesen Gegenstand hast du nicht.');
const bagFull=(db,userId)=>db.prepare('SELECT COUNT(*) n FROM inventory WHERE user_id=?').get(userId).n>=BAG_LIMIT;
const giveItem=(db,userId,itemId,source)=>{const uid=id();db.prepare('INSERT INTO inventory(id,user_id,item_id,source,created_at) VALUES (?,?,?,?,?)').run(uid,userId,itemId,source,now());return uid};
function drawFrom(chest){
 let roll=randomInt(100),rarity='uncommon';
 for(const r of RARITIES){if((roll-=chest.odds[r])<0){rarity=r;break}}
 const pool=chest.items[rarity],total=pool.reduce((a,p)=>a+p.weight,0);let pick=randomInt(total);
 for(const p of pool){if((pick-=p.weight)<0)return{rarity,itemId:p.id}}
 return{rarity,itemId:pool[0].id}
}

export function registerArmoryRoutes(db){
 const view=userId=>{
  const welcome=grantStartGold(db,userId),{character,stats}=statsOf(db,userId);
  const inventory=db.prepare('SELECT id,item_id,slot,listed,source,created_at FROM inventory WHERE user_id=? ORDER BY created_at DESC').all(userId)
   .map(r=>({uid:r.id,itemId:r.item_id,slot:r.slot,listed:!!r.listed,source:r.source,usable:!!character&&allowedClasses(ITEMS[r.item_id]).includes(character.class_id)}));
  return{balance:balanceOf(db,userId),welcome:welcome?START_GOLD:0,character:character&&{name:[character.name,character.surname].filter(Boolean).join(' '),classId:character.class_id,className:CLASSES[character.class_id],race:character.race,gender:character.gender??0},stats,base:BASE_STATS,inventory}
 };
 // Static data: items with their prices, chests with all odds, shop stock. Same for every player.
 const catalog={items:Object.fromEntries(Object.values(ITEMS).map(i=>[i.id,{id:i.id,name:i.name,quality:i.quality,icon:i.icon,itemLevel:i.itemLevel,requiredLevel:i.requiredLevel,slot:i.slot,type:i.type,game:i.game,value:i.value,buy:buyPrice(i),sell:sellPrice(i),classes:allowedClasses(i)}])),
  chests:CHESTS.map(c=>({id:c.id,name:c.name,price:c.price,icon:c.icon,odds:c.odds,items:Object.fromEntries(RARITIES.map(r=>{const pool=c.items[r],total=pool.reduce((a,p)=>a+p.weight,0);return[r,pool.map(p=>({id:p.id,chance:Math.round(c.odds[r]*p.weight/total*100)/100}))]}))})),
  shop:[...SHOP],base:BASE_STATS,source:DATA.source};
 route('GET','/api/armory/catalog','member',()=>catalog);
 route('GET','/api/armory','member',({user})=>view(user.id));

 route('POST','/api/armory/chest','member',({user,body})=>{
  rateLimit('chest:'+user.id,40,60e3);
  const chest=CHESTS.find(c=>c.id===body.chest)||fail(400,'Diese Truhe gibt es nicht.');
  const won=transaction(db,()=>{
   if(balanceOf(db,user.id)<chest.price)fail(400,`Dafür fehlen dir ${chest.price-balanceOf(db,user.id)} Gold.`);
   if(bagFull(db,user.id))fail(400,'Deine Taschen sind voll. Verkauf erst etwas.');
   const draw=drawFrom(chest),uid=giveItem(db,user.id,draw.itemId,'chest:'+chest.id);
   book(db,user.id,-chest.price,'chest',chest.id);
   db.prepare('INSERT INTO chest_opens(id,user_id,chest,item_id,rarity,created_at) VALUES (?,?,?,?,?,?)').run(id(),user.id,chest.id,draw.itemId,draw.rarity,now());
   return{...draw,uid}
  });
  const item=ITEMS[won.itemId];
  if(won.rarity==='legendary')discord('spielunke',{title:`🟠 LEGENDÄR aus der Truhe: ${item.name}`,text:`**${user.username}** hat die ${chest.name} geöffnet und **${item.name}** gezogen!`,color:0xff8000});
  return{...view(user.id),won:{uid:won.uid,itemId:won.itemId,rarity:won.rarity}}
 });

 route('POST','/api/armory/buy','member',({user,body})=>{
  rateLimit('shop:'+user.id,60,60e3);
  const itemId=int(body.itemId,'Gegenstand',1,1e6);if(!SHOP.has(itemId))fail(400,'Das führt der Händler nicht.');
  const item=ITEMS[itemId],price=buyPrice(item);
  const uid=transaction(db,()=>{
   if(balanceOf(db,user.id)<price)fail(400,`Dafür fehlen dir ${price-balanceOf(db,user.id)} Gold.`);
   if(bagFull(db,user.id))fail(400,'Deine Taschen sind voll. Verkauf erst etwas.');
   book(db,user.id,-price,'shop-buy',String(itemId));return giveItem(db,user.id,itemId,'shop')
  });
  return{...view(user.id),bought:uid}
 });
 route('POST','/api/armory/sell','member',({user,body})=>{
  const row=ownItem(db,user.id,body.uid);
  if(row.listed)fail(409,'Das Item steht im Auktionshaus. Zieh das Angebot erst zurück.');
  if(row.slot)fail(409,'Leg das Item erst ab.');
  const price=sellPrice(ITEMS[row.item_id]);
  transaction(db,()=>{if(Number(db.prepare('DELETE FROM inventory WHERE id=? AND user_id=? AND listed=0 AND slot IS NULL').run(row.id,user.id).changes)!==1)fail(409,'Das Item ist nicht mehr da.');book(db,user.id,price,'shop-sell',String(row.item_id))});
  return{...view(user.id),sold:price}
 });

 route('POST','/api/armory/equip','member',({user,body})=>{
  const row=ownItem(db,user.id,body.uid),item=ITEMS[row.item_id],character=characterOf(db,user.id);
  if(!character)fail(400,'Leg erst einen Charakter an.');
  if(row.listed)fail(409,'Das Item steht im Auktionshaus.');
  if(!item.slot)fail(400,`${item.name} lässt sich nicht anlegen, das ist eine Trophäe.`);
  if(!allowedClasses(item).includes(character.class_id))fail(400,`${CLASSES[character.class_id]} können ${item.type||'das'} nicht tragen.`);
  const options=slotsFor(item,character.class_id);
  let slot=body.slot;
  if(slot!==undefined&&!options.includes(slot))fail(400,'In diesen Platz passt das Item nicht.');
  if(slot===undefined)slot=options.find(s=>!db.prepare('SELECT 1 FROM inventory WHERE user_id=? AND slot=?').get(user.id,s))||options[0];
  transaction(db,()=>{
   const clear=s=>db.prepare('UPDATE inventory SET slot=NULL WHERE user_id=? AND slot=?').run(user.id,s);
   db.prepare('UPDATE inventory SET slot=NULL WHERE id=?').run(row.id);
   clear(slot);
   if(item.slot==='twohand')clear('offhand');
   if(slot==='offhand'){const main=db.prepare(`SELECT item_id FROM inventory WHERE user_id=? AND slot='mainhand'`).get(user.id);if(main&&ITEMS[main.item_id].slot==='twohand')clear('mainhand')}
   db.prepare('UPDATE inventory SET slot=? WHERE id=?').run(slot,row.id)
  });
  return view(user.id)
 });
 route('POST','/api/armory/unequip','member',({user,body})=>{
  const row=ownItem(db,user.id,body.uid);db.prepare('UPDATE inventory SET slot=NULL WHERE id=?').run(row.id);return view(user.id)
 });

 // Auction house: fixed buy-out prices, no bids, no run time, no mailbox.
 const listing=r=>({id:r.id,itemId:r.item_id,price:r.price,seller:r.seller,own:false,createdAt:r.created_at});
 route('GET','/api/auctions','member',({user})=>({
  balance:balanceOf(db,user.id),
  open:db.prepare(`SELECT a.id,a.item_id,a.price,a.created_at,a.seller_id,u.username seller FROM auctions a JOIN users u ON u.id=a.seller_id WHERE a.status='open' ORDER BY a.created_at DESC LIMIT 300`).all().map(r=>({...listing(r),own:r.seller_id===user.id})),
  sold:db.prepare(`SELECT a.item_id,a.price,a.closed_at,u.username buyer FROM auctions a LEFT JOIN users u ON u.id=a.buyer_id WHERE a.seller_id=? AND a.status='sold' ORDER BY a.closed_at DESC LIMIT 10`).all(user.id).map(r=>({itemId:r.item_id,price:r.price,buyer:r.buyer||'?',at:r.closed_at}))
 }));
 route('POST','/api/auctions','member',({user,body})=>{
  rateLimit('auction:'+user.id,30,60e3);
  const row=ownItem(db,user.id,body.uid),price=int(body.price,'Preis',1,MAX_PRICE);
  if(row.slot)fail(409,'Leg das Item erst ab.');
  if(row.listed)fail(409,'Das Item steht schon im Auktionshaus.');
  if(db.prepare(`SELECT COUNT(*) n FROM auctions WHERE seller_id=? AND status='open'`).get(user.id).n>=OPEN_LISTINGS)fail(400,`Mehr als ${OPEN_LISTINGS} Angebote gleichzeitig gehen nicht.`);
  const aid=id();
  transaction(db,()=>{db.prepare('UPDATE inventory SET listed=1 WHERE id=?').run(row.id);db.prepare('INSERT INTO auctions(id,seller_id,inventory_id,item_id,price,created_at) VALUES (?,?,?,?,?,?)').run(aid,user.id,row.id,row.item_id,price,now())});
  return{ok:true,id:aid}
 });
 route('POST','/api/auctions/:id/buy','member',({user,params})=>{
  rateLimit('auction:'+user.id,30,60e3);
  const sale=transaction(db,()=>{
   const a=db.prepare(`SELECT * FROM auctions WHERE id=? AND status='open'`).get(params.id)||fail(404,'Das Angebot ist nicht mehr da.');
   if(a.seller_id===user.id)fail(400,'Dein eigenes Angebot kannst du nicht kaufen.');
   if(balanceOf(db,user.id)<a.price)fail(400,`Dafür fehlen dir ${a.price-balanceOf(db,user.id)} Gold.`);
   if(bagFull(db,user.id))fail(400,'Deine Taschen sind voll.');
   if(Number(db.prepare(`UPDATE auctions SET status='sold',buyer_id=?,closed_at=? WHERE id=? AND status='open'`).run(user.id,now(),a.id).changes)!==1)fail(409,'Jemand war schneller.');
   db.prepare(`UPDATE inventory SET user_id=?,listed=0,slot=NULL,source='auction' WHERE id=?`).run(user.id,a.inventory_id);
   book(db,user.id,-a.price,'auction-buy',a.id);book(db,a.seller_id,a.price,'auction-sale',a.id);
   return a
  });
  notify(db,sale.seller_id,`Auktionshaus: ${ITEMS[sale.item_id].name} wurde für ${sale.price} Gold an ${user.username} verkauft.`,'auctions','auction:'+sale.id);
  return{ok:true,balance:balanceOf(db,user.id)}
 });
 route('DELETE','/api/auctions/:id','member',({user,params})=>{
  transaction(db,()=>{
   const a=db.prepare(`SELECT * FROM auctions WHERE id=? AND seller_id=? AND status='open'`).get(params.id,user.id)||fail(404,'Das Angebot ist nicht mehr da.');
   db.prepare(`UPDATE auctions SET status='withdrawn',closed_at=? WHERE id=?`).run(now(),a.id);db.prepare('UPDATE inventory SET listed=0 WHERE id=?').run(a.inventory_id)
  });
  return{ok:true}
 });
}
