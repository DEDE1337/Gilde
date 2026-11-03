/* Raid planner, boss kills, progress and the Hall of Fame. Raids mirror into guild_events for the calendar. */
import {discord,berlinTime} from './discord.js';
import {route,fail,text,int,oneOf,date,now,id,can,notify,characterOwned,publicCharacter,needUpload} from './core.js';

const STATUS=['planned','open','closed','done','cancelled'],SIGNUP=['signed','confirmed','bench','withdrawn','unavailable'],ROLES=['tank','heal','dps'];
const STATUS_NAMES={planned:'Geplant',open:'Anmeldung geöffnet',closed:'Anmeldung geschlossen',done:'Abgeschlossen',cancelled:'Abgesagt'};
const HALL=['firstkill','raid','event','mount','character','anniversary','milestone'];
const manages=(user,raid)=>can(user,'raids')||raid.leader_id===user.id;

export function registerRaidRoutes(db){
 const getRaid=rid=>db.prepare('SELECT * FROM raids WHERE id=?').get(rid)||fail(404,'Raid nicht gefunden.');
 const members=raidId=>db.prepare(`SELECT DISTINCT c.user_id FROM raid_signups s JOIN characters c ON c.id=s.character_id WHERE s.raid_id=? AND s.status NOT IN ('withdrawn','unavailable')`).all(raidId).map(r=>r.user_id);
 const tellRaid=(raid,message,key)=>{for(const u of members(raid.id))notify(db,u,`${raid.name}: ${message}`,'raid:'+raid.id,`raid:${raid.id}:${key}`)};
 const syncCalendar=raid=>{
  const event=db.prepare('SELECT id FROM guild_events WHERE raid_id=?').get(raid.id),desc=`${STATUS_NAMES[raid.status]}. ${raid.description}`.trim().slice(0,3000);
  if(raid.status==='cancelled'){if(event)db.prepare('DELETE FROM guild_events WHERE id=?').run(event.id);return}
  if(event)db.prepare('UPDATE guild_events SET title=?,starts_at=?,duration=?,description=? WHERE id=?').run(raid.name,raid.starts_at,raid.duration,desc,event.id);
  else db.prepare(`INSERT INTO guild_events(id,title,starts_at,duration,category,description,created_at,raid_id) VALUES (?,?,?,?,'raid',?,?,?)`).run(id(),raid.name,raid.starts_at,raid.duration,desc,now(),raid.id)
 };
 const raidFields=body=>{
  const instance=db.prepare('SELECT id FROM raid_instances WHERE id=?').get(String(body.instanceId))||fail(400,'Instanz ist ungültig.');
  const maxPlayers=int(body.maxPlayers,'Spielerzahl',1,40),tank=int(body.needTank,'Tanks',0,40),heal=int(body.needHeal,'Heiler',0,40),dps=int(body.needDps,'Schaden',0,40);
  if(tank+heal+dps>maxPlayers)fail(400,'Der Rollenbedarf übersteigt die Spielerzahl.');
  return{name:text(body.name,'Raidname',{min:3,max:80}),instanceId:instance.id,startsAt:date(body.startsAt,'Start'),duration:int(body.duration,'Dauer',15,1440),maxPlayers,tank,heal,dps,minLevel:int(body.minLevel??60,'Mindestlevel',1,60),description:text(body.description??'','Beschreibung',{max:3000}),status:oneOf(body.status??'planned',STATUS,'Status'),leaderId:(db.prepare(`SELECT id FROM users WHERE id=? AND status='active'`).get(String(body.leaderId))||fail(400,'Raidleiter ist ungültig.')).id}
 };
 route('GET','/api/raid-instances','public',()=>({instances:db.prepare('SELECT * FROM raid_instances').all().map(i=>({...i,bosses:db.prepare('SELECT id,name,confirmed FROM raid_bosses WHERE instance_id=? ORDER BY sort').all(i.id)}))}));
 route('POST','/api/raid-instances/:id/bosses','kills',({params,body})=>{const inst=db.prepare('SELECT * FROM raid_instances WHERE id=?').get(params.id)||fail(404,'Instanz nicht gefunden.');const n=db.prepare('SELECT COUNT(*) n FROM raid_bosses WHERE instance_id=?').get(inst.id).n;if(n>=inst.boss_count)fail(400,'Für diese Instanz sind alle Bosse eingetragen.');const bid=id();db.prepare('INSERT INTO raid_bosses(id,instance_id,name,sort,confirmed) VALUES (?,?,?,?,1)').run(bid,inst.id,text(body.name,'Bossname',{min:2,max:60}),n+1);return{id:bid}});
 route('GET','/api/raids','member',()=>({raids:db.prepare(`SELECT r.*,u.username leader,i.name instance FROM raids r JOIN users u ON u.id=r.leader_id JOIN raid_instances i ON i.id=r.instance_id ORDER BY r.starts_at DESC LIMIT 200`).all().map(r=>({...r,counts:Object.fromEntries(ROLES.map(role=>[role,db.prepare(`SELECT COUNT(*) n FROM raid_signups WHERE raid_id=? AND role=? AND status IN ('signed','confirmed')`).get(r.id,role).n]))}))}));
 route('GET','/api/raids/:id','member',({params})=>{
  const raid=db.prepare(`SELECT r.*,u.username leader,i.name instance FROM raids r JOIN users u ON u.id=r.leader_id JOIN raid_instances i ON i.id=r.instance_id WHERE r.id=?`).get(params.id)||fail(404,'Raid nicht gefunden.');
  return{raid,signups:db.prepare(`SELECT s.*,c.user_id,c.name,c.class_id,c.race,c.level,c.spec FROM raid_signups s JOIN characters c ON c.id=s.character_id WHERE s.raid_id=? ORDER BY s.updated_at`).all(raid.id).map(s=>({id:s.id,role:s.role,status:s.status,comment:s.comment,userId:s.user_id,character:publicCharacter(s)})),bosses:db.prepare('SELECT id,name,confirmed FROM raid_bosses WHERE instance_id=? ORDER BY sort').all(raid.instance_id)}
 });
 route('POST','/api/raids','raids',({body})=>{
  const f=raidFields(body),rid=id();
  db.prepare('INSERT INTO raids(id,name,instance_id,starts_at,duration,max_players,need_tank,need_heal,need_dps,min_level,description,leader_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(rid,f.name,f.instanceId,f.startsAt,f.duration,f.maxPlayers,f.tank,f.heal,f.dps,f.minLevel,f.description,f.leaderId,f.status,now());
  syncCalendar(getRaid(rid));
  if(f.status!=='cancelled'){const inst=db.prepare('SELECT name FROM raid_instances WHERE id=?').get(f.instanceId);discord('raids',{title:'⚔️ Neuer Raid: '+f.name,text:`**${inst?.name||f.instanceId}** · ${berlinTime(f.startsAt)} · ${f.duration} Min.\nGesucht: ${f.tank} Tanks, ${f.heal} Heiler, ${f.dps} DPS · ab Level ${f.minLevel}\nAnmelden auf der Website unter Raids.`,color:0xff7a1a})}
  return{id:rid}
 });
 route('PUT','/api/raids/:id','member',({user,params,body})=>{
  const old=getRaid(params.id);if(!manages(user,old))fail(403,'Nur der Raidleiter oder ein Offizier darf das.');
  const f=raidFields(body);
  db.prepare('UPDATE raids SET name=?,instance_id=?,starts_at=?,duration=?,max_players=?,need_tank=?,need_heal=?,need_dps=?,min_level=?,description=?,leader_id=?,status=? WHERE id=?').run(f.name,f.instanceId,f.startsAt,f.duration,f.maxPlayers,f.tank,f.heal,f.dps,f.minLevel,f.description,f.leaderId,f.status,old.id);
  const raid=getRaid(old.id);syncCalendar(raid);
  if(old.starts_at!==raid.starts_at)tellRaid(raid,'Der Termin wurde verschoben.','moved:'+raid.starts_at);
  if(old.status!==raid.status)tellRaid(raid,`Status: ${STATUS_NAMES[raid.status]}.`,'status:'+raid.status);
  return{ok:true}
 });
 route('POST','/api/raids/:id/signups','member',({user,params,body})=>{
  const raid=getRaid(params.id),c=characterOwned(db,user,String(body.characterId)),role=oneOf(body.role,ROLES,'Rolle'),wanted=oneOf(body.status??'signed',['signed','bench','withdrawn','unavailable'],'Anmeldestatus');
  if(raid.status!=='open'&&wanted==='signed')fail(400,'Die Anmeldung für diesen Raid ist nicht geöffnet.');
  if(c.level<raid.min_level&&wanted==='signed')fail(400,`Dieser Raid verlangt mindestens Level ${raid.min_level}.`);
  const old=db.prepare('SELECT id FROM raid_signups WHERE raid_id=? AND character_id=?').get(raid.id,c.id),comment=text(body.comment??'','Kommentar',{max:300});
  if(old)db.prepare('UPDATE raid_signups SET role=?,status=?,comment=?,updated_at=? WHERE id=?').run(role,wanted,comment,now(),old.id);
  else db.prepare('INSERT INTO raid_signups(id,raid_id,character_id,role,status,comment,updated_at) VALUES (?,?,?,?,?,?,?)').run(id(),raid.id,c.id,role,wanted,comment,now());
  return{ok:true}
 });
 route('PUT','/api/raids/:id/signups/:signup','member',({user,params,body})=>{
  const raid=getRaid(params.id);if(!manages(user,raid))fail(403,'Nur der Raidleiter oder ein Offizier darf das.');
  const s=db.prepare(`SELECT s.*,c.user_id,c.name FROM raid_signups s JOIN characters c ON c.id=s.character_id WHERE s.id=? AND s.raid_id=?`).get(params.signup,raid.id)||fail(404,'Anmeldung nicht gefunden.');
  const status=oneOf(body.status??s.status,SIGNUP,'Anmeldestatus'),role=oneOf(body.role??s.role,ROLES,'Rolle');
  db.prepare('UPDATE raid_signups SET status=?,role=?,updated_at=? WHERE id=?').run(status,role,now(),s.id);
  if(status!==s.status||role!==s.role)notify(db,s.user_id,`${raid.name}: ${s.name} ist jetzt ${({signed:'angemeldet',confirmed:'bestätigt',bench:'auf der Ersatzbank',withdrawn:'abgemeldet',unavailable:'nicht verfügbar'})[status]}.`,'raid:'+raid.id,`signup:${s.id}:${status}:${role}`);
  return{ok:true}
 });
 route('DELETE','/api/raids/:id/signups/:signup','member',({user,params})=>{const raid=getRaid(params.id);if(!manages(user,raid))fail(403,'Nur der Raidleiter oder ein Offizier darf das.');db.prepare('DELETE FROM raid_signups WHERE id=? AND raid_id=?').run(params.signup,raid.id);return{ok:true}});

 const killRows=where=>db.prepare(`SELECT k.*,b.name boss,b.instance_id,i.name instance,(SELECT COUNT(*) FROM raid_kills o WHERE o.boss_id=k.boss_id AND (o.killed_at<k.killed_at OR (o.killed_at=k.killed_at AND o.id<k.id)))=0 first FROM raid_kills k JOIN raid_bosses b ON b.id=k.boss_id JOIN raid_instances i ON i.id=b.instance_id ${where} ORDER BY k.killed_at DESC`);
 const withPeople=k=>({...k,first:!!k.first,participants:db.prepare('SELECT c.* FROM kill_participants p JOIN characters c ON c.id=p.character_id WHERE p.kill_id=?').all(k.id).map(publicCharacter)});
 route('GET','/api/progress','public',()=>({instances:db.prepare('SELECT * FROM raid_instances').all().map(i=>{
  const bosses=db.prepare(`SELECT b.id,b.name,b.confirmed,MIN(k.killed_at) first_kill,MAX(k.killed_at) last_kill,COUNT(k.id) kills FROM raid_bosses b LEFT JOIN raid_kills k ON k.boss_id=b.id WHERE b.instance_id=? GROUP BY b.id ORDER BY b.sort`).all(i.id);
  return{...i,bosses,defeated:bosses.filter(b=>b.kills).length,lastKill:bosses.reduce((a,b)=>b.last_kill&&b.last_kill>(a||'')?b.last_kill:a,null)}})}));
 route('GET','/api/kills','member',()=>({kills:killRows('').all().map(withPeople)}));
 route('POST','/api/kills','kills',({user,body})=>{
  const boss=db.prepare('SELECT * FROM raid_bosses WHERE id=?').get(String(body.bossId))||fail(400,'Boss ist ungültig.');
  const raidId=body.raidId?getRaid(String(body.raidId)).id:null,kid=id(),killedAt=date(body.killedAt,'Datum');
  db.prepare('INSERT INTO raid_kills(id,boss_id,raid_id,killed_at,comment,screenshot_id,created_by) VALUES (?,?,?,?,?,?,?)').run(kid,boss.id,raidId,killedAt,text(body.comment??'','Kommentar',{max:1000}),needUpload(db,user,body.screenshotId),user.id);
  for(const cid of new Set(Array.isArray(body.participants)?body.participants:[])){if(!db.prepare('SELECT 1 FROM characters WHERE id=?').get(String(cid)))fail(400,'Ein Teilnehmer ist unbekannt.');db.prepare('INSERT INTO kill_participants VALUES (?,?)').run(kid,String(cid))}
  const kill=killRows('WHERE k.id=?').get(kid);
  discord('allgemein',{title:kill.first?`🐉 Erstkill: ${kill.boss} liegt!`:`💀 ${kill.boss} besiegt`,text:`ModCheck hat **${kill.boss}** in ${kill.instance} gelegt.${kill.comment?'\n'+kill.comment:''}`,color:kill.first?0xff8000:0x3fb950});
  return{id:kid,first:!!kill.first}
 });
 route('DELETE','/api/kills/:id','kills',({params})=>{db.prepare('DELETE FROM raid_kills WHERE id=?').run(params.id);return{ok:true}});
 route('POST','/api/kills/:id/hall','kills',({user,params})=>{
  const kill=killRows('WHERE k.id=?').get(params.id)||fail(404,'Kill nicht gefunden.');if(!kill.first)fail(400,'Nur ein First Kill wird vorgeschlagen.');
  if(db.prepare('SELECT 1 FROM hall_entries WHERE kill_id=?').get(kill.id))fail(409,'Dieser First Kill ist bereits eingetragen.');
  const people=withPeople(kill).participants.map(c=>c.name).join(', '),hid=id();
  db.prepare(`INSERT INTO hall_entries(id,title,category,description,occurred_on,participants,screenshot_id,kill_id,status,submitted_by,created_at) VALUES (?,?,'firstkill',?,?,?,?,?,'pending',?,?)`).run(hid,`First Kill: ${kill.boss}`,kill.comment,kill.killed_at.slice(0,10),people,kill.screenshot_id,kill.id,user.id,now());return{id:hid}
 });

 route('GET','/api/hall','public',({user,query})=>{
  const staff=can(user,'hall'),status=staff&&query.get('status')==='pending'?'pending':'approved';
  return{entries:db.prepare('SELECT id,title,category,description,occurred_on,participants,screenshot_id,status FROM hall_entries WHERE status=? ORDER BY occurred_on DESC').all(status),staff}
 });
 route('POST','/api/hall','member',({user,body})=>{const hid=id();db.prepare(`INSERT INTO hall_entries(id,title,category,description,occurred_on,participants,screenshot_id,status,submitted_by,created_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)`).run(hid,text(body.title,'Titel',{min:3,max:100}),oneOf(body.category,HALL,'Kategorie'),text(body.description??'','Beschreibung',{max:2000}),date(body.occurredOn,'Datum').slice(0,10),text(body.participants??'','Beteiligte',{max:500}),needUpload(db,user,body.screenshotId),user.id,now());return{id:hid}});
 route('PUT','/api/hall/:id','hall',({params,body})=>{
  const e=db.prepare('SELECT * FROM hall_entries WHERE id=?').get(params.id)||fail(404,'Eintrag nicht gefunden.');
  const status=oneOf(body.status??e.status,['pending','approved','rejected'],'Status');
  db.prepare('UPDATE hall_entries SET title=?,description=?,status=? WHERE id=?').run(text(body.title??e.title,'Titel',{min:3,max:100}),text(body.description??e.description,'Beschreibung',{max:2000}),status,e.id);
  if(e.screenshot_id)db.prepare('UPDATE uploads SET public=? WHERE id=?').run(status==='approved'?1:0,e.screenshot_id);
  if(status==='approved'&&e.status!=='approved'){notify(db,e.submitted_by,`Dein Eintrag „${e.title}“ steht jetzt in der Hall of Fame.`,'hall','hall:'+e.id);discord('allgemein',{title:'🏆 Neu in der Hall of Fame: '+(body.title??e.title).trim(),text:String(body.description??e.description).slice(0,1000),color:0xa335ee})}
  return{ok:true}
 });
 route('DELETE','/api/hall/:id','hall',({params})=>{db.prepare('DELETE FROM hall_entries WHERE id=?').run(params.id);return{ok:true}});
 route('GET','/api/guild-summary','public',({user})=>{
  const last=killRows('').get(),first=killRows('').all().find(k=>k.first);
  const next=user?db.prepare(`SELECT id,name,starts_at FROM raids WHERE starts_at>? AND status IN ('planned','open','closed') ORDER BY starts_at LIMIT 1`).get(now()):null;
  return{lastKill:last?{boss:last.boss,instance:last.instance,at:last.killed_at}:null,firstKill:first?{boss:first.boss,instance:first.instance,at:first.killed_at}:null,nextRaid:next||null,progress:db.prepare('SELECT i.name,i.boss_count total,(SELECT COUNT(DISTINCT k.boss_id) FROM raid_kills k JOIN raid_bosses b ON b.id=k.boss_id WHERE b.instance_id=i.id) defeated FROM raid_instances i').all()}
 });
}

// Posts a reminder once per raid when it starts within the next hour.
export function remindRaids(db){
 const soon=new Date(Date.now()+3600e3).toISOString(),nowIso=new Date().toISOString();
 for(const r of db.prepare(`SELECT r.id,r.name,r.starts_at,i.name instance,(SELECT COUNT(*) FROM raid_signups s WHERE s.raid_id=r.id AND s.status IN ('signed','confirmed')) signed,r.max_players FROM raids r LEFT JOIN raid_instances i ON i.id=r.instance_id WHERE r.status IN ('open','closed') AND r.starts_at>? AND r.starts_at<=?`).all(nowIso,soon)){
  if(db.prepare('INSERT OR IGNORE INTO discord_sent(key,sent_at) VALUES (?,?)').run('remind:'+r.id,nowIso).changes)discord('raids',{title:'⏰ Gleich geht’s los: '+r.name,text:`**${r.instance||''}** startet ${berlinTime(r.starts_at)}.\n${r.signed} von ${r.max_players} angemeldet. Buffs, Reparatur, Tränke!`,color:0xff7a1a})
 }
}
