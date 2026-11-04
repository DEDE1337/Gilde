/* Dungeons and raids. Dungeons: a host opens a lobby, up to five players join, the host starts; as many runs as you like,
   the first three of a Berlin day pay double (daily bonus).
   Raids are scheduled every day at 19:00 Berlin time for up to 25 players: sign-up opens at 18:00, the fight starts on its own.
   The party fights the bosses one after another, each player in join order, then the boss. Every boss that goes down pays XP and may drop
   an item from its own real loot table; the clear pays gold.
   Instances, bosses, boss levels and loot come from armory-items.json (WoW Classic data, see scripts/build-armory.mjs); the fight numbers are this game's own. */
import {randomInt} from 'node:crypto';
import {route,fail,now,id,rateLimit,notify} from './core.js';
import {fighterOf,resolveAction,drinkPotion,ready} from './duels.js';
import {ITEMS,DUNGEON_DATA,BASE_STATS,giveItem,bagFull} from './armory.js';
import {book,transaction,potionsOf} from './gold.js';
import {grantXp,levelBonus,progressOf,POTIONS,POTIONS_PER_DUEL} from './progression.js';
import {forfeitLine} from './sayings.js';
import {bumpTask} from './daily.js';

// What a lightly geared player of a level brings: base values, level bonus and about a third of the slots with green or blue items of the last ten levels.
// Bosses are measured against it, so a fair party of the instance's level wins most of the time, an underleveled one rarely.
// Bosses are measured against a player without gear (base values and level bonus), so a fresh character finds a way in;
// every item found makes the next run easier. DIFFICULTY lifts health and attack on top.
const typicalCache=new Map(),GEAR_SHARE=0,DIFFICULTY=1.1;
export function typicalPlayer(level){
 if(typicalCache.has(level))return typicalCache.get(level);
 const t={...BASE_STATS},bonus=levelBonus(level);for(const k of Object.keys(t))t[k]+=bonus[k]||0;
 const bySlot={};
 for(const i of Object.values(ITEMS)){const req=i.requiredLevel||0;if(!i.slot||i.retired||!['uncommon','rare'].includes(i.quality)||req>level||req<level-10)continue;(bySlot[['mainhand','onehand','twohand'].includes(i.slot)?'weapon':i.slot]||=[]).push(i)}
 for(const list of Object.values(bySlot)){
  const avg=fn=>list.reduce((a,i)=>a+fn(i),0)/list.length*GEAR_SHARE;
  t.leben+=avg(i=>i.game.leben);t.verteidigung+=avg(i=>i.game.verteidigung);t.angriff+=avg(i=>i.game.angriff+Math.max(i.stats?.str||0,i.stats?.agi||0,i.stats?.int||0));t.krit+=avg(i=>i.game.krit)
 }
 typicalCache.set(level,t);return t
}
// Boss values per party member (hp) or flat; end bosses and raid bosses hit harder and last longer. A raid with a single boss (Onyxia)
// has no wear-down from earlier fights, so that boss alone carries the whole raid.
const ROLE={dungeon:{hp:.7,angriff:1.05,verteidigung:1.5},end:{hp:1.05,angriff:1.3,verteidigung:2},raid:{hp:1.2,angriff:1.15,verteidigung:2},raidEnd:{hp:1.8,angriff:1.4,verteidigung:2.2},raidAlone:{hp:3,angriff:1.8,verteidigung:2.2}};
export function bossStats(kind,level,isEnd,alone){
 const t=typicalPlayer(level),r=ROLE[kind==='raid'?(alone?'raidAlone':isEnd?'raidEnd':'raid'):(isEnd?'end':'dungeon')];
 return{hp:Math.round(t.leben*r.hp*DIFFICULTY),angriff:Math.round(t.angriff*r.angriff*DIFFICULTY),verteidigung:Math.round(t.verteidigung*r.verteidigung),krit:Math.round((5+level/10)*10)/10}
}
// Rewards: XP per boss (WoW-style grey: next to nothing once you outlevel the instance by more than five), a loot roll per boss and member,
// gold for the clear. Loot is weighted by quality, so epics stay rare.
const DROP_CHANCE={dungeon:22,end:45,raid:30,raidEnd:60},QUALITY_WEIGHT={uncommon:10,rare:6,epic:2,legendary:.4};
export const bossXp=(dungeon,boss,isEnd)=>Math.round((10+boss.level*4)*(isEnd?2:1)*(dungeon.kind==='raid'?1.5:1));
export const clearGold=dungeon=>Math.round((15+dungeon.level*3)*(dungeon.kind==='raid'?3:1));
const xpFor=(dungeon,amount,playerLevel)=>playerLevel>dungeon.maxLevel+5?Math.round(amount*.1):amount;
// The recommended level follows the bosses (some wings have bosses well above the zone's range). A boss more than four levels above it
// (Avatar of Hakkar, 63 in a 54 instance) fights with the values of that limit plus 4 % health and attack per extra level, at most two (raids excepted).
export const DUNGEONS=DUNGEON_DATA.map(d=>{
 const avg=d.bosses.reduce((a,b)=>a+b.level,0)/d.bosses.length,level=d.kind==='raid'?d.level:Math.min(d.maxLevel,Math.max(d.level,Math.round(avg)-4));
 return{...d,level,bosses:d.bosses.map((b,i,all)=>{const cap=d.kind==='raid'?60:Math.min(d.maxLevel,level+4),st=bossStats(d.kind,Math.min(b.level,cap),i===all.length-1,all.length===1),over=d.kind==='raid'?1:1+.04*Math.min(2,Math.max(0,b.level-cap));return{...b,...st,hp:Math.round(st.hp*over),angriff:Math.round(st.angriff*over)}})}
});
// Dungeons have no daily limit: the first BONUS_RUNS of a day pay double gold and XP and drop more often. Raids stay once a day.
export const BONUS_RUNS=3,BONUS={gold:2,xp:2,drop:1.5};
const PARTY={dungeon:5,raid:25},PER_DAY={raid:1},TURN_MS={dungeon:45e3,raid:30e3},LOBBY_MS=2*3600e3,LOG_KEPT=60,BOSS_HEAL_BETWEEN=.3;
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
// The boss hits once per round whatever the party size, so its attack grows with the party.
// Measured with simulated parties (solo has no healer and takes every hit, so it gets the biggest discount).
const PARTY_SCALE=[0,.3,.6,1,1.15,1.35];
export const bossScale=(kind,players)=>kind==='raid'?Math.min(1.1,.5+players*.03):PARTY_SCALE[Math.min(5,Math.max(1,players))];
const makeBoss=(dungeon,index,players)=>{const b=dungeon.bosses[index];return{id:'boss',name:b.name,icon:b.icon,level:b.level,max:b.hp*players,hp:b.hp*players,angriff:Math.round(b.angriff*bossScale(dungeon.kind,players)),verteidigung:b.verteidigung,krit:b.krit,defending:false,shield:0,buff:0,stunned:false,turns:0}};
function dropFrom(boss){const pool=boss.loot.filter(id=>ITEMS[id]),total=pool.reduce((a,id)=>a+QUALITY_WEIGHT[ITEMS[id].quality],0);let pick=randomInt(Math.max(1,Math.round(total*10)))/10;for(const id of pool){if((pick-=QUALITY_WEIGHT[ITEMS[id].quality])<0)return id}return pool[0]}

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
  const dungeon=dungeonOf(run.dungeon),gold=clearGold(dungeon);
  for(const uid of state.order){
   if(state.left.includes(uid))continue;
   const paid=state.bonus?.[uid]?gold*BONUS.gold:gold;
   book(db,uid,paid,dungeon.kind,run.id);bumpTask(db,uid,'dungeon');
   // The log is cut to its last entries, so the run keeps every member's XP and drops in state.rewards.
   const got=state.rewards?.[uid]||{xp:0,items:[]},items=got.items.map(i=>ITEMS[i].name);
   state.log.push({by:uid,action:'loot',gold:paid,xp:got.xp,items,bonus:!!state.bonus?.[uid],damage:0});
   notify(db,uid,`${dungeon.name} geschafft! +${paid} Gold${items.length?`, Beute: ${items.join(', ')}`:''}.`,'dungeons','run-won:'+run.id+':'+uid)
  }
 }
 // A boss is down: every member still in gets its XP and a roll on that boss's own loot table.
 function bossLoot(run,state,dungeon){
  const index=state.bossIndex,boss=dungeon.bosses[index],isEnd=index===dungeon.bosses.length-1,chance=DROP_CHANCE[dungeon.kind==='raid'?(isEnd?'raidEnd':'raid'):(isEnd?'end':'dungeon')];
  for(const uid of state.order){
   if(state.left.includes(uid))continue;
   const extra=!!state.bonus?.[uid],f=state.fighters[uid],xp=xpFor(dungeon,bossXp(dungeon,boss,isEnd),f.characterId?progressOf(db,f.characterId).level:f.level)*(extra?BONUS.xp:1);
   let itemId=null;
   if(randomInt(100)<Math.min(100,chance*(extra?BONUS.drop:1))&&!bagFull(db,uid)){itemId=dropFrom(boss);giveItem(db,uid,itemId,'dungeon:'+dungeon.id)}
   const levelUp=grantXp(db,f.characterId,xp,dungeon.kind);bumpTask(db,uid,'boss');
   const got=((state.rewards||={})[uid]||={xp:0,items:[]});got.xp+=xp;if(itemId)got.items.push(itemId);
   state.log.push({by:uid,action:'drop',boss:boss.name,xp,bonus:extra,itemId,itemName:itemId?ITEMS[itemId].name:null,quality:itemId?ITEMS[itemId].quality:null,levelUp,damage:0})
  }
 }
 // After a player's move: next player, or the boss when everybody had a turn; then check for a downed boss or a wiped party.
 function advance(run,state,after){
  const dungeon=dungeonOf(run.dungeon);
  if(state.boss.hp<=0){
   state.log.push({by:'boss',action:'bossdown',name:state.boss.name,damage:0});
   bossLoot(run,state,dungeon);
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
  const bonus=dungeon.kind==='dungeon'?Object.fromEntries(list.filter(m=>runsToday(m.user_id,'dungeon')<BONUS_RUNS).map(m=>[m.user_id,true])):{};
  const state={bossIndex:0,boss:makeBoss(dungeon,0,list.length),fighters,bonus,order:list.map(m=>m.user_id),left:[],round:1,log:[{by:'boss',action:'bossup',name:dungeon.bosses[0].name,icon:dungeon.bosses[0].icon,damage:0}]};
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
  return{raids,dungeons:DUNGEONS.map(d=>({id:d.id,name:d.name,kind:d.kind,level:d.level,maxLevel:d.maxLevel,icon:d.icon,gold:clearGold(d),xp:d.bosses.reduce((a,b,i,all)=>a+bossXp(d,b,i===all.length-1),0),party:PARTY[d.kind],bosses:d.bosses.map((b,i,all)=>({name:b.name,icon:b.icon,level:b.level,dropChance:DROP_CHANCE[d.kind==='raid'?(i===all.length-1?'raidEnd':'raid'):(i===all.length-1?'end':'dungeon')],loot:b.loot}))})),
   runsLeft:{raid:Math.max(0,PER_DAY.raid-runsToday(user.id,'raid'))},bonusLeft:Math.max(0,BONUS_RUNS-runsToday(user.id,'dungeon')),bonusRuns:BONUS_RUNS,bonus:BONUS,perDay:PER_DAY,
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
