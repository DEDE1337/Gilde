/* Legacy progress, news feed, patch tracker with reviewed changes, and the personal dashboard. */
import {route,fail,text,int,oneOf,date,webUrl,now,id,can,notify,characterOwned,publicCharacter,CLASSES} from './core.js';
import {wowheadGet,wowheadText} from '../worker/wowhead.js';
import {bisProgress} from './gear.js';

const NEWS_FEED='https://www.wowhead.com/news/rss/forever',NEWS_TTL=30*60*1000;
const LEGACY_POINT_CAP=65,LEGACY_CHARACTER_CAP=16;
const REWARDS=[[15,'Spielzeug'],[25,'Haustier'],[40,'Wappenrock'],[55,'Reittier']];
const LABELS=['buff','nerf','fix','mechanic','neutral'],AREAS=['class','talent','ability','item','raid','profession','general'];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const cdata=s=>(s||'').replace(/^<!\[CDATA\[|\]\]>$/g,'');

export function parseNewsFeed(xml){
 return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([,b])=>{
  const tag=n=>b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`))?.[1]||'',guid=clean(tag('guid')),link=clean(cdata(tag('link'))),title=wowheadText(cdata(tag('title')));
  return{guid,title,link,summary:wowheadText(cdata(tag('description')).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/Continue reading[\s\S]*$/,'').replace(/<a[^>]*>\s*$/,'')).slice(0,400),image:b.match(/<media:content url="(https:\/\/wow\.zamimg\.com\/[^"]+)"/)?.[1]||'',publishedAt:new Date(clean(tag('pubDate'))).toISOString(),isPatch:/tuning|hotfix|patch notes|class changes|buff|nerf/i.test(title)?1:0}
 }).filter(n=>n.guid&&n.title&&/^https:\/\/www\.wowhead\.com\//.test(n.link))
}
const flatTalents=data=>data.classes.flatMap(c=>c.trees.flatMap(t=>t.talents.map(x=>({id:x.id,classId:c.id,name:x.name,text:clean(x.descriptions.join(' | ')),ranks:x.maxRank,row:x.row}))));

export function registerProgressRoutes(db,env,forum){
 const cached=key=>{const r=db.prepare('SELECT payload,fetched_at FROM wowhead_cache WHERE key=?').get(key);return r?.payload?r:null};
 const setCache=(key,payload)=>db.prepare('INSERT INTO wowhead_cache(key,payload,fetched_at,checked_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,checked_at=excluded.checked_at').run(key,JSON.stringify(payload),Date.now(),Date.now());
 const storeNews=items=>{for(const n of items)db.prepare('INSERT INTO news_items(guid,title,link,summary,image,published_at,source,is_patch) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(guid) DO UPDATE SET title=excluded.title,summary=excluded.summary').run(n.guid,n.title,n.link,n.summary,n.image,n.publishedAt,'Wowhead',n.isPatch)};
 async function refreshNews(force=false){
  const row=db.prepare(`SELECT checked_at FROM wowhead_cache WHERE key='news'`).get();if(!force&&row&&Date.now()-row.checked_at<NEWS_TTL)return;
  try{storeNews(parseNewsFeed(await(await wowheadGet(NEWS_FEED)).text()));setCache('news',{ok:true})}catch(e){console.warn('News: '+e.message);db.prepare(`INSERT INTO wowhead_cache(key,checked_at,error) VALUES ('news',?,?) ON CONFLICT(key) DO UPDATE SET checked_at=excluded.checked_at,error=excluded.error`).run(Date.now(),e.message)}
 }
 /* Compares live Wowhead data against the last reviewed baseline; differences become a draft patch for human review. */
 function detectChanges(){
  const talents=cached('talents');if(!talents)return null;
  const current=flatTalents(JSON.parse(talents.payload)),base=cached('baseline:talents');
  if(!base){setCache('baseline:talents',current);return null}
  const before=new Map(JSON.parse(base.payload).map(t=>[t.id,t])),changed=[];
  for(const t of current){const o=before.get(t.id);if(!o)changed.push([t,null]);else if(o.text!==t.text||o.ranks!==t.ranks||o.name!==t.name||o.row!==t.row)changed.push([t,o]);before.delete(t.id)}
  for(const o of before.values())changed.push([null,o]);
  setCache('baseline:talents',current);
  if(!changed.length)return null;
  const pid=id(),day=now().slice(0,10);db.prepare(`INSERT INTO patches(id,version,released_on,source_name,source_url,status,created_at) VALUES (?,?,?,?,?,'draft',?)`).run(pid,`Datenabgleich ${day}`,day,'Wowhead Forever Talentdaten','https://www.wowhead.com/forever/talent-calc/warrior',now());
  for(const[t,o]of changed)db.prepare(`INSERT INTO patch_changes(id,patch_id,class_id,area,object_id,object_name,before_text,after_text,label) VALUES (?,?,?,'talent',?,?,?,?,'neutral')`).run(id(),pid,(t||o).classId,(t||o).id,(t||o).name,o?.text||'',t?.text||'');
  return pid
 }
 const affected=change=>{
  const hits=[],chars=db.prepare('SELECT * FROM characters').all();
  for(const c of chars){
   if(change.area==='talent'&&change.object_id&&JSON.parse(c.talents_json)[change.object_id])hits.push([c,`${c.name} nutzt das geänderte Talent ${change.object_name}. Der gespeicherte Build ist möglicherweise veraltet.`]);
   else if(change.area==='item'&&change.object_id&&(db.prepare('SELECT 1 FROM character_gear WHERE character_id=? AND item_id=?').get(c.id,change.object_id)||db.prepare('SELECT 1 FROM character_items WHERE character_id=? AND item_id=?').get(c.id,change.object_id)))hits.push([c,`Ein Gegenstand von ${c.name} wurde geändert: ${change.object_name}.`]);
   else if(change.class_id===c.class_id&&change.area!=='talent')hits.push([c,`Deine Klasse ${CLASSES[c.class_id]} wurde geändert (${c.name}).`])
  }
  return hits
 };
 route('GET','/api/news','public',async({query})=>{await refreshNews();const patchOnly=query.get('patch')==='1';return{news:db.prepare(`SELECT guid,title,link,summary,image,published_at,source,is_patch FROM news_items ${patchOnly?'WHERE is_patch=1':''} ORDER BY published_at DESC LIMIT 40`).all()}});
 const patchView=p=>({...p,changes:db.prepare('SELECT * FROM patch_changes WHERE patch_id=?').all(p.id)});
 route('GET','/api/patches','public',({user})=>{
  const staff=can(user,'patches'),patches=db.prepare(`SELECT * FROM patches WHERE status='approved' ${staff?`OR status='draft'`:''} ORDER BY released_on DESC,created_at DESC`).all().map(patchView),overview={};
  for(const cid of Object.keys(CLASSES))overview[cid]={name:CLASSES[cid],buff:0,nerf:0,fix:0,mechanic:0,neutral:0};
  for(const p of patches)if(p.status==='approved')for(const c of p.changes)if(overview[c.class_id])overview[c.class_id][c.label]++;
  return{patches,overview,staff}
 });
 route('POST','/api/patches','patches',({body})=>{const pid=id();db.prepare(`INSERT INTO patches(id,version,released_on,source_name,source_url,status,created_at) VALUES (?,?,?,?,?,'draft',?)`).run(pid,text(body.version,'Patchversion',{min:1,max:60}),date(body.releasedOn,'Veröffentlichung').slice(0,10),text(body.sourceName,'Quelle',{min:2,max:80}),webUrl(body.sourceUrl,'Quellenadresse'),now());return{id:pid}});
 route('POST','/api/patches/detect','patches',()=>({patchId:detectChanges()}));
 route('POST','/api/patches/:id/changes','patches',({params,body})=>{
  const p=db.prepare('SELECT * FROM patches WHERE id=?').get(params.id)||fail(404,'Patch nicht gefunden.');if(p.status!=='draft')fail(409,'Freigegebene Patches lassen sich nicht mehr ändern.');
  const classId=body.classId?int(body.classId,'Klasse',1,11):null;if(classId&&!CLASSES[classId])fail(400,'Klasse ist ungültig.');
  const cid=id();db.prepare('INSERT INTO patch_changes(id,patch_id,class_id,area,object_id,object_name,before_text,after_text,label) VALUES (?,?,?,?,?,?,?,?,?)').run(cid,p.id,classId,oneOf(body.area,AREAS,'Bereich'),body.objectId?int(body.objectId,'Objekt',1,99999999):null,text(body.objectName??'','Name',{max:100}),text(body.before??'','Bisher',{max:2000}),text(body.after,'Neu',{min:2,max:2000}),oneOf(body.label??'neutral',LABELS,'Kennzeichnung'));return{id:cid}
 });
 route('PUT','/api/patch-changes/:id','patches',({params,body})=>{db.prepare(`UPDATE patch_changes SET label=? WHERE id=? AND patch_id IN (SELECT id FROM patches WHERE status='draft')`).run(oneOf(body.label,LABELS,'Kennzeichnung'),params.id);return{ok:true}});
 route('DELETE','/api/patches/:id','patches',({params})=>{db.prepare(`DELETE FROM patches WHERE id=? AND status='draft'`).run(params.id);return{ok:true}});
 route('POST','/api/patches/:id/approve','patches',({params})=>{
  const p=db.prepare('SELECT * FROM patches WHERE id=?').get(params.id)||fail(404,'Patch nicht gefunden.');if(p.status==='approved')fail(409,'Dieser Patch ist bereits freigegeben.');
  db.prepare(`UPDATE patches SET status='approved' WHERE id=?`).run(p.id);let sent=0;
  for(const change of db.prepare('SELECT * FROM patch_changes WHERE patch_id=?').all(p.id))for(const[c,message]of affected(change)){const before=db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=?').get(c.user_id).n;notify(db,c.user_id,message,'impact',`patch:${p.id}:${c.id}:${change.area==='talent'||change.area==='item'?change.object_id:'class'}`);sent+=db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=?').get(c.user_id).n-before}
  return{ok:true,notifications:sent}
 });
 route('GET','/api/impact','member',({user})=>{
  const out=[];for(const c of db.prepare('SELECT * FROM characters WHERE user_id=?').all(user.id)){const talents=JSON.parse(c.talents_json);
   const rows=db.prepare(`SELECT ch.*,p.version,p.released_on,p.source_url,p.source_name FROM patch_changes ch JOIN patches p ON p.id=ch.patch_id WHERE p.status='approved' AND (ch.class_id=? OR ch.class_id IS NULL) ORDER BY p.released_on DESC`).all(c.class_id);
   const hits=rows.filter(r=>r.area!=='talent'||talents[r.object_id]);
   out.push({character:publicCharacter(c),changes:hits,outdatedBuild:rows.some(r=>r.area==='talent'&&talents[r.object_id]&&(!c.talents_checked_at||c.talents_checked_at.slice(0,10)<r.released_on))})}
  return{characters:out}
 });
 route('GET','/api/patches/talents','public',()=>({changes:db.prepare(`SELECT ch.object_id,ch.object_name,ch.before_text,ch.after_text,ch.label,p.version,p.released_on,p.source_url FROM patch_changes ch JOIN patches p ON p.id=ch.patch_id WHERE p.status='approved' AND ch.area='talent' ORDER BY p.released_on DESC`).all()}));

 const milestones=userId=>{
  const chars=db.prepare('SELECT * FROM characters WHERE user_id=?').all(userId),out=[];
  for(const cid of Object.keys(CLASSES).map(Number)){const best=chars.filter(c=>c.class_id===cid).sort((a,b)=>b.level-a.level)[0];for(const level of [25,45,60])out.push({name:`${CLASSES[cid]} Level ${level}`,done:!!best&&best.level>=level,character:best?.level>=level?best.name:null})}
  const skills=db.prepare('SELECT p.profession,MAX(p.skill) skill,c.name FROM character_professions p JOIN characters c ON c.id=p.character_id WHERE c.user_id=? GROUP BY p.profession').all(userId);
  for(const s of skills)for(const level of [150,225,300])out.push({name:`${s.profession} ${level}`,done:s.skill>=level,character:s.skill>=level?s.name:null});
  return out
 };
 const legacyOf=userId=>{const rows=db.prepare('SELECT * FROM legacy_progress WHERE user_id=?').all(userId);return{points:rows.find(r=>r.key==='points'&&!r.character_id)?.value||0,updatedAt:rows.find(r=>r.key==='points'&&!r.character_id)?.updated_at||null,ranks:rows.filter(r=>r.character_id).map(r=>({characterId:r.character_id,node:r.key,rank:r.value,updatedAt:r.updated_at}))}};
 const logLegacy=(user,cid,key,value)=>db.prepare('INSERT INTO legacy_history(id,user_id,character_id,key,value,created_at) VALUES (?,?,?,?,?,?)').run(id(),user.id,cid,key,value,now());
 route('GET','/api/legacy','member',({user})=>({nodes:db.prepare('SELECT * FROM legacy_nodes ORDER BY tree,sort').all(),...legacyOf(user.id),milestones:milestones(user.id),history:db.prepare('SELECT key,value,character_id,created_at FROM legacy_history WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(user.id),rewards:REWARDS,caps:{points:LEGACY_POINT_CAP,character:LEGACY_CHARACTER_CAP},public:!!user.legacy_public}));
 route('PUT','/api/legacy/points','member',({user,body})=>{const v=int(body.points,'Legacy-Punkte',0,LEGACY_POINT_CAP);db.prepare(`INSERT INTO legacy_progress(id,user_id,character_id,key,value,updated_at) VALUES (?,?,NULL,'points',?,?) ON CONFLICT(user_id,key) WHERE character_id IS NULL DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).run(id(),user.id,v,now());logLegacy(user,null,'points',v);return{ok:true}});
 route('PUT','/api/legacy/characters/:id/:node','member',({user,params,body})=>{
  const c=characterOwned(db,user,params.id),node=db.prepare('SELECT * FROM legacy_nodes WHERE id=?').get(params.node)||fail(404,'Legacy-Talent nicht gefunden.'),rank=int(body.rank,'Rang',0,node.max_rank);
  const others=db.prepare('SELECT key,value FROM legacy_progress WHERE character_id=? AND key<>?').all(c.id,node.id),spent=others.reduce((a,r)=>a+r.value,0)+rank;
  if(spent>LEGACY_CHARACTER_CAP)fail(400,`Pro Charakter sind höchstens ${LEGACY_CHARACTER_CAP} Punkte möglich.`);
  if(spent>legacyOf(user.id).points)fail(400,'So viele Legacy-Punkte hast du auf deinem Account nicht eingetragen.');
  if(rank&&node.requires&&!others.some(r=>r.key===node.requires&&r.value>0))fail(400,'Die Voraussetzung fehlt noch.');
  if(!rank&&others.some(r=>db.prepare('SELECT requires FROM legacy_nodes WHERE id=?').get(r.key)?.requires===node.id&&r.value>0))fail(400,'Ein anderes Legacy-Talent braucht diesen Punkt.');
  if(rank)db.prepare(`INSERT INTO legacy_progress(id,user_id,character_id,key,value,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(character_id,key) WHERE character_id IS NOT NULL DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).run(id(),user.id,c.id,node.id,rank,now());
  else db.prepare('DELETE FROM legacy_progress WHERE character_id=? AND key=?').run(c.id,node.id);
  logLegacy(user,c.id,node.id,rank);return{ok:true}
 });
 route('PUT','/api/legacy/visibility','member',({user,body})=>{db.prepare('UPDATE users SET legacy_public=? WHERE id=?').run(body.public?1:0,user.id);return{ok:true}});
 route('GET','/api/legacy/guild','member',()=>({members:db.prepare(`SELECT id,username FROM users WHERE legacy_public=1 AND status='active' AND hidden=0`).all().map(u=>({username:u.username,points:legacyOf(u.id).points,milestones:milestones(u.id).filter(m=>m.done).length}))}));

 route('GET','/api/dashboard','member',async({user})=>{
  await refreshNews();const characters=db.prepare('SELECT * FROM characters WHERE user_id=?').all(user.id);
  const raids=db.prepare(`SELECT r.id,r.name,r.starts_at,r.status raid_status,i.name instance,s.role,s.status,c.name character FROM raid_signups s JOIN characters c ON c.id=s.character_id JOIN raids r ON r.id=s.raid_id JOIN raid_instances i ON i.id=r.instance_id WHERE c.user_id=? AND r.starts_at>? ORDER BY r.starts_at LIMIT 5`).all(user.id,now());
  const bis=[];for(const c of characters)for(const l of db.prepare('SELECT id,spec FROM bis_lists WHERE class_id=?').all(c.class_id))bis.push({character:c.name,spec:l.spec,...bisProgress(db,l.id,c.id)});
  return{user:{username:user.username,guildRank:user.guild_rank,mainCharacterId:user.main_character_id,dashboard:JSON.parse(user.dashboard_json||'{}')},characters:characters.map(publicCharacter),raids,bis,wishes:db.prepare(`SELECT COUNT(*) n FROM character_items i JOIN characters c ON c.id=i.character_id WHERE c.user_id=? AND i.status IN ('needed','wishlist')`).get(user.id).n,professions:db.prepare('SELECT p.profession,p.skill,c.name FROM character_professions p JOIN characters c ON c.id=p.character_id WHERE c.user_id=?').all(user.id),crafts:db.prepare(`SELECT id,item_name,status FROM craft_requests WHERE (requester_id=? OR crafter_id=?) AND status NOT IN ('done','cancelled')`).all(user.id,user.id),announcement:db.prepare(`SELECT id,title FROM forum_topics WHERE category_id='announcements' ORDER BY created_at DESC LIMIT 1`).get()||null,news:db.prepare('SELECT title,link FROM news_items ORDER BY published_at DESC LIMIT 3').all(),patch:db.prepare(`SELECT version,released_on,source_url FROM patches WHERE status='approved' ORDER BY released_on DESC LIMIT 1`).get()||null,unread:forum.unreadTopics(user),notifications:db.prepare('SELECT id,message,link,created_at FROM notifications WHERE user_id=? AND read_at IS NULL ORDER BY created_at DESC LIMIT 8').all(user.id),raidCount:db.prepare(`SELECT COUNT(*) n FROM raid_signups s JOIN characters c ON c.id=s.character_id JOIN raids r ON r.id=s.raid_id WHERE c.user_id=? AND r.status='done' AND s.status='confirmed'`).get(user.id).n,kills:db.prepare('SELECT COUNT(DISTINCT p.kill_id) n FROM kill_participants p JOIN characters c ON c.id=p.character_id WHERE c.user_id=?').get(user.id).n,hall:db.prepare(`SELECT COUNT(*) n FROM hall_entries WHERE submitted_by=? AND status='approved'`).get(user.id).n,legacy:legacyOf(user.id).points,legacyCap:LEGACY_POINT_CAP}
 });
 return{refreshNews,detectChanges}
}
