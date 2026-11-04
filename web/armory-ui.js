/* Waffenkammer: treasure chests, character window, merchant, auction house and duels. The server decides every draw, price and hit;
   these pages only show it. Sounds are synthesised like the slot machine's, so the site ships no Blizzard audio. */
const AK={catalog:null,state:null,menu:null,duelTimer:null,confirm:null};
const AK_SLOT_NAMES={head:'Kopf',neck:'Hals',shoulders:'Schultern',back:'Rücken',chest:'Brust',wrists:'Handgelenke',hands:'Hände',waist:'Taille',legs:'Beine',feet:'Füße',ring1:'Finger',ring2:'Finger',trinket1:'Schmuck',trinket2:'Schmuck',mainhand:'Waffenhand',offhand:'Schildhand',ranged:'Distanz'};
const ITEM_SLOT={head:'Kopf',neck:'Hals',shoulders:'Schultern',back:'Rücken',chest:'Brust',wrists:'Handgelenke',hands:'Hände',waist:'Taille',legs:'Beine',feet:'Füße',ring:'Finger',trinket:'Schmuck',mainhand:'Waffenhand',onehand:'Einhändig',twohand:'Zweihändig',offhand:'Schildhand',ranged:'Distanz'};
const SLOT_ICONS={head:'inv_helmet_03',neck:'inv_jewelry_necklace_09',shoulders:'inv_shoulder_02',back:'inv_misc_cape_08',chest:'inv_chest_chain_07',wrists:'inv_bracer_02',hands:'inv_gauntlets_05',waist:'inv_belt_03',legs:'inv_pants_03',feet:'inv_boots_05',ring1:'inv_jewelry_ring_09',ring2:'inv_jewelry_ring_09',trinket1:'inv_jewelry_talisman_06',trinket2:'inv_jewelry_talisman_06',mainhand:'inv_sword_04',offhand:'inv_shield_04',ranged:'inv_weapon_bow_08'};
const RARITY_LABEL={uncommon:'Grün',rare:'Blau',epic:'Episch',legendary:'Legendär'},RARITIES=['uncommon','rare','epic','legendary'];
const STAT_NAMES=[['leben','Leben'],['angriff','Angriff'],['verteidigung','Verteidigung'],['krit','Kritische Trefferchance']];
const CHEST_TINT={stormwind:['#2f5fb0','#c9a24a'],ironforge:['#8a5a2b','#c0c6cf'],stratholme:['#4b3a5e','#9fb46b'],moltencore:['#8e2a12','#ffb347'],azeroth:['#6a2b9a','#ff9a2e']};
const LEFT_SLOTS=['head','shoulders','back','chest','wrists'],RIGHT_SLOTS=['hands','waist','legs','feet'],BOTTOM_SLOTS=['mainhand','offhand','ranged'];
const VIEW_SLOTS={head:1,shoulders:3,chest:5,waist:6,legs:7,feet:8,wrists:9,hands:10,back:16,mainhand:21,offhand:22,ranged:26},MODEL_RACE={Mensch:1,Zwerg:5,Nachtelf:7,Gnom:13};

const goldText=n=>`<span class="ak-gold">${Number(n).toLocaleString('de-DE')}<i aria-hidden="true"></i><span class="visually-hidden"> Gold</span></span>`;
const itemOf=id=>AK.catalog.items[id];
const armoryTabs=active=>`<nav class="tavern-tabs ak-tabs" aria-label="Waffenkammer">${[['armory','Charakter'],['shop','Händler'],['auctions','Auktionshaus'],['duels','Duelle'],['dungeons','Instanzen']].map(([id,label])=>`<button class="${id===active?'selected':''}" onclick="openPage('${id}')">${label}</button>`).join('')}</nav>`;
const akHead=(title,text)=>head(title,text,`<span class="pill ak-purse" id="akPurse">${goldText(AK.state?.balance??0)}</span>`);
const akIcon=(id,{uid='',size='',extra=''}={})=>{const i=itemOf(id);return `<button type="button" class="ak-icon ${size} q-${i.quality}" data-item="${i.id}" ${uid?`data-uid="${esc(uid)}"`:''} aria-label="${esc(i.name)}" ${extra}><img src="icons/${esc(i.icon)}.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"></button>`};
const akName=id=>{const i=itemOf(id);return `<span class="quality-${i.quality}">${esc(i.name)}</span>`};
const statLine=g=>STAT_NAMES.filter(([k])=>g[k]).map(([k,n])=>`+${String(g[k]).replace('.',',')}${k==='krit'?' %':''} ${n}`).join(' · ');
// The game plays with the character chosen at login; the server is told when the browser has another one active.
async function akLoad(){
 AK.catalog||=await api('/api/armory/catalog');let s=await api('/api/armory');
 if(typeof P!=='undefined'&&P.activeChar?.id&&s.character&&s.character.id!==P.activeChar.id)s=await api('/api/armory/active','POST',{characterId:P.activeChar.id}).catch(()=>s);
 if(page!=='armory')stopArmoryModel();akSet(s);return s
}
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
 document.addEventListener('pointerover',e=>{const el=e.target.closest?.('[data-item]');if(!el||e.pointerType!=='mouse'||!AK.catalog||AK.menu)return;tip.innerHTML=tooltipHtml(+el.dataset.item,el.dataset.uid);tip.classList.add('show');place(e)});
 document.addEventListener('pointermove',e=>{if(!tip.classList.contains('show'))return;if(AK.menu)tip.classList.remove('show');else place(e)});
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
 $('#content').innerHTML=akHead('Schatztruhen','Gib dein Spielunken-Gold für Truhen aus ganz Azeroth aus. Jede Truhe enthält echte Classic-Ausrüstung, die Chancen stehen offen dran.')+tavernTabs('chests')+
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
  result.innerHTML=`${won.quality==='legendary'||won.quality==='epic'?`<div class="ak-rays" aria-hidden="true"></div><div class="win-coins" aria-hidden="true">${Array.from({length:won.quality==='legendary'?36:18},(_,i)=>`<i style="left:${Math.random()*100}%;animation-delay:${(i*.07).toFixed(2)}s;animation-duration:${(1.4+Math.random()*1.2).toFixed(2)}s"></i>`).join('')}</div>`:''}<p class="win-rarity">${RARITY_LABEL[won.quality]}!</p>${akIcon(won.id,{uid:r.won.uid,size:'xl'})}<h3 class="quality-${won.quality}">${esc(won.name)}</h3><p class="muted">${won.slot?`${ITEM_SLOT[won.slot]} ${esc(won.type||'')} · ${statLine(won.game)}`:'Trophäe, nicht anlegbar'} · Wert ${goldText(won.sell)}</p>${r.xpGained?`<p class="ak-xp-gain">+${r.xpGained} Erfahrung${r.levelUp?` · <b>Stufe ${r.levelUp} erreicht!</b>`:''}</p>`:''}<div class="ak-row center">${canEquip?`<button class="primary" onclick="equipItem('${esc(r.won.uid)}',true)">Anlegen</button>`:''}<button class="${canEquip?'subtle':'primary'}" onclick="this.closest('dialog').close();openChest('${chest.id}')" ${r.balance<chest.price?'disabled':''}>Nochmal (${chest.price} Gold)</button><button class="subtle" onclick="this.closest('dialog').close()">Ins Inventar</button></div>`;
  if(r.levelUp)setTimeout(()=>ArmorySound.fanfare(),600);
  akSet(r);if(page==='chests')document.querySelectorAll('.ak-chest').forEach(el=>{const c=AK.catalog.chests.find(x=>x.id===el.dataset.chest);el.querySelector('.primary').disabled=r.balance<c.price})
 }finally{AK.opening=false}
});

