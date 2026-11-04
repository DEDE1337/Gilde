/* Guild forum and notice board. Bodies stay plain text; the client escapes them and only links https URLs. */
import {discord,berlinTime} from './discord.js';
import {route,fail,text,oneOf,now,id,can,rateLimit,needUpload,publicCharacter,notify} from './core.js';

export function registerForumRoutes(db){
 const canRead=(user,cat)=>cat.access==='public'||(cat.access==='member'&&!!user)||(cat.access==='officer'&&can(user,'moderate'));
 const category=(user,cid)=>{const c=db.prepare('SELECT * FROM forum_categories WHERE id=?').get(cid)||fail(404,'Kategorie nicht gefunden.');if(!canRead(user,c))fail(user?403:401,'Dieser Bereich ist geschützt.');return c};
 const topic=(user,tid)=>{const t=db.prepare('SELECT * FROM forum_topics WHERE id=?').get(tid)||fail(404,'Thema nicht gefunden.');category(user,t.category_id);return t};
 const author=uid=>{const u=db.prepare('SELECT id,username,guild_rank,main_character_id FROM users WHERE id=?').get(uid);return{username:u.username,guildRank:u.guild_rank,character:publicCharacter(db.prepare('SELECT * FROM characters WHERE id=?').get(u.main_character_id))}};
 const addPost=(topicId,user,body,image)=>{const stamp=now();db.prepare('INSERT INTO forum_posts(id,topic_id,user_id,body,image_id,created_at) VALUES (?,?,?,?,?,?)').run(id(),topicId,user.id,text(body,'Beitrag',{min:2,max:10000}),needUpload(db,user,image),stamp);db.prepare('UPDATE forum_topics SET last_post_at=? WHERE id=?').run(stamp,topicId)};
 // Like count, whether the reader liked it, and up to 20 names for the hover text.
 const likesOf=(postId,user)=>{const names=db.prepare('SELECT u.username FROM forum_likes l JOIN users u ON u.id=l.user_id WHERE l.post_id=? ORDER BY l.created_at LIMIT 20').all(postId).map(r=>r.username);return{likes:db.prepare('SELECT COUNT(*) n FROM forum_likes WHERE post_id=?').get(postId).n,liked:!!(user&&db.prepare('SELECT 1 FROM forum_likes WHERE post_id=? AND user_id=?').get(postId,user.id)),likers:names}};
 const unread=(user,t)=>{const r=db.prepare('SELECT read_at FROM forum_reads WHERE user_id=? AND topic_id=?').get(user.id,t.id);return !r||r.read_at<t.last_post_at};

 route('GET','/api/forum','public',({user})=>({categories:db.prepare('SELECT * FROM forum_categories ORDER BY sort').all().filter(c=>canRead(user,c)).map(c=>({...c,topics:db.prepare('SELECT COUNT(*) n FROM forum_topics WHERE category_id=?').get(c.id).n,last:db.prepare('SELECT title,last_post_at FROM forum_topics WHERE category_id=? ORDER BY last_post_at DESC LIMIT 1').get(c.id)||null})),moderator:can(user,'moderate')}));
 route('POST','/api/forum/categories','admin',({body})=>{const cid=id();db.prepare('INSERT INTO forum_categories(id,name,description,sort,access) VALUES (?,?,?,?,?)').run(cid,text(body.name,'Name',{min:2,max:60}),text(body.description??'','Beschreibung',{max:200}),db.prepare('SELECT COALESCE(MAX(sort),0)+1 n FROM forum_categories').get().n,oneOf(body.access??'member',['public','member','officer'],'Zugriff'));return{id:cid}});
 route('DELETE','/api/forum/categories/:id','admin',({params})=>{if(db.prepare('SELECT 1 FROM forum_topics WHERE category_id=? LIMIT 1').get(params.id))fail(409,'Die Kategorie enthält noch Themen.');db.prepare('DELETE FROM forum_categories WHERE id=?').run(params.id);return{ok:true}});
 route('GET','/api/forum/search','member',({user,query})=>{const q=(query.get('q')||'').trim();if(q.length<2)fail(400,'Suche braucht mindestens 2 Zeichen.');const like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';return{topics:db.prepare(`SELECT DISTINCT t.id,t.title,t.category_id,t.last_post_at FROM forum_topics t LEFT JOIN forum_posts p ON p.topic_id=t.id AND p.removed=0 WHERE t.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\' ORDER BY t.last_post_at DESC LIMIT 50`).all(like,like).filter(t=>canRead(user,db.prepare('SELECT access FROM forum_categories WHERE id=?').get(t.category_id)))}});
 route('GET','/api/forum/categories/:id','public',({user,params})=>{const c=category(user,params.id);return{category:c,topics:db.prepare(`SELECT t.*,u.username,(SELECT COUNT(*) FROM forum_posts p WHERE p.topic_id=t.id AND p.removed=0) posts FROM forum_topics t JOIN users u ON u.id=t.user_id WHERE t.category_id=? ORDER BY t.pinned DESC,t.last_post_at DESC LIMIT 200`).all(c.id).map(t=>({...t,unread:user?unread(user,t):false}))}});
 route('POST','/api/forum/categories/:id/topics','member',({user,params,body})=>{
  const c=category(user,params.id);rateLimit('post:'+user.id,20,60e3);
  if(c.id==='announcements'&&!can(user,'announce'))fail(403,'Ankündigungen schreiben nur Berechtigte.');
  const tid=id(),stamp=now();db.prepare('INSERT INTO forum_topics(id,category_id,title,user_id,created_at,last_post_at) VALUES (?,?,?,?,?,?)').run(tid,c.id,text(body.title,'Titel',{min:3,max:120}),user.id,stamp,stamp);addPost(tid,user,body.body,body.imageId);
  if(c.id==='announcements'){for(const u of db.prepare(`SELECT id FROM users WHERE status='active' AND id<>?`).all(user.id))notify(db,u.id,`Neue Gildenankündigung: ${body.title.trim()}`,'topic:'+tid,'topic:'+tid);discord('ankuendigungen',{title:'📜 '+body.title.trim(),text:`${String(body.body||'').trim().slice(0,1500)}\n\n– ${user.username}`})}
  return{id:tid}
 });
 route('GET','/api/forum/topics/:id','public',({user,params})=>{
  const t=topic(user,params.id);if(user)db.prepare('INSERT INTO forum_reads VALUES (?,?,?) ON CONFLICT(user_id,topic_id) DO UPDATE SET read_at=excluded.read_at').run(user.id,t.id,now());
  return{topic:t,posts:db.prepare('SELECT * FROM forum_posts WHERE topic_id=? ORDER BY created_at').all(t.id).map(p=>({id:p.id,body:p.removed?'':p.body,removed:!!p.removed,imageId:p.removed?null:p.image_id,createdAt:p.created_at,editedAt:p.edited_at,own:p.user_id===user?.id,author:author(p.user_id),...likesOf(p.id,user)})),categories:can(user,'moderate')?db.prepare('SELECT id,name FROM forum_categories ORDER BY sort').all():[],moderator:can(user,'moderate')}
 });
 route('POST','/api/forum/topics/:id/posts','member',({user,params,body})=>{const t=topic(user,params.id);rateLimit('post:'+user.id,20,60e3);if(t.locked&&!can(user,'moderate'))fail(403,'Dieses Thema ist geschlossen.');addPost(t.id,user,body.body,body.imageId);if(t.user_id!==user.id)notify(db,t.user_id,`Neue Antwort in „${t.title}“`,'topic:'+t.id,`reply:${t.id}:${t.last_post_at.slice(0,13)}`);return{ok:true}});
 route('PUT','/api/forum/topics/:id','moderate',({params,body})=>{
  const t=db.prepare('SELECT * FROM forum_topics WHERE id=?').get(params.id)||fail(404,'Thema nicht gefunden.');
  const target=body.categoryId?(db.prepare('SELECT id FROM forum_categories WHERE id=?').get(String(body.categoryId))||fail(400,'Kategorie ist ungültig.')).id:t.category_id;
  db.prepare('UPDATE forum_topics SET pinned=?,locked=?,category_id=? WHERE id=?').run(body.pinned===undefined?t.pinned:body.pinned?1:0,body.locked===undefined?t.locked:body.locked?1:0,target,t.id);return{ok:true}
 });
 const post=(user,pid)=>{const p=db.prepare('SELECT * FROM forum_posts WHERE id=?').get(pid)||fail(404,'Beitrag nicht gefunden.');topic(user,p.topic_id);if(p.removed)fail(410,'Dieser Beitrag wurde entfernt.');return p};
 route('PUT','/api/forum/posts/:id','member',({user,params,body})=>{const p=post(user,params.id);if(p.user_id!==user.id)fail(403,'Du darfst nur eigene Beiträge bearbeiten.');db.prepare('UPDATE forum_posts SET body=?,edited_at=? WHERE id=?').run(text(body.body,'Beitrag',{min:2,max:10000}),now(),p.id);return{ok:true}});
 // One like per member and post; liking again takes it back. post() checks read access and refuses removed posts.
 route('POST','/api/forum/posts/:id/like','member',({user,params})=>{
  const p=post(user,params.id);rateLimit('like:'+user.id,60,60e3);
  if(Number(db.prepare('DELETE FROM forum_likes WHERE post_id=? AND user_id=?').run(p.id,user.id).changes)===0){
   db.prepare('INSERT INTO forum_likes(post_id,user_id,created_at) VALUES (?,?,?)').run(p.id,user.id,now());
   if(p.user_id!==user.id){const t=db.prepare('SELECT title FROM forum_topics WHERE id=?').get(p.topic_id);notify(db,p.user_id,`${user.username} gefällt dein Beitrag in „${t.title}“`,'topic:'+p.topic_id,`like:${p.id}:${user.id}`)}
  }
  return{id:p.id,...likesOf(p.id,user)}
 });
 route('DELETE','/api/forum/posts/:id','member',({user,params})=>{const p=post(user,params.id);if(p.user_id!==user.id&&!can(user,'moderate'))fail(403,'Du darfst nur eigene Beiträge löschen.');db.prepare('UPDATE forum_posts SET removed=1,image_id=NULL WHERE id=?').run(p.id);return{ok:true}});
 route('GET','/api/board','member',({user})=>({
  announcements:db.prepare(`SELECT id,title,last_post_at FROM forum_topics WHERE category_id='announcements' ORDER BY created_at DESC LIMIT 5`).all(),
  raids:db.prepare(`SELECT r.id,r.name,r.starts_at,r.max_players,(SELECT COUNT(*) FROM raid_signups s WHERE s.raid_id=r.id AND s.status IN ('signed','confirmed')) signed FROM raids r WHERE r.status='open' AND r.starts_at>? ORDER BY r.starts_at LIMIT 5`).all(now()).filter(r=>r.signed<r.max_players),
  crafts:db.prepare(`SELECT id,item_name,quantity FROM craft_requests WHERE status='open' ORDER BY created_at DESC LIMIT 5`).all(),
  events:db.prepare('SELECT id,title,starts_at,category FROM guild_events WHERE starts_at>? ORDER BY starts_at LIMIT 5').all(now()),
  notices:db.prepare('SELECT message,link,created_at FROM notifications WHERE user_id=? AND read_at IS NULL ORDER BY created_at DESC LIMIT 5').all(user.id)
 }));
 return{unreadTopics:user=>db.prepare('SELECT * FROM forum_topics ORDER BY last_post_at DESC LIMIT 100').all().filter(t=>canRead(user,db.prepare('SELECT access FROM forum_categories WHERE id=?').get(t.category_id))&&unread(user,t)).slice(0,5).map(t=>({id:t.id,title:t.title}))}
}
