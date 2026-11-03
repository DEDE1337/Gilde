/* Waffenkammer: treasure chests, character window, merchant, auction house and duels. The server decides every draw, price and hit;
   these pages only show it. Sounds are synthesised like the slot machine's, so the site ships no Blizzard audio. */
const AK={catalog:null,state:null,menu:null,duelTimer:null,confirm:null};
const AK_SLOT_NAMES={head:'Kopf',neck:'Hals',shoulders:'Schultern',back:'Rücken',chest:'Brust',wrists:'Handgelenke',hands:'Hände',waist:'Taille',legs:'Beine',feet:'Füße',ring1:'Finger',ring2:'Finger',trinket1:'Schmuck',trinket2:'Schmuck',mainhand:'Waffenhand',offhand:'Schildhand',ranged:'Distanz'};
const ITEM_SLOT={head:'Kopf',neck:'Hals',shoulders:'Schultern',back:'Rücken',chest:'Brust',wrists:'Handgelenke',hands:'Hände',waist:'Taille',legs:'Beine',feet:'Füße',ring:'Finger',trinket:'Schmuck',mainhand:'Waffenhand',onehand:'Einhändig',twohand:'Zweihändig',offhand:'Schildhand',ranged:'Distanz'};
const SLOT_ICONS={head:'inv_helmet_03',neck:'inv_jewelry_necklace_09',shoulders:'inv_shoulder_02',back:'inv_misc_cape_08',chest:'inv_chest_chain_07',wrists:'inv_bracer_02',hands:'inv_gauntlets_05',waist:'inv_belt_03',legs:'inv_pants_03',feet:'inv_boots_05',ring1:'inv_jewelry_ring_09',ring2:'inv_jewelry_ring_09',trinket1:'inv_jewelry_talisman_06',trinket2:'inv_jewelry_talisman_06',mainhand:'inv_sword_04',offhand:'inv_shield_04',ranged:'inv_weapon_bow_08'};
const RARITY_LABEL={uncommon:'Grün',rare:'Blau',epic:'Episch',legendary:'Legendär'},RARITIES=['uncommon','rare','epic','legendary'];
const STAT_NAMES=[['leben','Leben'],['angriff','Angriff'],['verteidigung','Verteidigung'],['krit','Kritische Trefferchance']];
const CHEST_TINT={stormwind:['#2f5fb0','#c9a24a'],ironforge:['#8a5a2b','#c0c6cf'],stratholme:['#4b3a5e','#9fb46b'],moltencore:['#8e2a12','#ffb347'],azeroth:['#6a2b9a','#ff9a2e']};
const LEFT_SLOTS=['head','neck','shoulders','back','chest','wrists'],RIGHT_SLOTS=['hands','waist','legs','feet','ring1','ring2','trinket1','trinket2'],BOTTOM_SLOTS=['mainhand','offhand','ranged'];

const goldText=n=>`<span class="ak-gold">${Number(n).toLocaleString('de-DE')}<i aria-hidden="true"></i><span class="visually-hidden"> Gold</span></span>`;
const itemOf=id=>AK.catalog.items[id];
const armoryTabs=active=>`<nav class="tavern-tabs ak-tabs" aria-label="Waffenkammer">${[['chests','Schatztruhen'],['armory','Charakter'],['shop','Händler'],['auctions','Auktionshaus'],['duels','Duelle']].map(([id,label])=>`<button class="${id===active?'selected':''}" onclick="openPage('${id}')">${label}</button>`).join('')}</nav>`;
const akHead=(title,text)=>head(title,text,`<span class="pill ak-purse" id="akPurse">${goldText(AK.state?.balance??0)}</span>`);
const akIcon=(id,{uid='',size='',extra=''}={})=>{const i=itemOf(id);return `<button type="button" class="ak-icon ${size} q-${i.quality}" data-item="${i.id}" ${uid?`data-uid="${esc(uid)}"`:''} aria-label="${esc(i.name)}" ${extra}><img src="icons/${esc(i.icon)}.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"></button>`};
const akName=id=>{const i=itemOf(id);return `<span class="quality-${i.quality}">${esc(i.name)}</span>`};
const statLine=g=>STAT_NAMES.filter(([k])=>g[k]).map(([k,n])=>`+${String(g[k]).replace('.',',')}${k==='krit'?' %':''} ${n}`).join(' · ');
async function akLoad(){AK.catalog||=await api('/api/armory/catalog');const s=await api('/api/armory');akSet(s);return s}
function akSet(s){
 AK.state=s;const purse=$('#akPurse');if(purse)purse.innerHTML=goldText(s.balance);
 if(s.welcome){ArmorySound.coins(20);akDialog('legendary',`<p class="win-rarity">Willkommen in der Waffenkammer</p><h2 id="akDlgTitle">${s.welcome.toLocaleString('de-DE')} Startgold</h2><p class="win-name">Für deinen ersten Charakter. Öffne Truhen, kauf beim Händler und fordere die Gilde zum Duell.</p><button class="primary" onclick="this.closest('dialog').remove()">Los geht's</button>`)}
}
function akDialog(quality,html,cls=''){
 document.querySelector('dialog.ak-dialog')?.remove();
 const d=document.createElement('dialog');d.className=`win-dialog ak-dialog q-${quality} ${cls}`;d.setAttribute('aria-labelledby','akDlgTitle');d.innerHTML=html;
 d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();return d
}
// Two-step buttons instead of browser confirm dialogs: the first click arms, the second within four seconds acts.
function armed(button,label){
 if(AK.confirm===button){clearTimeout(AK.confirmTimer);AK.confirm=null;return true}
 if(AK.confirm){AK.confirm.textContent=AK.confirm.dataset.label;AK.confirm.classList.remove('armed')}
 button.dataset.label=button.textContent;button.textContent=label;button.classList.add('armed');AK.confirm=button;
 clearTimeout(AK.confirmTimer);AK.confirmTimer=setTimeout(()=>{if(AK.confirm===button){button.textContent=button.dataset.label;button.classList.remove('armed');AK.confirm=null}},4000);
 return false
}