/* Character window and bags */
const equipped=slot=>AK.state.inventory.find(i=>i.slot===slot);
function slotBox(slot){
 const it=equipped(slot);
 return `<div class="ak-slot" data-slot="${slot}">${it?akIcon(it.itemId,{uid:it.uid,extra:`onclick="itemMenu(event,'${esc(it.uid)}')"`}):`<span class="ak-slot-empty" title="${AK_SLOT_NAMES[slot]}"><img src="icons/${SLOT_ICONS[slot]}.jpg" alt=""></span>`}<small>${AK_SLOT_NAMES[slot]}</small></div>`
}
// A character without saved looks would render black: fall back to the first choice of every option.
function applyLook(actor,look){let options=Object.entries(look||{}).map(([o,v])=>({optionId:+o,choiceId:+v}));if(!options.length)try{options=(actor.getCustomizationOptions(true)||[]).filter(o=>o.Choices?.length).map(o=>({optionId:o.Id,choiceId:o.Choices[0].Id}))}catch{}try{actor.setAppearance({options,sheathMain:-1,sheathOff:-1})}catch{}}
function stopArmoryModel(){AK.modelToken=(AK.modelToken||0)+1;try{AK.viewer?.destroy()}catch{}AK.viewer=null}
// The character as a 3D model wearing its gear. Uses the viewer of the gear planner (tank-ui.js); items without display data stay off the model.
async function startArmoryModel(s){
 stopArmoryModel();const token=AK.modelToken,host=$('#akModel'),status=$('#akModelStatus'),c=s.character;if(!host||!c)return;
 const say=t=>{if(token===AK.modelToken&&status)status.textContent=t},race=MODEL_RACE[c.race];
 if(!race)return say('Für dieses Volk gibt es kein Classic-Modell, die Ausrüstung siehst du in den Plätzen.');
 const probe=document.createElement('canvas').getContext('webgl2');if(!probe)return say('Das 3D-Modell braucht WebGL2 in deinem Browser.');probe.getExtension('WEBGL_lose_context')?.loseContext();
 try{
  await loadViewerLibraries();if(token!==AK.modelToken||!host.isConnected)return;
  const items=s.gear.filter(g=>VIEW_SLOTS[g.slot]).map(g=>[VIEW_SLOTS[g.slot],g.display]);
  host.replaceChildren();
  AK.viewer=new window.ZamModelViewer({type:2,contentPath:new URL('/model/',location.href).href,container:window.jQuery('#akModel'),aspect:Math.max(.4,host.clientWidth/Math.max(1,host.clientHeight)),hd:false,dataEnv:'classic',env:'classic',gameDataEnv:'classic',models:{id:race+(c.gender?1:0),type:16},items,physics:false});
  let tries=0;const check=()=>{if(token!==AK.modelToken)return;const actor=AK.viewer?.renderer?.actors?.[0];if(actor?.isLoaded?.()){applyLook(actor,c.appearance);try{AK.viewer.method('setAnimation',['Stand'])}catch{}say(items.length?'Ziehen zum Drehen':'Noch keine sichtbare Ausrüstung angelegt');return}if(++tries>120)return say('Der Modellanbieter liefert gerade keine Grafikdaten.');setTimeout(check,500)};check()
 }catch(e){say('Das 3D-Modell konnte nicht geladen werden.');console.warn('Waffenkammer 3D:',e.message)}
}
function levelPanel(s){const p=s.progress;return `<div class="ak-level"><div class="ak-level-head"><b>Stufe ${p.level}</b><small class="muted">${p.next?`${p.xp} / ${p.next} Erfahrung`:'Höchststufe erreicht'}</small></div><div class="ak-xp" role="meter" aria-label="Erfahrung" aria-valuemin="0" aria-valuemax="${p.next||1}" aria-valuenow="${p.next?p.xp:1}"><i style="width:${p.next?p.xp/p.next*100:100}%"></i></div></div>`}
function abilityPanel(s){return s.abilities.length?`<div class="ak-abilities">${s.abilities.map(a=>`<div class="ak-ability ${a.unlocked?'':'locked'}" title="${esc(a.text)}"><img src="icons/${esc(a.icon)}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><span><b>${esc(a.name)}</b><small>${a.unlocked?esc(a.text):`ab Stufe ${a.unlockLevel}`}</small></span></div>`).join('')}</div>`:''}
function portrait(c){
 if(!c)return `<div class="ak-portrait empty"><p>Noch kein Charakter</p><button class="primary" onclick="openPage('characters')">Charakter anlegen</button></div>`;
 return `<div class="ak-portrait" style="--class:${CLASS_INFO[c.classId]?.[1]||'#fff'}"><img class="ak-face" src="icons/${charFaceIcon({race:c.race,gender:c.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><h3>${esc(c.name)}</h3><p>${classIcon(c.classId)} ${esc(c.race)} · ${esc(c.className)}</p></div>`
}
function statPanel(s){
 return `<dl class="ak-stats">${STAT_NAMES.map(([k,n])=>{const extra=Math.round((s.stats[k]-s.base[k])*10)/10;return `<div><dt>${n}</dt><dd>${String(s.stats[k]).replace('.',',')}${k==='krit'?' %':''}${extra?`<small class="up">+${String(extra).replace('.',',')}</small>`:''}</dd></div>`}).join('')}</dl>`
}
pageViews.armory=async()=>{
 const s=await akLoad(),bag=s.inventory.filter(i=>!i.slot),gear=s.inventory.filter(i=>i.slot),c=s.character;
 $('#content').innerHTML=akHead('Charakter','Leg deine Beute an. Bessere Ausrüstung bringt mehr Leben, Angriff, Verteidigung und kritische Treffer im Duell.')+armoryTabs('armory')+
  `<div class="ak-armory"><section class="ak-charwin wow-frame" aria-label="Ausrüstung"><div class="ak-col">${LEFT_SLOTS.map(slotBox).join('')}</div><div class="ak-center">${c?`<div class="ak-model-wrap" style="--class:${CLASS_INFO[c.classId]?.[1]||'#fff'}"><div id="akModel" class="ak-model"></div><p id="akModelStatus" class="ak-model-status">3D-Modell wird geladen …</p></div><h3 class="ak-char-name" style="color:${CLASS_INFO[c.classId]?.[1]||'#fff'}">${esc(c.name)}</h3><p class="muted">${classIcon(c.classId)} ${esc(c.race)} · ${esc(c.className)} · <button class="link" onclick="openCharScreen()">Charakter wechseln</button></p>${levelPanel(s)}`:portrait(null)}${statPanel(s)}</div><div class="ak-col">${RIGHT_SLOTS.map(slotBox).join('')}</div><div class="ak-bottom">${BOTTOM_SLOTS.map(slotBox).join('')}</div></section>`+
  `<section class="ak-bags wow-frame" aria-label="Taschen"><h3 class="wow-title">Taschen <small class="muted">${bag.length} Items · ${gear.length} angelegt</small></h3>${bag.length?`<div class="ak-bag-grid">${bag.map(i=>`<div class="ak-bag-cell ${i.usable?'':'unusable'} ${i.listed||i.wornBy?'listed':''}">${akIcon(i.itemId,{uid:i.uid,extra:`onclick="itemMenu(event,'${esc(i.uid)}')"`})}${i.listed?'<span class="ak-badge">AH</span>':i.wornBy?`<span class="ak-badge" title="Trägt ${esc(i.wornBy)}">${esc(i.wornBy.slice(0,6))}</span>`:''}</div>`).join('')}</div>`:emptyBox('Deine Taschen sind leer. Öffne eine <button class="link" onclick="openPage(\'chests\')">Schatztruhe</button> oder geh zum <button class="link" onclick="openPage(\'shop\')">Händler</button>.')}<p class="muted">Klick auf ein Item für Anlegen, Verkaufen oder Auktionshaus. Rot getönt: deine Klasse kann es nicht tragen. Mit Namen markiert: trägt gerade ein anderer Charakter von dir.</p></section></div>`+(c?frame(`Fähigkeiten der Klasse ${esc(c.className)}`,`${abilityPanel(s)}<p class="muted">Fähigkeiten setzt du im Duell ein. Erfahrung gibt es vor allem in Duellen (Sieg 40, Niederlage 15, bis zu 10 Duelle am Tag) und ein wenig für Truhen. Jede Stufe bringt +25 Leben, +2 Angriff und +1 Verteidigung, Höchststufe ist 20.</p>`):'');
 startArmoryModel(s)
};
function closeItemMenu(){AK.menu?.remove();AK.menu=null}
document.addEventListener('pointerdown',e=>{if(AK.menu&&!e.target.closest('.ak-menu')&&!e.target.closest('[data-uid]'))closeItemMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeItemMenu()});
function itemMenu(e,uid){
 e.stopPropagation();closeItemMenu();document.getElementById('akTip')?.classList.remove('show');
 const it=AK.state.inventory.find(i=>i.uid===uid);if(!it)return;const item=itemOf(it.itemId),menu=document.createElement('div');menu.className='ak-menu wow-frame';menu.setAttribute('role','menu');
 const ringSlots=item.slot==='onehand'&&[1,3,4].includes(AK.state.character?.classId)?['mainhand','offhand']:null;
 menu.innerHTML=`<p class="quality-${item.quality}"><b>${esc(item.name)}</b></p>${it.wornBy?`<small class="muted">Trägt gerade ${esc(it.wornBy)}.</small>${item.slot&&it.usable?`<button role="menuitem" onclick="equipItem('${esc(uid)}')">Hierher übernehmen und anlegen</button>`:''}`:it.slot?`<button role="menuitem" onclick="unequipItem('${esc(uid)}')">Ablegen</button>`:it.listed?`<button role="menuitem" onclick="openPage('auctions')">Steht im Auktionshaus</button>`:`${item.slot&&it.usable?(ringSlots?ringSlots.map(s=>`<button role="menuitem" onclick="equipItem('${esc(uid)}',false,'${s}')">Anlegen: ${s==='offhand'?'Schildhand':AK_SLOT_NAMES[s]} ${s.endsWith('2')?'2':s.endsWith('1')?'1':''}</button>`).join(''):`<button role="menuitem" onclick="equipItem('${esc(uid)}')">Anlegen</button>`):`<small class="muted">${item.slot?'Deine Klasse kann das nicht tragen.':'Trophäe, nicht anlegbar.'}</small>`}<button role="menuitem" onclick="if(armed(this,'Wirklich für ${item.sell} Gold verkaufen?'))sellItem('${esc(uid)}')">An Händler verkaufen: ${item.sell} Gold</button><button role="menuitem" onclick="closeItemMenu();openPage('auctions','${esc(uid)}')">Im Auktionshaus anbieten</button>`}`;
 document.body.append(menu);AK.menu=menu;
 const r=e.currentTarget.getBoundingClientRect(),w=menu.offsetWidth,h=menu.offsetHeight;
 menu.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+scrollX))+'px';menu.style.top=(r.bottom+h+8>innerHeight?r.top+scrollY-h-6:r.bottom+scrollY+6)+'px';
 menu.querySelector('button')?.focus()
}
// After equipping the character window redraws in place (no loading flash, same scroll position) and the changed slot lights up.
async function showGearChange(slot){if(page!=='armory')return;await openView(pageViews.armory,{quiet:true});const box=slot&&document.querySelector(`.ak-slot[data-slot="${slot}"]`);if(box){box.classList.remove('ak-changed');void box.offsetWidth;box.classList.add('ak-changed')}}
const equipItem=act(async(uid,fromDialog,slot)=>{closeItemMenu();const s=await api('/api/armory/equip','POST',slot?{uid,slot}:{uid});ArmorySound.equip();akSet(s);const it=s.inventory.find(i=>i.uid===uid);if(fromDialog)document.querySelector('dialog.ak-dialog')?.close();toast(`${itemOf(it.itemId).name} angelegt${it.slot?': '+AK_SLOT_NAMES[it.slot]:''}.`);await showGearChange(it.slot)});
const unequipItem=act(async uid=>{closeItemMenu();const was=AK.state?.inventory.find(i=>i.uid===uid);const s=await api('/api/armory/unequip','POST',{uid});ArmorySound.equip();akSet(s);if(was)toast(`${itemOf(was.itemId).name} abgelegt, liegt jetzt in den Taschen.`);await showGearChange(was?.slot)});
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
  frame('Tränke für den Beutel',`<p class="muted">Im Duell trinkst du sie über den Beutel, höchstens drei pro Duell.</p>${AK.catalog.potions.map(p=>`<div class="list-row ak-potion-row"><img src="icons/${esc(p.icon)}.jpg" alt=""><span><b>${esc(p.name)}</b><small class="muted">${esc(p.text)} · im Beutel: ${AK.state.potions?.[p.key]||0}</small></span><span>${goldText(p.price)} <button class="subtle" ${AK.state.balance<p.price?'disabled':''} onclick="buyPotion('${p.key}',1)">1 kaufen</button><button class="subtle" ${AK.state.balance<p.price*5?'disabled':''} onclick="buyPotion('${p.key}',5)">5 kaufen</button></span></div>`).join('')}`)+
  frame('Ankauf',sellable.length?`<p class="muted">Der Händler zahlt ein Viertel des Werts. Mehr holst du oft im <button class="link" onclick="openPage('auctions')">Auktionshaus</button>.</p><div class="ak-sell-list">${sellable.map(i=>`<div class="list-row">${akIcon(i.itemId,{uid:i.uid,size:'sm'})}<span>${akName(i.itemId)}</span><span>${goldText(itemOf(i.itemId).sell)} <button class="subtle" onclick="if(armed(this,'Sicher?'))sellItem('${esc(i.uid)}')">Verkaufen</button></span></div>`).join('')}</div>`:emptyBox('Nichts zu verkaufen. Angelegte Items leg erst im Charakterfenster ab.'))
};
const buyPotion=act(async(potion,count)=>{const s=await api('/api/armory/potion','POST',{potion,count});ArmorySound.coins(4);akSet(s);toast('Trank im Beutel.');redraw()});
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
const fighterCard=(f,side,turn)=>`<div class="ak-fighter ${side} ${turn?'turn':''} ${f.hp<=0?'down':''}" style="--class:${CLASS_INFO[f.classId]?.[1]||'#ddd'}" data-fighter="${esc(f.id)}"><div class="ak-fighter-face"><img src="icons/${charFaceIcon({race:f.race,gender:f.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><span class="ak-lvl" title="Stufe">${f.level||1}</span>${f.defending?'<span class="ak-shield-up" title="Verteidigt">🛡</span>':''}</div><h3>${esc(f.name)}</h3><p class="muted">${classIcon(f.classId)} ${esc(f.user)}</p>${f.shield>0?`<p class="ak-status shield">Schild ${f.shield}</p>`:''}${f.buff>0?`<p class="ak-status buff">Gestärkt ×${f.buff}</p>`:''}${f.stunned?'<p class="ak-status stun">Betäubt</p>':''}<div class="ak-hp" role="meter" aria-label="Leben" aria-valuemin="0" aria-valuemax="${f.max}" aria-valuenow="${f.hp}"><i style="width:${Math.max(0,f.hp/f.max*100)}%"></i><span>${f.hp} / ${f.max}</span></div><p class="ak-fstats"><span>⚔ ${f.angriff}</span><span>🛡 ${f.verteidigung}</span><span>✶ ${String(f.krit).replace('.',',')} %</span></p></div>`;
const logLine=(e,d)=>{const by=d.fighters[e.by]?.name||'?',other=Object.values(d.fighters).find(f=>f.id!==e.by)?.name||'?',spell=e.ability?`<img class="ak-log-icon" src="icons/${esc(e.icon)}.jpg" alt=""> ${esc(e.ability)}`:'';
 if(e.action==='stunned')return `<li class="miss"><b>${esc(by)}</b> ist außer Gefecht und setzt aus.</li>`;
 if(e.kind==='heal')return `<li class="heal"><b>${esc(by)}</b> wirkt ${spell} und heilt ${e.heal}.</li>`;
 if(e.kind==='shield')return `<li class="heal"><b>${esc(by)}</b> wirkt ${spell}: Schild hält ${e.shield}.</li>`;
 if(e.kind==='buff')return `<li class="crit"><b>${esc(by)}</b> wirkt ${spell}: die nächsten zwei Angriffe treffen härter.</li>`;
 if(e.ability)return `<li class="${e.crit?'crit':''}"><b>${esc(by)}</b> trifft ${esc(other)} mit ${spell}: <b>${e.damage}</b>${e.crit?' kritisch!':''}${e.absorbed?` (${e.absorbed} vom Schild)`:''}${e.stun?' · betäubt!':''}${e.heal?` · heilt ${e.heal}`:''}</li>`;
 return e.action==='defend'?`<li class="heal"><b>${esc(by)}</b> geht in Deckung${e.heal?` und heilt ${e.heal}`:''}.</li>`:e.miss?`<li class="miss"><b>${esc(by)}</b> holt zum starken Schlag aus und verfehlt.</li>`:`<li class="${e.crit?'crit':''}"><b>${esc(by)}</b> trifft ${esc(other)}${e.action==='strong'?' mit voller Wucht':''}: <b>${e.damage}</b>${e.crit?' kritisch!':''}${e.blocked?' (abgewehrt)':''}${e.absorbed?` (${e.absorbed} vom Schild)`:''}${e.empowered?' · gestärkt':''}</li>`};
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
// Battle screen in the style of old monster games: the foe stands top right, your character bottom left, both as 3D models with their gear.
// The menu offers Kampf (four class abilities with uses), Beutel (potions), Verteidigen and Aufgeben; a text box tells what happens.
pageViews.duel=async id=>{
 stopDuelPolling();stopBattleModels();if(!id)return openPage('duels');
 AK.catalog||=await api('/api/armory/catalog');
 const d=await api('/api/duels/'+encodeURIComponent(id));AK.duel={id,seen:d.log.length,menu:'main',busy:false};drawDuel(d,true)
};
function stopBattleModels(){AK.battleToken=(AK.battleToken||0)+1;for(const v of AK.battleViewers||[])try{v.destroy()}catch{}AK.battleViewers=[]}
async function battleModel(hostId,f){
 const host=document.getElementById(hostId),token=AK.battleToken,race=MODEL_RACE[f.race];if(!host)return;
 const fallback=()=>{host.innerHTML=`<img class="ak-actor-face" src="icons/${charFaceIcon({race:f.race,gender:f.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'">`};
 const probe=race&&document.createElement('canvas').getContext('webgl2');if(!probe)return fallback();probe.getExtension('WEBGL_lose_context')?.loseContext();
 try{
  await loadViewerLibraries();if(token!==AK.battleToken||!host.isConnected)return;
  const items=(f.model?.gear||[]).filter(g=>VIEW_SLOTS[g.slot]).map(g=>[VIEW_SLOTS[g.slot],g.display]);
  const viewer=new window.ZamModelViewer({type:2,contentPath:new URL('/model/',location.href).href,container:window.jQuery('#'+hostId),aspect:Math.max(.4,host.clientWidth/Math.max(1,host.clientHeight)),hd:false,dataEnv:'classic',env:'classic',gameDataEnv:'classic',models:{id:race+(f.gender?1:0),type:16},items,physics:false});
  AK.battleViewers.push(viewer);
  let tries=0;const check=()=>{if(token!==AK.battleToken)return;const actor=viewer?.renderer?.actors?.[0];if(actor?.isLoaded?.()){applyLook(actor,f.model?.appearance);try{viewer.method('setAnimation',['Stand'])}catch{}return}if(++tries>80)return;setTimeout(check,500)};check()
 }catch{fallback()}
}
const hpClass=f=>f.hp/f.max>.5?'':f.hp/f.max>.2?'mid':'low';
function battlePlate(f,side){
 return `<div class="ak-plate ${side}" data-plate="${esc(f.id)}"><div class="ak-plate-head"><b style="color:${CLASS_INFO[f.classId]?.[1]||'#fff'}">${esc(f.name)}</b><span>Stufe ${f.level||1}</span></div><div class="ak-plate-hp"><small>LP</small><div class="ak-hp ${hpClass(f)}"><i style="width:${Math.max(0,f.hp/f.max*100)}%"></i></div></div>${side==='me'?`<p class="ak-plate-num">${f.hp} / ${f.max}</p>`:''}<p class="ak-plate-state">${f.shield>0?`<span class="ak-status shield">Schild ${f.shield}</span>`:''}${f.buff>0?`<span class="ak-status buff">Gestärkt ×${f.buff}</span>`:''}${f.stunned?'<span class="ak-status stun">Betäubt</span>':''}${f.defending?'<span class="ak-status shield">Deckung</span>':''}</p></div>`
}
function battleText(e,d){
 const by=d.fighters[e.by]?.name||'?',other=Object.values(d.fighters).find(f=>f.id!==e.by)?.name||'?';
 if(e.action==='stunned')return `${by} ist außer Gefecht und setzt aus!`;
 if(e.action==='forfeit')return e.text||`${by} gibt auf!`;
 if(e.action==='potion')return `${by} trinkt ${e.potion}. ${e.heal?`+${e.heal} Leben.`:e.restored?'Alle Fähigkeiten sind wieder aufgeladen!':e.shield?`Ein Schild von ${e.shield} umgibt ${by}.`:''}`;
 if(e.action==='defend')return `${by} geht in Deckung${e.heal?` und heilt ${e.heal}`:''}.`;
 if(e.kind==='heal')return `${by} wirkt ${e.ability}! +${e.heal} Leben.`;
 if(e.kind==='shield')return `${by} wirkt ${e.ability}! Ein Schild hält ${e.shield} Schaden ab.`;
 if(e.kind==='buff')return `${by} wirkt ${e.ability}! Die nächsten zwei Angriffe treffen härter.`;
 if(e.miss)return `${by} verfehlt ${other}!`;
 return `${by} setzt ${e.ability||'einen Angriff'} ein! ${e.crit?'Volltreffer! ':''}${other} verliert ${e.damage} Leben.${e.absorbed?` ${e.absorbed} fängt der Schild ab.`:''}${e.stun?` ${other} ist betäubt!`:''}${e.heal?` ${by} heilt ${e.heal}.`:''}`
}
function battleMenu(d){
 // Shared by duels and dungeon runs: AK.duel holds the running battle with its action and forfeit handlers.
 const me=d.fighters[d.you],over=['done','won','wiped','abandoned'].includes(d.status),actFn=AK.duel.act||'duelAction',quitFn=AK.duel.forfeit||'forfeitDuel';
 if(over)return `<div class="ak-menu-grid one"><button class="ak-cmd" onclick="openPage('${AK.duel.back||'duels'}')">Zur Übersicht</button></div>`;
 if(!d.yourTurn)return `<p class="ak-wait">Warte auf ${esc(d.fighters[d.turnUser]?.name||Object.values(d.fighters).find(f=>f.id!==d.you)?.name||'?')} … <span id="duelClock"></span></p>`;
 const menu=AK.duel.menu;
 if(menu==='fight')return `<div class="ak-menu-grid moves">${me.abilities.map(a=>{const out=a.unlocked&&a.ppLeft!==null&&a.ppLeft<=0;return `<button class="ak-move ${a.unlocked?'':'locked'}" ${!a.unlocked||out?'disabled':''} onclick="${actFn}('${esc(a.key)}')" title="${esc(a.text)}"><img src="icons/${esc(a.icon)}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><b>${esc(a.name)}</b><small>${a.unlocked?(a.pp===null?'AP ∞':`AP ${a.ppLeft}/${a.pp}`):`ab Stufe ${a.unlockLevel}`}</small></button>`}).join('')}</div><button class="ak-back" onclick="battleSwitch('main')">Zurück</button>`;
 if(menu==='bag'){
  const left=d.potionsPerDuel-(me.potionsUsed||0);
  return `<div class="ak-menu-grid bag">${(AK.catalog?.potions||[]).map(p=>{const n=d.potions?.[p.key]||0;return `<button class="ak-move" ${!n||left<=0?'disabled':''} onclick="${actFn}('potion:${p.key}')"><img src="icons/${esc(p.icon)}.jpg" alt=""><b>${esc(p.name)}</b><small>${n}× · ${esc(p.text)}</small></button>`}).join('')}</div><p class="ak-bag-note">Noch ${left} von ${d.potionsPerDuel} Tränken in diesem Duell. Nachschub beim <button class="link" onclick="openPage('shop')">Händler</button>.</p><button class="ak-back" onclick="battleSwitch('main')">Zurück</button>`
 }
 return `<div class="ak-menu-grid"><button class="ak-cmd fight" onclick="battleSwitch('fight')">Kampf</button><button class="ak-cmd bag" onclick="battleSwitch('bag')">Beutel</button><button class="ak-cmd guard" onclick="${actFn}('defend')">Verteidigen</button><button class="ak-cmd flee" onclick="if(armed(this,'Wirklich aufgeben?'))${quitFn}()">Aufgeben</button></div>`
}
function battleSwitch(menu){AK.duel.menu=menu;const box=$('#akMenu');if(box&&AK.duel.last)box.innerHTML=battleMenu(AK.duel.last)}
function drawDuel(d,first){
 const ids=[d.challenger.id,d.opponent.id];
 if(!d.fighters){$('#content').innerHTML=akHead('Duell','Die Herausforderung ist noch offen.')+armoryTabs('duels')+frame('',`<p>${esc(d.challenger.user)} gegen ${esc(d.opponent.user)}: ${d.status==='pending'?'wartet auf Annahme.':'kam nicht zustande.'}</p><button class="primary" onclick="openPage('duels')">Zurück</button>`);return}
 const meId=ids.includes(d.you)?d.you:ids[0],foeId=ids.find(x=>x!==meId),me=d.fighters[meId],foe=d.fighters[foeId],over=d.status==='done';
 AK.duel.last=d;
 if(first||!$('#akBattle')){
  stopBattleModels();
  $('#content').innerHTML=akHead('Duell',`${esc(me.name)} gegen ${esc(foe.name)}`)+armoryTabs('duels')+
   `<section class="ak-battle" id="akBattle"><div class="ak-field"><div id="akFoePlate"></div><div class="ak-actor foe" data-fighter="${esc(foeId)}"><div class="ak-pad"></div><div class="ak-actor-model" id="akFoeModel"></div></div><div class="ak-actor me" data-fighter="${esc(meId)}"><div class="ak-pad"></div><div class="ak-actor-model" id="akMeModel"></div></div><div id="akMePlate"></div></div><div class="ak-console"><p class="ak-text" id="akBattleText" aria-live="polite"></p><div class="ak-menu-box" id="akMenu"></div></div></section>`+
   frame('Kampfverlauf','<ol class="ak-log" id="akLog" reversed></ol>');
  battleModel('akFoeModel',foe);battleModel('akMeModel',me)
 }
 const fresh=first?[]:d.log.slice(AK.duel.seen);AK.duel.seen=d.log.length;
 const finish=()=>{
  $('#akFoePlate').innerHTML=battlePlate(foe,'foe');$('#akMePlate').innerHTML=battlePlate(me,'me');
  const last=d.log.at(-1);
  $('#akBattleText').textContent=over?(d.winner===d.you?`Sieg! ${foe.name} ist besiegt.${d.reward?` +${d.reward} Gold.`:''}`:`${me.name} wurde besiegt.`):last?battleText(last,d):`${foe.name} stellt sich zum Duell! Was soll ${me.name} tun?`;
  if(!over&&d.yourTurn&&last&&!fresh.length)$('#akBattleText').textContent=`Was soll ${me.name} tun?`;
  $('#akMenu').innerHTML=battleMenu(d);
  $('#akLog').innerHTML=[...d.log].reverse().map(e=>`<li>${esc(battleText(e,d))}</li>`).join('');
  document.querySelector('.ak-actor.foe')?.classList.toggle('down',foe.hp<=0);document.querySelector('.ak-actor.me')?.classList.toggle('down',me.hp<=0);
  AK.duel.busy=false;
  if(over){if(fresh.length&&d.winner===d.you){ArmorySound.fanfare();ArmorySound.coins(10)}return}
  const clock=$('#duelClock');if(clock){const until=performance.now()+(d.turnLeft||0);const run=()=>{if(!clock.isConnected)return;const s=Math.max(0,Math.ceil((until-performance.now())/1000));clock.textContent=`(${s} s)`;if(s>0)requestAnimationFrame(run)};run()}
  AK.duelTimer=setTimeout(pollDuel,d.yourTurn?4000:1500)
 };
 if(!fresh.length)return finish();
 AK.duel.busy=true;$('#akMenu').innerHTML='';
 fresh.forEach((e,i)=>setTimeout(()=>{$('#akBattleText').textContent=battleText(e,d);animateHit(e,d)},i*1300));
 setTimeout(finish,fresh.length*1300)
}
async function pollDuel(){if(page!=='duel'||!AK.duel||AK.duel.busy)return;try{const d=await api('/api/duels/'+encodeURIComponent(AK.duel.id));if(d.log.length!==AK.duel.seen||d.status!==AK.duel.last?.status||d.yourTurn!==AK.duel.last?.yourTurn)drawDuel(d,false);else AK.duelTimer=setTimeout(pollDuel,d.yourTurn?4000:1500)}catch{AK.duelTimer=setTimeout(pollDuel,3000)}}
function animateHit(e,d){
 const attacker=document.querySelector(`.ak-actor[data-fighter="${CSS.escape(e.by)}"]`),target=[...document.querySelectorAll('.ak-actor[data-fighter]')].find(el=>el.dataset.fighter!==e.by);if(!attacker||!target)return;
 if(e.action==='stunned'){float(attacker,'Betäubt','miss');return}
 if(e.action==='forfeit')return;
 if(e.action==='potion'||e.kind==='heal'||e.kind==='shield'||e.kind==='buff'||e.action==='defend'){attacker.classList.add('glow');ArmorySound.heal();float(attacker,e.heal?`+${e.heal}`:e.kind==='buff'?'Gestärkt':e.restored?'Aufgeladen':e.shield?'Schild':'Deckung','heal');setTimeout(()=>attacker.classList.remove('glow'),900);return}
 attacker.classList.add('lunge');ArmorySound.swing();setTimeout(()=>attacker.classList.remove('lunge'),600);
 if(e.miss){ArmorySound.miss();setTimeout(()=>float(target,'Verfehlt','miss'),250);return}
 if(e.blocked)ArmorySound.block();else ArmorySound.hit(e.crit);
 setTimeout(()=>{target.classList.add('struck');float(target,`-${e.damage}${e.crit?'!':''}`,e.crit?'crit':'dmg');setTimeout(()=>target.classList.remove('struck'),500)},220)
}
function float(el,text,kind){const s=document.createElement('span');s.className=`ak-float ${kind}`;s.textContent=text;el.append(s);setTimeout(()=>s.remove(),1400)}
const duelAction=act(async action=>{
 if(AK.duel.busy)return;AK.duel.busy=true;stopDuelPolling();$('#akMenu').innerHTML='';AK.duel.menu='main';
 try{const d=await api(`/api/duels/${encodeURIComponent(AK.duel.id)}/action`,'POST',{action});drawDuel(d,false)}
 catch(e){AK.duel.busy=false;pollDuel();if(AK.duel.last)$('#akMenu').innerHTML=battleMenu(AK.duel.last);throw e}
});
const forfeitDuel=act(async()=>{stopDuelPolling();const d=await api(`/api/duels/${encodeURIComponent(AK.duel.id)}/forfeit`,'POST',{});const line=[...d.log].reverse().find(e=>e.action==='forfeit');showForfeit(line?.text);openPage('duels')});

