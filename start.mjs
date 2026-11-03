import http from 'node:http';
import {readFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {handleGuildEvents} from './worker/events.js';
import {handleWowheadData,refreshWowheadData,fetchWowheadIcon,parseTalentSeed} from './worker/wowhead.js';
import {createPlatform} from './server/index.js';
import {can,hashPassword,id as newId,now as nowIso} from './server/core.js';
import {randomBytes} from 'node:crypto';
import {configureDiscord} from './server/discord.js';
const root=path.dirname(fileURLToPath(import.meta.url));const web=path.join(root,'web');
const dataDir=process.env.MODCHECK_DATA?path.resolve(process.env.MODCHECK_DATA):path.join(root,'data');
await mkdir(dataDir,{recursive:true});
const sqlite=new DatabaseSync(path.join(dataDir,'modcheck.sqlite'));sqlite.exec('PRAGMA journal_mode=WAL');sqlite.exec('PRAGMA foreign_keys=ON');
sqlite.exec('CREATE TABLE IF NOT EXISTS modcheck_migrations (name TEXT PRIMARY KEY)');
for(const name of (await readdir(path.join(root,'drizzle'))).filter(n=>n.endsWith('.sql')).sort()){
 if(!sqlite.prepare('SELECT name FROM modcheck_migrations WHERE name=?').get(name)){
  // Table rebuilds must run with foreign keys off (SQLite's documented procedure), otherwise DROP TABLE cascades into every referencing table.
  const sql=await readFile(path.join(root,'drizzle',name),'utf8'),rebuild=sql.startsWith('-- modcheck:rebuild');
  if(rebuild)sqlite.exec('PRAGMA foreign_keys=OFF');
  sqlite.exec('BEGIN');try{sqlite.exec(sql);if(rebuild&&sqlite.prepare('PRAGMA foreign_key_check').all().length)throw new Error(name+': Fremdschlüssel nach dem Umbau verletzt');sqlite.prepare('INSERT INTO modcheck_migrations(name) VALUES (?)').run(name);sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}finally{if(rebuild)sqlite.exec('PRAGMA foreign_keys=ON')}
 }
}
// Hosting without a shell (Railway): MODCHECK_BOOTSTRAP_ADMIN=<name> creates the first administrator once, while no active admin exists.
// The one-time password is printed to the log only; it is never read from the environment.
{const wanted=process.env.MODCHECK_BOOTSTRAP_ADMIN;if(wanted&&!sqlite.prepare("SELECT 1 FROM users WHERE role='admin' AND status='active'").get()){
 if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(wanted))console.warn('MODCHECK_BOOTSTRAP_ADMIN: Name braucht 3 bis 24 Buchstaben, Zahlen, _ oder -. Es wurde kein Administrator angelegt.');
 else{const password=randomBytes(12).toString('base64url'),hash=hashPassword(password),existing=sqlite.prepare('SELECT id FROM users WHERE username=?').get(wanted);
  if(existing)sqlite.prepare("UPDATE users SET password_hash=?,role='admin',status='active',guild_rank='Gildenmeister' WHERE id=?").run(hash,existing.id);
  else sqlite.prepare("INSERT INTO users(id,username,password_hash,role,status,guild_rank,created_at) VALUES (?,?,?,'admin','active','Gildenmeister',?)").run(newId(),wanted,hash,nowIso());
  console.log(`
*** Administrator "${wanted}" angelegt. Einmaliges Passwort: ${password}
*** Jetzt anmelden, das Passwort unter Einstellungen ändern und die Variable MODCHECK_BOOTSTRAP_ADMIN löschen.
`)}}}
const DB={prepare(sql){const statement=sqlite.prepare(sql);let args=[];return{bind(...values){args=values;return this},async all(){return{results:statement.all(...args)}},async run(){const r=statement.run(...args);return{meta:{changes:Number(r.changes)}}}}}};
const dataEnv={DB,refreshLimit:1000,seedCatalog:async()=>JSON.parse(await readFile(path.join(web,'seed-catalog.json'),'utf8')),seedTalents:async()=>parseTalentSeed(await readFile(path.join(web,'forever-talents.js'),'utf8')),seedAbilities:async()=>JSON.parse(await readFile(path.join(web,'seed-abilities.json'),'utf8'))};
const backgroundTasks={waitUntil(){}};
const platform=createPlatform({db:sqlite,env:dataEnv,uploadDir:path.join(dataDir,'uploads')});
const refreshAll=async()=>{await refreshWowheadData(dataEnv,dataEnv.refreshLimit);await platform.progress.refreshNews();platform.progress.detectChanges()};
const discordChannels=configureDiscord(dataDir);
const analyticsToken=(await readFile(path.join(dataDir,'cf-analytics-token.txt'),'utf8').catch(()=>process.env.MODCHECK_CF_ANALYTICS_TOKEN||'')).trim();
const analyticsTag=/^[a-f0-9]{32}$/.test(analyticsToken)?`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${analyticsToken}"}'></script>`:'';
if(analyticsToken&&!analyticsTag)console.warn('cf-analytics-token.txt enthält keinen gültigen Schlüssel, die Analyse bleibt aus.');
const escHtml=s=>s.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const analyticsNote='<h3>Besucherstatistik</h3><p>Wir zählen Seitenaufrufe mit Cloudflare Web Analytics. Das Messskript setzt keine Cookies und erstellt keine Profile über mehrere Seiten hinweg. Cloudflare erhält dabei deine IP-Adresse, die aufgerufene Seite, Browser- und Ladezeitangaben und wertet sie nur zusammengefasst für uns aus. Grundlage ist unser berechtigtes Interesse zu sehen, ob die Seite genutzt wird und schnell lädt (Art. 6 Abs. 1 lit. f DSGVO). Werbeblocker unterdrücken das Skript häufig, das ist in Ordnung.</p>';
async function legalPage(bytes){
 const text=(await readFile(path.join(dataDir,'impressum.txt'),'utf8').catch(()=>(process.env.MODCHECK_IMPRESSUM||'').replace(/\\n/g,'\n'))).trim();
 const impressum=text?`<p>${text.split(/\r?\n/).map(l=>escHtml(l.trim())).join('<br>')}</p>`:'<p>Privates, nicht-kommerzielles Projekt für einen geschlossenen Kreis von Gildenmitgliedern, kein geschäftsmäßiges Angebot.</p>';
 return Buffer.from(bytes.toString('utf8').replace('<!--IMPRESSUM-->',impressum).replace('<!--ANALYTICS-->',analyticsTag?analyticsNote:''))
}
// Inline onclick handlers need 'unsafe-inline'; the 3D viewer needs WebAssembly and eval. The policy still blocks foreign scripts, framing and exfiltration targets.
const csp=["default-src 'self'","script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://static.cloudflareinsights.com","style-src 'self' 'unsafe-inline'","img-src 'self' data: blob: https://wow.zamimg.com","media-src 'self' blob:","font-src 'self'","connect-src 'self' https://cloudflareinsights.com","frame-src https://www.youtube-nocookie.com","worker-src 'self' blob:","object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'"].join('; ');
const securityHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':csp,'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','Cross-Origin-Opener-Policy':'same-origin',...(process.env.MODCHECK_HTTPS==='1'?{'Strict-Transport-Security':'max-age=31536000'}:{})};
const modelPath=/^\/(?:meta\/[a-z]+(?:\/\d+){1,3}\.json|(?:m2|skin|skel|anim|bone|phys)\/\d+\.(?:m2|skin|skel|anim|bone|phys)|textures\/\d+\.(?:webp|png))$/;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp4':'video/mp4'};
const port=Number(process.env.PORT||3000);
async function respond(res,response){res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)res.end(Buffer.from(await response.arrayBuffer()));else res.end()}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/events')){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end('Eintrag zu groß');return}chunks.push(chunk)}
   const method=req.method,user=platform.userOf(req);if(!user){res.writeHead(401,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'Bitte melde dich an.'}));return}if(!['GET','HEAD'].includes(method)&&!can(user,'raids')){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'Termine verwalten nur Offiziere mit Raidrechten.'}));return}
   const request=new Request(url,{method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});await respond(res,await handleGuildEvents(request,{DB,includeRaids:true},url));return;
  }
  if(['/api/catalog','/api/talents'].includes(url.pathname)){await respond(res,await handleWowheadData(new Request(url,{method:req.method}),dataEnv,url,backgroundTasks));return}
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/uploads/')){await platform.handle(req,res,url);return}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  const yt=url.pathname.match(/^\/yt\/([\w-]{11})\.jpg$/);
  if(yt){
   if(!platform.userOf(req)){res.writeHead(401);res.end();return}
   const response=await fetch(`https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`,{signal:AbortSignal.timeout(15000)});
   if(!response.ok){res.writeHead(404);res.end();return}
   res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=604800','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));return;
  }
  if(url.pathname.startsWith('/model/')){
   if(!platform.userOf(req)){res.writeHead(401);res.end('Bitte melde dich an.');return}
   const model=url.pathname.slice(6);if(!modelPath.test(model)){res.writeHead(404);res.end('Unbekannte Modelldatei');return}
   const response=await fetch('https://wow.zamimg.com/modelviewer/classic'+model,{signal:AbortSignal.timeout(30000)});
   const type=model.endsWith('.json')?'application/json':model.endsWith('.webp')?'image/webp':'application/octet-stream';res.writeHead(response.status,{'Content-Type':type,'Cache-Control':'public, max-age=86400'});res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));return;
  }
  const target=path.resolve(web,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(web+path.sep)){res.writeHead(403);res.end();return}
  try{let bytes=await readFile(target);if(analyticsTag&&target===path.join(web,'index.html'))bytes=Buffer.from(bytes.toString('utf8').replace('</body>',analyticsTag+'</body>'));if(target===path.join(web,'rechtliches.html'))bytes=await legalPage(bytes);const type=mime[path.extname(target)]||'application/octet-stream',range=type==='video/mp4'&&String(req.headers.range||'').match(/^bytes=(\d*)-(\d*)$/);
   if(range&&(range[1]||range[2])){const first=range[1]?Number(range[1]):Math.max(0,bytes.length-Number(range[2])),last=range[1]&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;if(first>last||first>=bytes.length){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});res.end();return}res.writeHead(206,{'Content-Type':type,'Content-Range':`bytes ${first}-${last}/${bytes.length}`,'Content-Length':last-first+1,'Accept-Ranges':'bytes',...securityHeaders});res.end(req.method==='HEAD'?undefined:bytes.subarray(first,last+1));return}
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache',...(type==='video/mp4'?{'Accept-Ranges':'bytes'}:{}),...securityHeaders});res.end(req.method==='HEAD'?undefined:bytes)}catch{const icon=await fetchWowheadIcon(url.pathname);if(icon)return respond(res,icon);res.writeHead(404);res.end('Datei nicht gefunden')}
 }catch(error){console.error(error.message);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Die Anfrage konnte nicht verarbeitet werden.'}))}
});
const host=process.env.HOST||'127.0.0.1';
if(process.env.MODCHECK_TEST_MODE!=='1')server.listen(port,host,()=>{console.log('\nModCheck ist bereit: http://'+host+':'+port+'/\nZum Beenden Strg+C drücken.\n');refreshAll();setInterval(refreshAll,3600*1000).unref();if(discordChannels.length){console.log('Discord verbunden: '+discordChannels.join(', '));setInterval(()=>{try{platform.remindRaids()}catch(e){console.warn(e.message)}},300e3).unref();setInterval(()=>platform.syncPolls().catch(e=>console.warn(e.message)),120e3).unref()}});

export {server,sqlite,DB};