/* Sounds */
const ArmorySound=(()=>{
 let ctx=null;
 const audio=()=>{if(typeof SlotSound!=='undefined'&&SlotSound.isMuted())return null;ctx||=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx};
 function tone(a,{freq,type='sine',start=0,length=.15,volume=.15,endFreq}){const o=a.createOscillator(),g=a.createGain(),t=a.currentTime+start;o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,t+length);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+length);o.connect(g).connect(a.destination);o.start(t);o.stop(t+length+.02)}
 function noise(a,{start=0,length=.2,volume=.2,freq=1200,q=1,type='bandpass',sweep}){const b=a.createBuffer(1,Math.ceil(a.sampleRate*length),a.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain(),t=a.currentTime+start;s.buffer=b;f.type=type;f.frequency.setValueAtTime(freq,t);if(sweep)f.frequency.exponentialRampToValueAtTime(sweep,t+length);f.Q.value=q;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+length);s.connect(f).connect(g).connect(a.destination);s.start(t)}
 return{
  creak(){const a=audio();if(!a)return;for(let i=0;i<5;i++)tone(a,{freq:90+i*14,endFreq:140+i*20,type:'sawtooth',start:i*.09,length:.12,volume:.035});noise(a,{length:.5,volume:.05,freq:400,q:4})},
  latch(){const a=audio();if(!a)return;tone(a,{freq:1800,type:'square',length:.03,volume:.08});tone(a,{freq:300,endFreq:90,type:'triangle',start:.02,length:.18,volume:.25});noise(a,{start:.01,length:.12,volume:.12,freq:2500,q:2})},
  open(){const a=audio();if(!a)return;noise(a,{length:.6,volume:.12,freq:300,sweep:3000,q:.8});[392,494,587].forEach((f,i)=>tone(a,{freq:f,type:'triangle',start:.25+i*.08,length:.5,volume:.07}))},
  tick(){const a=audio();if(a)tone(a,{freq:1400+Math.random()*200,type:'square',length:.02,volume:.03})},
  reveal(quality){const a=audio();if(!a)return;const chords={uncommon:[523,659],rare:[523,659,784],epic:[440,554,659,880],legendary:[392,494,587,784,988]};(chords[quality]||chords.uncommon).forEach((f,i)=>{tone(a,{freq:f,type:'triangle',start:i*.07,length:1.2,volume:.09});tone(a,{freq:f*2,type:'sine',start:i*.07+.02,length:1,volume:.03})});if(quality==='epic'||quality==='legendary')noise(a,{start:.1,length:1.4,volume:.05,freq:6000,q:.5,type:'highpass'})},
  coins(n=6){if(typeof SlotSound!=='undefined')SlotSound.coins(n)},
  fanfare(){if(typeof SlotSound!=='undefined')SlotSound.fanfare()},
  equip(){const a=audio();if(!a)return;noise(a,{length:.09,volume:.2,freq:3200,q:3});tone(a,{freq:620,endFreq:420,type:'square',start:.01,length:.12,volume:.06});tone(a,{freq:180,endFreq:80,type:'triangle',start:.02,length:.2,volume:.2})},
  swing(){const a=audio();if(a)noise(a,{length:.22,volume:.16,freq:500,sweep:2600,q:1.2})},
  hit(crit){const a=audio();if(!a)return;noise(a,{start:.12,length:.14,volume:crit?.4:.26,freq:900,q:.7,type:'lowpass'});tone(a,{freq:crit?140:110,endFreq:50,type:'triangle',start:.12,length:.22,volume:crit?.4:.3});if(crit)tone(a,{freq:1600,type:'square',start:.12,length:.05,volume:.06})},
  block(){const a=audio();if(!a)return;tone(a,{freq:900,endFreq:700,type:'square',start:.12,length:.18,volume:.06});noise(a,{start:.12,length:.1,volume:.15,freq:2800,q:4})},
  miss(){const a=audio();if(a)noise(a,{length:.3,volume:.1,freq:1500,sweep:400,q:1})},
  heal(){const a=audio();if(a)[523,659,784].forEach((f,i)=>tone(a,{freq:f,type:'sine',start:i*.1,length:.5,volume:.07}))}
 }
})();

/* Tooltips in the WoW style, with a comparison against what is equipped */
function tooltipHtml(id,uid){
 const i=itemOf(id),g=i.game,owned=uid&&AK.state?.inventory.find(x=>x.uid===uid),char=AK.state?.character;
 const all=i.classes.length===9,classNames=i.classes.map(c=>CLASS_INFO[c]?.[0]).filter(Boolean);
 let compare='';
 if(i.slot&&AK.state&&!owned?.slot){
  const slots=i.slot==='ring'?['ring1','ring2']:i.slot==='trinket'?['trinket1','trinket2']:i.slot==='onehand'||i.slot==='twohand'?['mainhand']:[i.slot];
  const worn=AK.state.inventory.find(x=>slots.includes(x.slot));
  if(worn){const w=itemOf(worn.itemId).game,diff=STAT_NAMES.map(([k,n])=>{const d=Math.round((g[k]-w[k])*10)/10;return d?`<span class="${d>0?'up':'down'}">${d>0?'+':''}${String(d).replace('.',',')} ${n}</span>`:''}).filter(Boolean);compare=`<p class="tt-compare">Statt ${esc(itemOf(worn.itemId).name)}:<br>${diff.join('<br>')||'gleichwertig'}</p>`}
 }
 return `<b class="quality-${i.quality}">${esc(i.name)}</b><span class="tt-ilvl">Gegenstandsstufe ${i.itemLevel}</span>${i.slot?`<span class="tt-row"><span>${ITEM_SLOT[i.slot]}</span><span>${esc(i.type||'')}</span></span>`:'<span>Trophäe, nicht anlegbar</span>'}${i.slot?STAT_NAMES.filter(([k])=>g[k]).map(([k,n])=>`<span class="tt-stat">+${String(g[k]).replace('.',',')}${k==='krit'?' %':''} ${n}</span>`).join(''):''}${i.slot&&!all?`<span class="${char&&!i.classes.includes(char.classId)?'tt-bad':''}">Klassen: ${classNames.join(', ')}</span>`:''}${i.requiredLevel?`<span>Original: benötigt Stufe ${i.requiredLevel}</span>`:''}<span class="tt-price">Verkaufspreis: ${goldText(i.sell)}</span>${compare}`
}
(()=>{
 const tip=document.createElement('div');tip.id='akTip';tip.className='ak-tip';tip.setAttribute('role','tooltip');document.body.append(tip);
 const place=e=>{const pad=16,w=tip.offsetWidth,h=tip.offsetHeight;let x=e.clientX+pad,y=e.clientY+pad;if(x+w>innerWidth-8)x=e.clientX-w-pad;if(y+h>innerHeight-8)y=Math.max(8,innerHeight-h-8);tip.style.transform=`translate(${x}px,${y}px)`};
 document.addEventListener('pointerover',e=>{const el=e.target.closest?.('[data-item]');if(!el||e.pointerType!=='mouse'||!AK.catalog)return;tip.innerHTML=tooltipHtml(+el.dataset.item,el.dataset.uid);tip.classList.add('show');place(e)});
 document.addEventListener('pointermove',e=>{if(tip.classList.contains('show'))place(e)});
 document.addEventListener('pointerout',e=>{if(e.target.closest?.('[data-item]')&&!e.relatedTarget?.closest?.('[data-item]'))tip.classList.remove('show')});
 document.addEventListener('scroll',()=>tip.classList.remove('show'),{passive:true});
})();