/* Spielunke tutorial: shows on every way into the Spielunke until "Nicht mehr anzeigen" is ticked. */
const TAVERN_PAGES=new Set(['bonus','roulette','blackjack','chests','ranking']),TUTORIAL_OFF='modcheck-tavern-tutorial-off';
function tavernTutorialOff(){try{return localStorage.getItem(TUTORIAL_OFF)==='1'}catch{return false}}
function showTavernTutorial(){
 if(tavernTutorialOff()||document.querySelector('dialog.ak-tutorial'))return;
 const step=(n,icon,title,text,target)=>`<button type="button" class="ak-step" onclick="this.closest('dialog').close();openPage('${target}')"><span class="ak-step-n">${n}</span><img src="icons/${icon}.jpg" alt=""><b>${title}</b><small>${text}</small></button>`;
 const d=akDialog('epic',`<p class="win-rarity">Willkommen in der Spielunke</p><h2 id="akDlgTitle">So läuft das Spiel</h2>
 <div class="ak-steps">${step(1,'inv_misc_coin_02','Gold verdienen','Hier in der Spielunke: drei Drehs am Automaten pro Tag, Roulette und Blackjack. Alles zahlt auf dasselbe Gildengold ein.','bonus')}
 ${step(2,'inv_box_01','Truhen öffnen','Gib das Gold für Schatztruhen aus. Darin steckt echte Classic-Ausrüstung, jede Truhe bringt auch Erfahrung.','chests')}
 ${step(3,'inv_chest_plate04','In der Waffenkammer ausrüsten','Leg die Beute deinem Charakter an, kauf beim Händler oder handel im Auktionshaus.','armory')}
 ${step(4,'ability_dualwield','Im Duell antreten','Fordere Gildenmitglieder heraus. Siege bringen Gold und Erfahrung, ab Stufe 4, 8 und 12 kommen neue Klassenfähigkeiten. Höchststufe ist 20.','duels')}</div>
 <label class="ak-tutorial-off"><input type="checkbox" id="akTutorialOff"> Nicht mehr anzeigen</label>
 <button class="primary" onclick="this.closest('dialog').close()">Los geht's</button>`,'ak-wide ak-tutorial');
 d.querySelector('#akTutorialOff').addEventListener('change',e=>{try{localStorage.setItem(TUTORIAL_OFF,e.target.checked?'1':'0')}catch{}})
}
// go() from app.js drives every page change; wrapping it catches the step into the Spielunke from anywhere else.
const goBeforeTutorial=go;
go=function(id){const was=page;if(id!=='duel'&&typeof stopBattleModels==='function')stopBattleModels();if(!['duel','run','duels'].includes(id))stopDuelPolling();goBeforeTutorial(id);if(TAVERN_PAGES.has(id)&&!TAVERN_PAGES.has(was)&&typeof P!=='undefined'&&P.user)setTimeout(showTavernTutorial,400)};

