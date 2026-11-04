/* Daily tasks: three per player and Berlin day, picked from TASKS by a hash of player and day (the same three all day long).
   Other modules report progress through bumpTask; a finished task is claimed for gold and XP. Claiming all three on consecutive
   days builds a streak that adds 10 % per day to the rewards (at most +70 %). The rewards are this game's own numbers. */
import {createHash} from 'node:crypto';
import {route,fail} from './core.js';
import {book,transaction} from './gold.js';
import {grantXp,progressOf} from './progression.js';
import {characterOf} from './armory.js';

// mode max: progress is the best value of the day (tower floor), otherwise a count.
export const TASKS={
 boss:{text:'Besiege {n} Bosse in Instanzen',targets:[4,6,8]},
 dungeon:{text:'Schließe {n} Instanz ab',textMany:'Schließe {n} Instanzen ab',targets:[1,2]},
 tower:{text:'Schaffe {n} Etagen im Turm der Prüfungen',targets:[5,8,10],mode:'max'},
 gather:{text:'Sammle {n}-mal Materialien',targets:[5,8]},
 brew:{text:'Braue {n} Tränke',targets:[2,3]},
 duel:{text:'Kämpfe {n} Duell zu Ende',textMany:'Kämpfe {n} Duelle zu Ende',targets:[1,2]},
 chest:{text:'Öffne {n} Schatztruhe',textMany:'Öffne {n} Schatztruhen',targets:[1,2]}
};
export const TASKS_PER_DAY=3,STREAK_STEP=.1,STREAK_MAX=7;
const berlinDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const previousDay=day=>{const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10)};
export const taskReward=level=>({gold:60+level*3,xp:30+level*5});

// The three tasks of a day for a player, always the same for that pair.
export function pickTasks(userId,day){
 const keys=Object.keys(TASKS),h=createHash('sha256').update(userId+':'+day).digest(),out=[];
 for(let i=0;out.length<TASKS_PER_DAY&&i<32;i++){const k=keys[h[i]%keys.length];if(!out.some(t=>t.task===k))out.push({task:k,target:TASKS[k].targets[h[i+1]%TASKS[k].targets.length]})}
 return out
}
function ensure(db,userId,day=berlinDay()){
 if(db.prepare('SELECT 1 FROM daily_tasks WHERE user_id=? AND day=? LIMIT 1').get(userId,day))return;
 for(const t of pickTasks(userId,day))db.prepare('INSERT OR IGNORE INTO daily_tasks(user_id,day,task,target) VALUES (?,?,?,?)').run(userId,day,t.task,t.target)
}
// Progress from the game modules; never lets a request fail.
export function bumpTask(db,userId,task,amount=1){
 try{
  if(!TASKS[task]||!userId)return;const day=berlinDay();ensure(db,userId,day);
  if(TASKS[task].mode==='max')db.prepare('UPDATE daily_tasks SET progress=MAX(progress,?) WHERE user_id=? AND day=? AND task=?').run(amount,userId,day,task);
  else db.prepare('UPDATE daily_tasks SET progress=progress+? WHERE user_id=? AND day=? AND task=?').run(amount,userId,day,task)
 }catch(e){console.warn('Tagesaufgabe:',e.message)}
}
// Streak as it stands for today: yesterday's full set keeps it alive, an older one does not.
function streakOf(db,userId,day=berlinDay()){const s=db.prepare('SELECT last_day,streak FROM daily_streaks WHERE user_id=?').get(userId);return s&&(s.last_day===day||s.last_day===previousDay(day))?s.streak:0}

export function registerDailyRoutes(db){
 const view=userId=>{
  const day=berlinDay();ensure(db,userId,day);
  const character=characterOf(db,userId),level=character?progressOf(db,character.id).level:1,streak=streakOf(db,userId,day),factor=1+STREAK_STEP*Math.min(STREAK_MAX,streak),base=taskReward(level);
  const tasks=db.prepare('SELECT task,target,progress,claimed FROM daily_tasks WHERE user_id=? AND day=? ORDER BY rowid').all(userId,day).map(t=>({task:t.task,text:(t.target>1&&TASKS[t.task].textMany||TASKS[t.task].text).replace('{n}',t.target),target:t.target,progress:Math.min(t.progress,t.target),done:t.progress>=t.target,claimed:!!t.claimed}));
  return{day,tasks,streak,factor,reward:{gold:Math.round(base.gold*factor),xp:Math.round(base.xp*factor)},allClaimed:tasks.every(t=>t.claimed)}
 };
 route('GET','/api/daily','member',({user})=>view(user.id));
 route('POST','/api/daily/:task/claim','member',({user,params})=>{
  const day=berlinDay();ensure(db,user.id,day);
  const t=db.prepare('SELECT * FROM daily_tasks WHERE user_id=? AND day=? AND task=?').get(user.id,day,params.task)||fail(404,'Diese Aufgabe hast du heute nicht.');
  if(t.claimed)fail(409,'Schon abgeholt.');if(t.progress<t.target)fail(409,'Die Aufgabe ist noch nicht geschafft.');
  const v=view(user.id),character=characterOf(db,user.id);
  transaction(db,()=>{
   if(Number(db.prepare('UPDATE daily_tasks SET claimed=1 WHERE user_id=? AND day=? AND task=? AND claimed=0').run(user.id,day,t.task).changes)!==1)fail(409,'Schon abgeholt.');
   book(db,user.id,v.reward.gold,'daily',t.task);
   // The third claim of the day extends (or starts) the streak.
   if(!db.prepare('SELECT 1 FROM daily_tasks WHERE user_id=? AND day=? AND claimed=0').get(user.id,day))
    db.prepare('INSERT INTO daily_streaks(user_id,last_day,streak) VALUES (?,?,1) ON CONFLICT(user_id) DO UPDATE SET streak=CASE WHEN last_day=? THEN streak WHEN last_day=? THEN streak+1 ELSE 1 END,last_day=excluded.last_day').run(user.id,day,day,previousDay(day))
  });
  const levelUp=character?grantXp(db,character.id,v.reward.xp,'daily'):0;
  return{...view(user.id),claimedReward:v.reward,levelUp}
 });
}
