/* Builds server/armory-items.json for the Waffenkammer game: real WoW Classic items by Wowhead ID (German names, icons, stats from the tooltip API),
   turned into the game values. Run: node scripts/build-armory.mjs. Only the chest and shop IDs below are chosen by hand; nothing else is invented.
   Instances and bosses come from the loot tables of AtlasLootClassic (GPL-2.0, github.com/Hoizame/AtlasLootClassic, pinned to ATLAS_SHA):
   which boss drops which item. German instance and boss names and boss levels come from Wowhead's zone and NPC tooltips. */
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';

// Five chests, each with its own items. weight: share inside the same rarity (famous items get less).
export const CHESTS=[
 {id:'stormwind',name:'Schatztruhe von Sturmwind',price:100,icon:'inv_box_01',odds:{uncommon:50,rare:30,epic:17,legendary:3},
  items:{uncommon:[6084,10400,10401,10402,10403,4243],rare:[2041,2042,1121,10399,5191,5193,5443],epic:[873,2164,2825,812],legendary:[[22632,1]]}},
 {id:'ironforge',name:'Schatztruhe von Ironforge',price:250,icon:'inv_box_02',odds:{uncommon:40,rare:35,epic:20,legendary:5},
  items:{uncommon:[3481,3482,3483,3484,3485,3491,3492],rare:[9492,9454,9452,9458,9459,11745,11746],epic:[2099,11684,2244,2915,943],legendary:[[22631,1]]}},
 {id:'stratholme',name:'Schatztruhe von Stratholme',price:500,icon:'inv_box_03',odds:{uncommon:30,rare:35,epic:27,legendary:8},
  items:{uncommon:[10002,10004,10023,10025,10028,10031],rare:[13348,13349,13340,13346,13344,13361,13359,13375,13394,13404],epic:[[13505,4],13353,12590,[12592,6],2243],legendary:[[22630,1]]}},
 {id:'moltencore',name:'Schatztruhe von Molten Core',price:1000,icon:'inv_box_04',odds:{uncommon:15,rare:30,epic:43,legendary:12},
  items:{uncommon:[15053,15054,15055,14042,14045],rare:[11923,11926,11931,11932,11735,11744,11817,11816,11820],epic:[[17076,6],17103,17104,17071,17072,16901,17107,18832,18842,17106,16922,19137],legendary:[[19019,2],[17182,1]]}},
 {id:'azeroth',name:'Legendäre Azeroth-Truhe',price:2500,icon:'inv_box_birdcage_01',odds:{uncommon:5,rare:20,epic:55,legendary:20},
  items:{uncommon:[12422,12427,15090,15085,14106],rare:[12583,13401,13393,13408,13380,13398,13397],epic:[[19364,3],[18608,4],[18609,4],19352,19351,19353,17068,17075,21134,19347,[22691,3],[22798,4],19363,19356,19357,19346,19360],legendary:[[22589,3],[19019,1],[17182,1]]}}
];
// Shop stock: the famous weapons plus armour and shields. Only gear you can see on a character, no rings, necklaces or trinkets.
export const SHOP=[19019,17182,19364,18608,17106,13375,9458,5443,19347,17071,16901,13401,11735,17107,12405,12410,15085,14106,10001,7930,3492,3487,13361,11923,17076,18832,2042,5193];
// Items that were in chests or the shop before; kept so they stay valid in bags. Rings, necklaces, trinkets and quest trophies can only be sold.
export const RETIRED=[1980,942,1443,11933,11810,11819,17063,18814,18820,18821,17204,11815,13382,13379,22954,18404,18813,18563,18564,1156];
const HIDDEN_SLOTS=['ring','neck','trinket'];