/* Dungeons and raids: list with lobbies, lobby view, and the party battle against the bosses. */
pageViews.dungeons=async()=>{
 await akLoad();const d=await api('/api/dungeons');stopDuelPolling();
 if(d.current&&P.arg!=='list')return openPage('run',d.current);
 const card=x=>{const left=d.runsLeft[x.kind];if(x.kind==='raid')return '';return `<article class="ak-dungeon wow-frame ${x.kind}"><div class="ak-dungeon-head"><img src="icons/${esc(x.icon)}.jpg" alt=""><div><h3>${esc(x.name)}</h3><p class="muted">${x.kind==='raid'?`Schlachtzug bis ${x.party} Spieler`:`Instanz bis ${x.party} Spieler`} · empfohlen ab Stufe ${x.level}</p></div></div><div class="ak-boss-row">${x.bosses.map(b=>`<span title="${esc(b.name)}"><img src="icons/${esc(b.icon)}.jpg" alt=""><small>${esc(b.name)}</small></span>`).join('')}</div><p class="ak-dungeon-loot">${goldText(x.gold)} · ${x.xp} Erfahrung · ${x.lootChance}% Chance auf Beute</p><button class="primary" ${left&&!d.current?'':'disabled'} onclick="openLobby('${x.id}')">Gruppe eröffnen</button></article>`};
 const when=iso=>new Date(iso).toLocaleString('de-DE',{timeZone:'Europe/Berlin',weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' Uhr';
 const raidRow=x=>{const open=Date.now()>=Date.parse(x.signupAt),dungeon=d.dungeons.find(y=>y.id===x.dungeon);return `<article class="ak-raid-slot wow-frame"><img src="icons/${esc(dungeon.icon)}.jpg" alt=""><div><h3>${esc(x.name)}</h3><p>${when(x.startsAt)} · bis ${x.max} Spieler</p><p class="muted">${x.status==='active'?'Der Kampf läuft.':open?`Anmeldung offen: ${x.count} von ${x.max} eingetragen. Start um 19 Uhr von selbst.`:`Anmeldung ab ${when(x.signupAt)}.`}</p></div><div class="ak-raid-act">${x.status==='active'?(x.signedUp?`<button class="primary" onclick="openPage('run','${esc(x.runId)}')">Zum Kampf</button>`:`<button class="subtle" onclick="openPage('run','${esc(x.runId)}')">Zuschauen</button>`):x.signedUp?`<button class="primary" onclick="openPage('run','${esc(x.runId)}')">Eingetragen</button>`:`<button class="primary" ${open&&x.runId&&!d.current?'':'disabled'} onclick="joinRun('${esc(x.runId||'')}')">Eintragen</button>`}</div></article>`};
 $('#content').innerHTML=akHead('Instanzen & Schlachtzüge',`Eröffne eine Gruppe, warte auf Mitstreiter und zieht gemeinsam gegen die Bosse. Heute noch ${d.runsLeft.dungeon} von ${d.perDay.dungeon} Instanzen. Schlachtzüge gibt es jeden Tag um 19 Uhr.`)+armoryTabs('dungeons')+
  (d.lobbies.filter(l=>l.kind==='dungeon').length?frame('Offene Gruppen',d.lobbies.filter(l=>l.kind==='dungeon').map(l=>`<div class="list-row"><span><b>${esc(l.name)}</b> <small class="muted">von ${esc(l.host)} · ${l.members.length}/${l.max} · ${l.members.map(esc).join(', ')}</small></span>${l.status==='lobby'?`<button class="primary" ${d.runsLeft[l.kind]&&!d.current&&l.members.length<l.max?'':'disabled'} onclick="joinRun('${esc(l.id)}')">Beitreten</button>`:'<span class="pill">im Kampf</span>'}</div>`).join('')):'')+
  `<h3 class="ak-section">Instanzen</h3><div class="ak-dungeons">${d.dungeons.filter(x=>x.kind==='dungeon').map(card).join('')}</div><h3 class="ak-section">Schlachtzüge: jeden Tag um 19 Uhr</h3>${d.raids.map(raidRow).join('')}<p class="muted">Eintragen geht ab 18 Uhr, bis zu 25 Spieler. Um 19 Uhr startet der Kampf von selbst mit allen, die eingetragen sind. Die Termine stehen auch im Kalender.</p>`+
  (d.recent.length?frame('Deine letzten Läufe',d.recent.map(r=>`<div class="list-row read"><span>${esc(r.name)}</span><span>${r.status==='won'?'<b class="up">geschafft</b>':r.status==='wiped'?'<b class="down">gescheitert</b>':'abgebrochen'} · ${dateText(r.at)} <button class="subtle" onclick="openPage('run','${esc(r.id)}')">Ansehen</button></span></div>`).join('')):'')
};
const openLobby=act(async dungeon=>{const r=await api('/api/dungeons','POST',{dungeon});openPage('run',r.id)});
const joinRun=act(async runId=>{await api(`/api/dungeons/${runId}/join`,'POST',{});openPage('run',runId)});
const leaveRun=act(async runId=>{await api(`/api/dungeons/${runId}/leave`,'POST',{});stopDuelPolling();openPage('dungeons','list')});
const startRun=act(async runId=>{const r=await api(`/api/dungeons/${runId}/start`,'POST',{});AK.duel={id:runId,seen:r.log.length,menu:'main',busy:false,act:'runAction',forfeit:'forfeitRun',back:'dungeons',run:true};drawRun(r,true)});
pageViews.run=async runId=>{
 stopDuelPolling();stopBattleModels();if(!runId)return openPage('dungeons');
 AK.catalog||=await api('/api/armory/catalog');
 const r=await api('/api/dungeons/'+encodeURIComponent(runId));
 AK.duel={id:runId,seen:r.log.length,menu:'main',busy:false,act:'runAction',forfeit:'forfeitRun',back:'dungeons',run:true};
 r.status==='lobby'?drawLobby(r):drawRun(r,true)
};
function drawLobby(r){
 const mine=r.members.some(m=>m.id===r.you),host=r.host&&r.host===r.you,raid=!!r.startsAt;
 $('#content').innerHTML=akHead(esc(r.name),`${r.kind==='raid'?'Schlachtzug':'Instanz'}: ${r.members.length} von ${r.max} Plätzen belegt. ${raid?`Start um 19 Uhr von selbst <span id="akRaidCountdown"></span>`:host?'Starte, sobald alle da sind.':'Der Gruppenleiter startet.'}`)+armoryTabs('dungeons')+
  frame('Gruppe',`<div class="ak-lobby">${r.members.map(m=>`<div class="ak-lobby-member ${m.id===r.host?'host':''}" style="--class:${CLASS_INFO[m.preview?.classId]?.[1]||'#ddd'}"><img src="icons/${charFaceIcon({race:m.preview?.race,gender:m.preview?.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><b>${esc(m.preview?.name||m.username)}</b><small>${m.preview?.classId?`${CLASS_INFO[m.preview.classId][0]} · Stufe ${m.preview.level}`:''}${m.id===r.host?' · Leiter':''}</small></div>`).join('')}${Array.from({length:Math.max(0,Math.min(raid?5:r.max,r.max-r.members.length))},()=>'<div class="ak-lobby-member empty"><span>?</span><small>frei</small></div>').join('')}</div><div class="ak-row">${host?`<button class="primary" onclick="startRun('${esc(r.id)}')">Losziehen</button>`:''}${mine?`<button class="subtle" onclick="leaveRun('${esc(r.id)}')">Gruppe verlassen</button>`:`<button class="primary" onclick="joinRun('${esc(r.id)}')">Beitreten</button>`}<button class="subtle" onclick="openPage('dungeons','list')">Alle Gruppen</button></div><p class="muted">Die Lebenspunkte der Bosse wachsen mit der Gruppe. Jeder Lauf zählt für alle Mitglieder gegen das Tageslimit, sobald er startet.</p>`);
 const cd=$('#akRaidCountdown');if(cd&&r.startsAt){const tickCd=()=>{if(!cd.isConnected)return;const left=Math.max(0,Date.parse(r.startsAt)-Date.now()),m=Math.floor(left/60e3),sec=Math.floor(left%60e3/1000);cd.textContent=`(noch ${m}:${String(sec).padStart(2,'0')})`;setTimeout(tickCd,1000)};tickCd()}
 AK.duelTimer=setTimeout(async()=>{if(page!=='run')return;try{const n=await api('/api/dungeons/'+encodeURIComponent(r.id));if(n.status==='lobby')drawLobby(n);else{AK.duel.seen=n.log.length;drawRun(n,true)}}catch{}},3000)
}
const bossText=(e,d)=>{const boss=d.boss?.name||'Der Boss',target=d.fighters?.[e.target]?.name||'?';
 if(e.action==='bossup')return `${e.name} stellt sich der Gruppe!`;
 if(e.action==='bossdown')return `${e.name} ist besiegt!`;
 if(e.action==='wipe')return 'Die Gruppe ist gefallen. Ab zum Geistheiler …';
 if(e.action==='stunned')return `${boss} ist betäubt und setzt aus!`;
 if(e.action==='aoe')return `${boss} entfesselt einen Flächenangriff! Die ganze Gruppe verliert zusammen ${e.damage} Leben.`;
 if(e.action==='heavy')return `${boss} holt zu einem gewaltigen Schlag aus! ${target} verliert ${e.damage} Leben.`;
 return `${boss} greift ${target} an! ${e.crit?'Volltreffer! ':''}${e.damage} Schaden.${e.absorbed?` ${e.absorbed} fängt der Schild ab.`:''}`};
function runText(e,d){
 if(e.by==='boss')return bossText(e,d);
 if(e.action==='loot'){const n=d.fighters[e.by]?.name||'?';return `${n} erhält ${e.gold} Gold und ${e.xp} Erfahrung${e.itemName?` sowie ${e.itemName}`:''}!${e.levelUp?` Stufe ${e.levelUp}!`:''}`}
 if(e.action==='forfeit')return e.text||`${d.fighters[e.by]?.name||'?'} gibt auf.`;
 // The player always hits the boss: hand battleText only these two, so the target is named correctly.
 return battleText(e,{...d,fighters:{[e.by]:d.fighters[e.by],boss:d.boss}})
}
function runPlate(f,d){const out=d.left.includes(f.id),dead=f.hp<=0,turn=d.turnUser===f.id;return `<div class="ak-member ${turn?'turn':''} ${dead||out?'down':''}" data-fighter="${esc(f.id)}" style="--class:${CLASS_INFO[f.classId]?.[1]||'#ddd'}"><img src="icons/${charFaceIcon({race:f.race,gender:f.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><span class="ak-member-info"><b>${esc(f.name)}</b><small>Stufe ${f.level}${out?' · aufgegeben':dead?' · gefallen':''}</small><span class="ak-hp ${hpClass(f)}"><i style="width:${Math.max(0,f.hp/f.max*100)}%"></i></span><small>${f.hp} / ${f.max}${f.shield>0?` · Schild ${f.shield}`:''}</small></span></div>`}
function drawRun(d,first){
 AK.duel.last=d;const over=['won','wiped','abandoned'].includes(d.status);
 if(first||!$('#akRun')){
  $('#content').innerHTML=akHead(esc(d.name),`${d.kind==='raid'?'Schlachtzug':'Instanz'} · Boss <span id="akBossNo">${d.bossIndex+1}</span> von ${d.bossCount}`)+armoryTabs('dungeons')+
   `<section class="ak-battle ak-run" id="akRun"><div class="ak-field"><div id="akBossPlate"></div><div class="ak-actor foe ak-boss" data-fighter="boss"><div class="ak-pad"></div><div class="ak-actor-model"><img class="ak-boss-art" id="akBossArt" alt=""></div></div><div class="ak-party" id="akParty"></div></div><div class="ak-console"><p class="ak-text" id="akBattleText" aria-live="polite"></p><div class="ak-menu-box" id="akMenu"></div></div></section>`+frame('Kampfverlauf','<ol class="ak-log" id="akLog" reversed></ol>')
 }
 const fresh=first?[]:d.log.slice(AK.duel.seen);AK.duel.seen=d.log.length;
 const paint=()=>{
  const b=d.boss;$('#akBossArt').src=`icons/${b.icon}.jpg`;$('#akBossNo').textContent=d.bossIndex+1;
  $('#akBossPlate').innerHTML=`<div class="ak-plate foe"><div class="ak-plate-head"><b style="color:#7a1a0a">${esc(b.name)}</b><span>Boss</span></div><div class="ak-plate-hp"><small>LP</small><div class="ak-hp ${hpClass(b)}"><i style="width:${Math.max(0,b.hp/b.max*100)}%"></i></div></div><p class="ak-plate-num">${b.hp} / ${b.max}</p><p class="ak-plate-state">${b.stunned?'<span class="ak-status stun">Betäubt</span>':''}</p></div>`;
  $('#akParty').innerHTML=d.order.map(uid=>runPlate(d.fighters[uid],d)).join('');
  document.querySelector('.ak-boss')?.classList.toggle('down',b.hp<=0&&d.status!=='active')
 };
 const finish=()=>{
  paint();const last=d.log.at(-1);
  $('#akBattleText').textContent=d.status==='won'?`Geschafft! ${d.name} ist bezwungen.`:d.status==='wiped'?'Die Gruppe ist gefallen.':d.yourTurn?`Du bist dran, ${d.fighters[d.you]?.name}! Was tust du?`:last?runText(last,d):'';
  $('#akMenu').innerHTML=d.left.includes(d.you)&&!over?'<p class="ak-wait">Du hast aufgegeben und schaust zu.</p>':battleMenu(d);
  $('#akLog').innerHTML=[...d.log].reverse().map(e=>`<li class="${e.action==='loot'?'heal':e.by==='boss'?'crit':''}">${esc(runText(e,d))}</li>`).join('');
  AK.duel.busy=false;
  if(over){if(fresh.length&&d.status==='won'){ArmorySound.fanfare();ArmorySound.coins(14)}return}
  const clock=$('#duelClock');if(clock){const until=performance.now()+(d.turnLeft||0);const run=()=>{if(!clock.isConnected)return;const s=Math.max(0,Math.ceil((until-performance.now())/1000));clock.textContent=`(${s} s)`;if(s>0)requestAnimationFrame(run)};run()}
  AK.duelTimer=setTimeout(pollRun,d.yourTurn?4000:1500)
 };
 if(!fresh.length)return finish();
 AK.duel.busy=true;$('#akMenu').innerHTML='';paint();
 fresh.forEach((e,i)=>setTimeout(()=>{$('#akBattleText').textContent=runText(e,d);runAnimate(e,d)},i*1100));
 setTimeout(finish,fresh.length*1100)
}
function runAnimate(e,d){
 const boss=document.querySelector('.ak-boss'),member=id=>document.querySelector(`.ak-member[data-fighter="${CSS.escape(id)}"]`);
 if(e.by==='boss'){
  if(['bossup','bossdown','wipe','stunned'].includes(e.action)){if(e.action==='bossdown')ArmorySound.fanfare();return}
  boss?.classList.add('lunge');ArmorySound.swing();setTimeout(()=>boss?.classList.remove('lunge'),600);ArmorySound.hit(e.crit||e.action==='heavy');
  const hits=e.action==='aoe'?e.hits:[{target:e.target,damage:e.damage}];
  setTimeout(()=>hits.forEach(h=>{const el=member(h.target);if(!el)return;el.classList.add('struck');float(el,`-${h.damage}`,'dmg');setTimeout(()=>el.classList.remove('struck'),500)}),250);return
 }
 const el=member(e.by);if(!el||e.action==='loot'||e.action==='forfeit')return;
 if(e.action==='potion'||['heal','shield','buff'].includes(e.kind)||e.action==='defend'){el.classList.add('glow');ArmorySound.heal();float(el,e.heal?`+${e.heal}`:'✦','heal');setTimeout(()=>el.classList.remove('glow'),900);return}
 el.classList.add('lunge');ArmorySound.swing();setTimeout(()=>el.classList.remove('lunge'),500);
 if(e.miss){ArmorySound.miss();return}
 ArmorySound.hit(e.crit);setTimeout(()=>{boss?.classList.add('struck');float(boss,`-${e.damage}${e.crit?'!':''}`,e.crit?'crit':'dmg');setTimeout(()=>boss?.classList.remove('struck'),500)},200)
}
async function pollRun(){if(page!=='run'||!AK.duel?.run||AK.duel.busy)return;try{const d=await api('/api/dungeons/'+encodeURIComponent(AK.duel.id));if(d.log.length!==AK.duel.seen||d.status!==AK.duel.last?.status||d.turnUser!==AK.duel.last?.turnUser)drawRun(d,false);else AK.duelTimer=setTimeout(pollRun,d.yourTurn?4000:1500)}catch{AK.duelTimer=setTimeout(pollRun,3000)}}
const runAction=act(async action=>{
 if(AK.duel.busy)return;AK.duel.busy=true;stopDuelPolling();$('#akMenu').innerHTML='';AK.duel.menu='main';
 try{const d=await api(`/api/dungeons/${encodeURIComponent(AK.duel.id)}/action`,'POST',{action});drawRun(d,false)}
 catch(e){AK.duel.busy=false;pollRun();if(AK.duel.last)$('#akMenu').innerHTML=battleMenu(AK.duel.last);throw e}
});
// Giving up leaves the fight for good: the silly line shows, then it is back to the list.
const forfeitRun=act(async()=>{stopDuelPolling();const d=await api(`/api/dungeons/${encodeURIComponent(AK.duel.id)}/forfeit`,'POST',{});const line=[...d.log].reverse().find(e=>e.action==='forfeit'&&e.by===d.you);showForfeit(line?.text);openPage('dungeons','list')});
function showForfeit(text){if(!text)return;ArmorySound.miss();akDialog('poor',`<p class="win-rarity">Aufgegeben</p><h2 id="akDlgTitle">Ab nach Hause</h2><p class="win-name">${esc(text)}</p><button class="primary" onclick="this.closest('dialog').close()">Peinlich …</button>`)}

/* Live stream box on the start page: preview from our server, the Twitch player only after a click. Closing hides it for this browser session. */
const STREAM_CLOSED='modcheck-stream-closed';
async function streamBox(){
 const old=document.getElementById('streamBox');
 if(page!=='home'){old?.remove();return}
 let s;try{s=await (await fetch('/stream/status',{cache:'no-store'})).json()}catch{return}
 let closed=false;try{closed=sessionStorage.getItem(STREAM_CLOSED)==='1'}catch{}
 if(!s.live||closed){document.getElementById('streamBox')?.remove();return}
 if(document.getElementById('streamBox'))return;
 const box=document.createElement('div');box.id='streamBox';box.className='stream-box';box.setAttribute('role','complementary');box.setAttribute('aria-label','Livestream');
 box.innerHTML=`<div class="stream-head"><span class="stream-live">● LIVE</span><b>${esc(s.title||'Wir sind live!')}</b><button class="stream-close" aria-label="Stream ausblenden" title="Ausblenden">✕</button></div><button class="stream-preview" aria-label="Stream ansehen"><img src="/stream/preview.jpg?t=${Date.now()}" alt=""><span>▶ Stream ansehen</span></button><small>Twitch lädt erst nach dem Klick.</small>`;
 box.querySelector('.stream-close').onclick=()=>{try{sessionStorage.setItem(STREAM_CLOSED,'1')}catch{}box.remove()};
 box.querySelector('.stream-preview').onclick=()=>{const frame=document.createElement('iframe');frame.src=`https://player.twitch.tv/?channel=${encodeURIComponent(s.channel)}&parent=${encodeURIComponent(location.hostname)}&autoplay=true`;frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;frame.title='Twitch-Stream';box.querySelector('.stream-preview').replaceWith(frame);box.querySelector('small')?.remove();box.classList.add('playing')};
 document.body.append(box)
}
setInterval(()=>{if(page==='home')streamBox()},120e3);
{const goBeforeStream=go;go=function(id){goBeforeStream(id);streamBox()}}
setTimeout(streamBox,1500);

/* Release countdown in the start page hero. */
const RELEASE_AT=Date.parse('2026-11-04T23:00:00Z');
(function releaseCountdown(){
 const box=document.getElementById('releaseCountdown');if(!box)return;
 const left=RELEASE_AT-Date.now();
 if(left<-864e5){box.hidden=true;return}
 box.hidden=false;
 if(left<=0){if(!box.dataset.live){box.dataset.live='1';box.innerHTML='<p class="release-title">World of Warcraft: Forever</p><p class="release-live">ist live! Für die Allianz!</p>'}return setTimeout(releaseCountdown,60e3)}
 const parts=[[Math.floor(left/864e5),'Tage'],[Math.floor(left/36e5)%24,'Stunden'],[Math.floor(left/6e4)%60,'Minuten'],[Math.floor(left/1e3)%60,'Sekunden']];
 box.innerHTML=`<p class="release-title">Release von World of Warcraft: Forever</p><div class="release-units">${parts.map(([n,l])=>`<span><b>${String(n).padStart(2,'0')}</b><small>${l}</small></span>`).join('')}</div><p class="release-when">05.11.2026 · 0:00 Uhr</p>`;
 setTimeout(releaseCountdown,1000-Date.now()%1000)
})();

/* Section overviews: a click on a main menu entry opens a page with all its parts ("Start" goes straight to the start page). */
const PAGE_INFO={
 home:['inv_misc_book_09','Die Startseite mit Raids, Terminen und Neuigkeiten.'],news:['inv_scroll_03','Neuigkeiten rund um World of Warcraft: Forever.'],patches:['inv_misc_note_01','Geprüfte Patchnotes und Änderungen.'],impact:['inv_misc_spyglass_02','Was neue Patches für deine Charaktere bedeuten.'],
 guild:['inv_banner_02','Die Gildenhalle: Motto, Geschichte und Botschaft.'],members:['achievement_guildperk_everybodysfriend','Alle Mitglieder mit ihren Charakteren.'],progress:['achievement_boss_onyxia','Welche Bosse die Gilde schon gelegt hat.'],hall:['inv_misc_trophy_argent','Die großen Momente der Gilde.'],polls:['inv_letter_15','Abstimmungen der Gilde, auch in Discord.'],crafting:['trade_blacksmithing','Wer kann was herstellen?'],
 character:['inv_chest_plate04','Ausrüstung planen und am 3D-Modell anlegen.'],talents:['ability_marksmanship','Talente für alle Klassen verteilen.'],skills:['spell_holy_magicalsentry','Alle Fähigkeiten deiner Klasse nach Stufe.'],bis:['inv_sword_39','Beste Ausrüstung pro Platz, mit Quelle.'],legacy:['inv_misc_book_11','Legacy-Ziele und Fortschritt.'],plan:['inv_misc_map_01','Deine Levelreise mit Klassenquests und Meilensteinen.'],
 instances:['achievement_boss_edwinvancleef','Karten, Bosse und Beute der Instanzen.'],gear:['inv_box_01','Alle Gegenstände, die deine Klasse tragen kann.'],
 raids:['achievement_boss_ragnaros','Raids planen und sich anmelden.'],calendar:['inv_misc_pocketwatch_01','Alle Termine der Gilde.'],forum:['inv_letter_09','Diskussionen, Guides und Videos.'],board:['inv_misc_note_06','Kurze Aushänge für alle.'],
 bonus:['inv_misc_coin_02','Drei freie Drehs am Tag für Gildengold.'],roulette:['inv_misc_dice_01','Setz dein Gold auf Rot, Schwarz oder Grün.'],blackjack:['inv_misc_ticket_tarot_blessings','Näher an 21 als der Geber.'],chests:['inv_box_birdcage_01','Gold gegen Schatztruhen voller Classic-Ausrüstung.'],ranking:['inv_misc_trophy_gold','Wer holt am meisten aus der Spielunke?'],
 armory:['inv_chest_chain_07','Dein Spielcharakter: Ausrüstung, Stufe und Fähigkeiten.'],shop:['inv_misc_bag_10','Waffen, Rüstungen und Tränke kaufen und verkaufen.'],auctions:['inv_misc_coin_17','Handel mit anderen Gildenmitgliedern.'],duels:['ability_dualwield','Fordere Gildenmitglieder zum Duell.'],dungeons:['achievement_boss_onyxia','Instanzen zu fünft und tägliche Raids um 19 Uhr.'],
 dashboard:['inv_misc_book_09','Deine persönliche Übersicht.'],characters:['inv_misc_head_human_01','Deine Charaktere verwalten.'],wishlist:['inv_misc_note_02','Gegenstände, die du noch willst.'],notifications:['inv_letter_15','Alle Benachrichtigungen.'],settings:['trade_engineering','Passwort und Hauptcharakter.'],notes:['inv_scroll_06','Notizen und Backup deiner Planung.']
};
const GROUP_TEXT={Gilde:'Alles rund um ModCheck: Mitglieder, Erfolge, Abstimmungen und Berufe.',Charaktere:'Der Charakterplaner für deine Klasse: Ausrüstung, Talente, Fähigkeiten und Levelreise.',Instanzen:'Instanzjournal und Gegenstandskatalog von WoW Forever.',Organisation:'Raids, Termine, Forum und Schwarzes Brett.',Spielunke:'Hier verdienst du Gildengold: Automat, Roulette, Blackjack und Schatztruhen.',Waffenkammer:'Unser Spiel: Charakter ausrüsten, handeln, Duelle und Instanzen.','Mein Account':'Deine Charaktere, Wunschliste, Benachrichtigungen und Einstellungen.'};
pageViews.overview=async group=>{
 const entry=NAV.find(g=>g[0]===group);if(!entry)return openPage('home');
 const [name,icon,items]=entry,visible=items.filter(([, ,auth])=>!auth||P.user);
 $('#content').innerHTML=head(`${icon} ${esc(name)}`,esc(GROUP_TEXT[name]||''))+`<div class="overview-grid">${visible.map(([id,label])=>{const [ic,text]=PAGE_INFO[id]||['inv_misc_questionmark',''];return `<button class="overview-card wow-frame" onclick="openPage('${id}')"><img src="icons/${ic}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><span><b>${esc(label)}</b><small>${esc(text)}</small></span><i aria-hidden="true">›</i></button>`}).join('')}</div>`
};
// The main menu entries: a click opens the overview of the section (Start: the start page); hovering still shows the dropdown.
function openSection(group){closeNav();group==='Start'?openPage('home'):openPage('overview',group)}

/* Top bar: the editable planner profile belongs to the planner only. The game pages show the game character read-only. */
const PLANNER_PAGES=new Set(['character','talents','skills','bis','legacy','plan','instances','gear','notes']);
const GAME_PAGES=new Set(['bonus','roulette','blackjack','chests','ranking','armory','shop','auctions','duels','duel','dungeons','run']);
async function updateTopBars(){
 const profile=document.querySelector('section.profile');if(profile)profile.style.display=PLANNER_PAGES.has(page)?'':'none';
 let bar=document.getElementById('gameBar');
 if(!GAME_PAGES.has(page)||!P.user){bar?.remove();return}
 if(!bar){bar=document.createElement('section');bar.id='gameBar';bar.className='game-bar';profile?.after(bar)}
 try{AK.state=await api('/api/armory')}catch{return}if(!GAME_PAGES.has(page))return;
 const s=AK.state,c=s.character;
 if(!c){bar.innerHTML=`<span>Für die Waffenkammer brauchst du einen Charakter.</span><button class="subtle" onclick="openCharScreen()">Charakter anlegen</button>`;return}
 const p=s.progress;
 bar.innerHTML=`<img src="icons/${charFaceIcon({race:c.race,gender:c.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><div class="game-bar-who"><b style="color:${CLASS_INFO[c.classId]?.[1]||'#fff'}">${esc(c.name)}</b><small>${esc(c.race)} · ${esc(c.className)}</small></div><div class="game-bar-level"><small>SPIELSTUFE</small><b>${p.level}</b></div><div class="game-bar-xp"><small>${p.next?`${p.xp} / ${p.next} Erfahrung`:'Höchststufe'}</small><span class="ak-xp"><i style="width:${p.next?p.xp/p.next*100:100}%"></i></span></div><div class="game-bar-gold"><small>GILDENGOLD</small>${goldText(s.balance)}</div><button class="subtle" onclick="openCharScreen()">Charakter wechseln</button>`
}
{const renderBeforeBars=render;render=function(){renderBeforeBars();updateTopBars()}}
setTimeout(updateTopBars,1200);

/* "Neu bei ModCheck": shown once per browser for logged-in members after this update, when no other window is open. */
const NEWS_SEEN='modcheck-news-2026-11-waffenkammer';
function newsSeen(){try{return localStorage.getItem(NEWS_SEEN)==='1'}catch{return true}}
function showNews(){
 if(newsSeen()||!P.user)return;
 if(document.getElementById('charScreen')||document.querySelector('dialog[open]'))return setTimeout(showNews,2000);
 try{localStorage.setItem(NEWS_SEEN,'1')}catch{}
 const item=(icon,title,text)=>`<div class="news-item"><img src="icons/${icon}.jpg" alt=""><span><b>${title}</b><small>${text}</small></span></div>`;
 const d=akDialog('epic',`<p class="win-rarity">Neu bei ModCheck</p><h2 id="akDlgTitle">Spielunke und Waffenkammer</h2>
 <h3 class="news-head">♠ Spielunke: Gold verdienen</h3><div class="news-list">${item('inv_misc_coin_02','Drei Drehs am Tag','Der Automat gibt jetzt drei freie Drehs pro Tag.')}${item('inv_box_birdcage_01','Schatztruhen','Fünf Truhen voller echter Classic-Ausrüstung, mit allen Chancen offen.')}</div>
 <h3 class="news-head">⚔ Waffenkammer: unser eigenes Spiel</h3><div class="news-list">${item('inv_chest_chain_07','Dein Charakter','Ausrüstung anlegen, am 3D-Modell sehen, Stufen bis 20 und vier Klassenfähigkeiten.')}${item('inv_misc_bag_10','Händler und Auktionshaus','Waffen, Rüstungen und Tränke kaufen, verkaufen und mit der Gilde handeln.')}${item('ability_dualwield','Duelle','Rundenkämpfe wie in alten Monster-Spielen: Kampf, Beutel, Verteidigen.')}${item('achievement_boss_onyxia','Instanzen und Raids','Zu fünft dreimal am Tag in Instanzen, jeden Tag um 19 Uhr Raid mit bis zu 25 Spielern.')}</div>
 <p class="muted">1.500 Startgold und ein paar Tränke warten schon auf dich.</p>
 <div class="ak-row center"><button class="primary" onclick="this.closest('dialog').close();openPage('armory')">Zur Waffenkammer</button><button class="subtle" onclick="this.closest('dialog').close();openPage('chests')">Zur Spielunke</button><button class="subtle" onclick="this.closest('dialog').close()">Später</button></div>`,'ak-wide news-dialog');
 d.querySelector('.primary')?.focus()
}
setTimeout(showNews,3500);
