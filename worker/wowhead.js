/* Live data from Wowhead Forever, cached in the DB. Uses the tooltip API, the talent calculator's data file and the Forever guides' loot tables; item pages answer bots with 403 and stay untouched. */
const wowheadItemTtl=12*3600*1000,wowheadDailyTtl=24*3600*1000,wowheadRetry=15*60*1000,wowheadPause=250;
const wowheadHeaders={'User-Agent':'ModCheck-Guild-Site/1.0'};
const wowheadTooltip='https://nether.wowhead.com/forever/tooltip/item/';
const wowheadCalculator='https://www.wowhead.com/forever/de/talent-calc/warrior';
const wowheadTalents='https://nether.wowhead.com/forever/de/data/talents-classic?dv=29&db=1793399207';
const wowheadQuality=['poor','common','uncommon','rare','epic','legendary'];
const wowheadStats={3:'agi',4:'str',5:'int',6:'spi',7:'sta'};
const wowheadIconPath=/^\/(?:icons|talent-icons)\/([a-z0-9_-]+)\.jpg$/;
const wowheadSlots=[[/^two-hand/i,'mainhand','twohand'],[/^(?:one-hand|main[ -]hand)/i,'mainhand','onehand'],[/shield$/i,'offhand','shield'],[/(?:gun|bow|crossbow|thrown)$/i,'ranged','ranged'],[/cloak$/i,'back'],[/nec[kl]/i,'neck'],[/(?:finger|ring)$/i,'ring1'],[/trinket$/i,'trinket1'],[/(?:head|helm)$/i,'head'],[/shoulders?$/i,'shoulders'],[/chest$/i,'chest'],[/wrists?$/i,'wrists'],[/hands?$/i,'hands'],[/(?:waist|belt)$/i,'waist'],[/legs$/i,'legs'],[/(?:feet|boots)$/i,'feet']];
let wowheadRefreshing=null;
function dataJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
async function wowheadGet(url){const r=await fetch(url,{headers:wowheadHeaders,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Wowhead antwortet mit '+r.status);return r}
function wowheadText(html){return html.replace(/<!--.*?-->/gs,'').replace(/<br\s*\/?>/gi,'\n').replace(/<table[^>]*>|<\/(?:tr|table|div)>/gi,'\n').replace(/<\/t[dh]>/gi,' ').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/[ \t]+/g,' ').replace(/ ?\n ?/g,'\n').replace(/\n{2,}/g,'\n').trim()}
function parseWowheadItem(raw){
 const html=raw.tooltip;if(!raw.name||!html)throw Error('Tooltip ohne Daten');
 const value=re=>{const m=html.match(re);return m?Number(m[1]):undefined};
 const stats={};for(const[,code,n]of html.matchAll(/<!--stat(\d+)-->([+-]?\d+)/g))if(wowheadStats[code])stats[wowheadStats[code]]=Number(n);
 const damage=html.match(/<!--dmg-->(\d+) - (\d+)/);if(damage){stats.dmgmin1=Number(damage[1]);stats.dmgmax1=Number(damage[2])}
 const extra={armor:value(/<!--amr-->(\d+)/),blockamount:value(/>?(\d+) Blocken/),dps:value(/<!--dps-->\(([\d.]+)/),speed:value(/<!--spd-->([\d.]+)/)};
 for(const[k,n]of Object.entries(extra))if(n!==undefined)stats[k]=n;
 const icon=typeof raw.icon==='string'&&/^[a-z0-9_-]+$/i.test(raw.icon)?raw.icon.toLowerCase():undefined;
 return{name:raw.name,quality:wowheadQuality[raw.quality],icon,level:value(/<!--rlvl-->(\d+)/),itemLevel:value(/<!--ilvl-->(\d+)/),stats,tooltip:wowheadText(html),droppedBy:wowheadText(html.match(/whtt-droppedby">[^:]*:\s*([^<]+)/)?.[1]||'')||undefined,dropChance:value(/whtt-dropchance">[^:]*:\s*([\d.]+)%/)}
}
function parseWowheadSpell(raw){
 const html=raw.tooltip;if(!raw.name||!html)throw Error('Tooltip ohne Daten');
 const icon=typeof raw.icon==='string'&&/^[a-z0-9_-]+$/i.test(raw.icon)?raw.icon.toLowerCase():undefined;
 const block=html.match(/Reagenzien:<br \/>\s*<div class="indent[^"]*">([\s\S]*?)<\/div>/);
 const reagents=[...(block?.[1]||'').matchAll(/item=(\d+)[^"]*"[^>]*>([^<]+)<\/a>(?:<\/span>)?(?:\s*\((\d+)\))?/g)].map(([,id,name,n])=>({id:Number(id),name:wowheadText(name),quantity:Number(n||1)}));
 const made=block&&html.slice(html.indexOf(block[0])+block[0].length).match(/^<br \/><span class="q\d?"><a href="[^"]*item=(\d+)[^"]*"[^>]*>([^<]+)<\/a><\/span>(?:\s*\((\d+)\))?/);
 const skill=html.match(/Benötigt <a href="[^"]*skill=\d+[^"]*"[^>]*>([^<]+)<\/a>\s*\((\d+)\)/);
 const requiredClass=html.match(/wowhead-tooltip-requirements">Benötigt ([^<]+)<\/div>/)?.[1],requiredLevel=html.match(/wowhead-tooltip-requirements">Benötigt Stufe (\d+)/)?.[1];
 return{name:raw.name,icon,requiredClass:requiredClass&&wowheadText(requiredClass),requiredLevel:requiredLevel?Number(requiredLevel):null,reagents,creates:made?{id:Number(made[1]),name:wowheadText(made[2]),quantity:Number(made[3]||1)}:null,profession:skill?wowheadText(skill[1]):null,skill:skill?Number(skill[2]):null,tooltip:wowheadText(html)}
}
async function resolveWowhead(env,kind,objectId){
 const key=kind+':'+objectId,row=(await readWowheadCache(env,key)).get(key);
 if(row?.payload&&!isStale(row,wowheadItemTtl,Date.now()))return JSON.parse(row.payload);
 try{const data=(kind==='item'?parseWowheadItem:parseWowheadSpell)(await(await wowheadGet((kind==='item'?wowheadTooltip:wowheadTooltip.replace('/item/','/spell/'))+objectId+'?locale=3')).json());await storeWowhead(env,key,data);return data}
 catch(e){await storeWowheadError(env,key,e);if(row?.payload)return JSON.parse(row.payload);throw Error('Wowhead kennt diese ID nicht oder ist gerade nicht erreichbar.')}
}
function classifyWowheadItem(kind,stats){
 const[,slot='',type='armor']=wowheadSlots.find(([re])=>re.test(kind))||[],sta=stats.sta||0,result=(tank,reason)=>({slot,type,usable:!!slot,tank,reason});
 if(!slot||type==='ranged')return result('other','Für andere Rollen oder nur als Übergang.');
 if(sta<0)return result('other','Negative Ausdauer: kein pauschaler Tank-Tipp.');
 if(type==='shield')return result('tank','Schild für Schildblock und defensive Fähigkeiten.');
 if(/^(?:mail|plate)/i.test(kind))return result('tank','Schwere Rüstung als defensive Leveloption.');
 if(type==='onehand')return result('threat','Einhandoption für Bedrohung; Schaden und Tempo mit deiner Waffe vergleichen.');
 if(sta>0&&['back','neck','ring1'].includes(slot))return result('tank','Ausdauer als defensiver Beitrag.');
 return sta>0?result('transition','Möglicher Übergang; Rüstung und Werte mit deinem aktuellen Slot vergleichen.'):result('other','Für andere Rollen oder nur als Übergang.')
}
function parseWowheadLoot(html){
 const start=html.indexOf('[tabs name=\\"Loot'),end=html.indexOf('[\\/tabs]',start);if(start<0||end<0)throw Error('Beutetabelle fehlt');
 const body=JSON.parse('"'+html.slice(start,end)+'"');
 const tabs=[...body.matchAll(/\[tab name="([^"]*)"[^\]]*\]([\s\S]*?)\[\/tab\]/g)].map(([,name,text])=>({name,items:[...text.matchAll(/\[tr\]\s*\[td\]([^[]*)\[\/td\]\s*\[td\]\[item=(\d+)/g)].map(([,kind,id])=>({id:Number(id),kind:kind.trim()}))})).filter(t=>t.items.length);
 if(!tabs.length)throw Error('Beutetabelle ist leer');return tabs
}
function lootKey(name){return name.toLowerCase().replace(/\(.*?\)/g,'').replace(/[’']/g,'').replace(/\s+/g,' ').trim()}
function findLootBoss(bosses,tab){const key=lootKey(tab);return bosses.find(b=>b.guideTab===tab||lootKey(b.name).split(' / ').includes(key))}
function guideLoot(row){return row?.payload?JSON.parse(row.payload):null}
function buildWowheadTalents(deRaw,enRaw,seed,url){
 const payload=raw=>{if(!raw.includes('wow.talentCalcClassic.classicplus.data'))throw Error('Keine Forever-Talentdaten');const line=raw.slice(0,raw.indexOf('\n'));return JSON.parse(line.slice(line.indexOf(',')+1,line.lastIndexOf('}')+1))};
 const de=payload(deRaw),en=payload(enRaw);let count=0,fallbacks=0;
 const classes=seed.classes.map(c=>({...c,trees:c.trees.map(t=>{
  const source=de.talents[t.id];if(!source)throw Error('Talentbaum fehlt: '+t.id);
  const talents=Object.values(source).sort((a,b)=>a.row-b.row||a.col-b.col).map(s=>{
   const e=en.talents[t.id]?.[s.id],fallback=!s.name||!Object.values(s.descriptions).every(Boolean),icon=/^[a-z0-9_-]+$/i.test(s.icon)?s.icon.toLowerCase():'inv_misc_questionmark';if(fallback)fallbacks++;count++;
   return{id:s.id,name:s.name||e?.name,locale:fallback?'enUS':'deDE',nameEnus:s.nameEnus??s.name,icon:'talent-icons/'+icon+'.jpg',iconName:icon,row:s.row,col:s.col,maxRank:s.ranks.length,requiredPoints:s.requiredPoints??s.row*5,requires:s.requires.map(r=>({id:r.id,rank:r.qty})),descriptions:s.ranks.map((_,i)=>wowheadText(s.descriptions[i+1]||e?.descriptions[i+1]||'')),rankSpellIds:s.ranks,definition:s.definition}});
  return{...t,icon:talents[0]?.icon,talents}})}));
 if(!count)throw Error('Keine Talente gefunden');
 return{version:'forever',snapshot:new Date().toISOString().slice(0,10),source:url,sourceEnglish:url.replace('/de/','/'),calculator:wowheadCalculator,locale:'deDE',localizationFallbackCount:fallbacks,hashVersion:de.hashVersion,talentCount:count,classes}
}
function parseTalentSeed(text){return JSON.parse(text.slice(text.indexOf('const FOREVER_TALENTS=')+22,text.lastIndexOf(';')))}
async function readWowheadCache(env,prefix){const{results}=await env.DB.prepare('SELECT key, payload, fetched_at, checked_at, error FROM wowhead_cache WHERE key LIKE ?').bind(prefix+'%').all();return new Map(results.map(r=>[r.key,r]))}
async function storeWowhead(env,key,data){const now=Date.now();await env.DB.prepare('INSERT INTO wowhead_cache (key,payload,fetched_at,checked_at,error) VALUES (?,?,?,?,NULL) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, fetched_at=excluded.fetched_at, checked_at=excluded.checked_at, error=NULL').bind(key,JSON.stringify(data),now,now).run()}
async function storeWowheadError(env,key,error){await env.DB.prepare('INSERT INTO wowhead_cache (key,checked_at,error) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET checked_at=excluded.checked_at, error=excluded.error').bind(key,Date.now(),String(error.message).slice(0,200)).run()}
function isStale(row,ttl,now){return !row||now-row.checked_at>(row.error?wowheadRetry:ttl)}
async function refreshGuides(env){
 const seed=await env.seedCatalog(),cache=await readWowheadCache(env,'guide:'),now=Date.now();
 for(const d of seed.dungeons){const key='guide:'+d.id;if(!isStale(cache.get(key),wowheadDailyTtl,now))continue;
  try{
   const tabs=parseWowheadLoot(await(await wowheadGet(d.guide)).text()),found=new Set(tabs.flatMap(t=>t.items.map(i=>i.id))),known=d.bosses.flatMap(b=>b.items);
   if(known.filter(id=>found.has(id)).length<known.length/2)throw Error('Beutetabelle passt nicht zum Katalog');
   await storeWowhead(env,key,tabs);
  }catch(e){console.warn('Guide '+d.id+': '+e.message);await storeWowheadError(env,key,e)}
  await new Promise(r=>setTimeout(r,wowheadPause))}
}
async function refreshItems(env,limit){
 const seed=await env.seedCatalog(),cache=await readWowheadCache(env,'item:'),guides=await readWowheadCache(env,'guide:'),now=Date.now();
 const ids=new Set(seed.items.map(i=>i.id));for(const row of guides.values())for(const tab of guideLoot(row)||[])for(const{id}of tab.items)ids.add(id);
 const stale=[...ids].filter(id=>isStale(cache.get('item:'+id),wowheadItemTtl,now)).slice(0,limit);
 for(const id of stale){const key='item:'+id;
  try{await storeWowhead(env,key,parseWowheadItem(await(await wowheadGet(wowheadTooltip+id+'?locale=3')).json()))}
  catch(e){console.warn('Item '+id+': '+e.message);await storeWowheadError(env,key,e)}
  await new Promise(r=>setTimeout(r,wowheadPause))}
}
async function refreshTalents(env){
 const cache=await readWowheadCache(env,'talents');if(!isStale(cache.get('talents'),wowheadDailyTtl,Date.now()))return;
 try{
  const page=await(await wowheadGet(wowheadCalculator)).text(),url=page.match(/https:\/\/nether\.wowhead\.com\/forever\/de\/data\/talents-classic[^"\s<]+/)?.[0].replace(/&amp;/g,'&')||wowheadTalents;
  const de=await(await wowheadGet(url)).text(),en=await(await wowheadGet(url.replace('/de/','/'))).text();
  await storeWowhead(env,'talents',buildWowheadTalents(de,en,await env.seedTalents(),url));
 }catch(e){console.warn('Talente: '+e.message);await storeWowheadError(env,'talents',e)}
}
function refreshWowheadData(env,limit=40){wowheadRefreshing||=(async()=>{await refreshGuides(env);await refreshItems(env,limit);await refreshTalents(env)})().catch(e=>console.warn(e.message)).finally(()=>{wowheadRefreshing=null});return wowheadRefreshing}
function mergeCatalog(seed,cache,guides){
 const items=new Map(seed.items.map(item=>{const row=cache.get('item:'+item.id);return[item.id,row?.payload?{...item,...JSON.parse(row.payload),nameEn:item.name,live:true,fetchedAt:row.fetched_at}:{...item}]}));
 let liveGuides=0;
 const dungeons=seed.dungeons.map(d=>{
  const tabs=guideLoot(guides.get('guide:'+d.id));if(!tabs)return d;liveGuides++;
  const bosses=d.bosses.map(b=>({...b})),listed=new Set(tabs.flatMap(t=>t.items.map(i=>i.id)));
  for(const tab of tabs){
   let boss=findLootBoss(bosses,tab.name);
   if(!boss){boss={id:d.id+'-'+lootKey(tab.name).replace(/[^a-z0-9]+/g,'-'),name:tab.name,items:[]};bosses.push(boss)}
   for(const id of boss.items)if(!listed.has(id)&&items.has(id))items.get(id).retired=true;
   boss.items=tab.items.map(i=>i.id);
   for(const{id,kind}of tab.items){
    const row=cache.get('item:'+id);
    if(!items.has(id)&&row?.payload){const data=JSON.parse(row.payload);items.set(id,{id,kind,url:'https://www.wowhead.com/forever/item='+id,...classifyWowheadItem(kind,data.stats),...data,automatic:true,live:true,fetchedAt:row.fetched_at})}
    if(items.has(id))Object.assign(items.get(id),{dungeon:d.id,boss:boss.id});
   }
  }
  return{...d,bosses}});
 const active=[...items.values()].filter(i=>!i.retired),times=active.filter(i=>i.live).map(i=>i.fetchedAt);
 return{items:[...items.values()],dungeons,meta:{source:'Wowhead Forever',total:active.length,live:times.length,failed:active.filter(i=>cache.get('item:'+i.id)?.error).length,oldest:times.length?Math.min(...times):null,newest:times.length?Math.max(...times):null,guides:{live:liveGuides,total:seed.dungeons.length},added:active.filter(i=>i.automatic).length,retired:items.size-active.length}}
}
async function handleWowheadData(request,env,url,ctx){
 if(request.method!=='GET')return dataJson({error:'Methode nicht erlaubt.'},405);
 const talents=url.pathname==='/api/talents';
 if(!env.DB)return dataJson(talents?{...await env.seedTalents(),meta:{live:false}}:{...await env.seedCatalog(),meta:null});
 ctx.waitUntil(refreshWowheadData(env,env.refreshLimit));
 if(!talents)return dataJson(mergeCatalog(await env.seedCatalog(),await readWowheadCache(env,'item:'),await readWowheadCache(env,'guide:')));
 const row=(await readWowheadCache(env,'talents')).get('talents');
 return dataJson(row?.payload?{...JSON.parse(row.payload),meta:{live:true,fetchedAt:row.fetched_at}}:{...await env.seedTalents(),meta:{live:false}})
}
async function fetchWowheadIcon(pathname){const name=pathname.match(wowheadIconPath)?.[1];if(!name)return null;try{const r=await fetch('https://wow.zamimg.com/images/wow/icons/large/'+name+'.jpg',{headers:wowheadHeaders,signal:AbortSignal.timeout(15000)});return r.ok?new Response(r.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=604800','X-Content-Type-Options':'nosniff'}}):null}catch{return null}}

export { handleWowheadData, refreshWowheadData, fetchWowheadIcon, parseTalentSeed, parseWowheadLoot, classifyWowheadItem, parseWowheadSpell, resolveWowhead, wowheadGet, wowheadText };