// Instances of the game. id stays stable (runs in the database point to it). atlas: sections of AtlasLootClassic's data.lua, in fighting order.
// name: own German name where one instance covers several wings; icon: kept for the instances that existed before. Raids are scheduled by dungeons.js.
export const ATLAS_SHA='8e99341e4e779328460bf7684c0d5b22ce50ddf1';
export const INSTANCES=[
 {id:'ragefire',atlas:['Ragefire']},
 {id:'wailing',atlas:['WailingCaverns']},
 {id:'deadmines',atlas:['TheDeadmines'],icon:'achievement_boss_edwinvancleef'},
 {id:'shadowfang',atlas:['ShadowfangKeep'],icon:'spell_shadow_antishadow'},
 {id:'blackfathom',atlas:['BlackfathomDeeps']},
 {id:'stockade',atlas:['TheStockade']},
 {id:'gnomeregan',atlas:['Gnomeregan']},
 {id:'kraul',atlas:['RazorfenKraul']},
 {id:'scarlet-low',atlas:['ScarletMonasteryGraveyard','ScarletMonasteryLibrary'],name:'Scharlachrotes Kloster: Friedhof und Bibliothek'},
 {id:'scarlet',atlas:['ScarletMonasteryArmory','ScarletMonasteryCathedral'],name:'Scharlachrotes Kloster: Waffenkammer und Kathedrale',icon:'spell_holy_resurrection'},
 {id:'downs',atlas:['RazorfenDowns']},
 {id:'uldaman',atlas:['Uldaman']},
 {id:'zulfarrak',atlas:["Zul'Farrak"]},
 {id:'maraudon',atlas:['Maraudon']},
 {id:'sunkentemple',atlas:["TheTempleOfAtal'Hakkar"]},
 {id:'blackrockdepths',atlas:['BlackrockDepths']},
 {id:'lowerspire',atlas:['LowerBlackrockSpire'],name:'Untere Schwarzfelsspitze'},
 {id:'diremaul',atlas:['DireMaulEast','DireMaulWest','DireMaulNorth'],name:'Düsterbruch'},
 {id:'upperspire',atlas:['UpperBlackrockSpire'],name:'Obere Schwarzfelsspitze'},
 {id:'scholomance',atlas:['Scholomance']},
 {id:'stratholme',atlas:['Stratholme'],icon:'inv_sword_17'},
 {id:'onyxia',atlas:['Onyxia'],kind:'raid',icon:'achievement_boss_onyxia'},
 {id:'moltencore',atlas:['MoltenCore'],kind:'raid',icon:'achievement_boss_ragnaros'}
];
// Bosses per run: dungeons four, raids five. The end boss is the one with the highest level, the others are picked evenly over the rest; all fight in level order.
const BOSSES_PER_RUN={dungeon:4,raid:5};

