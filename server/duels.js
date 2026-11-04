/* PvP duels in the style of old monster games: B accepts A's challenge, then both take turns with four class abilities (limited uses per duel),
   potions from the bag or a defend move, using the values of their gear and level. The server rolls every hit.
   A player who lets the turn timer run out uses the basic attack, so no duel hangs forever. */
import {randomInt} from 'node:crypto';
import {route,fail,now,id,rateLimit,notify} from './core.js';
import {grantXp,XP,POTIONS,POTIONS_PER_DUEL} from './progression.js';
import {statsOf} from './armory.js';
import {book,transaction,potionsOf} from './gold.js';
import {forfeitLine} from './sayings.js';

const TURN_MS=45e3,PENDING_MS=24*3600e3,OPEN_CHALLENGES=3,LOG_KEPT=40;
// Small reward, capped per day and per opponent, so two friends cannot farm gold by dueling each other in a loop.
export const DUEL_REWARD=25,REWARDS_PER_DAY=5;
const berlinDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const DAMAGE_SCALE=2.5,STRONG_HIT=70,STRONG_FACTOR=1.7,CRIT_FACTOR=1.5,DEFEND_HEAL=.05;

const BUFF_CHARGES=2;
const healBy=(f,amount)=>{const heal=Math.min(f.max-f.hp,Math.round(amount));f.hp+=heal;return heal};
// One action. Returns the log entry; changes the fighters in place. Abilities are looked up on the attacker, unknown keys count as a normal attack.
export function resolveAction(attacker,defender,action,rand=randomInt){
 const ability=(attacker.abilities||[]).find(a=>a.key===action);
 const entry={by:attacker.id,action,damage:0,crit:false,miss:false,...(ability?{ability:ability.name,icon:ability.icon,kind:ability.kind}:{})};
 if(action==='defend'){entry.heal=healBy(attacker,attacker.max*DEFEND_HEAL);attacker.defending=true;return entry}
 if(ability?.kind==='heal'){entry.heal=healBy(attacker,attacker.max*ability.value*(1+(attacker.heilkraft||0)/100));return entry}
 if(ability?.kind==='shield'){attacker.shield=(attacker.shield||0)+Math.round(attacker.max*ability.value);entry.shield=attacker.shield;return entry}
 if(ability?.kind==='buff'){attacker.buff=BUFF_CHARGES;entry.buff=ability.value;return entry}
 if(action==='strong'&&rand(100)>=STRONG_HIT){entry.miss=true;return entry}
 // Dodge (from agility): the hit misses completely. Only rolled when the defender has any, so fights without it keep their dice.
 if(defender.ausweichen>0&&rand(1000)<defender.ausweichen*10){Object.assign(entry,{miss:true,dodged:true});return entry}
 const crit=rand(1000)<attacker.krit*10,spread=85+rand(31);
 let damage=attacker.angriff*DAMAGE_SCALE*spread/100*100/(100+defender.verteidigung);
 if(action==='strong')damage*=STRONG_FACTOR;
 if(ability)damage*=ability.value;
 if(attacker.buff>0){damage*=1.5;attacker.buff--;entry.empowered=true}
 if(crit)damage*=CRIT_FACTOR;
 const blocked=defender.defending;if(blocked){damage/=2;defender.defending=false}
 damage=Math.max(1,Math.round(damage));
 if(defender.shield>0){const absorbed=Math.min(defender.shield,damage);defender.shield-=absorbed;damage-=absorbed;entry.absorbed=absorbed}
 defender.hp=Math.max(0,defender.hp-damage);
 if(ability?.kind==='stun'&&defender.hp>0)defender.stunned=true;
 if(ability?.kind==='drain')entry.heal=healBy(attacker,damage/2);
 Object.assign(entry,{damage,crit,blocked,stun:ability?.kind==='stun'});
 return entry
}
// An ability is ready while it has uses left; null uses means unlimited (the basic attack of every class).
export const ready=(f,action)=>['attack','strong','defend'].includes(action)||!!(f.abilities||[]).find(a=>a.key===action&&(a.ppLeft===null||a.ppLeft>0));
// Potion effects; the bag count is checked and reduced in the database before this runs.
export function drinkPotion(f,potion){
 const entry={by:f.id,action:'potion',potion:potion.name,icon:potion.icon,damage:0};
 if(potion.key==='heal')entry.heal=healBy(f,f.max*.35);
 if(potion.key==='stone'){f.shield=(f.shield||0)+Math.round(f.max*.25);entry.shield=f.shield}
 if(potion.key==='mana'){for(const a of f.abilities||[])if(a.pp!==null)a.ppLeft=a.pp;entry.restored=true}
 return entry
}

