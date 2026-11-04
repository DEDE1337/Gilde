/* Dungeons and raids. Dungeons: a host opens a lobby, up to five players join, the host starts; three runs per Berlin day.
   Raids are scheduled every day at 19:00 Berlin time for up to 25 players: sign-up opens at 18:00, the fight starts on its own.
   The party fights the bosses one after another, each player in join order, then the boss. A clear pays gold, XP and maybe an item.
   Boss names are from WoW Classic, their numbers are this game's own. */
import {randomInt} from 'node:crypto';
import {route,fail,now,id,rateLimit,notify} from './core.js';
import {fighterOf,resolveAction,drinkPotion,ready} from './duels.js';
import {CHESTS,ITEMS,drawFrom,giveItem,bagFull} from './armory.js';
import {book,transaction,potionsOf} from './gold.js';
import {grantXp,POTIONS,POTIONS_PER_DUEL} from './progression.js';
import {forfeitLine} from './sayings.js';

const B=(name,icon,hp,angriff,verteidigung,krit=5)=>({name,icon,hp,angriff,verteidigung,krit});
// hp is per player in the party, so a group of two meets a boss half as tough as a group of four.
export const DUNGEONS=[
 {id:'deadmines',name:'Die Todesminen',kind:'dungeon',level:1,icon:'achievement_boss_edwinvancleef',loot:'stormwind',lootChance:40,gold:40,xp:30,
  bosses:[B("Rhahk'Zor",'inv_hammer_09',200,18,8),B('Mr. Smite','inv_axe_22',280,22,12),B('Edwin VanCleef','achievement_boss_edwinvancleef',380,28,15)]},
 {id:'shadowfang',name:'Burg Schattenfang',kind:'dungeon',level:4,icon:'spell_shadow_antishadow',loot:'ironforge',lootChance:40,gold:60,xp:40,
  bosses:[B('Rethilgore','inv_misc_head_gnoll_01',350,30,20),B('Rudelmeister Nandos','ability_hunter_pet_wolf',450,36,24),B('Erzmagier Arugal','spell_shadow_antishadow',600,42,26)]},
 {id:'scarlet',name:'Scharlachrotes Kloster',kind:'dungeon',level:8,icon:'spell_holy_resurrection',loot:'ironforge',lootChance:45,gold:90,xp:50,
  bosses:[B('Herod','ability_warrior_bladestorm',600,50,40),B('Hochinquisitor Weißsträhne','spell_holy_resurrection',800,60,40,8)]},
 {id:'stratholme',name:'Stratholme',kind:'dungeon',level:12,icon:'inv_sword_17',loot:'stratholme',lootChance:50,gold:130,xp:60,
  bosses:[B('Ramstein der Gierschlund','inv_misc_head_undead_01',900,70,60),B('Baron Totenschwur','inv_sword_17',1300,85,60,8)]},
 {id:'onyxia',name:'Onyxias Hort',kind:'raid',level:14,icon:'achievement_boss_onyxia',loot:'azeroth',lootChance:100,gold:250,xp:90,
  bosses:[B('Onyxia','achievement_boss_onyxia',1600,110,90,10)]},
 {id:'moltencore',name:'Geschmolzener Kern',kind:'raid',level:16,icon:'achievement_boss_ragnaros',loot:'moltencore',lootChance:100,gold:400,xp:120,
  bosses:[B('Lucifron','spell_shadow_curseofmannoroth',1300,100,90),B('Golemagg der Verbrenner','spell_fire_lavaspawn',1600,115,100),B('Ragnaros','achievement_boss_ragnaros',2200,140,100,10)]}
];
const PARTY={dungeon:5,raid:25},PER_DAY={dungeon:3,raid:1},TURN_MS={dungeon:45e3,raid:30e3},LOBBY_MS=2*3600e3,LOG_KEPT=60,BOSS_HEAL_BETWEEN=.3;
// Raid schedule: weekday (0 = Sunday) to raid, start hour in Berlin time, sign-up one hour before.
export const RAID_DAYS={1:'onyxia',2:'moltencore',3:'onyxia',4:'moltencore',5:'onyxia',6:'moltencore',0:'onyxia'},RAID_HOUR=19,SIGNUP_MS=3600e3,RAID_CALENDAR_WEEKS=6;
// The UTC instant of a Berlin wall-clock time (handles summer and winter time).
export function berlinInstant(y,m,d,h){
 const guess=Date.UTC(y,m-1,d,h),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Berlin',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(guess)).map(p=>[p.type,p.value]));
 const shown=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute);return guess-(shown-guess)
}
// Upcoming raid slots from a moment on: [{dungeon, startsAt (ms), day (YYYY-MM-DD)}].
export function raidSlots(from=Date.now(),days=7){
 const out=[];
 for(let i=-1;i<=days;i++){
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(from+i*864e5)),[y,m,d]=day.split('-').map(Number);
  const weekday=new Date(Date.UTC(y,m-1,d)).getUTCDay();if(!(weekday in RAID_DAYS))continue;
  const startsAt=berlinInstant(y,m,d,RAID_HOUR);if(startsAt+3*3600e3<from)continue;
  out.push({dungeon:RAID_DAYS[weekday],startsAt,day})
 }
 return out.filter((x,i,a)=>a.findIndex(y=>y.day===x.day)===i).sort((a,b)=>a.startsAt-b.startsAt)
}
const berlinDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const dungeonOf=key=>DUNGEONS.find(d=>d.id===key)||fail(400,'Diese Instanz gibt es nicht.');
const makeBoss=(dungeon,index,players)=>{const b=dungeon.bosses[index];return{id:'boss',name:b.name,icon:b.icon,max:b.hp*players,hp:b.hp*players,angriff:b.angriff,verteidigung:b.verteidigung,krit:b.krit,defending:false,shield:0,buff:0,stunned:false,turns:0}};

