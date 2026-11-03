/* Shared server plumbing: routing, validation, sessions, permissions, notifications. Node only. */
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';

export const PERMISSIONS=['raids','kills','announce','moderate','hall','bis','patches','members','freespins'];
export const CLASSES={1:'Krieger',2:'Paladin',3:'Jäger',4:'Schurke',5:'Priester',7:'Schamane',8:'Magier',9:'Hexenmeister',11:'Druide'};
export const RACES={Mensch:[1,2,3,4,5,8,9],Zwerg:[1,2,3,4,5,7],Nachtelf:[1,3,4,5,11],Gnom:[1,4,5,8,9],Skyborne:[1,3,4,8,11]};
export const SLOTS=['head','neck','shoulders','back','chest','wrists','hands','waist','legs','feet','ring1','ring2','trinket1','trinket2','mainhand','offhand','ranged'];
export const SESSION_DAYS=14;
const routes=[];
export class ApiError extends Error{constructor(status,message){super(message);this.status=status}}
export const fail=(status,message)=>{throw new ApiError(status,message)};
export const now=()=>new Date().toISOString();
export const id=()=>randomUUID();
export function route(method,path,access,handler){const keys=[];const pattern=new RegExp('^'+path.replace(/:(\w+)/g,(_,k)=>{keys.push(k);return '([^/]+)'})+'$');routes.push({method,pattern,keys,access,handler})}
export function findRoute(method,pathname){for(const r of routes){if(r.method!==method)continue;const m=pathname.match(r.pattern);if(m)return{route:r,params:Object.fromEntries(r.keys.map((k,i)=>[k,decodeURIComponent(m[i+1])]))}}return null}

export const text=(value,name,{min=0,max=200}={})=>{if(typeof value!=='string')fail(400,`${name} fehlt.`);const v=value.trim();if(v.length<min||v.length>max)fail(400,min?`${name} braucht ${min} bis ${max} Zeichen.`:`${name} darf höchstens ${max} Zeichen haben.`);return v};
export const int=(value,name,min,max)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)fail(400,`${name} muss zwischen ${min} und ${max} liegen.`);return n};
export const oneOf=(value,list,name)=>{if(!list.includes(value))fail(400,`${name} ist ungültig.`);return value};
export const date=(value,name)=>{const d=new Date(value);if(typeof value!=='string'||Number.isNaN(d.getTime()))fail(400,`${name} ist ungültig.`);return d.toISOString()};
export const webUrl=(value,name)=>{let u;try{u=new URL(value)}catch{fail(400,`${name} ist keine gültige Adresse.`)}if(u.protocol!=='https:')fail(400,`${name} muss mit https beginnen.`);return u.href};

export function hashPassword(password){const salt=randomBytes(16);return 'scrypt$'+salt.toString('hex')+'$'+scryptSync(password,salt,32).toString('hex')}
export function verifyPassword(password,stored){const[,salt,hash]=stored.split('$');if(!hash)return false;const expected=Buffer.from(hash,'hex');return timingSafeEqual(scryptSync(password,Buffer.from(salt,'hex'),32),expected)}
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export function createSession(db,userId){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(tokenHash(token),userId,Date.now()+SESSION_DAYS*864e5);return token}
export function dropSession(db,token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token))}
export function sessionUser(db,token){
 if(!token)return null;
 const user=db.prepare(`SELECT u.id,u.username,u.role,u.status,u.guild_rank,u.main_character_id,u.dashboard_json,u.legacy_public FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash(token),Date.now());
 if(!user||user.status!=='active')return null;
 user.permissions=user.role==='admin'?[...PERMISSIONS]:db.prepare('SELECT permission FROM user_permissions WHERE user_id=?').all(user.id).map(p=>p.permission);
 return user
}
export const can=(user,permission)=>!!user?.permissions.includes(permission);
export function checkAccess(user,access){
 if(access==='public')return;
 if(!user)fail(401,'Bitte melde dich an.');
 if(access==='member')return;
 if(access==='admin'){if(user.role!=='admin')fail(403,'Nur für Administratoren.');return}
 if(!can(user,access))fail(403,'Dafür fehlt dir die Berechtigung.')
}
const attempts=new Map();
export function rateLimit(key,limit,windowMs){const t=Date.now(),list=(attempts.get(key)||[]).filter(x=>t-x<windowMs);if(list.length>=limit)fail(429,'Zu viele Versuche. Bitte warte kurz.');list.push(t);attempts.set(key,list)}
export function resetRateLimits(){attempts.clear()}
// Failure-only counter: blocks guessing against one account without letting strangers lock it by merely trying.
export function failuresBlocked(key,limit,windowMs){const t=Date.now(),list=(attempts.get(key)||[]).filter(x=>t-x<windowMs);attempts.set(key,list);return list.length>=limit}
export function recordFailure(key){if(!attempts.has(key))attempts.set(key,[]);attempts.get(key).push(Date.now())}

export function notify(db,userId,message,link,dedupeKey){db.prepare('INSERT OR IGNORE INTO notifications(id,user_id,message,link,dedupe_key,created_at) VALUES (?,?,?,?,?,?)').run(id(),userId,message,link,dedupeKey,now())}
export function characterOwned(db,user,characterId){const c=db.prepare('SELECT * FROM characters WHERE id=?').get(characterId);if(!c)fail(404,'Charakter nicht gefunden.');if(c.user_id!==user.id)fail(403,'Das ist nicht dein Charakter.');return c}
export function publicCharacter(c){return c&&{id:c.id,name:c.name,surname:c.surname||'',fullName:[c.name,c.surname].filter(Boolean).join(' '),classId:c.class_id,className:CLASSES[c.class_id],race:c.race,level:c.level,spec:c.spec,gender:c.gender??0,appearance:JSON.parse(c.appearance_json||'{}')}}
// Appearance is {customizationOptionId: choiceId} from the model viewer's character customization data.
export function appearance(value){
 if(value===undefined||value===null)return{};
 if(typeof value!=='object'||Array.isArray(value))fail(400,'Das Aussehen ist ungültig.');
 const entries=Object.entries(value);if(entries.length>12)fail(400,'Das Aussehen hat zu viele Merkmale.');
 return Object.fromEntries(entries.map(([k,v])=>{if(!/^\d{1,6}$/.test(k))fail(400,'Das Aussehen ist ungültig.');return[k,int(v,'Aussehen',1,9999999)]}))
}
export function needUpload(db,user,uploadId){if(!uploadId)return null;const u=db.prepare('SELECT id,user_id FROM uploads WHERE id=?').get(String(uploadId));if(!u)fail(400,'Bild nicht gefunden.');if(u.user_id!==user.id)fail(403,'Dieses Bild gehört dir nicht.');return u.id}