/* Treasure chests */
function chestArt(id){
 const [wood,band]=CHEST_TINT[id]||CHEST_TINT.stormwind;
 return `<svg class="ak-chest-art" viewBox="0 0 200 170" aria-hidden="true"><defs><linearGradient id="w-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wood}"/><stop offset="1" stop-color="#1a0f08"/></linearGradient><linearGradient id="b-${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a4120"/><stop offset=".5" stop-color="${band}"/><stop offset="1" stop-color="#5a4120"/></linearGradient><radialGradient id="g-${id}"><stop offset="0" stop-color="#fff3c4"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>
 <ellipse class="ak-chest-glow" cx="100" cy="92" rx="80" ry="40" fill="url(#g-${id})"/>
 <g class="ak-chest-body"><rect x="22" y="86" width="156" height="72" rx="6" fill="url(#w-${id})" stroke="#120a05" stroke-width="3"/><path d="M22 110h156M22 134h156" stroke="#0006" stroke-width="2"/><rect x="40" y="86" width="16" height="72" fill="url(#b-${id})"/><rect x="144" y="86" width="16" height="72" fill="url(#b-${id})"/><rect x="88" y="92" width="24" height="30" rx="3" fill="url(#b-${id})" stroke="#2a1b0b" stroke-width="2"/><circle cx="100" cy="104" r="4" fill="#1a0f08"/><path d="M100 106v8" stroke="#1a0f08" stroke-width="3"/></g>
 <g class="ak-chest-lid"><path d="M22 88 V62 Q22 30 100 30 Q178 30 178 62 V88 Z" fill="url(#w-${id})" stroke="#120a05" stroke-width="3"/><path d="M40 88V44M160 88V44" stroke="url(#b-${id})" stroke-width="16"/><path d="M24 74h152" stroke="#0005" stroke-width="2"/><path d="M22 88h156" stroke="url(#b-${id})" stroke-width="6"/></g></svg>`
}
pageViews.chests=async()=>{
 await akLoad();
 $('#content').innerHTML=akHead('Schatztruhen','Öffne Truhen aus ganz Azeroth. Jede Truhe enthält echte Classic-Gegenstände, die Chancen stehen offen dran.')+armoryTabs('chests')+
  `<div class="ak-chests">${AK.catalog.chests.map(c=>`<article class="ak-chest wow-frame" data-chest="${c.id}">${chestArt(c.id)}<h3>${esc(c.name)}</h3><p class="ak-chest-price">${goldText(c.price)}</p><div class="ak-odds" aria-label="Chancen">${RARITIES.map(r=>`<span class="ak-odd q-${r}" style="flex:${c.odds[r]}" title="${RARITY_LABEL[r]}: ${c.odds[r]} %"></span>`).join('')}</div><ul class="ak-odds-list">${RARITIES.map(r=>`<li class="quality-${r}">${RARITY_LABEL[r]} <b>${c.odds[r]} %</b></li>`).join('')}</ul><div class="ak-row"><button class="primary" onclick="openChest('${c.id}')" ${AK.state.balance<c.price?'disabled':''}>Öffnen</button><button class="subtle" onclick="showChestContents('${c.id}')">Inhalt und Chancen</button></div></article>`).join('')}</div>`+
  frame('So funktionieren die Truhen',`<p>Der Server zieht zuerst die Seltenheit nach den Chancen der Truhe, dann ein Item dieser Stufe. Berühmte Stücke wie Donnerzorn oder Sulfuras sind innerhalb ihrer Stufe seltener, das steht bei jedem Item im Inhalt. Gewonnene Items landen sofort in deinem Inventar.</p><p class="muted">Gildengold ist Spielgeld nur für diese Seite: kein Echtgeld, keine Käufe, keine Auszahlung. Itemdaten: ${esc(AK.catalog.source)}.</p>`)
};
function showChestContents(id){
 const c=AK.catalog.chests.find(x=>x.id===id);
 akDialog('rare',`<h2 id="akDlgTitle">${esc(c.name)}</h2><p class="muted">Preis ${goldText(c.price)} · Chance je Item in Prozent</p><div class="ak-contents">${RARITIES.map(r=>`<h4 class="quality-${r}">${RARITY_LABEL[r]} · ${c.odds[r]} %</h4>${c.items[r].map(p=>`<div class="ak-content-row">${akIcon(p.id,{size:'sm'})}<span>${akName(p.id)}<small class="muted">${itemOf(p.id).slot?`${ITEM_SLOT[itemOf(p.id).slot]} ${esc(itemOf(p.id).type||'')}`:'Trophäe'}</small></span><b>${String(p.chance).replace('.',',')} %</b></div>`).join('')}`).join('')}</div><button class="primary" onclick="this.closest('dialog').close()">Schließen</button>`,'ak-wide')
}
const REEL_CARD=132,REEL_WIN_INDEX=46,REEL_LENGTH=54,REEL_MS=6800;
function reelCards(chest,winner){
 // Filler cards follow the chest's real odds so the strip looks like what the chest holds; the winner is the server's draw.
 const pick=()=>{let roll=Math.random()*100;for(const r of RARITIES){if((roll-=chest.odds[r])<0){const pool=chest.items[r];return pool[Math.floor(Math.random()*pool.length)].id}}return chest.items.uncommon[0].id};
 return Array.from({length:REEL_LENGTH},(_,i)=>i===REEL_WIN_INDEX?winner:pick())
}
const reelCard=(id,win)=>{const i=itemOf(id);return `<div class="ak-card q-${i.quality} ${win?'win':''}"><img src="icons/${esc(i.icon)}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><span>${esc(i.name)}</span></div>`};
const openChest=act(async id=>{
 const chest=AK.catalog.chests.find(c=>c.id===id);if(AK.opening)return;AK.opening=true;
 try{
  const r=await api('/api/armory/chest','POST',{chest:id}),won=itemOf(r.won.itemId),calm=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const d=akDialog('common',`<h2 id="akDlgTitle" class="visually-hidden">${esc(chest.name)} wird geöffnet</h2><div class="ak-open-stage"><div class="ak-open-chest">${chestArt(chest.id)}</div><div class="ak-reel" hidden><div class="ak-reel-marker"></div><div class="ak-reel-strip">${reelCards(chest,r.won.itemId).map((x,i)=>reelCard(x,i===REEL_WIN_INDEX)).join('')}</div></div><div class="ak-result" hidden></div></div>`,'ak-open');
  d.style.setProperty('--q','#e8b64c');
  const stage=d.querySelector('.ak-open-stage'),box=d.querySelector('.ak-open-chest');
  if(!calm){ArmorySound.creak();box.classList.add('shake');await new Promise(s=>setTimeout(s,900))}
  ArmorySound.latch();box.classList.add('open');ArmorySound.open();await new Promise(s=>setTimeout(s,calm?0:700));
  const reel=d.querySelector('.ak-reel'),strip=d.querySelector('.ak-reel-strip');reel.hidden=false;box.classList.add('away');
  const offset=REEL_WIN_INDEX*REEL_CARD+REEL_CARD/2-reel.clientWidth/2+(Math.random()-.5)*REEL_CARD*.7;
  strip.style.transform='translateX(0)';strip.getBoundingClientRect();
  if(!calm){strip.style.transition=`transform ${REEL_MS}ms cubic-bezier(.06,.55,.1,1)`;let last=-1;const started=performance.now();const tick=()=>{const m=new DOMMatrixReadOnly(getComputedStyle(strip).transform),card=Math.floor(-m.m41/REEL_CARD);if(card!==last){last=card;ArmorySound.tick()}if(performance.now()-started<REEL_MS)requestAnimationFrame(tick)};requestAnimationFrame(tick)}
  strip.style.transform=`translateX(${-offset}px)`;
  await new Promise(s=>setTimeout(s,calm?0:REEL_MS+250));
  strip.children[REEL_WIN_INDEX].classList.add('landed');stage.classList.add(`won-${won.quality}`);d.className=`win-dialog ak-dialog ak-open q-${won.quality}`;d.style.removeProperty('--q');
  ArmorySound.reveal(won.quality);if(won.quality==='legendary'){ArmorySound.fanfare();ArmorySound.coins(30)}else if(won.quality==='epic')ArmorySound.coins(12);
  const result=d.querySelector('.ak-result');result.hidden=false;
  const canEquip=won.slot&&AK.state.character&&won.classes.includes(AK.state.character.classId);
  result.innerHTML=`${won.quality==='legendary'||won.quality==='epic'?`<div class="ak-rays" aria-hidden="true"></div><div class="win-coins" aria-hidden="true">${Array.from({length:won.quality==='legendary'?36:18},(_,i)=>`<i style="left:${Math.random()*100}%;animation-delay:${(i*.07).toFixed(2)}s;animation-duration:${(1.4+Math.random()*1.2).toFixed(2)}s"></i>`).join('')}</div>`:''}<p class="win-rarity">${RARITY_LABEL[won.quality]}!</p>${akIcon(won.id,{uid:r.won.uid,size:'xl'})}<h3 class="quality-${won.quality}">${esc(won.name)}</h3><p class="muted">${won.slot?`${ITEM_SLOT[won.slot]} ${esc(won.type||'')} · ${statLine(won.game)}`:'Trophäe, nicht anlegbar'} · Wert ${goldText(won.sell)}</p><div class="ak-row center">${canEquip?`<button class="primary" onclick="equipItem('${esc(r.won.uid)}',true)">Anlegen</button>`:''}<button class="${canEquip?'subtle':'primary'}" onclick="this.closest('dialog').close();openChest('${chest.id}')" ${r.balance<chest.price?'disabled':''}>Nochmal (${chest.price} Gold)</button><button class="subtle" onclick="this.closest('dialog').close()">Ins Inventar</button></div>`;
  akSet(r);if(page==='chests')document.querySelectorAll('.ak-chest').forEach(el=>{const c=AK.catalog.chests.find(x=>x.id===el.dataset.chest);el.querySelector('.primary').disabled=r.balance<c.price})
 }finally{AK.opening=false}
});

