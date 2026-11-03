/* PvP duels: B accepts A's challenge, then both take turns (attack, strong attack, defend) with the values of their equipped gear.
   The server rolls every hit. A player who lets the turn timer run out attacks automatically, so no duel hangs forever. */
import {randomInt} from 'node:crypto';
import {route,fail,now,id,oneOf,rateLimit,notify} from './core.js';
import {statsOf} from './armory.js';
import {book,transaction} from './gold.js';

const TURN_MS=45e3,PENDING_MS=24*3600e3,OPEN_CHALLENGES=3,LOG_KEPT=40;
// Small reward, capped per day and per opponent, so two friends cannot farm gold by dueling each other in a loop.
export const DUEL_REWARD=25,REWARDS_PER_DAY=5;
const berlinDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const DAMAGE_SCALE=2.5,STRONG_HIT=70,STRONG_FACTOR=1.7,CRIT_FACTOR=1.5,DEFEND_HEAL=.05;

// One action. Returns the log entry; changes the fighters in place.
export function resolveAction(attacker,defender,action,rand=randomInt){
 if(action==='defend'){
  const heal=Math.min(attacker.max-attacker.hp,Math.round(attacker.max*DEFEND_HEAL));attacker.hp+=heal;attacker.defending=true;
  return{by:attacker.id,action,heal,damage:0,crit:false,miss:false}
 }
 if(action==='strong'&&rand(100)>=STRONG_HIT)return{by:attacker.id,action,damage:0,crit:false,miss:true};
 const crit=rand(1000)<attacker.krit*10,spread=85+rand(31);
 let damage=attacker.angriff*DAMAGE_SCALE*spread/100*100/(100+defender.verteidigung);
 if(action==='strong')damage*=STRONG_FACTOR;
 if(crit)damage*=CRIT_FACTOR;
 const blocked=defender.defending;if(blocked){damage/=2;defender.defending=false}
 damage=Math.max(1,Math.round(damage));defender.hp=Math.max(0,defender.hp-damage);
 return{by:attacker.id,action,damage,crit,miss:false,blocked}
}

export function registerDuelRoutes(db){
 const username=userId=>db.prepare('SELECT username FROM users WHERE id=?').get(userId)?.username||'?';
 const fighter=userId=>{const {character,stats}=statsOf(db,userId);return{id:userId,user:username(userId),name:character?[character.name,character.surname].filter(Boolean).join(' '):username(userId),classId:character?.class_id??null,race:character?.race??null,gender:character?.gender??0,...stats,max:stats.leben,hp:stats.leben,defending:false}};
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
  notify(db,loserId,`Duell verloren gegen ${username(winnerId)}.`,'duels','duel-end:'+duel.id);
 }
 function act(duel,userId,action){
  const state=JSON.parse(duel.state),me=state.fighters[userId],otherId=userId===duel.challenger_id?duel.opponent_id:duel.challenger_id,other=state.fighters[otherId];
  state.moves=(state.moves||0)+1;const entry=resolveAction(me,other,action);entry.round=Math.ceil(state.moves/2);state.log.push(entry);state.log=state.log.slice(-LOG_KEPT);
  if(other.hp<=0){finish(duel,state,userId);return}
  db.prepare('UPDATE duels SET state=?,turn_user_id=?,turn_deadline=?,updated_at=? WHERE id=?').run(JSON.stringify(state),otherId,Date.now()+TURN_MS,now(),duel.id)
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
   fighters:state?.fighters||null,log:state?.log||[],round:Math.ceil(((state?.moves)||0)/2)+1,winner:duel.winner_id,reward:duel.reward,createdAt:duel.created_at}
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
 route('POST','/api/duels/:id/action','member',({user,params,body})=>{
  rateLimit('duel-act:'+user.id,120,60e3);
  const action=oneOf(body.action,['attack','strong','defend'],'Aktion');
  const duel=settle(mine(db.prepare('SELECT * FROM duels WHERE id=?').get(params.id),user.id));
  if(duel.status!=='active')fail(409,'Das Duell ist vorbei.');
  if(duel.turn_user_id!==user.id)fail(409,'Du bist nicht am Zug.');
  act(duel,user.id,action);
  return show(db.prepare('SELECT * FROM duels WHERE id=?').get(duel.id),user.id)
 });
}
