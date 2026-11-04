/* Accounts, members, characters and the planner data stored per character. */
import {discord,berlinTime,botReady} from './discord.js';
import {requestApproval} from './approvals.js';
import {grantStartGold,START_GOLD} from './gold.js';
import {progressOf} from './progression.js';
import {ITEMS} from './armory.js';
import {route,fail,text,int,oneOf,now,id,hashPassword,verifyPassword,createSession,dropSession,rateLimit,failuresBlocked,recordFailure,characterOwned,publicCharacter,appearance,notify,CLASSES,RACES,SLOTS,PERMISSIONS,can} from './core.js';

const me=user=>user&&{id:user.id,username:user.username,role:user.role,guildRank:user.guild_rank,permissions:user.permissions,mainCharacterId:user.main_character_id,dashboard:JSON.parse(user.dashboard_json||'{}'),legacyPublic:!!user.legacy_public};
const dummyHash=hashPassword('modcheck-timing-guard');

export function registerAccountRoutes(db){
 route('GET','/api/me','public',({user})=>({user:me(user)}));
 route('POST','/api/register','public',({body,ip})=>{
  rateLimit('register:'+ip,10,3600e3);
  const username=text(body.username,'Benutzername',{min:3,max:24});if(!/^[\p{L}\p{N}_-]+$/u.test(username))fail(400,'Benutzernamen dürfen nur Buchstaben, Zahlen, _ und - enthalten.');
  const password=text(body.password,'Passwort',{min:10,max:200});
  if(db.prepare('SELECT 1 FROM users WHERE lower(username)=lower(?)').get(username))fail(409,'Dieser Name ist bereits vergeben.');
  if(db.prepare(`SELECT COUNT(*) n FROM users WHERE status='pending'`).get().n>=30)fail(429,'Gerade warten zu viele Konten auf Freischaltung. Bitte melde dich bei der Gildenleitung.');
  db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES (?,?,?,?)').run(id(),username,hashPassword(password),now());
  for(const a of db.prepare(`SELECT id FROM users WHERE role='admin' AND status='active'`).all())notify(db,a.id,`Neue Registrierung: ${username}`,'members','register:'+username);
  const created=db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if(botReady())requestApproval(db,{id:created.id,username}).catch(e=>console.warn('Freischaltung per Emoji:',e.message));
  else discord('offiziere',{title:'Neue Registrierung',text:`**${username}** wartet auf Freischaltung.\nGilde → Mitglieder → Benutzer verwalten`,color:0x5b8def});
  return{ok:true,message:'Konto angelegt. Ein Offizier muss es noch freischalten.'}
 });
 route('POST','/api/login','public',({body,ip,setSession})=>{
  rateLimit('login:'+ip,20,600e3);
  const name=text(body.username,'Benutzername',{max:24}),failKey='login-fail:'+name.toLowerCase();
  if(failuresBlocked(failKey,10,900e3))fail(429,'Zu viele Fehlversuche für dieses Konto. Bitte warte 15 Minuten.');
  const u=db.prepare('SELECT * FROM users WHERE username=?').get(name);
  const ok=verifyPassword(text(body.password,'Passwort',{max:200}),u?.password_hash||dummyHash);
  if(!u||!ok){recordFailure(failKey);fail(401,'Name oder Passwort stimmt nicht.')}
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
  if(u.status==='pending')fail(403,'Dein Konto wartet noch auf die Freischaltung.');
  if(u.status==='disabled')fail(403,'Dieses Konto ist gesperrt.');
  setSession(createSession(db,u.id));return{ok:true}
 });
 route('POST','/api/logout','member',({token,clearSession})=>{dropSession(db,token);clearSession();return{ok:true}});
 route('PUT','/api/me/password','member',({user,body})=>{
  rateLimit('password:'+user.id,10,3600e3);
  const row=db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
  if(!verifyPassword(text(body.current,'Aktuelles Passwort',{max:200}),row.password_hash))fail(403,'Das aktuelle Passwort stimmt nicht.');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(text(body.next,'Neues Passwort',{min:10,max:200})),user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);return{ok:true}
 });
 route('PUT','/api/me/settings','member',({user,body})=>{
  const dash=body.dashboard;if(!dash||typeof dash!=='object')fail(400,'Einstellungen fehlen.');
  const clean={hidden:(Array.isArray(dash.hidden)?dash.hidden:[]).filter(x=>typeof x==='string').slice(0,20),order:(Array.isArray(dash.order)?dash.order:[]).filter(x=>typeof x==='string').slice(0,20)};
  db.prepare('UPDATE users SET dashboard_json=?,main_character_id=? WHERE id=?').run(JSON.stringify(clean),body.mainCharacterId?characterOwned(db,user,String(body.mainCharacterId)).id:user.main_character_id,user.id);return{ok:true}
 });

 route('GET','/api/members','member',()=>({members:db.prepare(`SELECT u.id,u.username,u.role,u.status,u.guild_rank,c.name,c.class_id FROM users u LEFT JOIN characters c ON c.id=u.main_character_id WHERE u.status='active' AND u.hidden=0 ORDER BY u.username`).all().map(m=>({...m,characters:db.prepare('SELECT * FROM characters WHERE user_id=? ORDER BY level DESC').all(m.id).map(publicCharacter)}))}));
 route('GET','/api/admin/users','members',()=>({users:db.prepare('SELECT id,username,role,status,guild_rank,hidden,created_at FROM users ORDER BY status,username').all().map(u=>({...u,permissions:db.prepare('SELECT permission FROM user_permissions WHERE user_id=?').all(u.id).map(p=>p.permission)})),permissions:PERMISSIONS}));
 route('PUT','/api/admin/users/:id','members',({user,params,body})=>{
  const target=db.prepare('SELECT * FROM users WHERE id=?').get(params.id);if(!target)fail(404,'Benutzer nicht gefunden.');
  const admin=user.role==='admin';
  if(target.role==='admin'&&!admin)fail(403,'Administratoren kann nur ein Administrator ändern.');
  const status=body.status===undefined?target.status:oneOf(body.status,['pending','active','disabled'],'Status');
  const rank=body.guildRank===undefined?target.guild_rank:text(body.guildRank,'Gildenrang',{min:2,max:30});
  const role=body.role===undefined?target.role:oneOf(body.role,['admin','officer','member'],'Rolle');
  if((role!==target.role||body.permissions!==undefined)&&!admin)fail(403,'Rollen und Rechte vergibt nur ein Administrator.');
  if(target.id===user.id&&(status!=='active'||role!=='admin')&&admin)fail(400,'Du kannst dich nicht selbst sperren oder herabstufen.');
  db.prepare('UPDATE users SET status=?,guild_rank=?,role=? WHERE id=?').run(status,rank,role,target.id);
  if(status!=='active')db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
  if(body.hidden!==undefined){if(!admin)fail(403,'Unsichtbar schaltet nur ein Administrator.');db.prepare('UPDATE users SET hidden=? WHERE id=?').run(body.hidden?1:0,target.id)}
  if(body.permissions!==undefined){if(!Array.isArray(body.permissions))fail(400,'Rechte sind ungültig.');db.prepare('DELETE FROM user_permissions WHERE user_id=?').run(target.id);for(const p of body.permissions)db.prepare('INSERT INTO user_permissions VALUES (?,?)').run(target.id,oneOf(p,PERMISSIONS,'Recht'))}
  if(status==='active'&&target.status==='pending')notify(db,target.id,'Dein Konto wurde freigeschaltet. Willkommen bei ModCheck!','dashboard','approved:'+target.id);
  return{ok:true}
 });

 route('GET','/api/characters','member',({user})=>({characters:db.prepare('SELECT * FROM characters WHERE user_id=? ORDER BY created_at').all(user.id).map(c=>({...publicCharacter(c),talents:JSON.parse(c.talents_json),gear:Object.fromEntries(db.prepare('SELECT slot,item_id FROM character_gear WHERE character_id=?').all(c.id).map(g=>[g.slot,g.item_id]))})),classes:CLASSES,races:RACES}));
 // Forever names: letters only, first letter upper case, the rest lower case.
 const personName=(value,label)=>{const v=text(value,label,{min:2,max:12});if(!/^\p{L}+$/u.test(v))fail(400,`${label}: nur Buchstaben, keine Leer- oder Sonderzeichen.`);return v[0].toLocaleUpperCase('de')+v.slice(1).toLocaleLowerCase('de')};
 const characterFields=(body,old)=>{
  const classId=int(body.classId,'Klasse',1,11);if(!CLASSES[classId])fail(400,'Klasse ist ungültig.');
  const race=oneOf(body.race,Object.keys(RACES),'Volk');if(!RACES[race].includes(classId))fail(400,`${race} kann nicht ${CLASSES[classId]} sein.`);
  return{name:text(body.name,'Charaktername',{min:2,max:12}),surname:body.surname===undefined&&old?old.surname:personName(body.surname,'Nachname'),classId,race,level:int(body.level??1,'Level',1,60),spec:text(body.spec??old?.spec??'','Spezialisierung',{max:30}),gender:body.gender===undefined?old?.gender??0:int(body.gender,'Geschlecht',0,1),appearance:body.appearance===undefined?JSON.parse(old?.appearance_json||'{}'):appearance(body.appearance)}
 };
 route('POST','/api/characters','member',({user,body})=>{
  const c=characterFields(body);if(db.prepare('SELECT 1 FROM characters WHERE name=? AND surname=?').get(c.name,c.surname))fail(409,`${c.name} ${c.surname} gibt es schon. Vor- und Nachname müssen zusammen einmalig sein.`);
  const cid=id();db.prepare('INSERT INTO characters(id,user_id,name,surname,class_id,race,level,spec,gender,appearance_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(cid,user.id,c.name,c.surname,c.classId,c.race,c.level,c.spec,c.gender,JSON.stringify(c.appearance),now());
  if(!user.main_character_id)db.prepare('UPDATE users SET main_character_id=? WHERE id=?').run(cid,user.id);
  return{id:cid,startGold:grantStartGold(db,user.id)?START_GOLD:0}
 });
 route('PUT','/api/characters/:id','member',({user,params,body})=>{
  const old=characterOwned(db,user,params.id),c=characterFields(body,old);
  const clash=db.prepare('SELECT id FROM characters WHERE name=? AND surname=?').get(c.name,c.surname);if(clash&&clash.id!==old.id)fail(409,'Diese Kombination aus Vor- und Nachname ist bereits vergeben.');
  db.prepare('UPDATE characters SET name=?,surname=?,class_id=?,race=?,level=?,spec=?,gender=?,appearance_json=? WHERE id=?').run(c.name,c.surname,c.classId,c.race,c.level,c.spec,c.gender,JSON.stringify(c.appearance),old.id);return{ok:true}
 });
 route('DELETE','/api/characters/:id','member',({user,params})=>{const c=characterOwned(db,user,params.id);db.prepare('DELETE FROM characters WHERE id=?').run(c.id);if(user.main_character_id===c.id)db.prepare('UPDATE users SET main_character_id=(SELECT id FROM characters WHERE user_id=? LIMIT 1) WHERE id=?').run(user.id,user.id);return{ok:true}});
 route('PUT','/api/characters/:id/planner','member',({user,params,body})=>{
  const c=characterOwned(db,user,params.id);
  if(body.talents!==undefined){if(!body.talents||typeof body.talents!=='object'||Array.isArray(body.talents))fail(400,'Talente sind ungültig.');const clean=Object.fromEntries(Object.entries(body.talents).filter(([k,v])=>/^\d+$/.test(k)&&Number.isInteger(v)&&v>0&&v<=5));if(Object.values(clean).reduce((a,b)=>a+b,0)>51)fail(400,'Mehr als 51 Talentpunkte sind nicht möglich.');db.prepare('UPDATE characters SET talents_json=?,talents_checked_at=? WHERE id=?').run(JSON.stringify(clean),now(),c.id)}
  if(body.gear!==undefined){if(!body.gear||typeof body.gear!=='object')fail(400,'Ausrüstung ist ungültig.');const gear=Object.entries(body.gear).map(([slot,item])=>[oneOf(slot,SLOTS,'Slot'),int(item,'Item',1,99999999)]);db.prepare('DELETE FROM character_gear WHERE character_id=?').run(c.id);for(const[slot,item]of gear)db.prepare('INSERT INTO character_gear VALUES (?,?,?)').run(c.id,slot,item)}
  return{ok:true}
 });
 route('GET','/api/characters/:id/profile','member',({user,params})=>{
  const c=db.prepare('SELECT * FROM characters WHERE id=?').get(params.id);if(!c)fail(404,'Charakter nicht gefunden.');
  const owner=db.prepare('SELECT username,guild_rank FROM users WHERE id=?').get(c.user_id);
  // The level shown on the profile is the Waffenkammer level from armory_xp; characters.level is only the planner value and stays 1 for characters made at login.
  const progress=progressOf(db,c.id);
  const worn=db.prepare('SELECT slot,item_id FROM inventory WHERE character_id=? AND slot IS NOT NULL').all(c.id).map(r=>{const i=ITEMS[r.item_id];return i&&{slot:r.slot,item:{id:i.id,name:i.name,quality:i.quality,icon:i.icon}}}).filter(Boolean);
  return{character:{...publicCharacter(c),level:progress.level},progress:{level:progress.level,xp:progress.xp,next:progress.next},worn,owner:{username:owner.username,guildRank:owner.guild_rank},gear:db.prepare('SELECT slot,item_id FROM character_gear WHERE character_id=?').all(c.id),professions:db.prepare('SELECT profession,skill,specialization FROM character_professions WHERE character_id=?').all(c.id),raidKills:db.prepare('SELECT COUNT(*) n FROM kill_participants WHERE character_id=?').get(c.id).n,own:c.user_id===user.id||can(user,'members')}
 });
 route('GET','/api/notifications','member',({user})=>({notifications:db.prepare('SELECT id,message,link,created_at,read_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(user.id)}));
 route('POST','/api/notifications/read','member',({user,body})=>{if(body.id)db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').run(now(),String(body.id),user.id);else db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(),user.id);return{ok:true}});
 route('DELETE','/api/notifications/:id','member',({user,params})=>{db.prepare('DELETE FROM notifications WHERE id=? AND user_id=?').run(params.id,user.id);return{ok:true}});
}
