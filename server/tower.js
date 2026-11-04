/* Tower of Trials: an endless solo climb for the Waffenkammer. Every floor holds one real Classic boss a little stronger than the last;
   the gold of each floor goes into a bank. Cash out any time to take it all; fall and you keep half. Every fifth floor is a guardian
   with a roll on its own loot table. The weekly ranking counts the highest floor cleared. Boss names, levels and loot are real data,
   the numbers are this game's own (bossStats in dungeons.js). */
import {randomInt} from 'node:crypto';
import {route,fail,now,id,rateLimit} from './core.js';
import {fighterOf,resolveAction,drinkPotion,ready} from './duels.js';
import {DUNGEONS,bossStats,bossScale,bossTurn} from './dungeons.js';
import {ITEMS,giveItem,bagFull} from './armory.js';
import {book,transaction,potionsOf} from './gold.js';
import {grantXp,POTIONS} from './progression.js';
import {discord} from './discord.js';
import {bumpTask} from './daily.js';

// Enemy level of a floor: five below the climber's level on floor 1, one level more every third floor.
export const floorLevel=(startLevel,floor)=>Math.max(1,Math.min(63,startLevel-5+Math.floor(floor/3)));
export const FLOOR_GROWTH=.015,GUARDIAN_BONUS=1.2,GUARDIAN_EVERY=5,FLOOR_HEAL=.3,POTIONS_PER_FLOOR=1,DEATH_KEEPS=.5,GUARDIAN_DROP=60,LOG_KEPT=30,RECORD_FROM=10;
export const floorGold=level=>Math.round(4+level*.8),floorXp=level=>Math.round(5+level*1.5);
const BOSSES=DUNGEONS.filter(d=>d.kind==='dungeon').flatMap(d=>d.bosses.map(b=>({...b,dungeon:d.name})));
const berlinDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
// The Monday of the current Berlin week, as YYYY-MM-DD.
export function weekOf(date=new Date()){const day=berlinDay(date),[y,m,d]=day.split('-').map(Number),wd=(new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7;return new Date(Date.UTC(y,m-1,d-wd)).toISOString().slice(0,10)}

// The enemy of a floor: a real boss near the floor's level (random among the closest), with values for a solo fight at that level.
export function enemyFor(startLevel,floor,rand=randomInt){
 const level=floorLevel(startLevel,floor),guardian=floor%GUARDIAN_EVERY===0;
 const gap=Math.min(...BOSSES.map(b=>Math.abs(b.level-level))),near=BOSSES.filter(b=>Math.abs(b.level-level)<=gap+1),b=near[rand(near.length)];
 // Beyond the level the floor also adds FLOOR_GROWTH per floor, so the climb never flattens out, not even past level 63.
 const st=bossStats('dungeon',Math.min(level,60),false),over=(1+.04*Math.max(0,level-60))*(1+FLOOR_GROWTH*floor)*(guardian?GUARDIAN_BONUS:1);
 return{id:'boss',name:b.name,icon:b.icon,dungeon:b.dungeon,level,guardian,loot:b.loot,max:Math.round(st.hp*over),hp:Math.round(st.hp*over),angriff:Math.round(st.angriff*over*bossScale('dungeon',1)),verteidigung:st.verteidigung,krit:st.krit,defending:false,shield:0,buff:0,stunned:false,turns:0}
}

export function registerTowerRoutes(db){
 const open=userId=>db.prepare(`SELECT * FROM tower_runs WHERE user_id=? AND status='active'`).get(userId);
 const save=(run,state,extra={})=>{const s={...state,log:state.log.slice(-LOG_KEPT)};db.prepare('UPDATE tower_runs SET state=?,floor=?,best=?,gold=?,status=?,paid=?,updated_at=? WHERE id=?').run(JSON.stringify(s),extra.floor??run.floor,extra.best??run.best,extra.gold??run.gold,extra.status??run.status,extra.paid??run.paid,now(),run.id)};
 const ranking=week=>db.prepare(`SELECT u.username,MAX(t.best) best FROM tower_runs t JOIN users u ON u.id=t.user_id WHERE t.week=? AND u.hidden=0 AND t.best>0 GROUP BY t.user_id ORDER BY best DESC,MIN(t.updated_at) LIMIT 10`).all(week);
 const show=(run,userId)=>{
  const state=run?JSON.parse(run.state):null,week=weekOf();
  return{run:run&&{id:run.id,status:run.status,floor:run.floor,best:run.best,gold:run.gold,paid:run.paid,keepOnDeath:Math.floor(run.gold*DEATH_KEEPS),me:state.me,enemy:state.enemy,log:state.log,potionsThisFloor:state.potionsThisFloor||0,xp:state.xp||0,items:(state.items||[]).map(i=>({id:i,name:ITEMS[i]?.name,quality:ITEMS[i]?.quality}))},
   potions:potionsOf(db,userId),potionsPerFloor:POTIONS_PER_FLOOR,guardianEvery:GUARDIAN_EVERY,
   bestThisWeek:db.prepare('SELECT COALESCE(MAX(best),0) n FROM tower_runs WHERE user_id=? AND week=?').get(userId,week).n,
   bestEver:db.prepare('SELECT COALESCE(MAX(best),0) n FROM tower_runs WHERE user_id=?').get(userId).n,
   ranking:ranking(week),week}
 };
 const last=userId=>db.prepare(`SELECT * FROM tower_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).get(userId);
 // Payout at the end: everything when cashing out, half when fallen. XP was paid floor by floor.
 function finish(run,state,status,user){
  const pay=status==='cashed'?run.gold:Math.floor(run.gold*DEATH_KEEPS);
  transaction(db,()=>{if(pay>0)book(db,run.user_id,pay,'tower',run.id);save(run,state,{status,paid:pay})});
  const week=weekOf(),before=db.prepare(`SELECT COALESCE(MAX(best),0) n FROM tower_runs WHERE week=? AND id<>?`).get(week,run.id).n;
  if(run.best>=RECORD_FROM&&run.best>before)discord('spielunke',{title:`🗼 Neuer Turm-Rekord: Etage ${run.best}`,text:`**${user.username}** hat diese Woche ${run.best} Etagen im Turm der Prüfungen geschafft.`,color:0x9b59b6})
 }
 // A floor is cleared: bank its gold, pay its XP, roll the guardian's loot, heal a little and bring the next enemy.
 function clearFloor(run,state){
  const e=state.enemy,gold=floorGold(e.level),xp=floorXp(e.level);let itemId=null;
  if(e.guardian&&randomInt(100)<GUARDIAN_DROP&&!bagFull(db,run.user_id)){const pool=e.loot.filter(i=>ITEMS[i]);itemId=pool[randomInt(pool.length)];giveItem(db,run.user_id,itemId,'tower');(state.items||=[]).push(itemId)}
  const levelUp=state.me.characterId?grantXp(db,state.me.characterId,xp,'tower'):0;state.xp=(state.xp||0)+xp;
  state.log.push({by:'me',action:'floor',floor:run.floor,gold,xp,itemId,itemName:itemId?ITEMS[itemId].name:null,quality:itemId?ITEMS[itemId].quality:null,levelUp,damage:0});
  const me=state.me;me.hp=Math.min(me.max,me.hp+Math.round(me.max*FLOOR_HEAL));me.shield=0;me.defending=false;me.stunned=false;
  // Abilities recharge after a guardian only; in between a mana potion does it.
  if(e.guardian)for(const a of me.abilities||[])if(a.pp!==null)a.ppLeft=a.pp;
  state.potionsThisFloor=0;const floor=run.floor+1;state.enemy=enemyFor(state.startLevel,floor);
  state.log.push({by:'boss',action:'bossup',name:state.enemy.name,icon:state.enemy.icon,guardian:state.enemy.guardian,floor,damage:0});
  save(run,state,{floor,best:run.floor,gold:run.gold+gold});bumpTask(db,run.user_id,'tower',run.floor);
 }

 route('GET','/api/tower','member',({user})=>{const run=open(user.id)||last(user.id);return show(run,user.id)});
 route('POST','/api/tower/start','member',({user})=>{
  rateLimit('tower:'+user.id,20,60e3);
  if(open(user.id))fail(409,'Du bist schon im Turm.');
  const me=fighterOf(db,user.id);if(!me.characterId)fail(400,'Leg erst einen Charakter an.');
  const state={me:{...me,id:'me'},startLevel:me.level,enemy:enemyFor(me.level,1),potionsThisFloor:0,xp:0,items:[],log:[]};
  state.log.push({by:'boss',action:'bossup',name:state.enemy.name,icon:state.enemy.icon,floor:1,damage:0});
  const rid=id();db.prepare('INSERT INTO tower_runs(id,user_id,character_id,state,week,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(rid,user.id,me.characterId,JSON.stringify(state),weekOf(),now(),now());
  return show(open(user.id),user.id)
 });
 route('POST','/api/tower/action','member',({user,body})=>{
  rateLimit('tower-act:'+user.id,180,60e3);
  const run=open(user.id)||fail(409,'Du bist gerade nicht im Turm.'),state=JSON.parse(run.state),me=state.me;
  let action=String(body.action||'').slice(0,40),entry;
  if(action==='attack')action=me.abilities?.[0]?.key||'attack';
  if(action.startsWith('potion:')){
   const potion=POTIONS[action.slice(7)]||fail(400,'Diesen Trank gibt es nicht.');
   if((state.potionsThisFloor||0)>=POTIONS_PER_FLOOR)fail(409,'Ein Trank pro Etage.');
   if(Number(db.prepare('UPDATE potions SET count=count-1 WHERE user_id=? AND potion=? AND count>0').run(user.id,potion.key).changes)!==1)fail(409,`Du hast keinen ${potion.name} mehr.`);
   state.potionsThisFloor=(state.potionsThisFloor||0)+1;entry=drinkPotion(me,potion)
  }else{
   if(action!=='defend'){
    const a=(me.abilities||[]).find(x=>x.key===action)||fail(400,'Diese Aktion kennst du nicht.');
    if(a.unlocked===false)fail(409,`${a.name} lernst du erst auf Stufe ${a.unlockLevel}.`);
    if(!ready(me,action))fail(409,`${a.name} ist aufgebraucht. Ein Manatrank lädt sie wieder auf.`);
    if(a.ppLeft!==null)a.ppLeft--
   }
   entry=resolveAction(me,state.enemy,action)
  }
  state.log.push({...entry,by:'me'});
  if(state.enemy.hp<=0){state.log.push({by:'boss',action:'bossdown',name:state.enemy.name,damage:0});clearFloor(run,state);return show(open(user.id),user.id)}
  for(const e of bossTurn(state.enemy,[me]))state.log.push({...e,target:'me'});
  if(me.hp<=0){state.log.push({by:'boss',action:'fallen',floor:run.floor,damage:0});finish(run,state,'dead',user);return show(db.prepare('SELECT * FROM tower_runs WHERE id=?').get(run.id),user.id)}
  if(me.stunned){me.stunned=false;for(const e of bossTurn(state.enemy,[me]))state.log.push({...e,target:'me'})}
  save(run,state);
  return show(open(user.id)||db.prepare('SELECT * FROM tower_runs WHERE id=?').get(run.id),user.id)
 });
 route('POST','/api/tower/cashout','member',({user})=>{
  const run=open(user.id)||fail(409,'Du bist gerade nicht im Turm.'),state=JSON.parse(run.state);
  state.log.push({by:'me',action:'cashout',gold:run.gold,damage:0});finish(run,state,'cashed',user);
  return show(db.prepare('SELECT * FROM tower_runs WHERE id=?').get(run.id),user.id)
 });
}
