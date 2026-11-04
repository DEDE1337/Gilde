/* Runs the real server against a throwaway data folder. Wowhead is stubbed for determinism. Usage: node --test tests/ */
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const dir=mkdtempSync(path.join(tmpdir(),'modcheck-test-'));
process.env.MODCHECK_DATA=dir;process.env.MODCHECK_TEST_MODE='1';
writeFileSync(path.join(dir,'discord-webhooks.json'),JSON.stringify({offiziere:'https://discord.com/api/webhooks/1/offiziere',raids:'https://discord.com/api/webhooks/2/raids',umfragen:'https://discord.com/api/webhooks/3/umfragen',allgemein:'nicht-discord'}));
writeFileSync(path.join(dir,'cf-analytics-token.txt'),'0123456789abcdef0123456789abcdef\n');
const realFetch=globalThis.fetch;
const item=id=>({name:'Item '+id,quality:3,icon:'inv_sword_05',tooltip:`<table><tr><td>Gegenstandsstufe <!--ilvl-->30<span><!--stat7-->+5 Ausdauer</span><!--rlvl-->25</td></tr></table>`});
const spell={name:'Leinenverband',icon:'inv_misc_bandage_15',tooltip:'<table><tr><td>Reagenzien:<br /><div class="indent q1"><a href="/forever/de/item=2589/leinenstoff">Leinenstoff</a></div><br /><span class="q1"><a href="/forever/de/item=1251/leinenverband">Leinenverband</a></span> (2)<br>Benötigt <a href="/forever/de/skill=2942/erste-hilfe" class="q1">Erste Hilfe</a> (1)</td></tr></table>'};
const rss=`<rss><channel><item><title>Class Tuning for WoW: Forever</title><link>https://www.wowhead.com/news=1/tuning</link><description>Text</description><guid isPermaLink="false">https://www.wowhead.com/news=1</guid><pubDate>Mon, 02 Nov 2026 14:38:53 -0600</pubDate></item></channel></rss>`;
const discordPosts=[];let discordIds=0;
const discordPollVotes={};
function discordHook(u,init){const m=u.match(/messages\/(\d+)$/);if(m)return Response.json({id:m[1],poll:{answers:[{answer_id:1},{answer_id:2},{answer_id:3}],results:{answer_counts:Object.entries(discordPollVotes).map(([id,count])=>({id:+id,count,me_voted:false}))}}});const body=JSON.parse(init.body);discordPosts.push({channel:u.split('?')[0].split('/').pop(),...body});return u.includes('wait=true')?Response.json({id:String(424242+discordIds++),channel_id:'777'}):new Response(null,{status:204})}
const botCalls=[],botReactors={};
function botApi(u,init){const m=u.match(/messages\/(\d+)\/reactions\/([^/?]+)(\/@me)?/);if(!m)return new Response('',{status:404});const emoji=decodeURIComponent(m[2]);if(init?.method==='PUT'){botCalls.push(emoji);return new Response(null,{status:204})}return Response.json((botReactors[emoji]||[]).map(id=>({id,bot:false})).concat([{id:'1',bot:true}]))}
const stub=async(url,init)=>{const u=String(url);if(u.startsWith('https://discord.com/api/v10/'))return botApi(u,init);if(u.startsWith('https://discord.com/api/webhooks/'))return discordHook(u,init);if(u.startsWith('http://127.0.0.1'))return realFetch(url,init);let m;if(m=u.match(/tooltip\/item\/(\d+)/))return m[1]==='9'?new Response('',{status:404}):Response.json(item(m[1]));if(u.includes('/tooltip/spell/'))return Response.json(spell);if(u.includes('news/rss'))return new Response(rss);return new Response('',{status:404})};
let base,server,sqlite;
const jars={};
async function call(who,method,url,body,raw){
 const headers={Origin:base};if(jars[who])headers.Cookie=jars[who];if(body!==undefined&&!raw)headers['Content-Type']='application/json';
 const r=await realFetch(base+url,{method,headers,body:raw?body:body===undefined?undefined:JSON.stringify(body)});
 const set=r.headers.getSetCookie?.()[0];if(set)jars[who]=set.split(';')[0];
 const data=await r.json().catch(()=>({}));return{status:r.status,data}
}
const ok=async(...a)=>{const r=await call(...a);assert.ok(r.status<300,`${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.data)}`);return r.data};
const denied=async(status,...a)=>{const r=await call(...a);assert.equal(r.status,status,`${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.data)}`);return r.data};
async function makeUser(name,role='member',perms=[]){
 await ok(name,'POST','/api/register',{username:name,password:'richtig-langes-passwort'});
 sqlite.prepare(`UPDATE users SET status='active',role=? WHERE username=?`).run(role,name);
 const uid=sqlite.prepare('SELECT id FROM users WHERE username=?').get(name).id;for(const p of perms)sqlite.prepare('INSERT INTO user_permissions VALUES (?,?)').run(uid,p);
 await ok(name,'POST','/api/login',{username:name,password:'richtig-langes-passwort'});return uid
}
const char=async(who,name,classId=1,race='Gnom',level=60)=>(await ok(who,'POST','/api/characters',{name,surname:'Eisenfaust',classId,race,level})).id;
const raidBody=(leaderId,o={})=>({name:'Onyxia Abend',instanceId:'onyxias-lair',startsAt:'2026-12-20T19:00:00.000Z',duration:180,maxPlayers:40,needTank:2,needHeal:8,needDps:30,minLevel:60,leaderId,status:'open',...o});