/* Character window and bags */
const equipped=slot=>AK.state.inventory.find(i=>i.slot===slot);
function slotBox(slot){
 const it=equipped(slot);
 return `<div class="ak-slot" data-slot="${slot}">${it?akIcon(it.itemId,{uid:it.uid,extra:`onclick="itemMenu(event,'${esc(it.uid)}')"`}):`<span class="ak-slot-empty" title="${AK_SLOT_NAMES[slot]}"><img src="icons/${SLOT_ICONS[slot]}.jpg" alt=""></span>`}<small>${AK_SLOT_NAMES[slot]}</small></div>`
}
function portrait(c){
 if(!c)return `<div class="ak-portrait empty"><p>Noch kein Charakter</p><button class="primary" onclick="openPage('characters')">Charakter anlegen</button></div>`;
 return `<div class="ak-portrait" style="--class:${CLASS_INFO[c.classId]?.[1]||'#fff'}"><img class="ak-face" src="icons/${charFaceIcon({race:c.race,gender:c.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><h3>${esc(c.name)}</h3><p>${classIcon(c.classId)} ${esc(c.race)} · ${esc(c.className)}</p></div>`
}
function statPanel(s){
 return `<dl class="ak-stats">${STAT_NAMES.map(([k,n])=>{const extra=Math.round((s.stats[k]-s.base[k])*10)/10;return `<div><dt>${n}</dt><dd>${String(s.stats[k]).replace('.',',')}${k==='krit'?' %':''}${extra?`<small class="up">+${String(extra).replace('.',',')}</small>`:''}</dd></div>`}).join('')}</dl>`
}
pageViews.armory=async()=>{
 const s=await akLoad(),bag=s.inventory.filter(i=>!i.slot),gear=s.inventory.filter(i=>i.slot);
 $('#content').innerHTML=akHead('Charakter','Leg deine Beute an. Bessere Ausrüstung bringt mehr Leben, Angriff, Verteidigung und kritische Treffer im Duell.')+armoryTabs('armory')+
  `<div class="ak-armory"><section class="ak-charwin wow-frame" aria-label="Ausrüstung"><div class="ak-col">${LEFT_SLOTS.map(slotBox).join('')}</div><div class="ak-center">${portrait(s.character)}${statPanel(s)}<p class="muted">Werte: Grundwerte plus alle angelegten Items, die deine Klasse tragen darf. Grundlage ist dein Hauptcharakter.</p></div><div class="ak-col">${RIGHT_SLOTS.map(slotBox).join('')}</div><div class="ak-bottom">${BOTTOM_SLOTS.map(slotBox).join('')}</div></section>`+
  `<section class="ak-bags wow-frame" aria-label="Taschen"><h3 class="wow-title">Taschen <small class="muted">${bag.length} Items · ${gear.length} angelegt</small></h3>${bag.length?`<div class="ak-bag-grid">${bag.map(i=>`<div class="ak-bag-cell ${i.usable?'':'unusable'} ${i.listed?'listed':''}">${akIcon(i.itemId,{uid:i.uid,extra:`onclick="itemMenu(event,'${esc(i.uid)}')"`})}${i.listed?'<span class="ak-badge">AH</span>':''}</div>`).join('')}</div>`:emptyBox('Deine Taschen sind leer. Öffne eine <button class="link" onclick="openPage(\'chests\')">Schatztruhe</button> oder geh zum <button class="link" onclick="openPage(\'shop\')">Händler</button>.')}<p class="muted">Klick auf ein Item für Anlegen, Verkaufen oder Auktionshaus. Rot umrandet: deine Klasse kann es nicht tragen.</p></section></div>`
};
function closeItemMenu(){AK.menu?.remove();AK.menu=null}
document.addEventListener('pointerdown',e=>{if(AK.menu&&!e.target.closest('.ak-menu')&&!e.target.closest('[data-uid]'))closeItemMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeItemMenu()});
function itemMenu(e,uid){
 e.stopPropagation();closeItemMenu();
 const it=AK.state.inventory.find(i=>i.uid===uid);if(!it)return;const item=itemOf(it.itemId),menu=document.createElement('div');menu.className='ak-menu wow-frame';menu.setAttribute('role','menu');
 const ringSlots=item.slot==='ring'?['ring1','ring2']:item.slot==='trinket'?['trinket1','trinket2']:item.slot==='onehand'&&[1,3,4].includes(AK.state.character?.classId)?['mainhand','offhand']:null;
 menu.innerHTML=`<p class="quality-${item.quality}"><b>${esc(item.name)}</b></p>${it.slot?`<button role="menuitem" onclick="unequipItem('${esc(uid)}')">Ablegen</button>`:it.listed?`<button role="menuitem" onclick="openPage('auctions')">Steht im Auktionshaus</button>`:`${item.slot&&it.usable?(ringSlots?ringSlots.map(s=>`<button role="menuitem" onclick="equipItem('${esc(uid)}',false,'${s}')">Anlegen: ${s==='offhand'?'Schildhand':AK_SLOT_NAMES[s]} ${s.endsWith('2')?'2':s.endsWith('1')?'1':''}</button>`).join(''):`<button role="menuitem" onclick="equipItem('${esc(uid)}')">Anlegen</button>`):`<small class="muted">${item.slot?'Deine Klasse kann das nicht tragen.':'Trophäe, nicht anlegbar.'}</small>`}<button role="menuitem" onclick="if(armed(this,'Wirklich für ${item.sell} Gold verkaufen?'))sellItem('${esc(uid)}')">An Händler verkaufen: ${item.sell} Gold</button><button role="menuitem" onclick="closeItemMenu();openPage('auctions','${esc(uid)}')">Im Auktionshaus anbieten</button>`}`;
 document.body.append(menu);AK.menu=menu;
 const r=e.currentTarget.getBoundingClientRect(),w=menu.offsetWidth,h=menu.offsetHeight;
 menu.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+scrollX))+'px';menu.style.top=(r.bottom+h+8>innerHeight?r.top+scrollY-h-6:r.bottom+scrollY+6)+'px';
 menu.querySelector('button')?.focus()
}
const equipItem=act(async(uid,fromDialog,slot)=>{closeItemMenu();const s=await api('/api/armory/equip','POST',slot?{uid,slot}:{uid});ArmorySound.equip();akSet(s);if(fromDialog){document.querySelector('dialog.ak-dialog')?.close();toast(`${itemOf(s.inventory.find(i=>i.uid===uid).itemId).name} angelegt.`)}if(page==='armory')redraw()});
const unequipItem=act(async uid=>{closeItemMenu();const s=await api('/api/armory/unequip','POST',{uid});ArmorySound.equip();akSet(s);if(page==='armory')redraw()});
const sellItem=act(async uid=>{closeItemMenu();const s=await api('/api/armory/sell','POST',{uid});ArmorySound.coins(5);akSet(s);toast(`Verkauft für ${s.sold} Gold.`);redraw()});