// A fighter as both duels and dungeon runs use it: values of gear and level, abilities with uses, the look for the 3D model.
export function fighterOf(db,userId){
 const username=userId=>db.prepare('SELECT username FROM users WHERE id=?').get(userId)?.username||'?';
 const {character,stats,progress,abilities,gear}=statsOf(db,userId);return{id:userId,characterId:character?.id??null,user:username(userId),name:character?[character.name,character.surname].filter(Boolean).join(' '):username(userId),classId:character?.class_id??null,race:character?.race??null,gender:character?.gender??0,level:progress.level,...stats,max:stats.leben,hp:stats.leben,defending:false,shield:0,buff:0,stunned:false,potionsUsed:0,model:{appearance:JSON.parse(character?.appearance_json||'{}'),gear},abilities:abilities.map(({key,name,icon,kind,value,pp,text,unlocked,unlockLevel})=>({key,name,icon,kind,value,pp,ppLeft:pp,text,unlocked,unlockLevel}))}
}
export function registerDuelRoutes(db){
 const username=userId=>db.prepare('SELECT username FROM users WHERE id=?').get(userId)?.username||'?';
 const fighter=userId=>fighterOf(db,userId);
 const rewardedToday=(userId,day)=>db.prepare(`SELECT COUNT(*) n FROM gold_ledger WHERE user_id=? AND reason='duel' AND substr(ref,1,10)=?`).get(userId,day).n;

 function finish(duel,state,winnerId){
  const loserId=winnerId===duel.challenger_id?duel.opponent_id:duel.challenger_id,day=berlinDay();
  // Reward only if the winner has rewards left today and this pair has not paid out today yet.
  const paidPair=db.prepare(`SELECT 1 FROM gold_ledger g JOIN duels d ON d.id=substr(g.ref,12) WHERE g.reason='duel' AND substr(g.ref,1,10)=? AND ((d.challenger_id=? AND d.opponent_id=?) OR (d.challenger_id=? AND d.opponent_id=?))`).get(day,duel.challenger_id,duel.opponent_id,duel.opponent_id,duel.challenger_id);
  const reward=!paidPair&&rewardedToday(winnerId,day)<REWARDS_PER_DAY?DUEL_REWARD:0;
  transaction(db,()=>{
   db.prepare(`UPDATE duels SET status='done',state=?,winner_id=?,reward=?,turn_user_id=NULL,turn_deadline=NULL,updated_at=? WHERE id=? AND status='active'`).run(JSON.stringify(state),winnerId,reward,now(),duel.id);
   if(reward)book(db,winnerId,reward,'duel',day+':'+duel.id)
  });
  grantXp(db,state.fighters[winnerId]?.characterId,XP.duelWin,'duel-win');grantXp(db,state.fighters[loserId]?.characterId,XP.duelLoss,'duel-loss');
  notify(db,loserId,`Duell verloren gegen ${username(winnerId)}.`,'duels','duel-end:'+duel.id);
 }
 function act(duel,userId,action){
  const state=JSON.parse(duel.state),me=state.fighters[userId],otherId=userId===duel.challenger_id?duel.opponent_id:duel.challenger_id,other=state.fighters[otherId];
  // 'attack' (also the timeout move) is the class's basic ability; locked or used-up abilities fall back to it.
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
   entry=resolveAction(me,other,action)
  }
  state.moves=(state.moves||0)+1;entry.round=Math.ceil(state.moves/2);state.log.push(entry);
  if(other.hp<=0){state.log=state.log.slice(-LOG_KEPT);finish(duel,state,userId);return}
  // A stunned fighter loses the next turn: it is logged and the turn comes straight back.
  let next=otherId;
  if(other.stunned){other.stunned=false;state.moves++;state.log.push({by:otherId,action:'stunned',round:Math.ceil(state.moves/2),damage:0});next=userId}
  state.log=state.log.slice(-LOG_KEPT);
  db.prepare('UPDATE duels SET state=?,turn_user_id=?,turn_deadline=?,updated_at=? WHERE id=?').run(JSON.stringify(state),next,Date.now()+TURN_MS,now(),duel.id)
 }
 // Lazily applies what the clock decided: expired challenges and missed turns.
 function settle(duel){
  for(let guard=0;duel&&guard<200;guard++){
   if(duel.status==='pending'&&Date.parse(duel.created_at)+PENDING_MS<Date.now()){db.prepare(`UPDATE duels SET status='expired',updated_at=? WHERE id=?`).run(now(),duel.id)}
   else if(duel.status==='active'&&duel.turn_deadline<Date.now()){act(duel,duel.turn_user_id,'attack')}
   else return duel;
   duel=db.prepare('SELECT * FROM duels WHERE id=?').get(duel.id)
  }
  return duel
 }
 const mine=(duel,userId)=>duel&&(duel.challenger_id===userId||duel.opponent_id===userId)?duel:fail(404,'Dieses Duell gibt es nicht.');
 const show=(duel,userId)=>{
  const state=duel.state?JSON.parse(duel.state):null;
  return{id:duel.id,status:duel.status,challenger:{id:duel.challenger_id,user:username(duel.challenger_id)},opponent:{id:duel.opponent_id,user:username(duel.opponent_id)},
   you:userId,yourTurn:duel.turn_user_id===userId,turnUser:duel.turn_user_id,turnLeft:duel.turn_deadline?Math.max(0,duel.turn_deadline-Date.now()):null,
   fighters:state?.fighters||null,potions:potionsOf(db,userId),potionsPerDuel:POTIONS_PER_DUEL,log:state?.log||[],round:Math.ceil(((state?.moves)||0)/2)+1,winner:duel.winner_id,reward:duel.reward,createdAt:duel.created_at}
 };

 route('GET','/api/duels','member',({user})=>{
  const rows=db.prepare(`SELECT * FROM duels WHERE (challenger_id=? OR opponent_id=?) AND status IN ('pending','active') ORDER BY created_at`).all(user.id,user.id).map(settle);
  const recent=db.prepare(`SELECT * FROM duels WHERE (challenger_id=? OR opponent_id=?) AND status IN ('done','declined','expired') ORDER BY updated_at DESC LIMIT 10`).all(user.id,user.id);
  const ranking=db.prepare(`SELECT u.id,u.username,
    (SELECT COUNT(*) FROM duels d WHERE d.status='done' AND d.winner_id=u.id) wins,
    (SELECT COUNT(*) FROM duels d WHERE d.status='done' AND d.winner_id<>u.id AND (d.challenger_id=u.id OR d.opponent_id=u.id)) losses
   FROM users u WHERE u.status='active' AND u.hidden=0`).all().filter(r=>r.wins+r.losses>0)
   .map(r=>({username:r.username,own:r.id===user.id,wins:r.wins,losses:r.losses,rate:Math.round(r.wins/(r.wins+r.losses)*100)}))
   .sort((a,b)=>b.wins-a.wins||b.rate-a.rate||a.losses-b.losses);
  const players=db.prepare(`SELECT u.id,u.username FROM users u WHERE u.status='active' AND u.hidden=0 AND u.id<>? AND EXISTS (SELECT 1 FROM characters c WHERE c.user_id=u.id) ORDER BY u.username`).all(user.id)
   .map(p=>{const f=fighter(p.id);return{id:p.id,username:p.username,name:f.name,classId:f.classId}});
  return{duels:rows.filter(d=>d&&['pending','active'].includes(d.status)).map(d=>show(d,user.id)),recent:recent.map(d=>show(d,user.id)),ranking,players,rewardsLeft:Math.max(0,REWARDS_PER_DAY-rewardedToday(user.id,berlinDay())),reward:DUEL_REWARD}
 });
 route('GET','/api/duels/:id','member',({user,params})=>show(settle(mine(db.prepare('SELECT * FROM duels WHERE id=?').get(params.id),user.id)),user.id));
 route('POST','/api/duels','member',({user,body})=>{
  rateLimit('duel:'+user.id,20,60e3);
  const opponent=db.prepare(`SELECT id,username FROM users WHERE id=? AND status='active'`).get(String(body.opponentId||''))||fail(404,'Diesen Spieler gibt es nicht.');
  if(opponent.id===user.id)fail(400,'Gegen dich selbst kannst du nicht antreten.');
  if(!statsOf(db,user.id).character)fail(400,'Leg erst einen Charakter an.');
  if(!statsOf(db,opponent.id).character)fail(400,`${opponent.username} hat noch keinen Charakter.`);
  if(db.prepare(`SELECT 1 FROM duels WHERE status IN ('pending','active') AND ((challenger_id=? AND opponent_id=?) OR (challenger_id=? AND opponent_id=?))`).get(user.id,opponent.id,opponent.id,user.id))fail(409,'Mit diesem Spieler läuft schon ein Duell.');
  if(db.prepare(`SELECT COUNT(*) n FROM duels WHERE challenger_id=? AND status='pending'`).get(user.id).n>=OPEN_CHALLENGES)fail(400,`Mehr als ${OPEN_CHALLENGES} offene Herausforderungen gehen nicht.`);
  const did=id();db.prepare('INSERT INTO duels(id,challenger_id,opponent_id,created_at,updated_at) VALUES (?,?,?,?,?)').run(did,user.id,opponent.id,now(),now());
  notify(db,opponent.id,`${user.username} fordert dich zum Duell heraus!`,'duels','duel:'+did);
  return{id:did}
 });
 route('POST','/api/duels/:id/accept','member',({user,params})=>{
  const duel=settle(mine(db.prepare('SELECT * FROM duels WHERE id=?').get(params.id),user.id));
  if(duel.opponent_id!==user.id)fail(403,'Nur der Herausgeforderte kann annehmen.');
  if(duel.status!=='pending')fail(409,'Diese Herausforderung ist nicht mehr offen.');
  // Values are frozen at the start: changing gear mid-fight changes nothing.
  const state={moves:0,fighters:{[duel.challenger_id]:fighter(duel.challenger_id),[duel.opponent_id]:fighter(duel.opponent_id)},log:[]};
  const first=randomInt(2)?duel.challenger_id:duel.opponent_id;
  if(Number(db.prepare(`UPDATE duels SET status='active',state=?,turn_user_id=?,turn_deadline=?,updated_at=? WHERE id=? AND status='pending'`).run(JSON.stringify(state),first,Date.now()+TURN_MS,now(),duel.id).changes)!==1)fail(409,'Diese Herausforderung ist nicht mehr offen.');
  notify(db,duel.challenger_id,`${user.username} hat dein Duell angenommen. Auf in den Kampf!`,'duels','duel-go:'+duel.id);
  return show(db.prepare('SELECT * FROM duels WHERE id=?').get(duel.id),user.id)
 });
 route('POST','/api/duels/:id/decline','member',({user,params})=>{
  const duel=settle(mine(db.prepare('SELECT * FROM duels WHERE id=?').get(params.id),user.id));
  if(duel.status!=='pending')fail(409,'Diese Herausforderung ist nicht mehr offen.');
  db.prepare(`UPDATE duels SET status='declined',updated_at=? WHERE id=?`).run(now(),duel.id);return{ok:true}
 });
 route('POST','/api/duels/:id/forfeit','member',({user,params})=>{
  const duel=settle(mine(db.prepare('SELECT * FROM duels WHERE id=?').get(params.id),user.id));
  if(duel.status!=='active')fail(409,'Das Duell ist vorbei.');
  const state=JSON.parse(duel.state),winner=user.id===duel.challenger_id?duel.opponent_id:duel.challenger_id;
  state.moves=(state.moves||0)+1;state.log.push({by:user.id,action:'forfeit',text:forfeitLine(state.fighters[user.id]?.name||user.username),round:Math.ceil(state.moves/2),damage:0});
  finish(duel,state,winner);
  return show(db.prepare('SELECT * FROM duels WHERE id=?').get(duel.id),user.id)
 });
 route('POST','/api/duels/:id/action','member',({user,params,body})=>{
  rateLimit('duel-act:'+user.id,120,60e3);
  const action=String(body.action||'').slice(0,40);
  const duel=settle(mine(db.prepare('SELECT * FROM duels WHERE id=?').get(params.id),user.id));
  if(duel.status!=='active')fail(409,'Das Duell ist vorbei.');
  if(duel.turn_user_id!==user.id)fail(409,'Du bist nicht am Zug.');
  const f=JSON.parse(duel.state).fighters[user.id];
  if(action.startsWith('potion:')){
   const potion=POTIONS[action.slice(7)]||fail(400,'Diesen Trank gibt es nicht.');
   if((f.potionsUsed||0)>=POTIONS_PER_DUEL)fail(409,`Mehr als ${POTIONS_PER_DUEL} Tränke pro Duell gehen nicht.`);
   if(!(potionsOf(db,user.id)[potion.key]>0))fail(409,`Du hast keinen ${potion.name} mehr.`)
  }else if(!['attack','strong','defend'].includes(action)){
   const a=(f.abilities||[]).find(x=>x.key===action)||fail(400,'Diese Aktion kennst du nicht.');
   if(a.unlocked===false)fail(409,`${a.name} lernst du erst auf Stufe ${a.unlockLevel}.`);
   if(a.ppLeft!==null&&a.ppLeft<=0)fail(409,`${a.name} ist aufgebraucht. Ein Manatrank lädt sie wieder auf.`)
  }
  act(duel,user.id,action);
  return show(db.prepare('SELECT * FROM duels WHERE id=?').get(duel.id),user.id)
 });
}