before(async()=>{
 globalThis.fetch=stub;
 ({server,sqlite}=await import('../start.mjs'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const {resetRateLimits}=await import('../server/core.js');resetRateLimits();
});
after(()=>{server.close();server.closeAllConnections?.();sqlite.close();globalThis.fetch=realFetch;try{rmSync(dir,{recursive:true,force:true})}catch{}});

let adminId,officerId,memberId,memberChar,otherChar,raidId;
test('Registrierung braucht Freischaltung, Login und Rechte',async()=>{
 await ok('pend','POST','/api/register',{username:'Wartend',password:'richtig-langes-passwort'});
 await denied(403,'pend','POST','/api/login',{username:'Wartend',password:'richtig-langes-passwort'});
 await denied(400,'x','POST','/api/register',{username:'Kurz',password:'zu-kurz'});
 await denied(409,'x','POST','/api/register',{username:'wartend',password:'richtig-langes-passwort'});
 await denied(401,'x','POST','/api/login',{username:'Wartend',password:'falsches-passwort-123'});
 adminId=await makeUser('Admin','admin');officerId=await makeUser('Offizier','officer',['raids','kills','moderate','hall']);memberId=await makeUser('Mitglied');await makeUser('Fremder');
 assert.equal((await ok('Admin','GET','/api/me')).user.role,'admin');
 assert.equal((await call('gast','GET','/api/me')).data.user,null);
 await denied(403,'Mitglied','GET','/api/admin/users');
 await denied(403,'Offizier','PUT',`/api/admin/users/${memberId}`,{role:'admin'});
 await ok('Offizier','GET','/api/members');
 await denied(401,'gast','GET','/api/members');
});
test('Fremde Herkunft und falscher Inhaltstyp werden abgewiesen',async()=>{
 const r=await realFetch(base+'/api/logout',{method:'POST',headers:{Origin:'https://boese.example',Cookie:jars.Mitglied}});assert.equal(r.status,403);
 const t=await realFetch(base+'/api/characters',{method:'POST',headers:{Origin:base,Cookie:jars.Mitglied,'Content-Type':'text/plain'},body:'{"name":"X"}'});assert.equal(t.status,415);
});
test('Charaktere prüfen Volk und Klasse, Fremdzugriff scheitert',async()=>{
 await denied(400,'Mitglied','POST','/api/characters',{name:'Falsch',classId:11,race:'Gnom'});
 memberChar=await char('Mitglied','Thorin');otherChar=await char('Fremder','Fremdling',8,'Mensch');
 await denied(409,'Fremder','POST','/api/characters',{name:'thorin',surname:'eisenfaust',classId:1,race:'Zwerg'});
 await denied(403,'Mitglied','PUT',`/api/characters/${otherChar}/planner`,{talents:{}});
 await denied(403,'Mitglied','DELETE',`/api/characters/${otherChar}`);
 await ok('Mitglied','PUT',`/api/characters/${memberChar}/planner`,{talents:{105796:3},gear:{mainhand:5187}});
 await denied(400,'Mitglied','PUT',`/api/characters/${memberChar}/planner`,{gear:{mainhand:0}});
 const gear=await ok('Mitglied','GET',`/api/characters/${memberChar}/gear`);assert.equal(gear.stats.sta,5);
});
test('Raidplaner: Rechte, Kalender, Anmeldung, Aufstellung, Benachrichtigung',async()=>{
 await denied(403,'Mitglied','POST','/api/raids',raidBody(officerId));
 await denied(400,'Offizier','POST','/api/raids',raidBody(officerId,{needDps:50}));
 raidId=(await ok('Offizier','POST','/api/raids',raidBody(officerId))).id;
 let events=(await ok('Mitglied','GET','/api/events')).events;assert.equal(events.filter(e=>e.title==='Onyxia Abend').length,1);
 await denied(401,'gast','GET','/api/raids');
 await denied(403,'Mitglied','POST',`/api/raids/${raidId}/signups`,{characterId:otherChar,role:'dps'});
 await ok('Mitglied','POST',`/api/raids/${raidId}/signups`,{characterId:memberChar,role:'tank',comment:'Bin dabei'});
 await ok('Mitglied','POST',`/api/raids/${raidId}/signups`,{characterId:memberChar,role:'dps'});
 const low=await char('Mitglied','Kleiner',1,'Zwerg',20);await denied(400,'Mitglied','POST',`/api/raids/${raidId}/signups`,{characterId:low,role:'dps'});
 let raid=await ok('Mitglied','GET',`/api/raids/${raidId}`);assert.equal(raid.signups.length,1);assert.equal(raid.signups[0].role,'dps');
 const sid=raid.signups[0].id;
 await denied(403,'Mitglied','PUT',`/api/raids/${raidId}/signups/${sid}`,{status:'confirmed'});
 await ok('Offizier','PUT',`/api/raids/${raidId}/signups/${sid}`,{status:'confirmed',role:'tank'});
 assert.equal((await ok('Offizier','GET','/api/raids')).raids[0].counts.tank,1);
 await ok('Offizier','PUT',`/api/raids/${raidId}`,raidBody(officerId,{startsAt:'2026-12-21T19:00:00.000Z'}));
 const notes=(await ok('Mitglied','GET','/api/notifications')).notifications.map(n=>n.message).join('|');assert.match(notes,/bestätigt/);assert.match(notes,/verschoben/);
 assert.equal((await ok('Mitglied','GET','/api/events')).events.find(e=>e.title==='Onyxia Abend').startsAt,'2026-12-21T19:00:00.000Z');
 await ok('Mitglied','POST',`/api/raids/${raidId}/signups`,{characterId:memberChar,role:'tank',status:'withdrawn'});
 await ok('Offizier','PUT',`/api/raids/${raidId}/signups/${sid}`,{status:'confirmed'});
});
test('Kalender schreiben nur mit Rechten; Raidtermine sind gesperrt',async()=>{
 const e={title:'Gildenabend',startsAt:'2026-12-01T19:00:00.000Z',duration:60,category:'guild',description:''};
 await denied(401,'gast','POST','/api/events',e);await denied(403,'Mitglied','POST','/api/events',e);await ok('Offizier','POST','/api/events',e);
 const raidEvent=(await ok('Offizier','GET','/api/events')).events.find(x=>x.title==='Onyxia Abend');
 await ok('Offizier','DELETE',`/api/events/${raidEvent.id}`);
 assert.ok((await ok('Offizier','GET','/api/events')).events.some(x=>x.id===raidEvent.id));
});
test('Boss-Kills, Fortschritt, First Kill und Hall of Fame',async()=>{
 await denied(403,'Mitglied','POST','/api/kills',{bossId:'onyxia',killedAt:'2026-12-21T21:00:00.000Z'});
 const first=await ok('Offizier','POST','/api/kills',{bossId:'onyxia',killedAt:'2026-12-21T21:00:00.000Z',raidId,participants:[memberChar]});assert.equal(first.first,true);
 const second=await ok('Offizier','POST','/api/kills',{bossId:'onyxia',killedAt:'2026-12-28T21:00:00.000Z'});assert.equal(second.first,false);
 const p=(await ok('Mitglied','GET','/api/progress')).instances.find(i=>i.id==='onyxias-lair');assert.equal(p.defeated,1);assert.equal(p.bosses[0].kills,2);
 await denied(400,'Offizier','POST',`/api/kills/${second.id}/hall`);
 const hall=await ok('Offizier','POST',`/api/kills/${first.id}/hall`);await denied(409,'Offizier','POST',`/api/kills/${first.id}/hall`);
 assert.equal((await ok('Mitglied','GET','/api/hall')).entries.length,0);
 await denied(403,'Mitglied','PUT',`/api/hall/${hall.id}`,{status:'approved'});
 await ok('Offizier','PUT',`/api/hall/${hall.id}`,{status:'approved'});
 assert.equal((await ok('Mitglied','GET','/api/hall')).entries[0].participants,'Thorin');
 const own=await ok('Mitglied','POST','/api/hall',{title:'Erstes Reittier',category:'mount',occurredOn:'2026-11-20T12:00:00Z'});
 assert.equal((await ok('Mitglied','GET','/api/hall?status=pending')).entries.some(e=>e.id===own.id),false);
 assert.equal((await ok('Offizier','GET','/api/hall?status=pending')).entries.some(e=>e.id===own.id),true);
});
test('BiS: Quelle ist Pflicht, Fortschritt zählt Plätze, Gildenliste geschützt',async()=>{
 await denied(403,'Mitglied','POST','/api/bis',{classId:1,spec:'Schutz',version:'P1',sourceName:'Guide',sourceUrl:'https://www.wowhead.com/forever/guide/x'});
 await denied(400,'Admin','POST','/api/bis',{classId:1,spec:'Schutz',version:'P1',sourceName:'Guide',sourceUrl:'javascript:alert(1)'});
 const list=(await ok('Admin','POST','/api/bis',{classId:1,spec:'Schutz',version:'P1',sourceName:'Guide',sourceUrl:'https://www.wowhead.com/forever/guide/x'})).id;
 await denied(400,'Admin','POST',`/api/bis/${list}/items`,{slot:'head',itemId:9});
 await ok('Admin','POST',`/api/bis/${list}/items`,{slot:'mainhand',itemId:5187});await ok('Admin','POST',`/api/bis/${list}/items`,{slot:'head',itemId:100});await ok('Admin','POST',`/api/bis/${list}/items`,{slot:'head',itemId:101,alternative:true});
 assert.deepEqual((await ok('Mitglied','GET',`/api/characters/${memberChar}/bis/${list}`)).progress,{done:1,total:2});
 await ok('Mitglied','PUT',`/api/characters/${memberChar}/items/100`,{status:'needed'});
 const guild=await ok('Offizier','GET','/api/wishlist/guild');assert.equal(guild.items[0].character.name,'Thorin');
 await denied(403,'Mitglied','GET','/api/wishlist/guild');
 await ok('Mitglied','PUT',`/api/characters/${memberChar}/items/100`,{status:'owned'});
 assert.equal((await ok('Mitglied','GET',`/api/characters/${memberChar}/bis/${list}`)).progress.done,2);
});
test('Berufe, Handwerkersuche und Anfragen',async()=>{
 await denied(400,'Mitglied','PUT',`/api/characters/${memberChar}/professions/Hexerei`,{skill:10});
 await denied(400,'Mitglied','PUT',`/api/characters/${memberChar}/professions/Erste%20Hilfe`,{skill:301});
 await denied(400,'Mitglied','POST',`/api/characters/${memberChar}/recipes`,{spellId:3275,profession:'Erste Hilfe'});
 await ok('Mitglied','PUT',`/api/characters/${memberChar}/professions/Erste%20Hilfe`,{skill:120});
 const r=await ok('Mitglied','POST',`/api/characters/${memberChar}/recipes`,{spellId:3275,profession:'Erste Hilfe'});assert.equal(r.recipe.creates.quantity,2);assert.equal(r.recipe.reagents[0].name,'Leinenstoff');
 assert.equal((await ok('Fremder','GET','/api/crafters?q=leinen')).results[0].character.name,'Thorin');
 const req=await ok('Fremder','POST','/api/crafts',{itemId:1251,quantity:5});
 await denied(400,'Fremder','PUT',`/api/crafts/${req.id}`,{status:'accepted'});
 await denied(403,'Mitglied','PUT',`/api/crafts/${req.id}`,{status:'progress'});
 await ok('Mitglied','PUT',`/api/crafts/${req.id}`,{status:'accepted'});
 await denied(409,'Offizier','PUT',`/api/crafts/${req.id}`,{status:'accepted'});
 await ok('Mitglied','PUT',`/api/crafts/${req.id}`,{status:'done'});
 assert.match((await ok('Fremder','GET','/api/notifications')).notifications[0].message,/abgeschlossen/);
});
test('Forum: Zugriff, Eigentum, Moderation, Upload-Prüfung',async()=>{
 await denied(401,'gast','GET','/api/forum');
 await denied(401,'gast','GET','/api/forum/categories/general');
 await denied(403,'Mitglied','POST','/api/forum/categories/announcements/topics',{title:'Hallo',body:'Inhalt'});
 const t=await ok('Mitglied','POST','/api/forum/categories/general/topics',{title:'<script>alert(1)</script>',body:'Erster Beitrag'});
 await ok('Fremder','POST',`/api/forum/topics/${t.id}/posts`,{body:'Zweiter Beitrag'});
 let view=await ok('Fremder','GET',`/api/forum/topics/${t.id}`);assert.equal(view.posts.length,2);assert.equal(view.posts[0].author.character.name,'Thorin');
 await denied(403,'Fremder','PUT',`/api/forum/posts/${view.posts[0].id}`,{body:'Fremd geändert'});
 await ok('Mitglied','PUT',`/api/forum/posts/${view.posts[0].id}`,{body:'Korrigiert'});
 await denied(403,'Fremder','DELETE',`/api/forum/posts/${view.posts[0].id}`);
 await ok('Offizier','DELETE',`/api/forum/posts/${view.posts[1].id}`);
 await denied(403,'Mitglied','PUT',`/api/forum/topics/${t.id}`,{locked:true});
 await ok('Offizier','PUT',`/api/forum/topics/${t.id}`,{locked:true,pinned:true,categoryId:'trade'});
 await denied(403,'Fremder','POST',`/api/forum/topics/${t.id}/posts`,{body:'Noch etwas'});
 assert.equal((await ok('Fremder','GET','/api/forum/search?q=korrigiert')).topics.length,1);
 assert.equal((await ok('Fremder','GET','/api/forum/search?q=%25%25')).topics.length,0);
 await denied(415,'Mitglied','POST','/api/uploads','<svg onload=alert(1)>',true);
 await denied(401,'gast','POST','/api/uploads',Buffer.from([137,80,78,71,13,10,26,10]),true);
 const png=await ok('Mitglied','POST','/api/uploads',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(32)]),true);
 await denied(403,'Fremder','POST','/api/forum/categories/general/topics',{title:'Fremdes Bild',body:'Inhalt',imageId:png.id});
 assert.equal((await realFetch(`${base}/uploads/${png.id}`)).status,401);
 const shown=await realFetch(`${base}/uploads/${png.id}`,{headers:{Cookie:jars.Mitglied}});assert.equal(shown.headers.get('content-type'),'image/png');assert.equal(shown.headers.get('x-content-type-options'),'nosniff');
});
test('Legacy: Grenzen, Voraussetzung, Sichtbarkeit, keine Mehrfachzählung',async()=>{
 await denied(400,'Mitglied','PUT','/api/legacy/points',{points:66});
 await ok('Mitglied','PUT','/api/legacy/points',{points:10});
 await denied(400,'Mitglied','PUT',`/api/legacy/characters/${memberChar}/talented`,{rank:1});
 await ok('Mitglied','PUT',`/api/legacy/characters/${memberChar}/well-rested`,{rank:5});
 await ok('Mitglied','PUT',`/api/legacy/characters/${memberChar}/talented`,{rank:5});
 await denied(400,'Mitglied','PUT',`/api/legacy/characters/${memberChar}/well-rested`,{rank:0});
 await denied(400,'Mitglied','PUT',`/api/legacy/characters/${memberChar}/diplomat`,{rank:1});
 await ok('Mitglied','PUT','/api/legacy/points',{points:40});
 await ok('Mitglied','PUT',`/api/legacy/characters/${memberChar}/diplomat`,{rank:5});
 await denied(400,'Mitglied','PUT',`/api/legacy/characters/${memberChar}/reinforce`,{rank:2});
 await denied(403,'Fremder','PUT',`/api/legacy/characters/${memberChar}/reinforce`,{rank:1});
 const second=await char('Mitglied','Thorina',1,'Zwerg',60);
 const l=await ok('Mitglied','GET','/api/legacy');assert.equal(l.points,40);assert.equal(l.milestones.filter(m=>m.name==='Krieger Level 60'&&m.done).length,1);void second;
 assert.equal((await ok('Fremder','GET','/api/legacy/guild')).members.length,0);
 await ok('Mitglied','PUT','/api/legacy/visibility',{public:true});
 assert.equal((await ok('Fremder','GET','/api/legacy/guild')).members[0].username,'Mitglied');
});
test('Patch-Tracker: Prüfung vor Freigabe, Betroffene, keine doppelten Meldungen',async()=>{
 const news=await ok('Mitglied','GET','/api/news');assert.equal(news.news[0].is_patch,1);
 await denied(403,'Mitglied','POST','/api/patches',{version:'1.60.1',releasedOn:'2026-11-10',sourceName:'Blizzard',sourceUrl:'https://news.blizzard.com/x'});
 const pid=(await ok('Admin','POST','/api/patches',{version:'1.60.1',releasedOn:'2026-11-10',sourceName:'Blizzard',sourceUrl:'https://news.blizzard.com/x'})).id;
 await ok('Admin','POST',`/api/patches/${pid}/changes`,{classId:1,area:'talent',objectId:105796,objectName:'Testtalent',before:'Alt',after:'Neu',label:'nerf'});
 await ok('Admin','POST',`/api/patches/${pid}/changes`,{classId:8,area:'class',objectName:'Magier',after:'Änderung'});
 assert.equal((await ok('Mitglied','GET','/api/patches')).patches.length,0);
 assert.equal((await ok('Mitglied','GET','/api/impact')).characters[0].changes.length,0);
 const done=await ok('Admin','POST',`/api/patches/${pid}/approve`);assert.ok(done.notifications>=2);
 await denied(409,'Admin','POST',`/api/patches/${pid}/approve`);
 const impact=(await ok('Mitglied','GET','/api/impact')).characters.find(c=>c.character.name==='Thorin');assert.equal(impact.changes[0].object_name,'Testtalent');assert.equal(impact.outdatedBuild,true);
 const n=(await ok('Mitglied','GET','/api/notifications')).notifications.filter(x=>/Testtalent/.test(x.message));assert.equal(n.length,1);
 assert.match((await ok('Fremder','GET','/api/notifications')).notifications.map(x=>x.message).join('|'),/Magier/);
 assert.equal((await ok('Mitglied','GET','/api/patches')).overview[1].nerf,1);
 const lists=(await ok('Mitglied','GET','/api/bis?classId=1')).lists;assert.equal(lists[0].outdatedSince,'1.60.1');
});
test('Dashboard: nur eigene Daten, Einstellungen bleiben',async()=>{
 await denied(401,'gast','GET','/api/dashboard');
 await ok('Mitglied','PUT','/api/me/settings',{dashboard:{hidden:['news'],order:['raids']}});
 const d=await ok('Mitglied','GET','/api/dashboard');assert.deepEqual(d.user.dashboard.hidden,['news']);assert.ok(d.characters.every(c=>c.name.startsWith('Thorin')||c.name==='Kleiner'));assert.equal(d.kills,1);assert.equal(d.legacy,40);assert.equal(d.professions[0].profession,'Erste Hilfe');
 await denied(403,'Fremder','PUT','/api/me/settings',{dashboard:{},mainCharacterId:memberChar});
});
test('Fähigkeiten zeigen nur Zauber der angefragten Klasse',async()=>{
 assert.deepEqual((await ok('Mitglied','GET','/api/abilities/8')).abilities,[]);
 await denied(400,'Mitglied','GET','/api/abilities/6');
});
test('Gäste bekommen nur Anmeldung und Registrierung',async()=>{
 for(const url of ['/api/events','/api/news','/api/progress','/api/guild-summary','/api/hall','/api/forum','/api/patches','/api/patches/talents','/api/bis','/api/items/5187','/api/spells/3275','/api/professions','/api/raid-instances','/api/abilities/1','/api/board','/api/rankings','/api/gibtsnicht'])await denied(401,'gast','GET',url);
 assert.equal((await call('gast','GET','/api/me')).status,200);
 await denied(400,'gast','POST','/api/register',{username:'ab',password:'kurz'});
 await denied(401,'gast','POST','/api/login',{username:'Niemand',password:'falsches-passwort-123'});
});
test('Tagesbonus: nur angemeldet, einmal pro Tag, Serie zählt',async()=>{
 const {payout,berlinDay,SYMBOLS,spinReels}=await import('../server/bonus.js');
 let jackpots=0;for(let i=0;i<20000;i++){const r=spinReels();if(r.some(s=>['epic','legendary'].includes(s.quality))){jackpots++;assert.ok(r.every(s=>s.id===r[0].id),'Lila und Legendär nur als Dreier')}}
 assert.ok(jackpots>700&&jackpots<1300,`Jackpot-Quote ${jackpots} von 20000`);
 const [a,b,c]=SYMBOLS;
 assert.equal(new Set(SYMBOLS.map(s=>s.value)).size,SYMBOLS.length);
 assert.deepEqual(payout([a,a,a]),{sum:6,multiplier:3,base:18,kind:'triple',symbol:'Verband'});
 assert.equal(payout([c,b,c]).kind,'pair');assert.equal(payout([c,b,c]).base,26);
 assert.deepEqual(payout([a,b,c]).base,10);assert.equal(payout([a,b,c]).kind,'none');
 await denied(401,'gast','POST','/api/bonus/spin');await denied(401,'gast','GET','/api/bonus');
 const uid=sqlite.prepare('SELECT id FROM users WHERE username=?').get('Mitglied').id,day=n=>berlinDay(new Date(Date.now()-n*864e5));
 for(const n of [1,2,3])sqlite.prepare('INSERT INTO daily_spins(user_id,day,reels,reward,streak,created_at) VALUES (?,?,?,?,?,?)').run(uid,day(n),'["bag","bag","bag"]',10,4-n,'2026-01-01T00:00:00Z');
 assert.equal((await ok('Mitglied','GET','/api/bonus')).streak,3);
 const before=(await ok('Mitglied','GET','/api/bonus')).balance;
 const spin=await ok('Mitglied','POST','/api/bonus/spin');
 assert.equal(spin.streak,4);assert.equal(spin.spin.reels.length,3);assert.equal(spin.result.streakBonus,8);
 assert.equal(spin.balance,before+spin.spin.reward);assert.equal(spin.rollsLeft,2);
 // Rolls two and three count, but without the streak bonus; the fourth is refused.
 let last=spin;for(const left of [1,0]){const next=await ok('Mitglied','POST','/api/bonus/spin');assert.equal(next.result.free,false);assert.equal(next.result.streakBonus,0);assert.equal(next.rollsLeft,left);assert.equal(next.balance,last.balance+next.result.reward);last=next}
 await denied(409,'Mitglied','POST','/api/bonus/spin');
 assert.equal((await ok('Mitglied','GET','/api/bonus')).balance,last.balance);
 assert.equal((await ok('Offizier','GET','/api/bonus')).streak,0);
 let first;for(let i=0;i<3;i++){first=await ok('Admin','POST','/api/bonus/spin');assert.equal(first.result.free,false)}assert.equal(first.canRespin,true);
 for(let i=0;i<3;i++){const extra=await ok('Admin','POST','/api/bonus/spin');assert.equal(extra.result.free,true);assert.equal(extra.balance,first.balance)}
 assert.equal((await ok('Offizier','GET','/api/bonus')).canRespin,false);
 sqlite.prepare('INSERT INTO user_permissions VALUES (?,?)').run(uid,'freespins');
 const free=await ok('Mitglied','POST','/api/bonus/spin');assert.equal(free.result.free,true);assert.equal(free.canRespin,true);assert.equal(free.balance,last.balance);
 sqlite.prepare('DELETE FROM user_permissions WHERE user_id=? AND permission=?').run(uid,'freespins');
 await denied(409,'Mitglied','POST','/api/bonus/spin');
 await denied(401,'gast','GET','/api/rankings');
 sqlite.prepare('INSERT INTO daily_spins(user_id,day,reels,reward,streak,created_at) VALUES (?,?,?,?,?,?)').run(uid,day(20),'["bag","bag","bag"]',5000,1,'2026-01-01T00:00:00Z');
 const top=(await ok('Offizier','GET','/api/rankings')).players.find(p=>p.username==='Mitglied');
 assert.equal(top.username,'Mitglied');assert.equal(top.own,false);assert.equal(top.streak,4);assert.equal(top.spins,7);assert.equal(top.best,5000);assert.equal(top.week,top.total-5000-sqlite.prepare('SELECT COALESCE(SUM(amount),0) n FROM gold_ledger WHERE user_id=?').get(uid).n);assert.equal(top.character.name,'Thorin');
 assert.equal((await ok('Mitglied','GET','/api/rankings')).players.find(p=>p.username==='Mitglied').own,true);
});
test('Roulette: Gold wird serverseitig verrechnet, kein Überziehen',async()=>{
 const {rouletteColor,roulettePayout}=await import('../server/bonus.js');
 assert.equal(rouletteColor(0),'green');assert.equal(rouletteColor(1),'red');assert.equal(rouletteColor(2),'black');assert.equal(rouletteColor(36),'red');
 assert.equal(roulettePayout('red',10,1),20);assert.equal(roulettePayout('red',10,2),0);assert.equal(roulettePayout('green',10,0),360);assert.equal(roulettePayout('black',10,0),0);
 await denied(401,'gast','GET','/api/roulette');await denied(401,'gast','POST','/api/roulette/spin',{color:'red',amount:1});
 const {balance}=await ok('Mitglied','GET','/api/roulette');assert.ok(balance>1);
 await denied(400,'Mitglied','POST','/api/roulette/spin',{color:'blau',amount:1});
 await denied(400,'Mitglied','POST','/api/roulette/spin',{color:'red',amount:0});
 await denied(400,'Mitglied','POST','/api/roulette/spin',{color:'red',amount:-5});
 await denied(400,'Mitglied','POST','/api/roulette/spin',{color:'red',amount:1.5});
 await denied(400,'Mitglied','POST','/api/roulette/spin',{color:'red',amount:balance+1});
 await denied(400,'Offizier','POST','/api/roulette/spin',{color:'red',amount:1});
 const r=await ok('Mitglied','POST','/api/roulette/spin',{color:'black',amount:1});
 assert.equal(r.balance,balance-1+r.payout);assert.equal(r.won,r.color==='black');assert.equal(r.last[0].number,r.number);
 assert.equal((await ok('Fremder','GET','/api/roulette')).last[0].number,r.number);
 assert.equal((await ok('Mitglied','GET','/api/bonus')).balance,r.balance);
 const me=(await ok('Mitglied','GET','/api/rankings')).players.find(p=>p.username==='Mitglied');assert.equal(me.total,r.balance);assert.equal(me.roulette,r.payout-1);
 const all=await ok('Mitglied','POST','/api/roulette/spin',{color:'green',amount:r.balance});assert.equal(all.balance,all.payout);
});
test('Blackjack: Regeln, Geheimhaltung und Gold',async()=>{
 const {handValue,settleHand,settleNatural}=await import('../server/blackjack.js');
 assert.equal(handValue(['AS','KH']),21);assert.equal(handValue(['AS','AH','9D']),21);assert.equal(handValue(['AS','9H','5D']),15);assert.equal(handValue(['TS','QH','5D']),25);
 assert.deepEqual(settleNatural(['AS','KH'],['9S','7H'],10),{result:'blackjack',payout:25});
 assert.deepEqual(settleNatural(['AS','KH'],['AH','QH'],10),{result:'push',payout:10});
 assert.equal(settleNatural(['9S','7H'],['AS','KH'],10).payout,0);assert.equal(settleNatural(['9S','7H'],['9S','7H'],10),null);
 assert.equal(settleHand(['TS','9H'],['TD','6C'],['5S'],10).result,'lose');
 assert.deepEqual(settleHand(['TS','9H'],['TD','6C'],['KS'],10).dealer,['TD','6C','KS']);assert.equal(settleHand(['TS','9H'],['TD','6C'],['KS'],10).payout,20);
 assert.equal(settleHand(['TS','9H'],['TD','9C'],[],10).payout,10);
 assert.equal(settleHand(['TS','9H','5D'],['TD','6C'],['KS'],10).result,'bust');assert.equal(settleHand(['TS','9H','5D'],['TD','6C'],['KS'],10).dealer.length,2);
 await denied(401,'gast','GET','/api/blackjack');await denied(401,'gast','POST','/api/blackjack/deal',{amount:1});
 const uid=sqlite.prepare('SELECT id FROM users WHERE username=?').get('Fremder').id;
 sqlite.prepare(`INSERT INTO daily_spins(user_id,day,reels,reward,streak,created_at) VALUES (?,'2026-01-01','["bag","bag","bag"]',100,1,'2026-01-01T00:00:00Z')`).run(uid);
 const start=(await ok('Fremder','GET','/api/blackjack')).balance;assert.ok(start>=100);
 await denied(400,'Fremder','POST','/api/blackjack/deal',{amount:start+1});await denied(400,'Fremder','POST','/api/blackjack/deal',{amount:0});
 await denied(409,'Fremder','POST','/api/blackjack/hit');await denied(409,'Fremder','POST','/api/blackjack/stand');
 const hand=(o)=>{sqlite.prepare(`DELETE FROM blackjack_hands WHERE user_id=? AND status='playing'`).run(uid);sqlite.prepare(`INSERT INTO blackjack_hands(id,user_id,amount,deck,player,dealer,created_at) VALUES (?,?,?,?,?,?,'2026-01-01T00:00:00Z')`).run(crypto.randomUUID(),uid,o.amount,JSON.stringify(o.deck),JSON.stringify(o.player),JSON.stringify(o.dealer))};
 const before=(await ok('Fremder','GET','/api/blackjack')).balance;
 hand({amount:10,player:['TS','6H'],dealer:['TD','7C'],deck:['5C','KS']});
 const open=await ok('Fremder','GET','/api/blackjack');assert.equal(open.balance,before-10);assert.equal(open.hand.dealer[1],null);assert.equal(open.hand.dealerTotal,10);assert.ok(!JSON.stringify(open).includes('deck'));assert.ok(!JSON.stringify(open).includes('7C'));
 await denied(409,'Fremder','POST','/api/blackjack/deal',{amount:1});
 const hit=await ok('Fremder','POST','/api/blackjack/hit');assert.equal(hit.hand.status,'done');assert.equal(hit.hand.playerTotal,21);assert.equal(hit.hand.result,'win');assert.equal(hit.balance,before+10);
 hand({amount:10,player:['TS','6H'],dealer:['TD','7C'],deck:['KS']});
 const bust=await ok('Fremder','POST','/api/blackjack/hit');assert.equal(bust.hand.result,'bust');assert.equal(bust.balance,before);
 hand({amount:10,player:['5S','6H'],dealer:['TD','7C'],deck:['TS']});
 const dbl=await ok('Fremder','POST','/api/blackjack/double');assert.equal(dbl.hand.amount,20);assert.equal(dbl.hand.result,'win');assert.equal(dbl.balance,before+20);
 hand({amount:10,player:['5S','2H'],dealer:['TD','7C'],deck:['2C','2D','2S']});
 await ok('Fremder','POST','/api/blackjack/hit');await denied(400,'Fremder','POST','/api/blackjack/double');
 const stood=await ok('Fremder','POST','/api/blackjack/stand');assert.equal(stood.hand.result,'lose');
 hand({amount:stood.balance,player:['5S','6H'],dealer:['TD','7C'],deck:['TS']});
 await denied(400,'Fremder','POST','/api/blackjack/double');
 sqlite.prepare(`DELETE FROM blackjack_hands WHERE user_id=? AND status='playing'`).run(uid);
 const real=await ok('Fremder','POST','/api/blackjack/deal',{amount:1});assert.ok(['playing','done'].includes(real.hand.status));assert.ok(!JSON.stringify(real).includes('"deck"'));
 assert.equal(typeof (await ok('Fremder','GET','/api/rankings')).players.find(p=>p.username==='Fremder').blackjack,'number');
});
test('Logout beendet die Sitzung, Passwortwechsel auch',async()=>{
 const old=jars.Fremder;await ok('Fremder','POST','/api/logout');jars.Fremder=old;await denied(401,'Fremder','GET','/api/dashboard');
 await ok('Fremder','POST','/api/login',{username:'Fremder',password:'richtig-langes-passwort'});
 const held=jars.Fremder;await ok('Fremder','PUT','/api/me/password',{current:'richtig-langes-passwort',next:'noch-ein-langes-passwort'});jars.Fremder=held;await denied(401,'Fremder','GET','/api/dashboard');
});