/* Merchant */
const SHOP_FILTERS=[['all','Alles'],['weapon','Waffen'],['armor','Rüstung'],['shield','Schilde'],['jewelry','Ringe und Schmuck']];
let shopFilter='all';
const shopKind=i=>i.type==='Schild'?'shield':['ring','neck','trinket'].includes(i.slot)?'jewelry':['mainhand','onehand','twohand','ranged'].includes(i.slot)?'weapon':'armor';
pageViews.shop=async()=>{
 await akLoad();
 const stock=AK.catalog.shop.map(itemOf).filter(i=>shopFilter==='all'||shopKind(i)===shopFilter).sort((a,b)=>RARITIES.indexOf(b.quality)-RARITIES.indexOf(a.quality)||b.buy-a.buy);
 const sellable=AK.state.inventory.filter(i=>!i.slot&&!i.listed);
 $('#content').innerHTML=akHead('Händler','Thunderfury, Sulfuras, Ashkandi und mehr: kauf direkt mit deinem Gildengold oder verkauf, was du nicht brauchst.')+armoryTabs('shop')+
  `<div class="rank-tabs" role="group" aria-label="Warengruppe">${SHOP_FILTERS.map(([k,l])=>`<button class="${k===shopFilter?'selected':''}" aria-pressed="${k===shopFilter}" onclick="shopFilter='${k}';redraw()">${l}</button>`).join('')}</div>`+
  `<div class="ak-shop">${stock.map(i=>{const usable=AK.state.character&&i.classes.includes(AK.state.character.classId);return `<div class="ak-shop-row wow-frame q-${i.quality}">${akIcon(i.id)}<span class="ak-shop-name">${akName(i.id)}<small class="muted">${ITEM_SLOT[i.slot]||''} ${esc(i.type||'')} · Stufe ${i.itemLevel}${usable?'':' · <span class="tt-bad">nicht für deine Klasse</span>'}</small><small>${statLine(i.game)}</small></span><span class="ak-shop-buy">${goldText(i.buy)}<button class="primary" ${AK.state.balance<i.buy?'disabled':''} onclick="if(armed(this,'Kaufen?'))buyItem(${i.id})">Kaufen</button></span></div>`}).join('')}</div>`+
  frame('Ankauf',sellable.length?`<p class="muted">Der Händler zahlt ein Drittel des Werts. Mehr holst du oft im <button class="link" onclick="openPage('auctions')">Auktionshaus</button>.</p><div class="ak-sell-list">${sellable.map(i=>`<div class="list-row">${akIcon(i.itemId,{uid:i.uid,size:'sm'})}<span>${akName(i.itemId)}</span><span>${goldText(itemOf(i.itemId).sell)} <button class="subtle" onclick="if(armed(this,'Sicher?'))sellItem('${esc(i.uid)}')">Verkaufen</button></span></div>`).join('')}</div>`:emptyBox('Nichts zu verkaufen. Angelegte Items leg erst im Charakterfenster ab.'))
};
const buyItem=act(async itemId=>{const s=await api('/api/armory/buy','POST',{itemId});ArmorySound.coins(8);akSet(s);toast(`${itemOf(itemId).name} gekauft. Liegt in deinen Taschen.`);redraw()});

