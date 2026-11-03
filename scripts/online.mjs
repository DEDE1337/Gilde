/* Starts the site and a Cloudflare tunnel; both end together when this window closes.
   With data/tunnel-token.txt it runs the named tunnel for the own domain, otherwise a quick tunnel with a random link. */
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=process.env.PORT||'3000',linkFile=path.join(root,'data','online-link.txt');
const readData=name=>{try{return readFileSync(path.join(root,'data',name),'utf8').trim()}catch{return ''}};
const token=readData('tunnel-token.txt'),domain=readData('domain.txt').replace(/^https?:\/\//,'').replace(/\/.*$/,'');
const installed=[path.join(process.env['ProgramFiles(x86)']||'','cloudflared','cloudflared.exe'),path.join(process.env.ProgramFiles||'','cloudflared','cloudflared.exe')].find(existsSync);
const server=spawn(process.execPath,['start.mjs'],{cwd:root,stdio:'ignore',env:{...process.env,PORT:port,MODCHECK_HTTPS:'1',MODCHECK_TRUST_PROXY:'1'}});
// The token goes through the environment so it does not show up in the process list.
const args=token?['tunnel','--no-autoupdate','run']:['tunnel','--no-autoupdate','--url','http://127.0.0.1:'+port];
const tunnel=spawn(installed||'cloudflared',args,{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,...(token?{TUNNEL_TOKEN:token}:{})}});
let shown=false;
function stop(){try{rmSync(linkFile,{force:true})}catch{}server.kill();tunnel.kill()}
function announce(link){
 if(shown)return;shown=true;
 mkdirSync(path.dirname(linkFile),{recursive:true});writeFileSync(linkFile,link);
 console.log(`\n  ModCheck ist online${token?' unter deiner Domain':''}. Diesen Link kannst du schicken:\n\n  ${link}\n\n  Dieses Fenster offen lassen. Fenster schließen = Seite offline.\n`)
}
function read(chunk){
 const s=String(chunk);
 if(token){if(/Registered tunnel connection/.test(s))announce(domain?'https://'+domain:'(deine Domain, siehe data/domain.txt)');if(/Unauthorized|invalid token|failed to unmarshal/i.test(s)&&!shown)console.error('\n  Der Tunnel-Schlüssel in data/tunnel-token.txt wird nicht angenommen. Bitte neu aus dem Cloudflare-Dashboard kopieren.\n');return}
 const link=s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];if(link)announce(link)
}
tunnel.stdout.on('data',read);tunnel.stderr.on('data',read);
tunnel.on('error',()=>{console.error('Cloudflare-Programm nicht gefunden.');stop();process.exit(1)});
tunnel.on('exit',()=>{console.log('Tunnel beendet, die Seite ist offline.');stop();process.exit(0)});
server.on('exit',()=>{console.log('Server beendet.');stop();process.exit(1)});
for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{stop();process.exit(0)});
console.log(token?'ModCheck startet mit deiner Domain ...':'ModCheck startet, der Link erscheint gleich ...');