test('Cloudflare-Analyse steckt nur in der Startseite',async()=>{
 const page=await (await realFetch(base+'/')).text();
 assert.match(page,/static\.cloudflareinsights\.com\/beacon\.min\.js" data-cf-beacon='\{"token":"0123456789abcdef0123456789abcdef"\}'><\/script><\/body>/);
 assert.doesNotMatch(await (await realFetch(base+'/schildwall.css')).text(),/cloudflareinsights/);
});

test('Rechtliches: für Gäste offen, Impressum aus data/ wird maskiert',async()=>{
 let page=await (await realFetch(base+'/rechtliches.html')).text();
 assert.match(page,/kein geschäftsmäßiges Angebot/);assert.match(page,/Cloudflare Web Analytics/);assert.doesNotMatch(page,/<!--IMPRESSUM-->/);
 writeFileSync(path.join(dir,'impressum.txt'),'Max <b>Muster</b>\nBeispielweg 1');
 page=await (await realFetch(base+'/rechtliches.html')).text();
 assert.match(page,/<p>Max &#60;b&#62;Muster&#60;\/b&#62;<br>Beispielweg 1<\/p>/);
});

test('Härtung: Kontosperre nach Fehlversuchen, Namen ohne Groß-/Kleinschreibung, Header, 3D nur angemeldet',async()=>{
 const {resetRateLimits}=await import('../server/core.js');resetRateLimits();
 await makeUser('Sperrziel');
 for(let i=0;i<10;i++)await denied(401,'raten','POST','/api/login',{username:'Sperrziel',password:'falsch-falsch-falsch'});
 await denied(429,'raten','POST','/api/login',{username:'sperrziel',password:'richtig-langes-passwort'});
 resetRateLimits();
 await ok('Sperrziel2','POST','/api/login',{username:'Sperrziel',password:'richtig-langes-passwort'});
 await denied(409,'klon','POST','/api/register',{username:'SPERRZIEL',password:'richtig-langes-passwort'});
 const page=await realFetch(base+'/');
 assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(page.headers.get('content-security-policy'),/object-src 'none'/);
 assert.equal((await realFetch(base+'/model/meta/item/1.json')).status,401);
 resetRateLimits();
});

test('Discord: Meldungen gehen an die richtigen Webhooks, ohne Pings, Erinnerung nur einmal',async()=>{
 const waitFor=async fn=>{for(let i=0;i<80&&!fn();i++)await new Promise(r=>setTimeout(r,100));return fn()};
 await ok('neu','POST','/api/register',{username:'DiscordNeuling',password:'richtig-langes-passwort'});
 assert.ok(await waitFor(()=>discordPosts.some(p=>p.channel==='offiziere'&&p.embeds[0].description.includes('DiscordNeuling'))));
 const leader=sqlite.prepare('SELECT id FROM users WHERE username=?').get('Offizier').id;
 const startsAt=new Date(Date.now()+30*60e3).toISOString();
 const rid=(await ok('Offizier','POST','/api/raids',raidBody(leader,{name:'@everyone Testraid',startsAt}))).id;
 assert.ok(await waitFor(()=>discordPosts.some(p=>p.channel==='raids'&&p.embeds[0].title.includes('Testraid'))));
 assert.ok(discordPosts.every(p=>Array.isArray(p.allowed_mentions.parse)&&p.allowed_mentions.parse.length===0));
 assert.ok(!discordPosts.some(p=>p.channel==='nicht-discord'));
 const {remindRaids}=await import('../server/raids.js');remindRaids(sqlite);remindRaids(sqlite);
 assert.ok(await waitFor(()=>discordPosts.some(p=>p.embeds[0].title.startsWith('⏰')&&p.embeds[0].title.includes('Testraid'))));
 await new Promise(r=>setTimeout(r,1500));
 assert.equal(discordPosts.filter(p=>p.embeds[0].title.startsWith('⏰')&&p.embeds[0].title.includes('Testraid')).length,1);
 await ok('Offizier','DELETE','/api/raids/'+rid).catch(()=>{});
});

test('Umfragen: anlegen nur mit Recht, abstimmen, ändern, Discord-Stimmen zählen mit',async()=>{
 const ends=new Date(Date.now()+48*36e5).toISOString();
 await denied(403,'Mitglied','POST','/api/polls',{question:'Wer kommt zum Raid?',options:['Ja','Nein'],closesAt:ends});
 await denied(400,'Admin','POST','/api/polls',{question:'Doppelte Antworten?',options:['Ja','ja'],closesAt:ends});
 await denied(400,'Admin','POST','/api/polls',{question:'Viel zu lange Umfrage',options:['A','B'],closesAt:new Date(Date.now()+40*864e5).toISOString()});
 const made=await ok('Admin','POST','/api/polls',{question:'Welches Volk spielst du?',kind:'race',popup:true,closesAt:ends});
 assert.equal(made.onDiscord,true);
 const dpost=discordPosts.find(p=>p.channel==='umfragen'&&p.poll);
 assert.equal(dpost.poll.question.text,'Welches Volk spielst du?');assert.equal(dpost.poll.answers.length,6);assert.equal(dpost.poll.duration,48);
 let poll=(await ok('Mitglied','GET','/api/polls')).polls.find(p=>p.id===made.id);
 assert.deepEqual(poll.options,['Mensch','Zwerg','Nachtelf','Gnom','Skyborne','Noch unentschlossen']);assert.equal(poll.popup,true);assert.deepEqual(poll.mine,[]);
 await denied(400,'Mitglied','POST',`/api/polls/${made.id}/vote`,{options:[0,1]});
 await denied(400,'Mitglied','POST',`/api/polls/${made.id}/vote`,{options:[9]});
 poll=(await ok('Mitglied','POST',`/api/polls/${made.id}/vote`,{options:[3]})).poll;assert.deepEqual(poll.mine,[3]);assert.equal(poll.web[3],1);
 poll=(await ok('Mitglied','POST',`/api/polls/${made.id}/vote`,{options:[2]})).poll;assert.equal(poll.web[3],0);assert.equal(poll.web[2],1);assert.equal(poll.voters,1);
 discordPollVotes[1]=4;discordPollVotes[3]=2;
 const {syncPolls}=await import('../server/polls.js');await syncPolls(sqlite);
 poll=(await ok('Mitglied','GET','/api/polls')).polls.find(p=>p.id===made.id);
 assert.deepEqual(poll.discord.slice(0,3),[4,0,2]);assert.equal(poll.web[2]+poll.discord[2],3);assert.ok(poll.discordSyncedAt);
 await ok('Admin','POST',`/api/polls/${made.id}/close`);
 await denied(409,'Mitglied','POST',`/api/polls/${made.id}/vote`,{options:[1]});
 await denied(403,'Mitglied','DELETE',`/api/polls/${made.id}`);
 await ok('Admin','DELETE',`/api/polls/${made.id}`);
 assert.equal((await ok('Mitglied','GET','/api/polls')).polls.some(p=>p.id===made.id),false);
 await denied(401,'gast','GET','/api/polls');
});

test('YouTube-Vorschaubilder nur für Angemeldete und nur mit gültiger ID',async()=>{
 assert.equal((await realFetch(base+'/yt/lVPBik2gNQA.jpg')).status,401);
 const r=await realFetch(base+'/yt/kaputt.jpg');assert.ok([403,404].includes(r.status));
 assert.match((await realFetch(base+'/')).headers.get('content-security-policy'),/frame-src https:\/\/www\.youtube-nocookie\.com/);
});

test('Charaktererstellung: Geschlecht und Aussehen werden gespeichert und beim Bearbeiten behalten',async()=>{
 const cid=(await ok('Mitglied','POST','/api/characters',{name:'Lockenkopf',surname:'Sturmwind',classId:8,race:'Mensch',level:1,gender:1,appearance:{14:17160,16:17184}})).id;
 let c=(await ok('Mitglied','GET','/api/characters')).characters.find(x=>x.id===cid);
 assert.equal(c.gender,1);assert.deepEqual(c.appearance,{14:17160,16:17184});
 await ok('Mitglied','PUT','/api/characters/'+cid,{name:'Lockenkopf',classId:8,race:'Mensch',level:12});
 c=(await ok('Mitglied','GET','/api/characters')).characters.find(x=>x.id===cid);
 assert.equal(c.level,12);assert.equal(c.gender,1);assert.deepEqual(c.appearance,{14:17160,16:17184});
 await denied(400,'Mitglied','POST','/api/characters',{name:'Kaputt',classId:1,race:'Mensch',gender:2});
 await denied(400,'Mitglied','POST','/api/characters',{name:'Kaputt',classId:1,race:'Mensch',appearance:{abc:1}});
 await ok('Mitglied','DELETE','/api/characters/'+cid);
});

test('Forever-Namen: Nachname Pflicht, nur Buchstaben, Kombination einmalig',async()=>{
 await denied(400,'Mitglied','POST','/api/characters',{name:'Ohnenach',classId:1,race:'Mensch'});
 await denied(400,'Mitglied','POST','/api/characters',{name:'Leer',surname:'von Stein',classId:1,race:'Mensch'});
 const a=(await ok('Mitglied','POST','/api/characters',{name:'Thorin',surname:'kUPFERBART',classId:1,race:'Zwerg'})).id;
 const c=(await ok('Mitglied','GET','/api/characters')).characters.find(x=>x.id===a);
 assert.equal(c.surname,'Kupferbart');assert.equal(c.fullName,'Thorin Kupferbart');
 await denied(409,'Offizier','POST','/api/characters',{name:'THORIN',surname:'kupferbart',classId:1,race:'Zwerg'});
 await ok('Mitglied','DELETE','/api/characters/'+a);
});

test('Unsichtbare Konten: nicht in Mitgliederliste, Rangliste und Umfrage-Zählung',async()=>{
 const ends=new Date(Date.now()+48*36e5).toISOString();
 const adminId=sqlite.prepare('SELECT id FROM users WHERE username=?').get('Admin').id;
 await denied(403,'Offizier','PUT','/api/admin/users/'+adminId,{hidden:true});
 await ok('Admin','PUT','/api/admin/users/'+adminId,{hidden:true});
 assert.equal((await ok('Mitglied','GET','/api/members')).members.some(m=>m.username==='Admin'),false);
 assert.equal((await ok('Mitglied','GET','/api/rankings')).players.some(p=>p.username==='Admin'),false);
 const pid=(await ok('Admin','POST','/api/polls',{question:'Unsichtbar-Test?',options:['Ja','Nein'],closesAt:ends})).id;
 const mine=(await ok('Admin','POST',`/api/polls/${pid}/vote`,{options:[0]})).poll;assert.deepEqual(mine.mine,[0]);assert.equal(mine.web[0],0);
 await ok('Mitglied','POST',`/api/polls/${pid}/vote`,{options:[1]});
 const seen=(await ok('Mitglied','GET','/api/polls')).polls.find(p=>p.id===pid);assert.deepEqual(seen.web,[0,1]);assert.equal(seen.voters,1);
 await ok('Admin','DELETE','/api/polls/'+pid);
 await ok('Admin','PUT','/api/admin/users/'+adminId,{hidden:false});
 assert.equal((await ok('Mitglied','GET','/api/members')).members.some(m=>m.username==='Admin'),true);
});

test('Proxy-Modi: gefälschte Header werden nur im passenden Modus beachtet',async()=>{
 const seen=async headers=>{const r=await realFetch(base+'/api/admin/client-ip',{headers:{Cookie:jars.Admin,...headers}});assert.equal(r.status,200);return(await r.json()).seenAs};
 const forged={'cf-connecting-ip':'6.6.6.6','x-real-ip':'7.7.7.7','x-forwarded-for':'8.8.8.8, 9.9.9.9'};
 const old=process.env.MODCHECK_TRUST_PROXY;
 try{
  delete process.env.MODCHECK_TRUST_PROXY;assert.equal(await seen(forged),'127.0.0.1');
  process.env.MODCHECK_TRUST_PROXY='proxy';assert.equal(await seen(forged),'7.7.7.7');
  assert.equal(await seen({'cf-connecting-ip':'6.6.6.6','x-forwarded-for':'8.8.8.8, 9.9.9.9'}),'9.9.9.9');
  assert.equal(await seen({'cf-connecting-ip':'6.6.6.6'}),'127.0.0.1');
  process.env.MODCHECK_TRUST_PROXY='cloudflare';assert.equal(await seen(forged),'6.6.6.6');
 }finally{if(old===undefined)delete process.env.MODCHECK_TRUST_PROXY;else process.env.MODCHECK_TRUST_PROXY=old}
 await denied(403,'Mitglied','GET','/api/admin/client-ip');await denied(401,'gast','GET','/api/admin/client-ip');
});

test('Erster Start ohne Shell: Admin aus Umgebungsvariable, Passwort nur im Log, nur einmal',async()=>{
 const {spawnSync}=await import('node:child_process');const {mkdtempSync}=await import('node:fs');
 const data=mkdtempSync(path.join(tmpdir(),'modcheck-boot-')),root=path.resolve(import.meta.dirname,'..');
 const run=env=>spawnSync(process.execPath,['--input-type=module','-e',`const {sqlite}=await import(${JSON.stringify(new URL('../start.mjs',import.meta.url).href)});console.log('USERS='+JSON.stringify(sqlite.prepare('SELECT username,role,status FROM users').all()));process.exit(0)`],{cwd:root,encoding:'utf8',env:{...process.env,MODCHECK_DATA:data,MODCHECK_TEST_MODE:'1',...env}});
 try{
  const first=run({MODCHECK_BOOTSTRAP_ADMIN:'Erstadmin'});
  assert.match(first.stdout,/Administrator "Erstadmin" angelegt\. Einmaliges Passwort: \S{12,}/);
  assert.match(first.stdout,/USERS=\[\{"username":"Erstadmin","role":"admin","status":"active"\}\]/);
  const second=run({MODCHECK_BOOTSTRAP_ADMIN:'Zweitadmin'});
  assert.doesNotMatch(second.stdout,/Einmaliges Passwort/);assert.match(second.stdout,/USERS=\[\{"username":"Erstadmin"/);assert.doesNotMatch(second.stdout,/Zweitadmin/);
  const bad=run({MODCHECK_BOOTSTRAP_ADMIN:'x y'});assert.doesNotMatch(bad.stdout,/Einmaliges Passwort/);
 }finally{try{rmSync(data,{recursive:true,force:true})}catch{}}
});

test('Einstellungen ohne Dateizugriff: Discord, Domain und Impressum aus Umgebungsvariablen',async()=>{
 const {configureDiscord}=await import('../server/discord.js');const {mkdtempSync}=await import('node:fs');
 const empty=mkdtempSync(path.join(tmpdir(),'modcheck-env-'));
 const keep={w:process.env.MODCHECK_DISCORD_WEBHOOKS,d:process.env.MODCHECK_DOMAIN};
 try{
  process.env.MODCHECK_DISCORD_WEBHOOKS=JSON.stringify({raids:'https://discord.com/api/webhooks/5/abc-DEF_123',allgemein:'kein-webhook'});
  assert.deepEqual(configureDiscord(empty),['raids']);
  assert.deepEqual(configureDiscord(dir).sort(),['offiziere','raids','umfragen']); // the file wins over the variable
 }finally{for(const [k,v] of [['MODCHECK_DISCORD_WEBHOOKS',keep.w],['MODCHECK_DOMAIN',keep.d]]){if(v===undefined)delete process.env[k];else process.env[k]=v}configureDiscord(dir);try{rmSync(empty,{recursive:true,force:true})}catch{}}
});

test('Discord-Bot: Registrierung per Emoji annehmen oder ablehnen',async()=>{
 const waitFor=async fn=>{for(let i=0;i<80&&!fn();i++)await new Promise(r=>setTimeout(r,100));return fn()};
 process.env.MODCHECK_DISCORD_BOT_TOKEN='test-token';
 try{
  const {syncApprovals}=await import('../server/approvals.js');
  await ok('neu','POST','/api/register',{username:'EmojiJa',password:'richtig-langes-passwort'});
  await ok('neu','POST','/api/register',{username:'EmojiNein',password:'richtig-langes-passwort'});
  assert.ok(await waitFor(()=>botCalls.length>=4),'der Bot setzt beide Emojis unter jede Meldung');
  assert.deepEqual([...new Set(botCalls)].sort(),['✅','❌'].sort());
  const statusOf=n=>sqlite.prepare('SELECT status FROM users WHERE username=?').get(n).status;
  const messageOf=n=>sqlite.prepare('SELECT a.message_id FROM register_approvals a JOIN users u ON u.id=a.user_id WHERE u.username=?').get(n).message_id;
  await syncApprovals(sqlite);
  assert.equal(statusOf('EmojiJa'),'pending');assert.equal(statusOf('EmojiNein'),'pending');
  botReactors['✅']=['42'];await syncApprovals(sqlite);
  // The stub gives every message the same reactions, so both users see the same emoji: check the yes-case alone first.
  assert.equal(statusOf('EmojiJa'),'active');assert.equal(statusOf('EmojiNein'),'active');
  sqlite.prepare(`UPDATE users SET status='pending' WHERE username IN ('EmojiJa','EmojiNein')`).run();
  sqlite.prepare('UPDATE register_approvals SET decided_at=NULL').run();
  botReactors['❌']=['42'];await syncApprovals(sqlite);
  assert.equal(statusOf('EmojiJa'),'disabled','❌ gewinnt, wenn beide Emojis gesetzt sind');
  assert.ok(messageOf('EmojiJa'));
  const done=sqlite.prepare('SELECT COUNT(*) n FROM register_approvals WHERE decided_at IS NULL').get().n;assert.equal(done,0);
 }finally{delete process.env.MODCHECK_DISCORD_BOT_TOKEN;delete botReactors['✅'];delete botReactors['❌']}
});

test('Waffenkammer: Startgold einmal, Truhen, Shop, Ausrüstung mit Klassenregeln, keine Fremdzugriffe',async()=>{
 const {resetRateLimits}=await import('../server/core.js');resetRateLimits();
 const uid=await makeUser('Truhenjaeger');
 assert.equal((await ok('Truhenjaeger','GET','/api/armory')).welcome,0,'ohne Charakter kein Startgold');
 const created=await ok('Truhenjaeger','POST','/api/characters',{name:'Kisto',surname:'Goldhand',classId:8,race:'Gnom',level:60});
 assert.equal(created.startGold,1500);
 assert.equal((await ok('Truhenjaeger','POST','/api/characters',{name:'Zweito',surname:'Goldhand',classId:1,race:'Gnom',level:60})).startGold,0);
 let a=await ok('Truhenjaeger','GET','/api/armory');assert.equal(a.welcome,0);assert.equal(a.balance,1500);assert.equal(a.character.className,'Magier');
 const cat=await ok('Truhenjaeger','GET','/api/armory/catalog');
 assert.equal(cat.chests.length,5);
 for(const c of cat.chests){
  const n=Object.values(c.items).reduce((s,p)=>s+p.length,0);assert.ok(n>=15,`${c.id}: ${n} Items`);
  assert.equal(Object.values(c.odds).reduce((s,v)=>s+v,0),100);
  const total=Object.values(c.items).flat().reduce((s,p)=>s+p.chance,0);assert.ok(Math.abs(total-100)<0.2,`${c.id}: ${total}`);
  for(const [r,pool] of Object.entries(c.items))for(const p of pool)assert.equal(cat.items[p.id].quality,r)
 }
 assert.deepEqual(cat.chests.map(c=>c.odds.legendary),[3,5,8,12,20]);
 // Chest: gold leaves, one item arrives.
 const opened=await ok('Truhenjaeger','POST','/api/armory/chest',{chest:'stormwind'});
 assert.equal(opened.balance,1400);assert.equal(opened.inventory.length,1);assert.equal(opened.inventory[0].uid,opened.won.uid);
 assert.ok(cat.chests[0].items[opened.won.rarity].some(p=>p.id===opened.won.itemId));
 await denied(400,'Truhenjaeger','POST','/api/armory/chest',{chest:'gibtsnicht'});
 await denied(400,'Truhenjaeger','POST','/api/armory/chest',{chest:'azeroth'});
 assert.equal((await ok('Truhenjaeger','GET','/api/armory')).balance,1400,'abgelehnte Truhe kostet nichts');
 // Shop: buy, wrong class refused, sell back.
 await denied(400,'Truhenjaeger','POST','/api/armory/buy',{itemId:5187});
 const ring=5193,bought=await ok('Truhenjaeger','POST','/api/armory/buy',{itemId:ring});
 assert.equal(bought.balance,1400-cat.items[ring].buy);
 const shieldBuy=await ok('Truhenjaeger','POST','/api/armory/buy',{itemId:5443});
 const shield=shieldBuy.inventory.find(i=>i.itemId===5443);assert.equal(shield.usable,false);
 await denied(400,'Truhenjaeger','POST','/api/armory/equip',{uid:shield.uid});
 const ringUid=bought.inventory.find(i=>i.itemId===ring).uid;
 a=await ok('Truhenjaeger','POST','/api/armory/equip',{uid:ringUid});
 assert.equal(a.inventory.find(i=>i.uid===ringUid).slot,'back');assert.equal(a.stats.angriff,a.base.angriff+cat.items[ring].game.angriff);
 await denied(409,'Truhenjaeger','POST','/api/armory/sell',{uid:ringUid});
 await denied(404,'Mitglied','POST','/api/armory/equip',{uid:ringUid});
 await denied(404,'Mitglied','POST','/api/armory/sell',{uid:shield.uid});
 const before=(await ok('Truhenjaeger','GET','/api/armory')).balance,sold=await ok('Truhenjaeger','POST','/api/armory/sell',{uid:shield.uid});
 assert.equal(sold.balance,before+cat.items[5443].sell);
 await denied(404,'Truhenjaeger','POST','/api/armory/sell',{uid:shield.uid});
 // A two-hander goes into the main hand; start gold stays single even after repeated reads.
 sqlite.prepare(`INSERT INTO gold_ledger(id,user_id,amount,reason,created_at) VALUES ('test-gold',?,100000,'test',?)`).run(uid,new Date().toISOString());
 const staff=(await ok('Truhenjaeger','POST','/api/armory/buy',{itemId:2042})).inventory.find(i=>i.itemId===2042).uid;
 a=await ok('Truhenjaeger','POST','/api/armory/equip',{uid:staff});assert.equal(a.inventory.find(i=>i.uid===staff).slot,'mainhand');
 assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM gold_ledger WHERE user_id=? AND reason='start'`).get(uid).n,1);
 await denied(401,'gast','GET','/api/armory');
});

test('Auktionshaus: anbieten, kaufen, zurückziehen, kein Doppelverkauf',async()=>{
 const {resetRateLimits}=await import('../server/core.js');resetRateLimits();
 await makeUser('Haendlerin');await char('Haendlerin','Verka',1,'Zwerg');
 await makeUser('Kaeufer');await char('Kaeufer','Kaufo',1,'Zwerg');
 const item=(await ok('Haendlerin','POST','/api/armory/buy',{itemId:5193})).inventory[0].uid;
 const startSeller=(await ok('Haendlerin','GET','/api/armory')).balance,startBuyer=(await ok('Kaeufer','GET','/api/armory')).balance;
 await denied(400,'Haendlerin','POST','/api/auctions',{uid:item,price:0});
 const {id:auction}=await ok('Haendlerin','POST','/api/auctions',{uid:item,price:300});
 await denied(409,'Haendlerin','POST','/api/auctions',{uid:item,price:300});
 await denied(409,'Haendlerin','POST','/api/armory/sell',{uid:item});
 await denied(409,'Haendlerin','POST','/api/armory/equip',{uid:item});
 await denied(400,'Haendlerin','POST',`/api/auctions/${auction}/buy`);
 assert.ok((await ok('Kaeufer','GET','/api/auctions')).open.some(o=>o.id===auction&&!o.own&&o.seller==='Haendlerin'));
 await ok('Kaeufer','POST',`/api/auctions/${auction}/buy`);
 await denied(404,'Kaeufer','POST',`/api/auctions/${auction}/buy`);
 assert.equal((await ok('Kaeufer','GET','/api/armory')).balance,startBuyer-300);
 assert.equal((await ok('Haendlerin','GET','/api/armory')).balance,startSeller+300);
 assert.ok((await ok('Kaeufer','GET','/api/armory')).inventory.some(i=>i.uid===item&&!i.listed));
 assert.ok(!(await ok('Haendlerin','GET','/api/armory')).inventory.some(i=>i.uid===item));
 // Withdrawing puts the item back into the bag; only the seller may withdraw.
 const {id:again}=await ok('Kaeufer','POST','/api/auctions',{uid:item,price:999999});
 await denied(404,'Haendlerin','DELETE',`/api/auctions/${again}`);
 await denied(400,'Haendlerin','POST',`/api/auctions/${again}/buy`);
 await ok('Kaeufer','DELETE',`/api/auctions/${again}`);
 assert.ok((await ok('Kaeufer','GET','/api/armory')).inventory.some(i=>i.uid===item&&!i.listed));
});

test('Duelle: Herausforderung, Züge, Zeitlimit, Sieger, Belohnung mit Obergrenze',async()=>{
 const {resetRateLimits}=await import('../server/core.js');resetRateLimits();
 const {resolveAction}=await import('../server/duels.js');
 const hitter={id:'a',hp:100,max:100,angriff:100,verteidigung:0,krit:0,defending:false},target={id:'b',hp:1000,max:1000,angriff:10,verteidigung:0,krit:0,defending:false};
 const fixed=n=>()=>n;
 assert.equal(resolveAction(hitter,target,'attack',fixed(15)).damage,250);
 target.defending=true;assert.equal(resolveAction(hitter,target,'attack',fixed(15)).damage,125);assert.equal(target.defending,false);
 assert.equal(resolveAction(hitter,target,'strong',fixed(99)).miss,true);
 assert.equal(resolveAction(hitter,target,'strong',fixed(0)).damage,Math.round(100*2.5*.85*1.7));
 hitter.krit=5;const crit=resolveAction(hitter,target,'strong',fixed(0));assert.equal(crit.crit,true);assert.equal(crit.damage,Math.round(100*2.5*.85*1.7*1.5));
 const a=await makeUser('Duellant');await char('Duellant','Klinge',1,'Zwerg');
 const b=await makeUser('Gegner');await char('Gegner','Schild',1,'Zwerg');
 await denied(400,'Duellant','POST','/api/duels',{opponentId:a});
 const {id:duel}=await ok('Duellant','POST','/api/duels',{opponentId:b});
 await denied(409,'Gegner','POST','/api/duels',{opponentId:a});
 await denied(403,'Duellant','POST',`/api/duels/${duel}/accept`);
 await denied(404,'Mitglied','GET',`/api/duels/${duel}`);
 let d=await ok('Gegner','POST',`/api/duels/${duel}/accept`);assert.equal(d.status,'active');
 const names={[a]:'Duellant',[b]:'Gegner'};
 for(let i=0;i<200&&d.status==='active';i++){
  const who=names[d.turnUser];await denied(409,who==='Duellant'?'Gegner':'Duellant','POST',`/api/duels/${duel}/action`,{action:'attack'});
  d=await ok(who,'POST',`/api/duels/${duel}/action`,{action:i%3===2?'strong':'attack'})
 }
 assert.equal(d.status,'done');assert.ok([a,b].includes(d.winner));assert.equal(d.reward,25);
 const loser=d.winner===a?b:a;assert.ok(Object.values(d.fighters).some(f=>f.hp===0&&f.id===loser));
 // A second duel of the same pair on the same day pays nothing; missed turns attack on their own.
 const {id:second}=await ok('Duellant','POST','/api/duels',{opponentId:b});await ok('Gegner','POST',`/api/duels/${second}/accept`);
 for(let i=0;i<200;i++){sqlite.prepare('UPDATE duels SET turn_deadline=0 WHERE id=?').run(second);d=await ok('Duellant','GET',`/api/duels/${second}`);if(d.status!=='active')break}
 assert.equal(d.status,'done');assert.equal(d.reward,0);
 const list=await ok('Duellant','GET','/api/duels');
 const me=list.ranking.find(r=>r.username==='Duellant');assert.equal(me.wins+me.losses,2);assert.ok(list.players.some(p=>p.username==='Gegner'));
 const {id:third}=await ok('Gegner','POST','/api/duels',{opponentId:a});await ok('Duellant','POST',`/api/duels/${third}/decline`);
 assert.equal(sqlite.prepare('SELECT status FROM duels WHERE id=?').get(third).status,'declined');
});

test('Waffenkammer: Ausrüstung und Level pro Charakter, Login-Charakter spielt, Fähigkeiten im Duell',async()=>{
 const {resetRateLimits}=await import('../server/core.js');resetRateLimits();
 const {levelOf,abilitiesFor,LEVEL_CAP}=await import('../server/progression.js');
 assert.deepEqual(levelOf(0),{level:1,xp:0,next:100,total:0});assert.equal(levelOf(99).level,1);assert.equal(levelOf(100).level,2);assert.equal(levelOf(1e9).level,LEVEL_CAP);
 assert.deepEqual(abilitiesFor(1,4).map(a=>a.unlocked),[true,true,false,false]);
 const uid=await makeUser('Zweichar');
 const warrior=await char('Zweichar','Brann',1,'Zwerg'),mage=await char('Zweichar','Funki',8,'Gnom');
 sqlite.prepare(`INSERT INTO gold_ledger(id,user_id,amount,reason,created_at) VALUES ('zweichar-gold',?,100000,'test',?)`).run(uid,new Date().toISOString());
 // Gear belongs to the active character only.
 const cape=(await ok('Zweichar','POST','/api/armory/buy',{itemId:5193})).inventory.find(i=>i.itemId===5193).uid;
 let a=await ok('Zweichar','POST','/api/armory/active',{characterId:warrior});assert.equal(a.character.id,warrior);
 a=await ok('Zweichar','POST','/api/armory/equip',{uid:cape});assert.equal(a.inventory.find(i=>i.uid===cape).slot,'back');assert.ok(a.gear.some(g=>g.slot==='back'&&g.display));
 a=await ok('Zweichar','POST','/api/armory/active',{characterId:mage});assert.equal(a.character.className,'Magier');
 assert.equal(a.inventory.find(i=>i.uid===cape).slot,null);assert.equal(a.inventory.find(i=>i.uid===cape).wornBy,'Brann');assert.equal(a.stats.leben,a.base.leben);
 a=await ok('Zweichar','POST','/api/armory/equip',{uid:cape});assert.equal(a.inventory.find(i=>i.uid===cape).slot,'back');
 a=await ok('Zweichar','POST','/api/armory/active',{characterId:warrior});assert.equal(a.inventory.find(i=>i.uid===cape).wornBy,'Funki');
 await denied(404,'Mitglied','POST','/api/armory/active',{characterId:warrior});
 // XP: a chest gives a tenth of its price, the level adds values.
 const opened=await ok('Zweichar','POST','/api/armory/chest',{chest:'moltencore'});
 assert.equal(opened.xpGained,15,'eine Truhe gibt nur wenig Erfahrung');assert.equal(opened.progress.level,1);assert.equal(opened.stats.angriff,opened.base.angriff);
 assert.deepEqual(opened.potions,{heal:2,mana:1},'Starttränke');
 assert.equal(opened.abilities.filter(x=>x.unlocked).length,1);
 // Duel with abilities: a stun skips the enemy turn, cooldowns are enforced, both sides get XP.
 const foe=await makeUser('Zielscheibe');await char('Zielscheibe','Ziel',1,'Mensch');
 sqlite.prepare('UPDATE characters SET armory_xp=1000 WHERE id=?').run(warrior);
 const {id:duel}=await ok('Zweichar','POST','/api/duels',{opponentId:foe});
 let d=await ok('Zielscheibe','POST',`/api/duels/${duel}/accept`);
 if(d.turnUser===foe)d=await ok('Zielscheibe','POST',`/api/duels/${duel}/action`,{action:'defend'});
 assert.deepEqual(d.fighters[uid].abilities.filter(x=>x.unlocked).map(x=>x.key),['heroic','charge']);
 await denied(409,'Zweichar','POST',`/api/duels/${duel}/action`,{action:'deathwish'});
 await denied(400,'Zweichar','POST',`/api/duels/${duel}/action`,{action:'pyro'});
 d=await ok('Zweichar','POST',`/api/duels/${duel}/action`,{action:'charge'});
 assert.equal(d.log.at(-1).action,'stunned');assert.equal(d.turnUser,uid,'nach Betäubung bleibt der Zug beim Angreifer');
 // Two uses of Sturmangriff, then it is used up until a mana potion restores it.
 d=await ok('Zweichar','POST',`/api/duels/${duel}/action`,{action:'charge'});assert.equal(d.turnUser,uid);
 await denied(409,'Zweichar','POST',`/api/duels/${duel}/action`,{action:'charge'});
 d=await ok('Zweichar','POST',`/api/duels/${duel}/action`,{action:'potion:mana'});
 assert.equal(d.log.at(-1).action,'potion');assert.equal(d.potions.mana,0);assert.equal(d.fighters[uid].abilities.find(x=>x.key==='charge').ppLeft,2);
 for(let i=0;i<300&&d.status==='active';i++)d=await ok(d.turnUser===uid?'Zweichar':'Zielscheibe','POST',`/api/duels/${duel}/action`,{action:'attack'});
 assert.equal(d.status,'done');
 const xp=sqlite.prepare(`SELECT reason,amount FROM armory_xp_log WHERE character_id=? AND reason LIKE 'duel%'`).all(d.winner===uid?warrior:sqlite.prepare('SELECT id FROM characters WHERE user_id=?').get(foe).id);
 assert.deepEqual(xp.map(x=>x.amount),[40]);
});

test('Instanzen: Lobby, Start nur durch Leiter, Kampf gegen alle Bosse, Beute, Tageslimit, Aufgeben mit Spruch',async()=>{
 const {resetRateLimits}=await import('../server/core.js');resetRateLimits();
 const {bossTurn}=await import('../server/dungeons.js');
 const {FORFEIT_SAYINGS}=await import('../server/sayings.js');assert.ok(FORFEIT_SAYINGS.length>=10&&FORFEIT_SAYINGS.length<=15);
 const party=[{id:'a',hp:500,max:500,verteidigung:0,defending:false},{id:'b',hp:500,max:500,verteidigung:0,defending:false}];
 const boss={angriff:100,verteidigung:0,krit:0,stunned:false,turns:2};
 const aoe=bossTurn(boss,party,()=>15);assert.equal(aoe[0].action,'aoe');assert.equal(aoe[0].hits.length,2);
 boss.stunned=true;assert.equal(bossTurn(boss,party)[0].action,'stunned');
 const host=await makeUser('Gruppenleiter');await char('Gruppenleiter','Leiter',1,'Zwerg');
 const mate=await makeUser('Mitlaeufer');await char('Mitlaeufer','Laeufer',8,'Gnom');
 await makeUser('Zuschauer');
 await denied(400,'Zuschauer','POST','/api/dungeons',{dungeon:'deadmines'});
 const lobby=await ok('Gruppenleiter','POST','/api/dungeons',{dungeon:'deadmines'});assert.equal(lobby.status,'lobby');
 await denied(409,'Gruppenleiter','POST','/api/dungeons',{dungeon:'scarlet'});
 assert.ok((await ok('Mitlaeufer','GET','/api/dungeons')).lobbies.some(l=>l.id===lobby.id&&l.host==='Gruppenleiter'));
 await ok('Mitlaeufer','POST',`/api/dungeons/${lobby.id}/join`);
 await denied(403,'Mitlaeufer','POST',`/api/dungeons/${lobby.id}/start`);
 let r=await ok('Gruppenleiter','POST',`/api/dungeons/${lobby.id}/start`);
 assert.equal(r.status,'active');assert.equal(r.boss.name,"Rhahk'Zor");assert.equal(r.boss.max,400,'Lebenspunkte wachsen mit der Gruppengröße');
 await denied(409,'Mitlaeufer','POST',`/api/dungeons/${lobby.id}/join`);
 const names={[host]:'Gruppenleiter',[mate]:'Mitlaeufer'};
 for(let i=0;i<400&&r.status==='active';i++){
  const who=names[r.turnUser];
  if(!who){sqlite.prepare('UPDATE dungeon_runs SET turn_deadline=0 WHERE id=?').run(lobby.id);r=await ok('Gruppenleiter','GET',`/api/dungeons/${lobby.id}`);continue}
  await denied(409,who==='Gruppenleiter'?'Mitlaeufer':'Gruppenleiter','POST',`/api/dungeons/${lobby.id}/action`,{action:'attack'});
  // Make the party strong enough to clear the test run quickly.
  sqlite.prepare('UPDATE dungeon_runs SET state=json_set(state,\'$.boss.hp\',MIN(json_extract(state,\'$.boss.hp\'),60)) WHERE id=?').run(lobby.id);
  r=await ok(who,'POST',`/api/dungeons/${lobby.id}/action`,{action:'attack'})
 }
 assert.equal(r.status,'won');assert.equal(r.bossIndex,2);
 const loot=r.log.filter(e=>e.action==='loot');assert.equal(loot.length,2);assert.ok(loot.every(e=>e.gold===40&&e.xp===30));
 assert.ok(r.log.some(e=>e.action==='bossdown'&&e.name==='Edwin VanCleef'));
 assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM gold_ledger WHERE user_id=? AND reason='dungeon'`).get(host).n,1);
 // Daily limit: three dungeon runs, then no more.
 for(let n=0;n<2;n++){const l=await ok('Gruppenleiter','POST','/api/dungeons',{dungeon:'deadmines'});await ok('Gruppenleiter','POST',`/api/dungeons/${l.id}/start`);await ok('Gruppenleiter','POST',`/api/dungeons/${l.id}/forfeit`)}
 assert.equal((await ok('Gruppenleiter','GET','/api/dungeons')).runsLeft.dungeon,0);
 await denied(409,'Gruppenleiter','POST','/api/dungeons',{dungeon:'deadmines'});
 // Raids are scheduled: Wednesday and Sunday 19:00 Berlin, nobody opens them by hand.
 const {raidSlots,berlinInstant}=await import('../server/dungeons.js');
 await denied(400,'Mitlaeufer','POST','/api/dungeons',{dungeon:'onyxia'});
 const slots=raidSlots(Date.parse('2026-11-04T10:00:00Z'));
 assert.deepEqual(slots.slice(0,2).map(x=>[x.day,x.dungeon]),[['2026-11-04','onyxia'],['2026-11-05','moltencore']]);
 assert.equal(new Date(slots[0].startsAt).toISOString(),'2026-11-04T18:00:00.000Z','19 Uhr Winterzeit');
 assert.equal(new Date(berlinInstant(2026,7,1,19)).toISOString(),'2026-07-01T17:00:00.000Z','19 Uhr Sommerzeit');
 const soon=Date.now()+30*60e3;
 sqlite.prepare(`INSERT INTO dungeon_runs(id,dungeon,kind,host_id,starts_at,created_at,updated_at) VALUES ('raid-test','onyxia','raid',NULL,?,?,?)`).run(soon,new Date().toISOString(),new Date().toISOString());
 await ok('Mitlaeufer','POST','/api/dungeons/raid-test/join');await ok('Gruppenleiter','POST','/api/dungeons/raid-test/join');
 await denied(409,'Mitlaeufer','POST','/api/dungeons/raid-test/start');
 sqlite.prepare('UPDATE dungeon_runs SET starts_at=? WHERE id=?').run(Date.now()-1000,'raid-test');
 r=await ok('Mitlaeufer','GET','/api/dungeons/raid-test');assert.equal(r.status,'active','startet zur Raidzeit von selbst');assert.equal(r.boss.max,3200);
 // Forfeit: a silly line, the leaver is out of the fight and free again; the rest fights on.
 r=await ok('Mitlaeufer','POST','/api/dungeons/raid-test/forfeit');
 assert.equal(r.status,'active');const line=r.log.find(e=>e.action==='forfeit');assert.ok(line.text.includes('Laeufer'));
 assert.equal((await ok('Mitlaeufer','GET','/api/dungeons')).current,null,'wer aufgibt, ist raus');
 await denied(409,'Mitlaeufer','POST','/api/dungeons/raid-test/action',{action:'attack'});
 r=await ok('Gruppenleiter','POST','/api/dungeons/raid-test/forfeit');assert.equal(r.status,'wiped');
});