/* Auction house */
let ahSearch='',ahQuality='all';
pageViews.auctions=async preselect=>{
 await akLoad();const ah=await api('/api/auctions');AK.state.balance=ah.balance;
 const term=ahSearch.toLowerCase(),offers=ah.open.filter(o=>!o.own&&(ahQuality==='all'||itemOf(o.itemId).quality===ahQuality)&&(!term||itemOf(o.itemId).name.toLowerCase().includes(term))),mine=ah.open.filter(o=>o.own);
 const sellable=AK.state.inventory.filter(i=>!i.slot&&!i.listed),pick=sellable.find(i=>i.uid===preselect)||sellable[0];
 $('#content').innerHTML=akHead('Auktionshaus','Feste Sofortkaufpreise unter Gildenmitgliedern. Gekauftes landet direkt in deinen Taschen, das Gold beim Verkäufer.')+armoryTabs('auctions')+
  `<div class="ak-ah">`+frame('Angebote',`<div class="toolbar ak-row"><input id="ahSearch" type="search" placeholder="Item suchen" value="${esc(ahSearch)}" aria-label="Item suchen" oninput="ahSearch=this.value;clearTimeout(window.ahT);window.ahT=setTimeout(redraw,300)"><select aria-label="Seltenheit" onchange="ahQuality=this.value;redraw()">${[['all','Alle Seltenheiten'],...RARITIES.map(r=>[r,RARITY_LABEL[r]])].map(([k,l])=>`<option value="${k}" ${k===ahQuality?'selected':''}>${l}</option>`).join('')}</select></div>${offers.length?`<div class="ak-ah-table" role="table">${offers.map(o=>`<div class="ak-ah-row" role="row">${akIcon(o.itemId)}<span role="cell">${akName(o.itemId)}<small class="muted">von ${esc(o.seller)} · ${dateText(o.createdAt)}</small></span><span role="cell" class="ak-ah-price">${goldText(o.price)}<button class="primary" ${ah.balance<o.price?'disabled':''} onclick="if(armed(this,'Kaufen?'))buyAuction('${esc(o.id)}')">Kaufen</button></span></div>`).join('')}</div>`:emptyBox(term||ahQuality!=='all'?'Nichts gefunden.':'Gerade bietet niemand etwas an.')}`)+
  `<div>`+frame('Item anbieten',sellable.length?`<form id="ahForm" class="ak-ah-form"><label>Item<select name="uid" onchange="ahPreview(this.value)">${sellable.map(i=>`<option value="${esc(i.uid)}" ${i===pick?'selected':''}>${esc(itemOf(i.itemId).name)}</option>`).join('')}</select></label><div id="ahPreview"></div><label>Sofortkaufpreis in Gold<input name="price" type="number" min="1" max="1000000" step="1" inputmode="numeric" required value="${itemOf(pick.itemId).value}"></label><button class="primary">Anbieten</button><p class="muted">Kein Gebot, keine Laufzeit, keine Gebühr. Du kannst das Angebot jederzeit zurückziehen.</p></form>`:emptyBox('Keine freien Items in den Taschen. Angelegte Items leg erst ab.'))+
  frame('Meine Angebote',mine.length?mine.map(o=>`<div class="list-row">${akIcon(o.itemId,{size:'sm'})}<span>${akName(o.itemId)}</span><span>${goldText(o.price)} <button class="subtle" onclick="withdrawAuction('${esc(o.id)}')">Zurückziehen</button></span></div>`).join(''):emptyBox('Du bietest nichts an.'))+
  (ah.sold.length?frame('Zuletzt verkauft',ah.sold.map(s=>`<div class="list-row read">${akIcon(s.itemId,{size:'sm'})}<span>${akName(s.itemId)}<small class="muted">an ${esc(s.buyer)} · ${dateText(s.at)}</small></span>${goldText(s.price)}</div>`).join('')):'')+`</div></div>`;
 if(pick){ahPreview(pick.uid);$('#ahForm').onsubmit=act(async e=>{e.preventDefault();const f=formData(e.target);await api('/api/auctions','POST',{uid:f.uid,price:Math.floor(+f.price)});ArmorySound.coins(3);toast('Angebot steht im Auktionshaus.');P.arg=null;redraw()})}
 if(document.activeElement?.id!=='ahSearch'&&ahSearch){const s=$('#ahSearch');s.focus();s.setSelectionRange(s.value.length,s.value.length)}
};
function ahPreview(uid){const it=AK.state.inventory.find(i=>i.uid===uid),box=$('#ahPreview');if(!it||!box)return;const i=itemOf(it.itemId);box.innerHTML=`<div class="list-row">${akIcon(i.id,{uid,size:'sm'})}<span>${akName(i.id)}<small class="muted">Richtwert ${i.value} Gold · Händler zahlt ${i.sell}</small></span></div>`;const price=document.querySelector('#ahForm [name=price]');if(price)price.value=i.value}
const buyAuction=act(async id=>{await api(`/api/auctions/${id}/buy`,'POST',{});ArmorySound.coins(10);toast('Gekauft. Das Item liegt in deinen Taschen.');AK.state=null;redraw()});
const withdrawAuction=act(async id=>{await api(`/api/auctions/${id}`,'DELETE');toast('Angebot zurückgezogen.');redraw()});

