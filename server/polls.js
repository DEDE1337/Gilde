/* Guild polls. Each poll is mirrored as a native Discord poll; webhooks only see vote counts, not voters, so totals add both sides. */
import {route,fail,text,int,oneOf,date,now,id,notify,CLASSES,RACES} from './core.js';
import {discordPoll,discordPollCounts} from './discord.js';

const UNDECIDED='Noch unentschlossen';
const KIND_OPTIONS={class:()=>[...Object.values(CLASSES),UNDECIDED],race:()=>[...Object.keys(RACES),UNDECIDED]};

export function registerPollRoutes(db){
 const isOpen=p=>!p.closed&&p.closes_at>now();
 const get=pid=>db.prepare('SELECT * FROM polls WHERE id=?').get(pid)||fail(404,'Umfrage nicht gefunden.');
 const view=(p,userId)=>{
  const options=JSON.parse(p.options_json),discord=p.discord_counts_json?JSON.parse(p.discord_counts_json):options.map(()=>0);
  const web=options.map((_,i)=>db.prepare('SELECT COUNT(*) n FROM poll_votes v JOIN users u ON u.id=v.user_id WHERE v.poll_id=? AND v.option_index=? AND u.hidden=0').get(p.id,i).n);
  return{id:p.id,question:p.question,kind:p.kind,options,multi:!!p.multi,popup:!!p.popup,open:isOpen(p),closesAt:p.closes_at,createdAt:p.created_at,
   web,discord,voters:db.prepare('SELECT COUNT(DISTINCT v.user_id) n FROM poll_votes v JOIN users u ON u.id=v.user_id WHERE v.poll_id=? AND u.hidden=0').get(p.id).n,
   mine:db.prepare('SELECT option_index FROM poll_votes WHERE poll_id=? AND user_id=? ORDER BY option_index').all(p.id,userId).map(r=>r.option_index),
   onDiscord:!!p.discord_ref,discordSyncedAt:p.discord_synced_at}
 };
 route('GET','/api/polls','member',({user})=>({polls:db.prepare('SELECT * FROM polls ORDER BY created_at DESC LIMIT 60').all().map(p=>view(p,user.id)).sort((a,b)=>b.open-a.open)}));
 route('POST','/api/polls','announce',async({user,body})=>{
  const kind=oneOf(body.kind??'text',['text','class','race'],'Art');
  const options=kind==='text'?(Array.isArray(body.options)?body.options:[]).filter(o=>typeof o==='string'&&o.trim()).map((o,i)=>text(o,`Antwort ${i+1}`,{min:1,max:55})):KIND_OPTIONS[kind]();
  if(options.length<2||options.length>10)fail(400,'Eine Umfrage braucht 2 bis 10 Antworten.');
  if(new Set(options.map(o=>o.toLowerCase())).size!==options.length)fail(400,'Jede Antwort darf nur einmal vorkommen.');
  const question=text(body.question,'Frage',{min:5,max:300}),closesAt=date(body.closesAt,'Ende'),hours=(new Date(closesAt)-Date.now())/36e5;
  if(hours<1||hours>768)fail(400,'Eine Umfrage läuft zwischen 1 Stunde und 32 Tagen.');
  const pid=id();
  db.prepare('INSERT INTO polls(id,question,options_json,kind,multi,popup,closes_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(pid,question,JSON.stringify(options),kind,body.multi?1:0,body.popup?1:0,closesAt,user.id,now());
  for(const u of db.prepare(`SELECT id FROM users WHERE status='active' AND id<>?`).all(user.id))notify(db,u.id,`Neue Umfrage: ${question}`,'polls','poll:'+pid);
  const ref=await discordPoll({question,options,hours:Math.ceil(hours),multi:!!body.multi});
  if(ref)db.prepare('UPDATE polls SET discord_ref=? WHERE id=?').run(ref,pid);
  return{id:pid,onDiscord:!!ref}
 });
 route('POST','/api/polls/:id/vote','member',({user,params,body})=>{
  const p=get(params.id);if(!isOpen(p))fail(409,'Diese Umfrage ist schon beendet.');
  const count=JSON.parse(p.options_json).length,picks=[...new Set((Array.isArray(body.options)?body.options:[]).map(v=>int(v,'Antwort',0,count-1)))];
  if(!picks.length)fail(400,'Bitte wähle eine Antwort.');if(!p.multi&&picks.length>1)fail(400,'Hier ist nur eine Antwort möglich.');
  db.prepare('DELETE FROM poll_votes WHERE poll_id=? AND user_id=?').run(p.id,user.id);
  for(const i of picks)db.prepare('INSERT INTO poll_votes VALUES (?,?,?,?)').run(p.id,user.id,i,now());
  return{poll:view(get(p.id),user.id)}
 });
 route('POST','/api/polls/:id/close','announce',({user,params})=>{const p=get(params.id);db.prepare('UPDATE polls SET closed=1 WHERE id=?').run(p.id);return{poll:view(get(p.id),user.id)}});
 route('DELETE','/api/polls/:id','announce',({params})=>{db.prepare('DELETE FROM polls WHERE id=?').run(get(params.id).id);return{ok:true}});
}

// Pulls Discord vote counts for polls that are running or ended less than a day ago.
export async function syncPolls(db){
 const since=new Date(Date.now()-864e5).toISOString();
 for(const p of db.prepare('SELECT id,options_json,discord_ref FROM polls WHERE discord_ref IS NOT NULL AND closes_at>?').all(since)){
  const counts=await discordPollCounts(p.discord_ref,JSON.parse(p.options_json).length);
  if(counts)db.prepare('UPDATE polls SET discord_counts_json=?,discord_synced_at=? WHERE id=?').run(JSON.stringify(counts),now(),p.id)
 }
}
