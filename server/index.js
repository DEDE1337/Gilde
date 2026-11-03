/* Platform API entry: session handling, same-origin guard, uploads and dispatch to the route modules. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {ApiError,findRoute,checkAccess,sessionUser,fail,id,now,rateLimit,SESSION_DAYS} from './core.js';
import {registerAccountRoutes} from './accounts.js';
import {registerRaidRoutes,remindRaids} from './raids.js';
import {registerGearRoutes} from './gear.js';
import {registerForumRoutes} from './forum.js';
import {registerProgressRoutes} from './progress.js';
import {registerBonusRoutes} from './bonus.js';
import {registerPollRoutes,syncPolls} from './polls.js';

const MAX_BODY=64*1024,MAX_UPLOAD=3*1024*1024,OPEN_API=new Set(['/api/me','/api/register','/api/login']);
const IMAGE_TYPES=[['image/png',b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))],['image/jpeg',b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff],['image/webp',b=>b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP']];
const cookieOf=req=>(req.headers.cookie||'').split(';').map(c=>c.trim().split('=')).find(([k])=>k==='mc_session')?.[1]||null;
const sameOrigin=(req,url)=>{const origin=req.headers.origin;if(!origin)return !req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin';return origin===url.origin||origin===`http://${req.headers.host}`||origin===`https://${req.headers.host}`};
async function readBody(req,limit){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>limit)fail(413,'Die Anfrage ist zu groß.');chunks.push(c)}return Buffer.concat(chunks)}

export function createPlatform({db,env,uploadDir}){
 registerAccountRoutes(db);registerRaidRoutes(db);registerGearRoutes(db,env);registerBonusRoutes(db);registerPollRoutes(db);
 const forum=registerForumRoutes(db),progress=registerProgressRoutes(db,env,forum);
 const secure=process.env.MODCHECK_HTTPS==='1';
 const cookie=(token,age)=>`mc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
 const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data))};
 const ipOf=req=>(process.env.MODCHECK_TRUST_PROXY==='1'&&(req.headers['cf-connecting-ip']||String(req.headers['x-forwarded-for']||'').split(',')[0].trim()))||req.socket.remoteAddress||'?';
 async function upload(req,res,user,ip){
  if(!user)fail(401,'Bitte melde dich an.');rateLimit('upload:'+user.id,20,3600e3);
  const bytes=await readBody(req,MAX_UPLOAD),mime=IMAGE_TYPES.find(([,test])=>test(bytes))?.[0];
  if(!mime)fail(415,'Erlaubt sind nur PNG, JPEG und WebP.');
  await mkdir(uploadDir,{recursive:true});const uid=id();await writeFile(path.join(uploadDir,uid),bytes);
  db.prepare('INSERT INTO uploads(id,user_id,mime,size,created_at) VALUES (?,?,?,?,?)').run(uid,user.id,mime,bytes.length,now());send(res,201,{id:uid})
 }
 async function serveUpload(res,uploadId,user){
  if(!user)fail(401,'Bitte melde dich an.');
  const u=db.prepare('SELECT * FROM uploads WHERE id=?').get(uploadId);if(!u)fail(404,'Bild nicht gefunden.');
  res.writeHead(200,{'Content-Type':u.mime,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Content-Disposition':'inline'});res.end(await readFile(path.join(uploadDir,u.id)))
 }
 async function handle(req,res,url){
  const token=cookieOf(req),user=sessionUser(db,token),ip=ipOf(req),cookies=[];
  try{
   if(req.method!=='GET'&&!sameOrigin(req,url))fail(403,'Ungültiger Ursprung.');
   if(url.pathname==='/api/uploads'&&req.method==='POST')return await upload(req,res,user,ip);
   const file=url.pathname.match(/^\/uploads\/([a-f0-9-]{36})$/);if(file&&req.method==='GET')return await serveUpload(res,file[1],user);
   if(!user&&!OPEN_API.has(url.pathname))fail(401,'Bitte melde dich an.');
   const match=findRoute(req.method,url.pathname);if(!match)fail(404,'Unbekannte Adresse.');
   checkAccess(user,match.route.access);
   let body={};
   if(req.method!=='GET'&&req.method!=='DELETE'){const raw=await readBody(req,MAX_BODY);if(raw.length){if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Es wird JSON erwartet.');try{body=JSON.parse(raw.toString('utf8'))}catch{fail(400,'Die Anfrage ist kein gültiges JSON.')}}if(!body||typeof body!=='object')fail(400,'Die Anfrage ist ungültig.')}
   const result=await match.route.handler({user,token,ip,body,params:match.params,query:url.searchParams,setSession:t=>cookies.push(cookie(t,SESSION_DAYS*86400)),clearSession:()=>cookies.push(cookie('',0))});
   send(res,200,result,cookies.length?{'Set-Cookie':cookies}:{})
  }catch(e){
   if(e instanceof ApiError)return send(res,e.status,{error:e.message});
   if(/UNIQUE constraint/.test(e.message))return send(res,409,{error:'Dieser Eintrag existiert bereits.'});
   console.error(e);send(res,500,{error:'Die Anfrage konnte nicht verarbeitet werden.'})
  }
 }
 return{handle,progress,userOf:req=>sessionUser(db,cookieOf(req)),remindRaids:()=>remindRaids(db),syncPolls:()=>syncPolls(db)}
}