/* Duels */
const ACTIONS=[['attack','Angriff','Normaler Schlag','ability_warrior_cleave'],['strong','Starker Angriff','70 % Trefferchance, 1,7-facher Schaden','ability_warrior_decisivestrike'],['defend','Verteidigen','Nächster Treffer halbiert, heilt 5 %','ability_defend']];
const fighterCard=(f,side,turn)=>`<div class="ak-fighter ${side} ${turn?'turn':''} ${f.hp<=0?'down':''}" style="--class:${CLASS_INFO[f.classId]?.[1]||'#ddd'}" data-fighter="${esc(f.id)}"><div class="ak-fighter-face"><img src="icons/${charFaceIcon({race:f.race,gender:f.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'">${f.defending?'<span class="ak-shield-up" title="Verteidigt">🛡</span>':''}</div><h3>${esc(f.name)}</h3><p class="muted">${classIcon(f.classId)} ${esc(f.user)}</p><div class="ak-hp" role="meter" aria-label="Leben" aria-valuemin="0" aria-valuemax="${f.max}" aria-valuenow="${f.hp}"><i style="width:${Math.max(0,f.hp/f.max*100)}%"></i><span>${f.hp} / ${f.max}</span></div><p class="ak-fstats"><span>⚔ ${f.angriff}</span><span>🛡 ${f.verteidigung}</span><span>✶ ${String(f.krit).replace('.',',')} %</span></p></div>`;
const logLine=(e,d)=>{const by=d.fighters[e.by]?.name||'?',other=Object.values(d.fighters).find(f=>f.id!==e.by)?.name||'?';return e.action==='defend'?`<li class="heal"><b>${esc(by)}</b> geht in Deckung${e.heal?` und heilt ${e.heal}`:''}.</li>`:e.miss?`<li class="miss"><b>${esc(by)}</b> holt zum starken Schlag aus und verfehlt.</li>`:`<li class="${e.crit?'crit':''}"><b>${esc(by)}</b> trifft ${esc(other)}${e.action==='strong'?' mit voller Wucht':''}: <b>${e.damage}</b>${e.crit?' kritisch!':''}${e.blocked?' (abgewehrt)':''}</li>`};
pageViews.duels=async()=>{
 await akLoad();const d=await api('/api/duels');stopDuelPolling();
 const incoming=d.duels.filter(x=>x.status==='pending'&&x.opponent.id===x.you),outgoing=d.duels.filter(x=>x.status==='pending'&&x.challenger.id===x.you),active=d.duels.filter(x=>x.status==='active');
 $('#content').innerHTML=akHead('Duelle','Fordere ein Gildenmitglied heraus. Gekämpft wird rundenbasiert mit den Werten eurer angelegten Ausrüstung.')+armoryTabs('duels')+
  `<div class="two-col">`+frame('Herausfordern',(AK.state.character?(d.players.length?`<form id="duelForm" class="ak-row"><select name="opponentId" aria-label="Gegner">${d.players.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.username)}${p.classId?', '+CLASS_INFO[p.classId][0]:''})</option>`).join('')}</select><button class="primary">Duell fordern</button></form>`:emptyBox('Noch hat niemand sonst einen Charakter.')):`<p>Für Duelle brauchst du einen Charakter.</p><button class="primary" onclick="openPage('characters')">Charakter anlegen</button>`)+`<p class="muted">Sieger bekommen ${d.reward} Gold, höchstens ${5} Siege am Tag und nur einmal pro Tag gegen denselben Gegner. Heute noch ${d.rewardsLeft} belohnte Siege.</p>`+
  (active.length||incoming.length||outgoing.length?`<h4>Offen</h4>${active.map(x=>`<div class="list-row"><span>⚔ gegen <b>${esc(x.challenger.id===x.you?x.opponent.user:x.challenger.user)}</b> · Runde ${x.round}${x.yourTurn?' · <b class="up">du bist dran</b>':''}</span><button class="primary" onclick="openPage('duel','${esc(x.id)}')">Zum Kampf</button></div>`).join('')}${incoming.map(x=>`<div class="list-row"><span><b>${esc(x.challenger.user)}</b> fordert dich heraus</span><span><button class="primary" onclick="acceptDuel('${esc(x.id)}')">Annehmen</button> <button class="subtle" onclick="declineDuel('${esc(x.id)}')">Ablehnen</button></span></div>`).join('')}${outgoing.map(x=>`<div class="list-row read"><span>Wartet auf <b>${esc(x.opponent.user)}</b></span><button class="subtle" onclick="declineDuel('${esc(x.id)}')">Zurückziehen</button></div>`).join('')}`:'')+
  (d.recent.length?`<h4>Letzte Duelle</h4>${d.recent.map(x=>{const foe=x.challenger.id===x.you?x.opponent.user:x.challenger.user;return `<div class="list-row read"><span>${x.status==='done'?(x.winner===x.you?'<b class="up">Sieg</b>':'<b class="down">Niederlage</b>'):x.status==='declined'?'Abgelehnt':'Verfallen'} gegen ${esc(foe)}${x.reward&&x.winner===x.you?` · +${x.reward} Gold`:''}</span>${x.status==='done'?`<button class="subtle" onclick="openPage('duel','${esc(x.id)}')">Ansehen</button>`:''}</div>`}).join('')}`:''))+
  frame('PvP-Rangliste',d.ranking.length?`<div class="ak-rank" role="table"><div class="ak-rank-row head" role="row"><span>#</span><span>Spieler</span><span>Siege</span><span>Niederl.</span><span>Quote</span></div>${d.ranking.map((r,i)=>`<div class="ak-rank-row ${r.own?'own':''}" role="row"><span>${i+1}</span><span>${esc(r.username)}</span><span>${r.wins}</span><span>${r.losses}</span><span>${r.rate} %</span></div>`).join('')}</div>`:emptyBox('Noch kein Duell ausgetragen.'))+`</div>`;
 const form=$('#duelForm');if(form)form.onsubmit=act(async e=>{e.preventDefault();await api('/api/duels','POST',formData(e.target));toast('Herausforderung verschickt.');redraw()});
 if(d.duels.length)AK.duelTimer=setTimeout(()=>{if(page==='duels')redraw()},8000)
};
const acceptDuel=act(async id=>{const d=await api(`/api/duels/${id}/accept`,'POST',{});openPage('duel',d.id)});
const declineDuel=act(async id=>{await api(`/api/duels/${id}/decline`,'POST',{});redraw()});
function stopDuelPolling(){clearTimeout(AK.duelTimer);AK.duelTimer=null}
pageViews.duel=async id=>{
 stopDuelPolling();if(!id)return openPage('duels');
 const d=await api('/api/duels/'+encodeURIComponent(id));AK.duel={id,seen:d.log.length};drawDuel(d,true)
};
function drawDuel(d,first){
 const ids=[d.challenger.id,d.opponent.id],[left,right]=d.fighters?ids.map(k=>d.fighters[k]):[null,null];
 if(!left){$('#content').innerHTML=akHead('Duell','Die Herausforderung ist noch offen.')+armoryTabs('duels')+frame('',`<p>${esc(d.challenger.user)} gegen ${esc(d.opponent.user)}: ${d.status==='pending'?'wartet auf Annahme.':'kam nicht zustande.'}</p><button class="primary" onclick="openPage('duels')">Zurück</button>`);return}
 const over=d.status==='done',won=d.winner===d.you,secs=Math.ceil((d.turnLeft||0)/1000);
 $('#content').innerHTML=akHead('Duell',`${esc(left.name)} gegen ${esc(right.name)} · Runde ${d.round}`)+armoryTabs('duels')+
  `<section class="ak-arena wow-frame ${over?'over':''}">${fighterCard(left,'left',d.turnUser===left.id)}<div class="ak-vs"><span>VS</span>${over?`<p class="ak-verdict ${won?'up':'down'}">${won?'Sieg!':'Niederlage'}</p>${won&&d.reward?`<p>+${d.reward} Gold</p>`:''}<button class="primary" onclick="openPage('duels')">Zur Übersicht</button>`:d.yourTurn?`<p class="ak-turn">Du bist am Zug</p><p class="muted" id="duelClock">${secs} s</p>`:`<p class="ak-turn">Gegner ist am Zug</p><p class="muted" id="duelClock">${secs} s</p>`}</div>${fighterCard(right,'right',d.turnUser===right.id)}</section>`+
  (over||!d.yourTurn?'':`<div class="ak-actions">${ACTIONS.map(([k,l,t,icon])=>`<button class="ak-action" onclick="duelAction('${k}')"><img src="icons/${icon}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><b>${l}</b><small>${t}</small></button>`).join('')}</div>`)+
  frame('Kampfverlauf',d.log.length?`<ol class="ak-log" reversed>${[...d.log].reverse().map(e=>logLine(e,d)).join('')}</ol>`:'<p class="muted">Der erste Schlag steht noch aus. Wer nicht innerhalb von 45 Sekunden handelt, greift automatisch an.</p>');
 if(!first){const fresh=d.log.slice(AK.duel.seen);fresh.forEach((e,i)=>setTimeout(()=>animateHit(e,d),i*450))}
 AK.duel.seen=d.log.length;
 if(over){if(!first&&won){ArmorySound.fanfare();ArmorySound.coins(10)}return}
 const clock=$('#duelClock');let left2=d.turnLeft||0;const t0=performance.now();const run=()=>{if(!clock.isConnected)return;const s=Math.max(0,Math.ceil((left2-(performance.now()-t0))/1000));clock.textContent=`${s} s`;if(s>0)requestAnimationFrame(run)};requestAnimationFrame(run);
 AK.duelTimer=setTimeout(pollDuel,d.yourTurn?4000:1500)
}
async function pollDuel(){if(page!=='duel'||!AK.duel)return;try{const d=await api('/api/duels/'+encodeURIComponent(AK.duel.id));drawDuel(d,false)}catch{AK.duelTimer=setTimeout(pollDuel,3000)}}
function animateHit(e,d){
 const attacker=document.querySelector(`[data-fighter="${CSS.escape(e.by)}"]`),target=[...document.querySelectorAll('[data-fighter]')].find(el=>el.dataset.fighter!==e.by);if(!attacker||!target)return;
 if(e.action==='defend'){attacker.classList.add('guard');ArmorySound.heal();float(attacker,e.heal?`+${e.heal}`:'Deckung','heal');setTimeout(()=>attacker.classList.remove('guard'),700);return}
 attacker.classList.add('lunge');ArmorySound.swing();setTimeout(()=>attacker.classList.remove('lunge'),500);
 if(e.miss){ArmorySound.miss();setTimeout(()=>float(target,'Verfehlt','miss'),180);return}
 if(e.blocked)ArmorySound.block();else ArmorySound.hit(e.crit);
 setTimeout(()=>{target.classList.add('struck');float(target,`-${e.damage}${e.crit?'!':''}`,e.crit?'crit':'dmg');setTimeout(()=>target.classList.remove('struck'),450)},150)
}
function float(el,text,kind){const s=document.createElement('span');s.className=`ak-float ${kind}`;s.textContent=text;el.append(s);setTimeout(()=>s.remove(),1400)}
const duelAction=act(async action=>{
 document.querySelectorAll('.ak-action').forEach(b=>b.disabled=true);stopDuelPolling();
 try{const d=await api(`/api/duels/${encodeURIComponent(AK.duel.id)}/action`,'POST',{action});drawDuel(d,false)}
 catch(e){pollDuel();throw e}
});
