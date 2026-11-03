/* Posts guild events to Discord through webhooks listed in data/discord-webhooks.json. Unknown or missing channels are skipped; a failed post never breaks a request. */
import {readFileSync} from 'node:fs';
import path from 'node:path';

export const DISCORD_CHANNELS=['ankuendigungen','raids','allgemein','spielunke','offiziere','umfragen'];
const HOOK=/^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;
let hooks={},site='';
const queues={};

export function configureDiscord(dataDir){
 hooks={};site='';
 try{const raw=JSON.parse(readFileSync(path.join(dataDir,'discord-webhooks.json'),'utf8'));for(const c of DISCORD_CHANNELS){const u=String(raw[c]||'').trim();if(HOOK.test(u))hooks[c]=u;else if(u)console.warn(`discord-webhooks.json: „${c}“ ist keine Discord-Webhook-Adresse und wird ignoriert.`)}}catch(e){if(e.code!=='ENOENT')console.warn('discord-webhooks.json konnte nicht gelesen werden:',e.message)}
 try{const d=readFileSync(path.join(dataDir,'domain.txt'),'utf8').trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'');if(d)site='https://'+d}catch{}
 return Object.keys(hooks)
}
export const berlinTime=iso=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso))+' Uhr';
// One queue per channel keeps posts in order and spaced below Discord's webhook rate limit.
export function discord(channel,{title,text='',color=0xffb347}){
 const url=hooks[channel];if(!url)return;
 const embed={title:String(title).slice(0,256),description:String(text).slice(0,2000),color,footer:{text:'ModCheck'},timestamp:new Date().toISOString(),...(site?{url:site}:{})};
 // allowed_mentions empty: user text like "@everyone" must never ping the server.
 const body=JSON.stringify({username:'ModCheck',embeds:[embed],allowed_mentions:{parse:[]}});
 queues[channel]=(queues[channel]||Promise.resolve()).then(async()=>{
  try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(10000)});if(!r.ok)console.warn(`Discord ${channel}: ${r.status}`)}catch(e){console.warn(`Discord ${channel}: ${e.message}`)}
  await new Promise(r=>setTimeout(r,1200))
 })
}

// Native Discord poll in #umfragen (falls back to #allgemein). Returns "channel:messageId" so counts can be read back later, or null.
export async function discordPoll({question,options,hours,multi}){
 const channel=hooks.umfragen?'umfragen':hooks.allgemein?'allgemein':null;if(!channel)return null;
 const body={username:'ModCheck',allowed_mentions:{parse:[]},poll:{question:{text:String(question).slice(0,300)},answers:options.map(o=>({poll_media:{text:String(o).slice(0,55)}})),duration:Math.min(768,Math.max(1,hours)),allow_multiselect:!!multi}};
 try{
  const r=await fetch(hooks[channel]+'?wait=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!r.ok){console.warn(`Discord-Umfrage: ${r.status} ${(await r.text()).slice(0,200)}`);return null}
  const m=await r.json();return m.id?`${channel}:${m.id}`:null
 }catch(e){console.warn('Discord-Umfrage:',e.message);return null}
}
// Webhooks may read their own messages; the poll there carries per-answer counts, but no voter names.
export async function discordPollCounts(ref,optionCount){
 const [channel,messageId]=String(ref).split(':'),url=hooks[channel];if(!url||!/^\d+$/.test(messageId||''))return null;
 try{
  const r=await fetch(`${url}/messages/${messageId}`,{signal:AbortSignal.timeout(10000)});if(!r.ok)return null;
  const poll=(await r.json()).poll;if(!poll)return null;
  const index=new Map((poll.answers||[]).map((a,i)=>[a.answer_id,i])),counts=Array(optionCount).fill(0);
  for(const a of poll.results?.answer_counts||[]){const i=index.get(a.id);if(i!==undefined&&i<optionCount)counts[i]=a.count}
  return counts
 }catch{return null}
}
