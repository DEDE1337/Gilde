/* Daily bonus: three server-decided slot spins per Berlin calendar day. Guild gold is a site-only score, never money or in-game gold. */
import {randomInt} from 'node:crypto';
import {discord,berlinTime} from './discord.js';
import {route,fail,now,id,int,oneOf,rateLimit,publicCharacter,can} from './core.js';
import {blackjackNet,registerBlackjackRoutes} from './blackjack.js';
import {balanceOf as goldBalance} from './gold.js';

export const SYMBOLS=[
 {id:'bandage',name:'Verband',icon:'inv_misc_bandage_09',quality:'poor',value:2,weight:44},
 {id:'pelt',name:'Wolfspelz',icon:'inv_misc_pelt_wolf_02',quality:'poor',value:3,weight:40},
 {id:'bag',name:'Beutel',icon:'inv_misc_bag_08',quality:'common',value:5,weight:32},
 {id:'boots',name:'Stiefel',icon:'inv_boots_05',quality:'common',value:8,weight:26},
 {id:'gloves',name:'Handschuhe',icon:'inv_gauntlets_17',quality:'uncommon',value:12,weight:18},
 {id:'shield',name:'Schild',icon:'inv_shield_04',quality:'uncommon',value:18,weight:14},
 {id:'helmet',name:'Helm',icon:'inv_helmet_03',quality:'rare',value:30,weight:10},
 {id:'sword',name:'Schwert',icon:'inv_sword_41',quality:'rare',value:45,weight:7},
 {id:'ring',name:'Ring',icon:'inv_jewelry_ring_09',quality:'epic',value:80,jackpot:30},
 {id:'staff',name:'Stab',icon:'inv_staff_27',quality:'epic',value:120,jackpot:15},
 {id:'talisman',name:'Talisman',icon:'inv_jewelry_talisman_06',quality:'legendary',value:250,jackpot:5}
];
export const ROLLS_PER_DAY=3;
const STREAK_STEP=2,STREAK_CAP=7,PAIR_MULTIPLIER=2,TRIPLE_MULTIPLIER=3,JACKPOT_ROLLS=1000;
const NORMAL=SYMBOLS.filter(s=>s.weight),TOTAL=NORMAL.reduce((a,s)=>a+s.weight,0);
const publicSymbol=({id,name,icon,quality,value,jackpot})=>({id,name,icon,quality,value,jackpotPercent:jackpot?jackpot/10:null});
export const berlinDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const previousDay=day=>new Date(Date.parse(day+'T12:00:00Z')-864e5).toISOString().slice(0,10);
function drawSymbol(){let roll=randomInt(TOTAL);for(const s of NORMAL){if((roll-=s.weight)<0)return s}return NORMAL[0]}
/* Epic and legendary items never show up alone: they are a separate roll that fills all three reels. */
export function spinReels(){let roll=randomInt(JACKPOT_ROLLS);for(const s of SYMBOLS){if(s.jackpot&&(roll-=s.jackpot)<0)return[s,s,s]}return[drawSymbol(),drawSymbol(),drawSymbol()]}
export function payout(reels){
 const sum=reels.reduce((a,s)=>a+s.value,0),[a,b,c]=reels,triple=a.id===b.id&&b.id===c.id,pair=!triple&&(a.id===b.id||a.id===c.id?a:b.id===c.id?b:null),multiplier=triple?TRIPLE_MULTIPLIER:pair?PAIR_MULTIPLIER:1;
 return{sum,multiplier,base:sum*multiplier,kind:triple?'triple':pair?'pair':'none',symbol:triple?a.name:pair?pair.name:null}
}
const RED_NUMBERS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const ROULETTE_MULTIPLIER={red:2,black:2,green:36},ROULETTE_HISTORY=15;
export const rouletteColor=n=>n===0?'green':RED_NUMBERS.has(n)?'red':'black';
export const roulettePayout=(bet,amount,number)=>rouletteColor(number)===bet?amount*ROULETTE_MULTIPLIER[bet]:0;
function longestStreak(days){let best=0,run=0,last=null;for(const day of [...new Set(days)].sort()){run=last&&previousDay(day)===last?run+1:1;best=Math.max(best,run);last=day}return best}
export function registerBonusRoutes(db){
 const streakUntil=(userId,day)=>{const days=new Set(db.prepare('SELECT day FROM daily_spins WHERE user_id=?').all(userId).map(r=>r.day));let n=0;for(let d=day;days.has(d);d=previousDay(d))n++;return n};
 const balanceOf=userId=>goldBalance(db,userId);
 registerBlackjackRoutes(db,balanceOf);
 const lastNumbers=()=>db.prepare('SELECT number FROM roulette_rounds ORDER BY created_at DESC,rowid DESC LIMIT ?').all(ROULETTE_HISTORY).map(r=>({number:r.number,color:rouletteColor(r.number)}));
 const view=(userId,freeSpins)=>{
  const today=berlinDay(),rows=db.prepare('SELECT reels,reward,streak FROM daily_spins WHERE user_id=? AND day=? ORDER BY roll').all(userId,today),row=rows.at(-1),rollsLeft=Math.max(0,ROLLS_PER_DAY-rows.length);
  return{symbols:SYMBOLS.map(publicSymbol),today,rollsLeft,rollsPerDay:ROLLS_PER_DAY,todayWon:rows.reduce((a,r)=>a+r.reward,0),canRespin:freeSpins&&!rollsLeft,spin:row?{reels:JSON.parse(row.reels),reward:row.reward}:null,streak:streakUntil(userId,row?today:previousDay(today)),balance:balanceOf(userId),history:db.prepare('SELECT day,reward,streak FROM daily_spins WHERE user_id=? ORDER BY day DESC,roll DESC LIMIT 7').all(userId)}
 };
 route('GET','/api/bonus','member',({user})=>view(user.id,can(user,'freespins')));
 route('POST','/api/bonus/spin','member',({user})=>{
  rateLimit('spin:'+user.id,30,60e3);
  const today=berlinDay(),done=db.prepare('SELECT COUNT(*) n FROM daily_spins WHERE user_id=? AND day=?').get(user.id,today).n,spent=done>=ROLLS_PER_DAY;
  if(spent&&!can(user,'freespins'))fail(409,'Deine drei Drehs für heute sind verbraucht.');
  const reels=spinReels(),win=payout(reels),items=reels.map(publicSymbol);
  if(spent)return{...view(user.id,can(user,'freespins')),result:{...win,items,reward:win.base,streakBonus:0,free:true}};
  // The streak bonus comes with the first roll of the day only; the primary key (user, day, roll) stops a fourth free roll even if two requests race.
  const streak=streakUntil(user.id,previousDay(today))+1,roll=done+1,reward=win.base+(roll===1?Math.min(streak,STREAK_CAP)*STREAK_STEP:0);
  db.prepare('INSERT INTO daily_spins(user_id,day,roll,reels,reward,streak,created_at) VALUES (?,?,?,?,?,?,?)').run(user.id,today,roll,JSON.stringify(reels.map(r=>r.id)),reward,streak,now());
  if(win.kind==='triple'&&reels[0].jackpot)discord('spielunke',{title:`${reels[0].quality==='legendary'?'🟠 LEGENDÄR':'🟣 Episch'}: ${win.symbol} ×3!`,text:`**${user.username}** hat am Automaten dreimal ${win.symbol} gezogen: **+${reward} Gildengold**`,color:reels[0].quality==='legendary'?0xff8000:0xa335ee});
  return{...view(user.id,can(user,'freespins')),result:{...win,items,reward,streakBonus:reward-win.base,free:false}}
 });
 route('GET','/api/roulette','member',({user})=>({balance:balanceOf(user.id),last:lastNumbers(),multipliers:ROULETTE_MULTIPLIER}));
 route('POST','/api/roulette/spin','member',({user,body})=>{
  rateLimit('roulette:'+user.id,30,60e3);
  const color=oneOf(body.color,['red','black','green'],'Farbe'),balance=balanceOf(user.id);
  if(balance<1)fail(400,'Du hast kein Gildengold mehr.');
  const amount=int(body.amount,'Einsatz',1,balance),number=randomInt(37),payout=roulettePayout(color,amount,number);
  db.prepare('INSERT INTO roulette_rounds(id,user_id,bet_color,amount,number,payout,created_at) VALUES (?,?,?,?,?,?,?)').run(id(),user.id,color,amount,number,payout,now());
  return{number,color:rouletteColor(number),won:payout>0,payout,amount,balance:balanceOf(user.id),last:lastNumbers()}
 });
 route('GET','/api/rankings','member',({user})=>{
  const today=berlinDay(),weekStart=berlinDay(new Date(Date.now()-6*864e5));
  const players=db.prepare(`SELECT u.id,u.username,u.guild_rank,u.main_character_id FROM users u WHERE u.status='active' AND u.hidden=0 AND EXISTS (SELECT 1 FROM daily_spins s WHERE s.user_id=u.id)`).all().map(u=>{
   const spins=db.prepare('SELECT day,reward FROM daily_spins WHERE user_id=?').all(u.id),character=publicCharacter(db.prepare('SELECT * FROM characters WHERE id=?').get(u.main_character_id));
   return{username:u.username,guildRank:u.guild_rank,character,own:u.id===user.id,total:balanceOf(u.id),roulette:db.prepare('SELECT COALESCE(SUM(payout-amount),0) n FROM roulette_rounds WHERE user_id=?').get(u.id).n,blackjack:blackjackNet(db,u.id),week:spins.filter(s=>s.day>=weekStart&&s.day<=today).reduce((a,s)=>a+s.reward,0),best:Math.max(...spins.map(s=>s.reward)),streak:longestStreak(spins.map(s=>s.day)),spins:spins.length}
  });
  return{players}
 });
}