// The boss acts after every full round: a normal hit on a random fighter, every third turn something nasty.
export function bossTurn(boss,party,rand=randomInt){
 const alive=party.filter(f=>f.hp>0);if(!alive.length)return[];
 if(boss.stunned){boss.stunned=false;return[{by:'boss',action:'stunned',damage:0}]}
 boss.turns++;
 if(boss.turns%3===0&&alive.length>1){
  // Area attack: everybody takes a softer hit.
  const hits=alive.map(f=>{const e=resolveAction({...boss,angriff:boss.angriff*.6},f,'attack',rand);return{target:f.id,damage:e.damage,absorbed:e.absorbed||0}});
  return[{by:'boss',action:'aoe',hits,damage:hits.reduce((a,h)=>a+h.damage,0)}]
 }
 const target=alive[rand(alive.length)],heavy=boss.turns%3===0;
 const e=resolveAction(heavy?{...boss,angriff:boss.angriff*2}:boss,target,'attack',rand);
 return[{...e,by:'boss',action:heavy?'heavy':'attack',target:target.id}]
}

export function registerDungeonRoutes(db){
 const tick=()=>{ensureRaids();ensureRaidCalendar()};
 const runsToday=(userId,kind)=>db.prepare(`SELECT COUNT(*) n FROM dungeon_members m JOIN dungeon_runs r ON r.id=m.run_id WHERE m.user_id=? AND m.started_day=? AND r.kind=?`).get(userId,berlinDay(),kind).n;
 const members=runId=>db.prepare('SELECT m.user_id,u.username FROM dungeon_members m JOIN users u ON u.id=m.user_id WHERE m.run_id=? ORDER BY m.joined_at').all(runId);
 // Members who gave up are out: the run is no longer theirs.
 const openRunOf=userId=>db.prepare(`SELECT r.* FROM dungeon_runs r JOIN dungeon_members m ON m.run_id=r.id WHERE m.user_id=? AND m.left_at IS NULL AND r.status IN ('lobby','active')`).get(userId);
 const save=(run,state,turn)=>db.prepare('UPDATE dungeon_runs SET state=?,turn_user_id=?,turn_deadline=?,updated_at=? WHERE id=?').run(JSON.stringify({...state,log:state.log.slice(-LOG_KEPT)}),turn,turn?Date.now()+TURN_MS[run.kind]:null,now(),run.id);
 const alive=(state,uid)=>state.fighters[uid]&&state.fighters[uid].hp>0&&!state.left.includes(uid);
 const nextPlayer=(state,after)=>{const order=state.order,start=after===null?-1:order.indexOf(after);for(let i=start+1;i<order.length;i++)if(alive(state,order[i]))return order[i];return null};
 const firstPlayer=state=>nextPlayer(state,null);

 function end(run,state,status){
  db.prepare('UPDATE dungeon_runs SET status=?,state=?,turn_user_id=NULL,turn_deadline=NULL,updated_at=? WHERE id=?').run(status,JSON.stringify({...state,log:state.log.slice(-LOG_KEPT)}),now(),run.id)
 }
 // Clear: every member who did not give up gets gold, XP and a roll for loot from the dungeon's chest pool.
 function reward(run,state){
  const dungeon=dungeonOf(run.dungeon),chest=CHESTS.find(c=>c.id===dungeon.loot);
  for(const uid of state.order){
   if(state.left.includes(uid))continue;
   const f=state.fighters[uid];let itemId=null;
   transaction(db,()=>{
    book(db,uid,dungeon.gold,dungeon.kind,run.id);
    if(chest&&randomInt(100)<dungeon.lootChance&&!bagFull(db,uid)){itemId=drawFrom(chest).itemId;giveItem(db,uid,itemId,'dungeon:'+dungeon.id)}
   });
   const levelUp=grantXp(db,f.characterId,dungeon.xp,dungeon.kind);
   state.log.push({by:uid,action:'loot',gold:dungeon.gold,xp:dungeon.xp,itemId,itemName:itemId?ITEMS[itemId].name:null,quality:itemId?ITEMS[itemId].quality:null,levelUp,damage:0});
   notify(db,uid,`${dungeon.name} geschafft! +${dungeon.gold} Gold${itemId?`, Beute: ${ITEMS[itemId].name}`:''}.`,'dungeons','run-won:'+run.id+':'+uid)
  }
 }
 // After a player's move: next player, or the boss when everybody had a turn; then check for a downed boss or a wiped party.
 function advance(run,state,after){
  const dungeon=dungeonOf(run.dungeon);
  if(state.boss.hp<=0){
   state.log.push({by:'boss',action:'bossdown',name:state.boss.name,damage:0});
   if(state.bossIndex+1>=dungeon.bosses.length){reward(run,state);return end(run,state,'won')}
   state.bossIndex++;const players=state.order.filter(uid=>!state.left.includes(uid)).length;
   state.boss=makeBoss(dungeon,state.bossIndex,players);
   for(const uid of state.order){const f=state.fighters[uid];if(f.hp>0){f.hp=Math.min(f.max,f.hp+Math.round(f.max*BOSS_HEAL_BETWEEN));f.shield=0;f.defending=false;f.stunned=false}}
   state.log.push({by:'boss',action:'bossup',name:state.boss.name,icon:state.boss.icon,damage:0});
   return save(run,state,firstPlayer(state))
  }
  let next=nextPlayer(state,after);
  if(!next){
   const party=state.order.filter(uid=>alive(state,uid)).map(uid=>state.fighters[uid]);
   for(const e of bossTurn(state.boss,party))state.log.push({...e,round:state.round});
   state.round++;
   next=firstPlayer(state)
  }
  if(!next){state.log.push({by:'boss',action:'wipe',damage:0});return end(run,state,'wiped')}
  // A stunned player loses the turn.
  const f=state.fighters[next];
  if(f.stunned){f.stunned=false;state.log.push({by:next,action:'stunned',round:state.round,damage:0});return advance(run,state,next)}
  save(run,state,next)
 }
 function act(run,userId,action){
  const state=JSON.parse(run.state),me=state.fighters[userId];
  if(action==='attack')action=me.abilities?.[0]?.key||'attack';
  let entry;
  if(action.startsWith('potion:')){
   const potion=POTIONS[action.slice(7)];
   const took=potion&&(me.potionsUsed||0)<POTIONS_PER_DUEL&&Number(db.prepare('UPDATE potions SET count=count-1 WHERE user_id=? AND potion=? AND count>0').run(userId,potion.key).changes)===1;
   if(took){me.potionsUsed=(me.potionsUsed||0)+1;entry=drinkPotion(me,potion)}else action=me.abilities?.[0]?.key||'attack'
  }
  if(!entry){
   if(!ready(me,action)||(me.abilities||[]).some(a=>a.key===action&&a.unlocked===false))action=me.abilities?.[0]?.key||'attack';
   const used=(me.abilities||[]).find(a=>a.key===action);if(used&&used.ppLeft!==null)used.ppLeft--;
   entry=resolveAction(me,state.boss,action)
  }
  state.log.push({...entry,round:state.round});
  advance(run,state,userId)
 }
 // What the clock decided: stale lobbies close, missed turns become a basic attack.
 function settle(run){
  for(let guard=0;run&&guard<50;guard++){
   if(run.status==='lobby'&&run.starts_at&&run.starts_at<=Date.now()){if(members(run.id).length)begin(run);else db.prepare(`UPDATE dungeon_runs SET status='abandoned',updated_at=? WHERE id=?`).run(now(),run.id)}
   else if(run.status==='lobby'&&!run.starts_at&&Date.parse(run.created_at)+LOBBY_MS<Date.now())db.prepare(`UPDATE dungeon_runs SET status='abandoned',updated_at=? WHERE id=?`).run(now(),run.id);
   else if(run.status==='active'&&run.turn_deadline&&run.turn_deadline<Date.now())act(run,run.turn_user_id,'attack');
   else return run;
   run=db.prepare('SELECT * FROM dungeon_runs WHERE id=?').get(run.id)
  }
  return run
 }
 const show=(run,userId)=>{
  const dungeon=dungeonOf(run.dungeon),state=run.state?JSON.parse(run.state):null,list=members(run.id);
  return{id:run.id,dungeon:run.dungeon,name:dungeon.name,kind:run.kind,status:run.status,host:run.host_id,you:userId,startsAt:run.starts_at?new Date(run.starts_at).toISOString():null,
   members:list.map(m=>({id:m.user_id,username:m.username,...(state?{}:{preview:fighterPreview(m.user_id)})})),max:PARTY[run.kind],
   yourTurn:run.turn_user_id===userId,turnUser:run.turn_user_id,turnLeft:run.turn_deadline?Math.max(0,run.turn_deadline-Date.now()):null,
   boss:state?.boss||null,bossIndex:state?.bossIndex??0,bossCount:dungeon.bosses.length,fighters:state?.fighters||null,order:state?.order||[],left:state?.left||[],round:state?.round||0,log:state?.log||[],
   potions:potionsOf(db,userId),potionsPerDuel:POTIONS_PER_DUEL}
 };
// Starts a run: everybody's values are frozen, the first boss appears, the first player is up.
 function begin(run){
  const dungeon=dungeonOf(run.dungeon),list=members(run.id);
  const fighters=Object.fromEntries(list.map(m=>[m.user_id,fighterOf(db,m.user_id)]));
  const state={bossIndex:0,boss:makeBoss(dungeon,0,list.length),fighters,order:list.map(m=>m.user_id),left:[],round:1,log:[{by:'boss',action:'bossup',name:dungeon.bosses[0].name,icon:dungeon.bosses[0].icon,damage:0}]};
  transaction(db,()=>{
   if(Number(db.prepare(`UPDATE dungeon_runs SET status='active',updated_at=? WHERE id=? AND status='lobby'`).run(now(),run.id).changes)!==1)fail(409,'Die Gruppe ist schon unterwegs.');
   db.prepare('UPDATE dungeon_members SET started_day=? WHERE run_id=?').run(berlinDay(),run.id);
   save(run,state,state.order[0])
  });
  for(const m of list)if(m.user_id!==run.host_id)notify(db,m.user_id,`Es geht los: ${dungeon.name}!`,'dungeons','start:'+run.id)
 }
 // Scheduled raids: the lobby of the next slot exists from the start of sign-up; one per slot (fixed id).
 function ensureRaids(){
  for(const slot of raidSlots()){
   if(Date.now()<slot.startsAt-SIGNUP_MS)continue;
   db.prepare(`INSERT OR IGNORE INTO dungeon_runs(id,dungeon,kind,host_id,starts_at,created_at,updated_at) VALUES (?,?,'raid',NULL,?,?,?)`).run('raid-'+slot.day,slot.dungeon,slot.startsAt,now(),now())
  }
  for(const run of db.prepare(`SELECT * FROM dungeon_runs WHERE kind='raid' AND status IN ('lobby','active')`).all())settle(run)
 }
 // Calendar: every raid of the next weeks gets an entry once; an officer may move or delete it, it is not recreated.
 function ensureRaidCalendar(){
  for(const slot of raidSlots(Date.now(),RAID_CALENDAR_WEEKS*7)){
   const key='raid-calendar:'+slot.day;if(db.prepare('SELECT 1 FROM discord_sent WHERE key=?').get(key))continue;
   const dungeon=dungeonOf(slot.dungeon);
   transaction(db,()=>{
    db.prepare(`INSERT OR IGNORE INTO guild_events(id,title,starts_at,duration,category,description,created_at) VALUES (?,?,?,?,'raid',?,?)`).run('waffenkammer-'+slot.day,`Waffenkammer-Raid: ${dungeon.name}`,new Date(slot.startsAt).toISOString(),90,`Schlachtzug in der Waffenkammer für bis zu 25 Spieler. Anmeldung ab 18 Uhr unter Waffenkammer → Instanzen & Raids, der Kampf startet um 19 Uhr von selbst.`,now());
    db.prepare('INSERT INTO discord_sent(key,sent_at) VALUES (?,?)').run(key,now())
   })
  }
 }
 const fighterPreview=userId=>{const f=fighterOf(db,userId);return{name:f.name,classId:f.classId,level:f.level,race:f.race,gender:f.gender}};
 const getRun=(runId)=>settle(db.prepare('SELECT * FROM dungeon_runs WHERE id=?').get(runId))||fail(404,'Diese Gruppe gibt es nicht.');
 const isMember=(runId,userId)=>!!db.prepare('SELECT 1 FROM dungeon_members WHERE run_id=? AND user_id=?').get(runId,userId);

 route('GET','/api/dungeons','member',({user})=>{
  ensureRaids();
  const lobbies=db.prepare(`SELECT * FROM dungeon_runs WHERE status IN ('lobby','active') ORDER BY created_at DESC LIMIT 50`).all().map(settle).filter(r=>r&&['lobby','active'].includes(r.status));
  const mine=openRunOf(user.id);
  const raids=raidSlots().slice(0,2).map(slot=>{const run=db.prepare('SELECT * FROM dungeon_runs WHERE id=?').get('raid-'+slot.day),list=run?members(run.id):[];return{dungeon:slot.dungeon,name:dungeonOf(slot.dungeon).name,startsAt:new Date(slot.startsAt).toISOString(),signupAt:new Date(slot.startsAt-SIGNUP_MS).toISOString(),runId:run?.id||null,status:run?.status||'planned',count:list.length,max:PARTY.raid,signedUp:list.some(m=>m.user_id===user.id)}});
  return{raids,dungeons:DUNGEONS.map(d=>({id:d.id,name:d.name,kind:d.kind,level:d.level,icon:d.icon,gold:d.gold,xp:d.xp,lootChance:d.lootChance,party:PARTY[d.kind],bosses:d.bosses.map(b=>({name:b.name,icon:b.icon}))})),
   runsLeft:{dungeon:Math.max(0,PER_DAY.dungeon-runsToday(user.id,'dungeon')),raid:Math.max(0,PER_DAY.raid-runsToday(user.id,'raid'))},perDay:PER_DAY,
   lobbies:lobbies.map(r=>({id:r.id,dungeon:r.dungeon,name:dungeonOf(r.dungeon).name,kind:r.kind,status:r.status,host:members(r.id).find(m=>m.user_id===r.host_id)?.username||'?',members:members(r.id).map(m=>m.username),max:PARTY[r.kind]})),
   current:mine?mine.id:null,
   recent:db.prepare(`SELECT r.id,r.dungeon,r.status,r.updated_at FROM dungeon_runs r JOIN dungeon_members m ON m.run_id=r.id WHERE m.user_id=? AND r.status IN ('won','wiped','abandoned') ORDER BY r.updated_at DESC LIMIT 8`).all(user.id).map(r=>({id:r.id,name:dungeonOf(r.dungeon).name,status:r.status,at:r.updated_at}))}
 });
 route('GET','/api/dungeons/:id','member',({user,params})=>show(getRun(params.id),user.id));
 route('POST','/api/dungeons','member',({user,body})=>{
  rateLimit('dungeon:'+user.id,20,60e3);
  const dungeon=dungeonOf(String(body.dungeon||''));
  if(dungeon.kind==='raid')fail(400,'Schlachtzüge laufen jeden Tag um 19 Uhr. Anmeldung ab 18 Uhr.');
  if(!fighterOf(db,user.id).characterId)fail(400,'Leg erst einen Charakter an.');
  if(openRunOf(user.id))fail(409,'Du bist schon in einer Gruppe.');
  if(runsToday(user.id,dungeon.kind)>=PER_DAY[dungeon.kind])fail(409,dungeon.kind==='raid'?'Dein Raid für heute ist schon gelaufen.':'Deine drei Instanzen für heute sind schon gelaufen.');
  const rid=id();
  transaction(db,()=>{db.prepare('INSERT INTO dungeon_runs(id,dungeon,kind,host_id,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(rid,dungeon.id,dungeon.kind,user.id,now(),now());db.prepare('INSERT INTO dungeon_members(run_id,user_id,joined_at) VALUES (?,?,?)').run(rid,user.id,now())});
  return show(db.prepare('SELECT * FROM dungeon_runs WHERE id=?').get(rid),user.id)
 });
 route('POST','/api/dungeons/:id/join','member',({user,params})=>{
  const run=getRun(params.id),dungeon=dungeonOf(run.dungeon);
  if(run.status!=='lobby')fail(409,'Diese Gruppe ist schon unterwegs.');
  if(isMember(run.id,user.id))return show(run,user.id);
  if(run.starts_at&&Date.now()<run.starts_at-SIGNUP_MS)fail(409,'Die Anmeldung öffnet eine Stunde vor dem Start.');
  if(!fighterOf(db,user.id).characterId)fail(400,'Leg erst einen Charakter an.');
  if(openRunOf(user.id))fail(409,'Du bist schon in einer Gruppe.');
  if(run.kind==='dungeon'&&runsToday(user.id,dungeon.kind)>=PER_DAY[dungeon.kind])fail(409,'Für heute hast du keine Läufe mehr übrig.');
  if(members(run.id).length>=PARTY[run.kind])fail(409,'Die Gruppe ist voll.');
  db.prepare('INSERT INTO dungeon_members(run_id,user_id,joined_at) VALUES (?,?,?)').run(run.id,user.id,now());
  if(run.host_id)notify(db,run.host_id,`${user.username} ist deiner Gruppe für ${dungeon.name} beigetreten.`,'dungeons','join:'+run.id+':'+user.id);
  return show(run,user.id)
 });
 route('POST','/api/dungeons/:id/leave','member',({user,params})=>{
  const run=getRun(params.id);if(!isMember(run.id,user.id))fail(404,'Du bist nicht in dieser Gruppe.');
  if(run.status!=='lobby')fail(409,'Die Gruppe ist schon unterwegs. Aufgeben geht im Kampf.');
  db.prepare('DELETE FROM dungeon_members WHERE run_id=? AND user_id=?').run(run.id,user.id);
  const rest=members(run.id);
  if(!rest.length&&!run.starts_at)db.prepare(`UPDATE dungeon_runs SET status='abandoned',updated_at=? WHERE id=?`).run(now(),run.id);
  else if(rest.length&&run.host_id===user.id)db.prepare('UPDATE dungeon_runs SET host_id=?,updated_at=? WHERE id=?').run(rest[0].user_id,now(),run.id);
  return{ok:true}
 });
 route('POST','/api/dungeons/:id/start','member',({user,params})=>{
  const run=getRun(params.id),dungeon=dungeonOf(run.dungeon);
  if(run.starts_at)fail(409,'Der Schlachtzug startet von selbst um 19 Uhr.');
  if(run.host_id!==user.id)fail(403,'Nur der Gruppenleiter startet.');
  if(run.status!=='lobby')fail(409,'Die Gruppe ist schon unterwegs.');
  const list=members(run.id);
  for(const m of list)if(runsToday(m.user_id,dungeon.kind)>=PER_DAY[dungeon.kind])fail(409,`${m.username} hat heute keine Läufe mehr übrig.`);
  begin(run);
  return show(db.prepare('SELECT * FROM dungeon_runs WHERE id=?').get(run.id),user.id)
 });
 route('POST','/api/dungeons/:id/action','member',({user,params,body})=>{
  rateLimit('dungeon-act:'+user.id,120,60e3);
  const run=getRun(params.id),action=String(body.action||'').slice(0,40);
  if(!isMember(run.id,user.id))fail(404,'Du bist nicht in dieser Gruppe.');
  if(run.status!=='active')fail(409,'Der Kampf ist vorbei.');
  if(JSON.parse(run.state).left.includes(user.id))fail(409,'Du hast aufgegeben.');
  if(run.turn_user_id!==user.id)fail(409,'Du bist nicht am Zug.');
  const f=JSON.parse(run.state).fighters[user.id];
  if(action.startsWith('potion:')){
   const potion=POTIONS[action.slice(7)]||fail(400,'Diesen Trank gibt es nicht.');
   if((f.potionsUsed||0)>=POTIONS_PER_DUEL)fail(409,`Mehr als ${POTIONS_PER_DUEL} Tränke pro Lauf gehen nicht.`);
   if(!(potionsOf(db,user.id)[potion.key]>0))fail(409,`Du hast keinen ${potion.name} mehr.`)
  }else if(!['attack','defend'].includes(action)){
   const a=(f.abilities||[]).find(x=>x.key===action)||fail(400,'Diese Aktion kennst du nicht.');
   if(a.unlocked===false)fail(409,`${a.name} lernst du erst auf Stufe ${a.unlockLevel}.`);
   if(a.ppLeft!==null&&a.ppLeft<=0)fail(409,`${a.name} ist aufgebraucht. Ein Manatrank lädt sie wieder auf.`)
  }
  act(run,user.id,action);
  return show(db.prepare('SELECT * FROM dungeon_runs WHERE id=?').get(run.id),user.id)
 });
 route('POST','/api/dungeons/:id/forfeit','member',({user,params})=>{
  const run=getRun(params.id);if(!isMember(run.id,user.id))fail(404,'Du bist nicht in dieser Gruppe.');
  if(run.status!=='active')fail(409,'Der Kampf ist vorbei.');
  const state=JSON.parse(run.state);if(state.left.includes(user.id))fail(409,'Du hast schon aufgegeben.');
  state.left.push(user.id);db.prepare('UPDATE dungeon_members SET left_at=? WHERE run_id=? AND user_id=?').run(now(),run.id,user.id);state.log.push({by:user.id,action:'forfeit',text:forfeitLine(state.fighters[user.id]?.name||user.username),round:state.round,damage:0});
  if(!state.order.some(uid=>alive(state,uid))){state.log.push({by:'boss',action:'wipe',damage:0});end(run,state,'wiped')}
  else if(run.turn_user_id===user.id)advance(run,state,user.id);
  else save(run,state,run.turn_user_id);
  return show(db.prepare('SELECT * FROM dungeon_runs WHERE id=?').get(run.id),user.id)
 });
 return{tick}
}