const QUALITY={2:'uncommon',3:'rare',4:'epic',5:'legendary'};
const SLOT_TEXT={Kopf:'head',Hals:'neck',Schulter:'shoulders',Rücken:'back',Brust:'chest',Handgelenke:'wrists',Hände:'hands',Taille:'waist',Beine:'legs',Füße:'feet',Finger:'ring',Schmuck:'trinket',Waffenhand:'mainhand',Einhändig:'onehand',Zweihändig:'twohand',Schildhand:'offhand','In Schildhand geführt':'offhand',Distanz:'ranged'};
// Value of an item in shop gold. Rarity matters most, item level scales within it.
const VALUE_FACTOR={uncommon:.6,rare:1.1,epic:2.2,legendary:6};
const text=html=>html.replace(/<br\s*\/?>/g,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&');

// Raw tooltips are cached in data/ (not versioned) so re-running only fetches new IDs.
const cacheUrl=new URL('../data/armory-tooltips.json',import.meta.url);
let cache={};try{cache=JSON.parse(readFileSync(cacheUrl,'utf8'))}catch{}
async function tooltip(id){
 if(cache[id])return cache[id];
 const raw=await fetchTooltip(id);cache[id]=raw;mkdirSync(new URL('../data/',import.meta.url),{recursive:true});writeFileSync(cacheUrl,JSON.stringify(cache));return raw
}
async function fetchTooltip(id){
 for(const flavour of ['classic','forever']){
  for(let attempt=0;attempt<3;attempt++){
   const r=await fetch(`https://nether.wowhead.com/${flavour}/tooltip/item/${id}?locale=3`);
   if(r.status===404)break;
   if(r.ok){const j=await r.json();if(j.name)return j}
   await new Promise(s=>setTimeout(s,1500))
  }
 }
 throw Error(`Item ${id} nicht gefunden`)
}

function parse(id,raw){
 const html=raw.tooltip,plain=text(html),quality=QUALITY[raw.quality];
 if(!quality)throw Error(`Item ${id} (${raw.name}) hat keine passende Seltenheit`);
 const num=re=>{const m=plain.match(re);return m?Number(m[1].replace(',','.')):0};
 const row=html.match(/<table width="100%"><tr><td>([^<]+)<\/td>(?:<th>(?:<!--[^>]*-->)?(?:<span[^>]*>)?([^<]*))?/);
 let slotText=row?.[1]?.trim(),type=row?.[2]?.trim()||'';
 if(!slotText)slotText=Object.keys(SLOT_TEXT).find(k=>new RegExp(`(^|\\n)${k}(\\n|$)`).test(plain));
 const slot=SLOT_TEXT[slotText]||null;
 if(!type&&slot)type=plain.match(/\n(Stoff|Leder|Kette|Platte)\n/)?.[1]||'';
 const itemLevel=num(/Gegenstandsstufe (\d+)/),stats={
  sta:num(/\+(\d+) Ausdauer/),str:num(/\+(\d+) Stärke/),agi:num(/\+(\d+) Beweglichkeit/),int:num(/\+(\d+) Intelligenz/),spi:num(/\+(\d+) Willenskraft/),
  armor:num(/(\d+) Rüstung/),dps:num(/\(([\d.,]+) Schaden pro Sekunde\)/),crit:num(/kritische[nr]? (?:Treffer|Distanztreffer)[^.\d]*?um (\d+)%/),
  spell:num(/(?:Schaden und (?:die )?Heilung|Schaden)[^.\d]*?Zauber[^.\d]*?um bis zu (\d+)/)||num(/Zauber[^.\d]*?Schaden[^.\d]*?um bis zu (\d+)/),
  heal:num(/Heilung[^.\d]*?um bis zu (\d+)/)
 };
 const classes=plain.match(/Klassen: ([^\n]+)/)?.[1]?.split(/,\s*/)||null;
 return{id,name:raw.name,quality,icon:raw.icon,itemLevel,requiredLevel:num(/Benötigt Stufe (\d+)/),slot,type,classes,stats,unique:/Einzigartig/.test(plain)}
}

// The class-independent game values. Real stats count first; a small share from item level makes sure every item matters.
// Strength, agility, intellect and spirit are not in here: the server weighs them by the wearer's class (statsOf in server/armory.js).
function gameStats(item){
 if(!item.slot)return{leben:0,angriff:0,verteidigung:0,krit:0};
 const s=item.stats,base=item.itemLevel*{uncommon:1,rare:1.25,epic:1.6,legendary:2.2}[item.quality],weapon=['mainhand','onehand','twohand','ranged'].includes(item.slot)&&item.type!=='Schild';
 let leben=s.sta*10,angriff=s.dps+Math.max(s.spell,s.heal*.5)*.6,verteidigung=s.armor/25,krit=s.crit;
 if(weapon){angriff+=base*(item.slot==='twohand'?.5:.3)+(item.quality==='legendary'?base*.4:0);krit+=base/120}
 else if(['ring','neck','trinket'].includes(item.slot)){angriff+=base*.2;krit+=base/60}
 else if(item.type==='Schild'){verteidigung+=base*.5;leben+=base*2}
 else{verteidigung+=base*.15;leben+=base*2}
 return{leben:Math.round(leben),angriff:Math.round(angriff),verteidigung:Math.round(verteidigung),krit:Math.round(krit*10)/10}
}
// AtlasLootClassic's data.lua, cached in data/. Sections start with data["Name"] = {, bosses are the entries with an npcID.
async function atlasLua(){
 const url=new URL('../data/atlasloot-'+ATLAS_SHA.slice(0,8)+'.lua',import.meta.url);
 try{return readFileSync(url,'utf8')}catch{}
 const r=await fetch(`https://raw.githubusercontent.com/Hoizame/AtlasLootClassic/${ATLAS_SHA}/AtlasLootClassic_DungeonsAndRaids/data.lua`);if(!r.ok)throw Error('AtlasLoot: '+r.status);
 const lua=await r.text();mkdirSync(new URL('../data/',import.meta.url),{recursive:true});writeFileSync(url,lua);return lua
}
function block(text,start){let depth=0;for(let i=text.indexOf('{',start);i<text.length;i++){if(text[i]==='{')depth++;else if(text[i]==='}'&&--depth===0)return text.slice(start,i+1)}return text.slice(start)}
function atlasSection(lua,name){
 const start=lua.indexOf(`data["${name}"] = {`);if(start<0)throw Error('AtlasLoot-Abschnitt fehlt: '+name);
 const text=block(lua,start),range=text.match(/LevelRange = (?:GetForVersion\()?\{\s*(\d+),\s*(\d+),\s*(\d+)\s*\}/),mapId=+(text.match(/MapID = (\d+)/)?.[1]||0);
 const list=block(text,text.indexOf('items = {')),bosses=[];
 for(let i=list.indexOf('{',list.indexOf('{')+1);i>0;){
  const entry=block(list,i),npc=entry.match(/npcID = \{?\s*(\d+)/),loot=entry.indexOf('[NORMAL_DIFF] = {');
  // Rare spawns, quest and event bosses (ExtraList: holidays, Tier 0.5 summons, invasions) are not part of a normal run.
  if(npc&&loot>=0&&!/specialType = "(rare|quest|scourgeInvasion)"/.test(entry)&&!/ExtraList = true/.test(entry))bosses.push({npcId:+npc[1],english:entry.match(/name = AL\["([^"]+)"\]/)?.[1]||'',items:[...block(entry,loot+16).matchAll(/\{\s*\d+,\s*(\d{2,6})\b/g)].map(m=>+m[1])});
  const next=list.indexOf('{',i+entry.length);i=next>0&&next<list.length-1?next:-1
 }
 return{mapId,level:range?[+range[1],+range[2],+range[3]]:null,bosses}
}
async function nether(kind,id){
 const key=kind+':'+id;if(cache[key])return cache[key];
 for(let attempt=0;attempt<3;attempt++){const r=await fetch(`https://nether.wowhead.com/classic/tooltip/${kind}/${id}?locale=3`);if(r.ok){const j=await r.json();cache[key]=j;writeFileSync(cacheUrl,JSON.stringify(cache));return j}if(r.status===404)return null;await new Promise(s=>setTimeout(s,1500))}
 return null
}
const pickEven=(list,n)=>n<=0?[]:list.length<=n?list:n===1?[list[Math.floor(list.length/2)]]:Array.from({length:n},(_,i)=>list[Math.round(i*(list.length-1)/(n-1))]);
async function displayIds(){
 const url=new URL('../data/armory-displays.json',import.meta.url);
 try{return new Map(JSON.parse(readFileSync(url,'utf8')))}catch{}
 const csv=async table=>(await (await fetch(`https://wago.tools/db2/${table}/csv?product=wow_classic_era`)).text()).trim().split('\n').slice(1).map(l=>l.split(','));
 const modified=await csv('ItemModifiedAppearance'),appearance=new Map((await csv('ItemAppearance')).map(r=>[+r[0],+r[2]]));
 const map=new Map(modified.filter(r=>r[2]==='0').map(r=>[+r[1],appearance.get(+r[3])]).filter(([,d])=>d));
 writeFileSync(url,JSON.stringify([...map]));return map
}
const valueOf=item=>Math.round(Math.pow(Math.max(item.itemLevel,10),1.5)*VALUE_FACTOR[item.quality]/5)*5;

// Item display IDs for the 3D viewer, from the game's ItemModifiedAppearance and ItemAppearance tables (wago.tools, Classic Era).
const displays=await displayIds();
const lua=await atlasLua(),raws=new Map();
async function rawItem(id){if(!raws.has(id)){try{raws.set(id,await tooltip(id))}catch{raws.set(id,null)}}return raws.get(id)}
const gearOf=async ids=>{const out=[];for(const id of ids){const raw=await rawItem(id);if(!raw)continue;let it;try{it=parse(id,raw)}catch{continue}if(it.slot&&!HIDDEN_SLOTS.includes(it.slot)&&!out.includes(id))out.push(id)}return out};
const dungeons=[];
for(const inst of INSTANCES){
 const kind=inst.kind||'dungeon',sections=inst.atlas.map(n=>atlasSection(lua,n));
 const candidates=[];for(const sec of sections)for(const b of sec.bosses){const loot=await gearOf(b.items);if(loot.length)candidates.push({...b,loot})}
 if(!candidates.length){console.warn(`\n${inst.id}: keine Bosse mit sichtbarer Ausrüstung, ausgelassen`);continue}
 const zone=await nether('zone',sections[0].mapId),levels=sections.map(s=>s.level).filter(Boolean);
 const level=kind==='raid'?60:Math.min(...levels.map(l=>l[1])),maxLevel=kind==='raid'?60:Math.max(...levels.map(l=>l[2]));
 for(const b of candidates){const npc=await nether('npc',b.npcId),shown=npc?.tooltip?.match(/Stufe (\d+|\?\?)/)?.[1];b.name=npc?.name||b.english;b.level=shown&&shown!=='??'?+shown:Math.min(63,maxLevel+3)}
 const endBoss=[...candidates].sort((x,y)=>y.level-x.level||candidates.indexOf(y)-candidates.indexOf(x))[0];
 const chosen=[...pickEven(candidates.filter(b=>b!==endBoss),BOSSES_PER_RUN[kind]-1)].sort((x,y)=>x.level-y.level).concat(endBoss);
 const bosses=[];
 for(const b of chosen){
  const best=[...b.loot].sort((x,y)=>(raws.get(y).quality-raws.get(x).quality)||(parse(y,raws.get(y)).itemLevel-parse(x,raws.get(x)).itemLevel))[0];
  bosses.push({name:b.name,npcId:b.npcId,level:b.level,icon:raws.get(best).icon,loot:b.loot})
 }
 dungeons.push({id:inst.id,name:inst.name||zone?.name||inst.atlas[0],kind,level,maxLevel,icon:inst.icon||bosses.at(-1).icon,bosses});
 process.stdout.write(inst.id+' ')
}
const wanted=new Set([...SHOP,...RETIRED,...dungeons.flatMap(d=>d.bosses.flatMap(b=>b.loot))]);
for(const chest of CHESTS)for(const list of Object.values(chest.items))for(const entry of list)wanted.add(Array.isArray(entry)?entry[0]:entry);
const items={};
for(const id of [...wanted].sort((a,b)=>a-b)){
 const item=parse(id,await tooltip(id));if(HIDDEN_SLOTS.includes(item.slot))item.slot=null;
 items[id]={...item,game:gameStats(item),value:valueOf(item),display:displays.get(id)||null,...(RETIRED.includes(id)?{retired:true}:{})};
 process.stdout.write('.')
}
const chests=CHESTS.map(chest=>{
 const pools={};
 for(const [rarity,list] of Object.entries(chest.items)){
  pools[rarity]=list.map(entry=>{const [id,weight]=Array.isArray(entry)?entry:[entry,10];if(items[id].quality!==rarity)throw Error(`${items[id].name} ist ${items[id].quality}, nicht ${rarity} (${chest.id})`);return{id,weight}})
 }
 const count=Object.values(pools).reduce((a,p)=>a+p.length,0);if(count<15)throw Error(`${chest.id} hat nur ${count} Items`);
 return{...chest,items:pools}
});
writeFileSync(new URL('../server/armory-items.json',import.meta.url),JSON.stringify({source:'Wowhead Classic-Tooltips (nether.wowhead.com), abgerufen '+new Date().toISOString().slice(0,10)+'; Bossbeute aus AtlasLootClassic '+ATLAS_SHA.slice(0,8)+' (GPL-2.0)',items,chests,shop:SHOP,dungeons},null,1)+'\n');
console.log('Instanzen:\n'+dungeons.map(d=>`${d.id} ${d.level}-${d.maxLevel} [${d.bosses.map(b=>b.name+' '+b.level+' ('+b.loot.length+')').join(', ')}]`).join('\n'));
console.log('\n'+Object.keys(items).length+' Items geschrieben.');
for(const c of chests){const ev=Object.entries(c.items).reduce((sum,[r,pool])=>{const total=pool.reduce((a,p)=>a+p.weight,0);return sum+c.odds[r]/100*pool.reduce((a,p)=>a+p.weight/total*items[p.id].value,0)},0);console.log(c.id,'Preis',c.price,'Erwartungswert (Shopwert)',Math.round(ev))}
