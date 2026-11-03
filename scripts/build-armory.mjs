/* Builds server/armory-items.json for the Waffenkammer game: real WoW Classic items by Wowhead ID (German names, icons, stats from the tooltip API),
   turned into the four simple game values. Run: node scripts/build-armory.mjs. Only the item IDs below are chosen by hand; nothing else is invented. */
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';

// Five chests, each with its own items. weight: share inside the same rarity (famous items get less).
export const CHESTS=[
 {id:'stormwind',name:'Schatztruhe von Sturmwind',price:100,icon:'inv_box_01',odds:{uncommon:50,rare:30,epic:17,legendary:3},
  items:{uncommon:[6084,10400,10401,10402,10403,4243],rare:[2041,2042,1121,10399,5191,5193,5443],epic:[873,2164,2825,1980],legendary:[[18563,1]]}},
 {id:'ironforge',name:'Schatztruhe von Ironforge',price:250,icon:'inv_box_02',odds:{uncommon:40,rare:35,epic:20,legendary:5},
  items:{uncommon:[3481,3482,3483,3484,3485,3491,3492],rare:[9492,9454,9452,9458,9459,11745,11746],epic:[2099,11684,942,2915,943],legendary:[[18564,1]]}},
 {id:'stratholme',name:'Schatztruhe von Stratholme',price:500,icon:'inv_box_03',odds:{uncommon:30,rare:35,epic:27,legendary:8},
  items:{uncommon:[10002,10004,10023,10025,10028,10031],rare:[13348,13349,13340,13346,13344,13361,13359,13375,13394,13404],epic:[[13505,4],13353,12590,[12592,6],1443],legendary:[[22630,1]]}},
 {id:'moltencore',name:'Schatztruhe von Molten Core',price:1000,icon:'inv_box_04',odds:{uncommon:15,rare:30,epic:43,legendary:12},
  items:{uncommon:[15053,15054,15055,14042,14045],rare:[11923,11926,11931,11932,11933,11810,11819,11816,11820],epic:[[17076,6],17103,17104,17063,18814,18820,18821,18832,18842,17106,16922,19137],legendary:[[17204,3],[17182,1]]}},
 {id:'azeroth',name:'Legendäre Azeroth-Truhe',price:2500,icon:'inv_box_birdcage_01',odds:{uncommon:5,rare:20,epic:55,legendary:20},
  items:{uncommon:[12422,12427,15090,15085,14106],rare:[12583,11815,13382,13380,13379,13398,13397],epic:[[19364,3],[18608,4],[18609,4],19352,19351,19353,17068,17075,21134,22954,[22691,3],[22798,4],19363,19356,18404,18813],legendary:[[22589,3],[19019,1]]}}
];
// Shop stock: the famous weapons plus armour, shields, rings and trinkets across all rarities.
export const SHOP=[19019,17182,19364,18608,17106,13375,9458,5443,17063,18821,1156,18820,11810,11815,12405,12410,15085,14106,10001,7930,3492,3487,13361,11923,17076,18832,2042,5193];

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

// The four game values. Real stats count first; a small share from item level makes sure every item matters.
function gameStats(item){
 if(!item.slot)return{leben:0,angriff:0,verteidigung:0,krit:0};
 const s=item.stats,base=item.itemLevel*{uncommon:1,rare:1.25,epic:1.6,legendary:2.2}[item.quality],weapon=['mainhand','onehand','twohand','ranged'].includes(item.slot)&&item.type!=='Schild';
 let leben=s.sta*10,angriff=s.dps+s.str+s.agi*.5+s.int*.3+Math.max(s.spell,s.heal*.5)*.6,verteidigung=s.armor/25,krit=s.crit+s.agi/30;
 if(weapon){angriff+=base*(item.slot==='twohand'?.5:.3)+(item.quality==='legendary'?base*.4:0);krit+=base/120}
 else if(['ring','neck','trinket'].includes(item.slot)){angriff+=base*.2;krit+=base/60}
 else if(item.type==='Schild'){verteidigung+=base*.5;leben+=base*2}
 else{verteidigung+=base*.15;leben+=base*2}
 return{leben:Math.round(leben),angriff:Math.round(angriff),verteidigung:Math.round(verteidigung),krit:Math.round(krit*10)/10}
}
const valueOf=item=>Math.round(Math.pow(Math.max(item.itemLevel,10),1.5)*VALUE_FACTOR[item.quality]/5)*5;

const wanted=new Set([...SHOP]);
for(const chest of CHESTS)for(const list of Object.values(chest.items))for(const entry of list)wanted.add(Array.isArray(entry)?entry[0]:entry);
const items={};
for(const id of [...wanted].sort((a,b)=>a-b)){
 const item=parse(id,await tooltip(id));
 items[id]={...item,game:gameStats(item),value:valueOf(item)};
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
writeFileSync(new URL('../server/armory-items.json',import.meta.url),JSON.stringify({source:'Wowhead Classic-Tooltips (nether.wowhead.com), abgerufen '+new Date().toISOString().slice(0,10),items,chests,shop:SHOP},null,1)+'\n');
console.log('\n'+Object.keys(items).length+' Items geschrieben.');
for(const c of chests){const ev=Object.entries(c.items).reduce((sum,[r,pool])=>{const total=pool.reduce((a,p)=>a+p.weight,0);return sum+c.odds[r]/100*pool.reduce((a,p)=>a+p.weight/total*items[p.id].value,0)},0);console.log(c.id,'Preis',c.price,'Erwartungswert (Shopwert)',Math.round(ev))}
