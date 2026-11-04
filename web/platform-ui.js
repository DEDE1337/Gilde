/* Guild platform UI: accounts, navigation and shared helpers. Every value from the server goes through esc(). */
const P={user:null,arg:null,cache:{},activeChar:null};
const CLASS_INFO={1:['Krieger','#C79C6E','warrior'],2:['Paladin','#F58CBA','paladin'],3:['Jäger','#ABD473','hunter'],4:['Schurke','#FFF569','rogue'],5:['Priester','#FFFFFF','priest'],7:['Schamane','#0070DE','shaman'],8:['Magier','#69CCF0','mage'],9:['Hexenmeister','#9482C9','warlock'],11:['Druide','#FF7D0A','druid']};
const RACE_CLASSES={Mensch:[1,2,3,4,5,8,9],Zwerg:[1,2,3,4,5,7],Nachtelf:[1,3,4,5,11],Gnom:[1,4,5,8,9],Skyborne:[1,3,4,8,11]};
const SLOT_NAMES={head:'Kopf',neck:'Hals',shoulders:'Schulter',back:'Rücken',chest:'Brust',wrists:'Handgelenke',hands:'Hände',waist:'Taille',legs:'Beine',feet:'Füße',ring1:'Ring 1',ring2:'Ring 2',trinket1:'Schmuck 1',trinket2:'Schmuck 2',mainhand:'Waffenhand',offhand:'Nebenhand',ranged:'Fernkampf'};
const NAV=[['Start','⌂',[['home','Gildenportal'],['news','WoW-Forever-News'],['patches','Patchnotes'],['impact','Patch-Impact-Tracker',1]]],['Gilde','⚜',[['guild','Gildenhalle'],['members','Mitglieder',1],['progress','Raidfortschritt'],['hall','Hall of Fame'],['polls','Abstimmungen',1],['crafting','Gildenberufe',1]]],['Charaktere','♜',[['character','Charakterplaner'],['talents','Talentwerkstatt'],['skills','Fähigkeiten'],['bis','BiS-Listen'],['legacy','Legacy-Fortschritt',1],['plan','Levelreise']]],['Instanzen','☠',[['instances','Karten, Bosse & Beute'],['gear','Gegenstandskatalog']]],['Organisation','▦',[['raids','Raidplaner',1],['calendar','Kalender'],['forum','Forum'],['board','Schwarzes Brett',1]]],['Spielunke','♠',[['bonus','Automat'],['roulette','Roulette'],['blackjack','Blackjack'],['chests','Schatztruhen'],['ranking','Rangliste']]],['Waffenkammer','⚔',[['armory','Charakter & Taschen'],['shop','Händler'],['auctions','Auktionshaus'],['duels','Duelle'],['dungeons','Instanzen & Raids']]],['Mein Account','✦',[['dashboard','Mein Dashboard',1],['characters','Meine Charaktere',1],['wishlist','Meine Wunschliste',1],['notifications','Benachrichtigungen',1],['settings','Einstellungen',1],['notes','Notizen & Backup']]]];
const dateText=v=>v?new Date(v).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'}):'–',timeText=v=>new Date(v).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'});
const toLocalInput=v=>{const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,16)};
async function api(path,method='GET',body){const r=await fetch(path,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok){const e=Error(data.error||'Die Anfrage ist fehlgeschlagen.');e.status=r.status;throw e}return data}
const act=fn=>async(...a)=>{try{return await fn(...a)}catch(e){toast(e.message)}};
const can=p=>!!P.user?.permissions.includes(p),isAdmin=()=>P.user?.role==='admin';
const formData=f=>Object.fromEntries(new FormData(f).entries());
const frame=(title,body,cls='')=>`<section class="wow-frame ${cls}">${title?`<h3 class="wow-title">${title}</h3>`:''}${body}</section>`;
const emptyBox=t=>`<div class="empty">${t}</div>`;
function classIcon(id){const c=CLASS_INFO[id];return c?`<img class="class-icon" src="talent-icons/classicon_${c[2]}.jpg" alt="${c[0]}" title="${c[0]}">`:''}
function charName(c){if(!c)return '<span class="muted">Kein Charakter</span>';const color=CLASS_INFO[c.classId]?.[1]||'#ddd';return `${classIcon(c.classId)}<button class="char-link" style="color:${color}" onclick="openPage('profile','${esc(c.id)}')">${esc(c.fullName||c.name)}</button>`}
const QUALITY=['poor','common','uncommon','rare','epic','legendary'];
function itemLink(i){if(!i)return '';const q=typeof i.quality==='number'?QUALITY[i.quality]:i.quality||'common';return `<a class="item-link quality-${esc(q)}" href="https://www.wowhead.com/forever/item=${+i.id}" target="_blank" rel="noopener" data-tip-item="${+i.id}"><img src="icons/${esc(i.icon||'inv_misc_questionmark')}.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'">${esc(i.name)}</a>`}
function spellLink(s){return `<a class="item-link quality-common" href="https://www.wowhead.com/forever/spell=${+s.id}" target="_blank" rel="noopener" data-tip-spell="${+s.id}"><img src="icons/${esc(s.icon||'inv_misc_questionmark')}.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'">${esc(s.name)}</a>`}
/* YouTube links get a click-to-play card: the thumbnail comes through our server, YouTube itself is only contacted after the click (privacy-enhanced domain). */
const YT_LINK=/https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s<]*?&amp;)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/g;
function bodyText(t){
 const safe=esc(t),ids=[...new Set([...safe.matchAll(YT_LINK)].map(m=>m[1]))].slice(0,6);
 return safe.replace(/https:\/\/[^\s<]+/g,u=>`<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`).replace(/\n/g,'<br>')+(ids.length?`<div class="yt-list">${ids.map(id=>`<button type="button" class="yt-card" data-yt="${id}" onclick="playYouTube(this)" aria-label="Video abspielen"><img src="yt/${id}.jpg" alt="" loading="lazy"><span class="yt-play" aria-hidden="true">▶</span><small>Lädt erst beim Klick von YouTube</small></button>`).join('')}</div>`:'')
}
function playYouTube(btn){const id=btn.dataset.yt;if(!/^[\w-]{11}$/.test(id))return;btn.outerHTML=`<div class="yt-frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="YouTube-Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`}
async function uploadFile(file){if(!file||!file.size)return null;const r=await fetch('/api/uploads',{method:'POST',credentials:'same-origin',body:file});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Upload fehlgeschlagen.');return data.id}
const uploadField=(name,label)=>`<label>${label}<input type="file" name="${name}" accept="image/png,image/jpeg,image/webp"></label><small class="muted">PNG, JPEG oder WebP, höchstens 3 MB.</small>`;

/* WoW-style tooltip for items and recipes */
const tipBox=document.createElement('div');tipBox.id='wowTip';tipBox.hidden=true;document.body.append(tipBox);
const tipCache=new Map();
async function loadTip(kind,tipId){const key=kind+tipId;if(!tipCache.has(key))tipCache.set(key,api(`/api/${kind==='item'?'items':'spells'}/${tipId}`).then(d=>d.item||d.spell));return tipCache.get(key)}
document.addEventListener('mouseover',async e=>{const el=e.target.closest?.('[data-tip-item],[data-tip-spell]');if(!el)return;const kind=el.dataset.tipItem?'item':'spell';try{const data=await loadTip(kind,el.dataset.tipItem||el.dataset.tipSpell);if(!el.matches(':hover'))return;tipBox.innerHTML=`<strong>${esc(data.name)}</strong><p>${esc(data.tooltip||'').split('\n').slice(1).join('<br>').replace(/&lt;br&gt;/g,'')}</p>`;tipBox.hidden=false;const r=el.getBoundingClientRect();tipBox.style.left=Math.max(8,Math.min(innerWidth-tipBox.offsetWidth-8,r.left))+'px';tipBox.style.top=(r.bottom+tipBox.offsetHeight+8<innerHeight?r.bottom+6:Math.max(8,r.top-tipBox.offsetHeight-6))+scrollY+'px'}catch{}});
document.addEventListener('mouseout',e=>{if(e.target.closest?.('[data-tip-item],[data-tip-spell]'))tipBox.hidden=true});

/* Navigation */
const pageViews={};
function openPage(id,arg){P.arg=arg??null;go(id)}
function closeNav(except){document.querySelectorAll('.nav-group.open').forEach(n=>{if(n!==except){n.classList.remove('open');n.firstElementChild.setAttribute('aria-expanded','false')}})}
function toggleNav(group){closeNav(group);group.firstElementChild.setAttribute('aria-expanded',String(group.classList.toggle('open')))}
document.addEventListener('click',e=>{if(!e.target.closest?.('.nav-group'))closeNav()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav()});
function drawNav(){
 const openGroup=NAV.find(g=>g[2].some(x=>x[0]===page||(pageGroups[page]===x[0])))?.[0];
 document.body.classList.toggle('guest-mode',!P.user);$('#heroCta').textContent=P.user?'Antreten zum Raid':'Anmelden';
 $('#nav').innerHTML=!P.user?`<button class="${page==='home'?'active':''}" onclick="openPage('home')">⌂ &nbsp; Start</button><button class="${page==='login'?'active':''}" onclick="openPage('login')">✦ &nbsp; Anmelden</button>`:NAV.map(([name,icon,items])=>`<div class="nav-group ${name===openGroup?'current':''}" onpointerleave="if(event.pointerType==='mouse')closeNav()"><button aria-haspopup="true" aria-expanded="false" onclick="openSection('${name}')">${icon} &nbsp; ${name}</button><div class="nav-menu">${items.filter(([, ,auth])=>!auth||P.user).map(([id,label])=>`<button class="${page===id?'active':''}" onclick="closeNav();openPage('${id}')">${label}</button>`).join('')}</div></div>`).join('');
 const unread=P.unread||0;
 document.querySelector('header .badge').outerHTML=`<span class="badge account-box">${P.user?`<button id="noteBell" onclick="toggleNotes(event)" class="bell ${unread?'has-unread':''}" aria-haspopup="true" aria-expanded="${!!noteDrop.isConnected&&!noteDrop.hidden}" aria-label="Benachrichtigungen, ${unread} ungelesen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"/></svg>${unread?`<span class="bell-count">${unread>99?'99+':unread}</span>`:''}</button>${isAdmin()?`<button onclick="showIntro()">Trailer</button>`:''}${P.bonusOpen?`<button class="bonus-ready" onclick="openPage('bonus')">Bonus bereit</button>`:''}${typeof openCharScreen==='function'?(P.activeChar?`<button class="char-face" onclick="openCharScreen()" title="Charakter wechseln" aria-label="Charakter wechseln, aktiv: ${esc(P.activeChar.name)}"><img src="icons/${charFaceIcon(P.activeChar)}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><span style="color:${CLASS_INFO[P.activeChar.classId]?.[1]||'#fff'}">${esc(P.activeChar.name)}</span></button>`:`<button onclick="openCharScreen()">Charakter wählen</button>`):''}<button onclick="openPage('dashboard')">${esc(P.user.username)}</button><button onclick="logout()">Abmelden</button>`:`<button onclick="openPage('login')">Anmelden</button>`}</span>`
}
const pageGroups={raid:'raids',topic:'forum',category:'forum',profile:'members',login:'dashboard',admin:'members'};
const allPages=[...new Set(NAV.flatMap(g=>g[2].map(x=>x[0])))];
for(const id of allPages.concat(Object.keys(pageGroups)))if(!tabs.some(t=>t[0]===id))tabs.push([id,'',NAV.flatMap(g=>g[2]).find(x=>x[0]===id)?.[1]||({raid:'Raid',topic:'Forum',category:'Forum',profile:'Charakterprofil',login:'Anmelden',admin:'Verwaltung'})[id]]);
const oldRenderPlatform=render;
render=function(){let redirected=false;if(P.booted&&!P.user&&!['home','login'].includes(page)){P.afterLogin={page,arg:P.arg};page='login';P.arg=null;redirected=true}oldRenderPlatform();drawNav();drawProfile();syncHistory(redirected);if(page==='home'&&P.user)drawHomeExtras();const view=pageViews[page];if(view)openView(view)};

/* Browser history: every page gets a hash route (#forum, #topic/<id>), so Back/Forward and reloading stay inside the site. */
const routeHash=()=>'#'+page+(P.arg!==null&&P.arg!==undefined&&P.arg!==''?'/'+encodeURIComponent(P.arg):'');
function readHash(){const m=location.hash.slice(1).match(/^([\w-]+)(?:\/(.+))?$/);if(!m||!tabs.some(t=>t[0]===m[1])||m[1]==='calendar')return null;let arg=null;try{arg=m[2]?decodeURIComponent(m[2]):null}catch{return null}return{page:m[1],arg}}
let restoringRoute=false;
function syncHistory(replace){if(!P.booted)return;const hash=routeHash();if(hash===location.hash)return;const s={page,arg:P.arg};if(replace||restoringRoute||!location.hash)history.replaceState(s,'',hash);else history.pushState(s,'',hash)}
// Called once user and data are loaded, right before the first real render.
function applyStartRoute(){const r=readHash();if(r){page=r.page;P.arg=r.arg}P.booted=true}
addEventListener('popstate',()=>{if(!P.booted)return;const r=readHash()||{page:'home',arg:null};closeNotes();restoringRoute=true;try{P.arg=r.arg;go(r.page)}finally{restoringRoute=false}});
function drawProfile(){
 const linked=!!P.activeChar,cls=$('#classSelect'),race=$('#race'),allowed=Object.keys(RACE_CLASSES).filter(r=>RACE_CLASSES[r].includes(plannerClass()));
 cls.innerHTML=Object.entries(CLASS_INFO).map(([id,c])=>`<option value="${id}" ${+id===plannerClass()?'selected':''}>${c[0]}</option>`).join('');
 race.innerHTML=allowed.map(r=>`<option ${r===state.race?'selected':''}>${r}</option>`).join('');
 cls.disabled=race.disabled=linked;cls.title=race.title=linked?'Klasse und Volk änderst du unter „Meine Charaktere“.':''
}
$('#classSelect').addEventListener('change',e=>{state.classId=+e.target.value;window.plannerLabel='';if(!RACE_CLASSES[state.race].includes(state.classId))state.race=Object.keys(RACE_CLASSES).find(r=>RACE_CLASSES[r].includes(state.classId));if(typeof talentPlan==='function')talentPlan().classId=state.classId;state.equipment={};save();render();toast('Klasse gewechselt. Die Ausrüstungsauswahl wurde geleert.')});
// quiet: live refresh, keeps the old content and the scroll position instead of flashing "Wird geladen".
async function openView(view,{quiet=false}={}){
 const target=$('#content'),opened=page,y=scrollY;if(!quiet)target.innerHTML=emptyBox('Wird geladen …');
 try{await view(P.arg);if(quiet&&page===opened)scrollTo({top:y,behavior:'instant'})}catch(e){if(page!==opened||quiet)return;target.innerHTML=e.status===401?frame('Anmeldung erforderlich',`<p>Dieser Bereich ist für Gildenmitglieder.</p><button class="primary" onclick="openPage('login')">Zur Anmeldung</button>`):frame('Das hat nicht geklappt',`<p>${esc(e.message)}</p>`)}
}
const redraw=()=>{const view=pageViews[page];return view?openView(view):render()};
async function refreshUser(){const{user}=await api('/api/me');P.user=user;P.activeChar=null;if(user){try{P.notes=(await api('/api/notifications')).notifications;P.unread=P.notes.filter(n=>!n.read_at).length;P.bonusOpen=(await api('/api/bonus')).rollsLeft>0;await loadActiveCharacter();loadCalendarEvents()}catch{}}}
const logout=act(async()=>{await api('/api/logout','POST');location.reload()});

pageViews.login=async()=>{
 if(P.user)return openPage('dashboard');
 $('#content').innerHTML=head('Willkommen in der Gildenhalle','Melde dich an oder lege ein Konto an.')+`<div class="two-col">`+frame('Anmelden',`<form id="loginForm"><label>Benutzername<input name="username" required autocomplete="username" maxlength="24"></label><label>Passwort<input name="password" type="password" required autocomplete="current-password"></label><button class="primary">Anmelden</button></form>`)+frame('Konto anlegen',`<form id="registerForm"><label>Benutzername<input name="username" required minlength="3" maxlength="24" autocomplete="username"></label><label>Passwort (mindestens 10 Zeichen)<input name="password" type="password" required minlength="10" autocomplete="new-password"></label><button class="subtle">Registrieren</button><p><small class="muted">Ein Offizier schaltet neue Konten frei.</small></p></form>`)+`</div>`;
 $('#loginForm').onsubmit=act(async e=>{e.preventDefault();await api('/api/login','POST',formData(e.target));await refreshUser();const next=P.afterLogin;P.afterLogin=null;next?openPage(next.page,next.arg):openPage('dashboard')});
 $('#registerForm').onsubmit=act(async e=>{e.preventDefault();const r=await api('/api/register','POST',formData(e.target));e.target.reset();toast(r.message)});
};
pageViews.settings=async()=>{
 const d=await api('/api/dashboard');
 $('#content').innerHTML=head('Einstellungen',esc(P.user.username)+' · '+esc(P.user.guildRank))+`<div class="two-col">`+frame('Passwort ändern',`<form id="pwForm"><label>Aktuelles Passwort<input name="current" type="password" required autocomplete="current-password"></label><label>Neues Passwort<input name="next" type="password" required minlength="10" autocomplete="new-password"></label><button class="primary">Ändern</button><p><small class="muted">Danach meldest du dich neu an.</small></p></form>`)+frame('Hauptcharakter',`<form id="mainForm"><label>Wird im Forum und in der Mitgliederliste gezeigt<select name="mainCharacterId">${d.characters.map(c=>`<option value="${esc(c.id)}" ${c.id===d.user.mainCharacterId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><button class="primary" ${d.characters.length?'':'disabled'}>Speichern</button></form>`)+`</div>`+(can('members')?frame('',`<button class="subtle" onclick="openPage('admin')">Benutzer und Rechte verwalten</button>`):'');
 $('#pwForm').onsubmit=act(async e=>{e.preventDefault();await api('/api/me/password','PUT',formData(e.target));await refreshUser();openPage('login');toast('Passwort geändert. Bitte neu anmelden.')});
 $('#mainForm').onsubmit=act(async e=>{e.preventDefault();await api('/api/me/settings','PUT',{dashboard:d.user.dashboard,...formData(e.target)});await refreshUser();toast('Gespeichert.')});
};
pageViews.notifications=async()=>{
 const{notifications:n}=await api('/api/notifications');
 $('#content').innerHTML=head('Benachrichtigungen',`${n.filter(x=>!x.read_at).length} ungelesen`,`<button class="subtle" onclick="readAll()">Alle gelesen</button>`)+frame('',n.map(x=>`<div class="list-row ${x.read_at?'read':''}"><span>${esc(x.message)}<br><small class="muted">${timeText(x.created_at)}</small></span><span class="row-actions">${x.link?`<button class="subtle" onclick="followLink('${esc(x.link)}','${esc(x.id)}')">Öffnen</button>`:''}<button class="subtle" aria-label="Entfernen" onclick="dropNote('${esc(x.id)}')">×</button></span></div>`).join('')||emptyBox('Keine Benachrichtigungen.'));
};
const readAll=act(async()=>{await api('/api/notifications/read','POST',{});P.unread=0;redraw();drawNav()});
const dropNote=act(async id=>{await api('/api/notifications/'+id,'DELETE');await refreshUser();redraw();drawNav()});
const followLink=act(async(link,noteId)=>{closeNotes();if(noteId){await api('/api/notifications/read','POST',{id:noteId});await refreshUnread()}const[target,arg]=link.split(':');openPage(target,arg)});

/* Bell in the header: unread counter, a drop-down with the latest notifications, mark as read and remove. */
const noteDrop=document.createElement('div');noteDrop.id='noteDrop';noteDrop.className='note-drop';noteDrop.hidden=true;noteDrop.setAttribute('role','dialog');noteDrop.setAttribute('aria-label','Benachrichtigungen');document.body.append(noteDrop);
async function refreshUnread(){try{const{notifications:n}=await api('/api/notifications');P.notes=n;P.unread=n.filter(x=>!x.read_at).length}catch{}drawNav();if(!noteDrop.hidden)drawNotes()}
function placeNotes(){const b=$('#noteBell');if(!b)return closeNotes();const r=b.getBoundingClientRect(),w=Math.min(380,innerWidth-16);noteDrop.style.width=w+'px';noteDrop.style.left=Math.max(8,Math.min(innerWidth-w-8,r.right-w))+'px';noteDrop.style.top=(r.bottom+8)+'px'}
function drawNotes(){
 const n=(P.notes||[]).slice(0,15),unread=(P.notes||[]).filter(x=>!x.read_at).length;
 noteDrop.innerHTML=`<div class="note-drop-head"><strong>Benachrichtigungen</strong>${unread?`<button class="link" onclick="readAllNotes()">Alle als gelesen markieren</button>`:''}</div><div class="note-drop-list">${n.map(x=>`<div class="note-item ${x.read_at?'':'unread'}"><button class="note-open" onclick="${x.link?`followLink('${esc(x.link)}','${esc(x.id)}')`:`markNote('${esc(x.id)}')`}"><span>${esc(x.message)}</span><small>${timeText(x.created_at)}</small></button>${x.read_at?'':`<button class="note-mark" title="Als gelesen markieren" aria-label="Als gelesen markieren" onclick="markNote('${esc(x.id)}')">●</button>`}<button class="note-del" title="Entfernen" aria-label="Entfernen" onclick="removeNote('${esc(x.id)}')">×</button></div>`).join('')||'<p class="muted note-empty">Keine Benachrichtigungen.</p>'}</div><button class="note-drop-all" onclick="closeNotes();openPage('notifications')">Alle anzeigen</button>`;
 placeNotes()
}
async function toggleNotes(e){e?.stopPropagation();if(!noteDrop.hidden)return closeNotes();noteDrop.hidden=false;$('#noteBell')?.setAttribute('aria-expanded','true');drawNotes();await refreshUnread()}
function closeNotes(){noteDrop.hidden=true;$('#noteBell')?.setAttribute('aria-expanded','false')}
const markNote=act(async id=>{await api('/api/notifications/read','POST',{id});await refreshUnread();if(page==='notifications')redraw()});
const removeNote=act(async id=>{await api('/api/notifications/'+id,'DELETE');await refreshUnread();if(page==='notifications')redraw()});
const readAllNotes=act(async()=>{await api('/api/notifications/read','POST',{});await refreshUnread();if(page==='notifications')redraw()});
document.addEventListener('pointerdown',e=>{if(!noteDrop.hidden&&!e.target.closest('#noteDrop,#noteBell'))closeNotes()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!noteDrop.hidden){closeNotes();$('#noteBell')?.focus()}});
addEventListener('resize',()=>{if(!noteDrop.hidden)placeNotes()});addEventListener('scroll',()=>{if(!noteDrop.hidden)placeNotes()},{passive:true});

/* Live updates: while the tab is visible, /api/pulse is asked every few seconds. When the area of the open page changed,
   the page redraws itself quietly; never while someone is typing, has a dialog open or a menu up. */
const LIVE_PAGES={dungeons:'dungeons',raids:'raids',raid:'raids',dashboard:'raids',board:'forum',forum:'forum',category:'forum',topic:'forum',notifications:'notes'};
const LIVE_EVERY=6000;let liveSeen=null,liveTimer=null,liveBusy=false;
function userBusy(){const a=document.activeElement;if(a&&a.closest('#content')&&a.matches('input,textarea,select,[contenteditable]'))return true;if(document.querySelector('dialog[open]')||!noteDrop.hidden||(typeof AK!=='undefined'&&AK.menu))return true;return [...document.querySelectorAll('#content textarea,#content input[type=text],#content input[type=number],#content input:not([type])')].some(x=>x.value!==x.defaultValue)}
async function livePulse(){
 if(liveBusy||!P.user||document.visibilityState!=='visible')return;liveBusy=true;
 try{
  const p=await api('/api/pulse'),before=liveSeen;liveSeen=p.areas;
  if(p.unread!==P.unread||(before&&before.notes!==p.areas.notes))await refreshUnread();
  const title=document.title.replace(/^\(\d+\) /,'');document.title=(p.unread?`(${p.unread}) `:'')+title;
  const area=LIVE_PAGES[page];
  if(before&&area&&before[area]!==p.areas[area]&&pageViews[page]){if(userBusy())liveSeen={...p.areas,[area]:before[area]};else await openView(pageViews[page],{quiet:true})}
 }catch{}finally{liveBusy=false}
}
function startLive(){clearInterval(liveTimer);liveTimer=setInterval(livePulse,LIVE_EVERY);livePulse()}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')livePulse()});
startLive();

/* Characters and the link between the planner and the server */
pageViews.characters=async()=>{
 const{characters}=await api('/api/characters');
 $('#content').innerHTML=head('Meine Charaktere','Alle Systeme der Gilde nutzen diese Charaktere.',`<span class="pill">${characters.length}</span>`)+`<div class="card-grid">${characters.map(c=>`<div class="wow-frame char-card" style="--class:${CLASS_INFO[c.classId][1]}">${charName(c)}<p class="muted">Level ${c.level} · ${esc(c.race)} · ${esc(c.className)}${c.spec?' · '+esc(c.spec):''}</p><div class="row-actions"><button class="${P.activeChar?.id===c.id?'primary':'subtle'}" onclick="activateCharacter('${esc(c.id)}')">${P.activeChar?.id===c.id?'Aktiv im Planer':'Im Planer nutzen'}</button><button class="subtle" onclick="openPage('profile','${esc(c.id)}')">Profil</button><button class="subtle" onclick="editCharacter('${esc(c.id)}')">Bearbeiten</button><button class="subtle" onclick="deleteCharacter('${esc(c.id)}')">Löschen</button></div></div>`).join('')}</div>`+frame('Charakter hinzufügen',characterForm({}));
 P.chars=characters;bindCharacterForm()
};
function characterForm(c){return `<form id="charForm" data-id="${esc(c.id||'')}" class="form-grid"><label>Vorname<input name="name" required minlength="2" maxlength="12" value="${esc(c.name||'')}"></label><label>Nachname<input name="surname" ${c.id?'':'required'} minlength="2" maxlength="12" pattern="\p{L}+" title="Nur Buchstaben" value="${esc(c.surname||'')}"></label><label>Volk<select name="race" onchange="fillClasses(this.form)">${Object.keys(RACE_CLASSES).map(r=>`<option ${c.race===r?'selected':''}>${r}</option>`).join('')}</select></label><label>Klasse<select name="classId" data-value="${c.classId||''}"></select></label><label>Level<input name="level" type="number" min="1" max="60" value="${c.level||1}" required></label><label>Spezialisierung<input name="spec" maxlength="30" value="${esc(c.spec||'')}"></label><button class="primary">${c.id?'Speichern':'Hinzufügen'}</button></form>`}
function fillClasses(form){const sel=form.classId,wanted=sel.value||sel.dataset.value;sel.innerHTML=RACE_CLASSES[form.race.value].map(id=>`<option value="${id}" ${String(id)===wanted?'selected':''}>${CLASS_INFO[id][0]}</option>`).join('')}
function bindCharacterForm(){const f=$('#charForm');fillClasses(f);f.onsubmit=act(async e=>{e.preventDefault();const d=formData(f);d.classId=+d.classId;d.level=+d.level;if(!d.surname)delete d.surname;if(f.dataset.id)await api('/api/characters/'+f.dataset.id,'PUT',d);else await api('/api/characters','POST',d);toast('Charakter gespeichert.');await loadActiveCharacter();redraw()})}
function editCharacter(id){const f=$('#charForm').closest('section');f.innerHTML='<h3 class="wow-title">Charakter bearbeiten</h3>'+characterForm(P.chars.find(c=>c.id===id));bindCharacterForm();f.scrollIntoView({behavior:'smooth'})}
const deleteCharacter=act(async id=>{if(!confirm('Diesen Charakter mit Ausrüstung, Berufen und Anmeldungen löschen?'))return;await api('/api/characters/'+id,'DELETE');await loadActiveCharacter();redraw()});
function storedCharacter(){try{return localStorage.getItem('modcheck-active-char')}catch{return null}}
async function loadActiveCharacter(){if(!P.user)return;const{characters}=await api('/api/characters');P.chars=characters;P.activeChar=characters.find(c=>c.id===storedCharacter())||characters.find(c=>c.id===P.user.mainCharacterId)||characters[0]||null;if(P.activeChar)applyCharacter(P.activeChar)}
function applyCharacter(c){
 const items={};for(const[slot,id]of Object.entries(c.gear)){const i=itemCatalog.find(x=>x.id===id);if(i)items[slot]={id:i.id,name:i.name,quality:i.quality,type:i.type}}
 state.equipment=items;state.modelGender=c.gender?1:0;state.name=c.name;state.level=c.level;state.race=c.race;state.classId=c.classId;window.plannerLabel=[c.spec,c.className].filter(Boolean).join(' ').toUpperCase();if(typeof talentPlan==='function'){talentPlan().classId=c.classId;talentPlan().ranks[c.classId]={...c.talents}}
 skipSync=true;save();skipSync=false;sync()
}
const activateCharacter=act(async id=>{try{localStorage.setItem('modcheck-active-char',id)}catch{}api('/api/armory/active','POST',{characterId:id}).catch(()=>{});await loadActiveCharacter();toast(P.activeChar.name+' ist jetzt im Planer aktiv.');redraw()});
let skipSync=false,syncTimer=null;const oldSave=save;
save=function(){oldSave();if(skipSync||!P.activeChar||!P.user)return;clearTimeout(syncTimer);syncTimer=setTimeout(pushPlanner,600)};
async function pushPlanner(){const c=P.activeChar;if(!c)return;const gear=Object.fromEntries(Object.entries(state.equipment||{}).filter(([,v])=>v.id).map(([k,v])=>[k,v.id])),talents=state.talentPlan?.ranks?.[c.classId]||{};try{await api(`/api/characters/${c.id}/planner`,'PUT',{gear,talents});c.gear=gear;c.talents=talents}catch(e){toast('Planer nicht gespeichert: '+e.message)}}
pageViews.profile=async id=>{
 const p=await api(`/api/characters/${id}/profile`),c=p.character;
 const gear=await Promise.all(p.gear.map(async g=>({slot:g.slot,item:await loadTip('item',g.item_id).then(d=>d).catch(()=>null)})));
 $('#content').innerHTML=head(`<span style="color:${CLASS_INFO[c.classId][1]}">${esc(c.name)}</span>`,`Level ${c.level} · ${esc(c.race)} · ${esc(c.className)}${c.spec?' · '+esc(c.spec):''}`,`<span class="pill">${esc(p.owner.guildRank)}</span>`)+`<div class="two-col">`+frame('Ausrüstung',gear.map(g=>`<div class="list-row"><small class="muted">${SLOT_NAMES[g.slot]}</small>${g.item?itemLink({...g.item}):''}</div>`).join('')||emptyBox('Noch nichts angelegt.'))+frame('Berufe und Raids',p.professions.map(x=>`<div class="list-row"><span>${esc(x.profession)}${x.specialization?' · '+esc(x.specialization):''}</span><strong>${x.skill} / 300</strong></div>`).join('')+`<div class="list-row"><span>Dokumentierte Bosskills</span><strong>${p.raidKills}</strong></div>`)+`</div>`
};
pageViews.members=async()=>{
 const{members}=await api('/api/members');
 $('#content').innerHTML=head('Mitglieder','Die Gesichter hinter dem Banner.',`<span class="pill">${members.length}</span>`)+(can('members')?`<p><button class="subtle" onclick="openPage('admin')">Benutzer verwalten</button></p>`:'')+frame('',members.map(m=>`<div class="list-row"><span>${m.characters.length?m.characters.map(charName).join(' &nbsp; '):esc(m.username)}<br><small class="muted">${esc(m.username)}</small></span><span class="pill">${esc(m.guild_rank)}</span></div>`).join('')||emptyBox('Noch keine Mitglieder.'))
};
pageViews.admin=async()=>{
 const{users,permissions}=await api('/api/admin/users');
 const labels={raids:'Raids',kills:'Boss-Kills',announce:'Ankündigungen',moderate:'Forum',hall:'Hall of Fame',bis:'BiS-Listen',patches:'Patchdaten',members:'Mitglieder',freespins:'Automat ohne Limit'};
 $('#content').innerHTML=head('Verwaltung','Technische Rechte sind vom sichtbaren Gildenrang getrennt.')+users.map(u=>frame(esc(u.username),`<form class="form-grid" data-user="${esc(u.id)}"><label>Status<select name="status">${[['pending','Wartet'],['active','Aktiv'],['disabled','Gesperrt']].map(([v,n])=>`<option value="${v}" ${u.status===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Gildenrang<input name="guildRank" value="${esc(u.guild_rank)}" maxlength="30"></label>${isAdmin()?`<label class="inline-check" title="Taucht nicht in Mitgliederliste, Ranglisten und Umfrage-Zählung auf"><input type="checkbox" name="hidden" ${u.hidden?'checked':''}> Unsichtbar</label><label>Rolle<select name="role">${[['member','Mitglied'],['officer','Offizier'],['admin','Administrator']].map(([v,n])=>`<option value="${v}" ${u.role===v?'selected':''}>${n}</option>`).join('')}</select></label><fieldset class="perm-list"><legend>Rechte</legend>${permissions.map(p=>`<label><input type="checkbox" name="perm" value="${p}" ${u.permissions.includes(p)?'checked':''}> ${labels[p]}</label>`).join('')}</fieldset>`:''}<button class="primary">Speichern</button></form>`)).join('');
 document.querySelectorAll('[data-user]').forEach(f=>f.onsubmit=act(async e=>{e.preventDefault();const d=formData(f);delete d.perm;if(isAdmin()){d.permissions=[...f.querySelectorAll('[name=perm]:checked')].map(x=>x.value);d.hidden=!!f.querySelector('[name=hidden]')?.checked}else delete d.hidden;await api('/api/admin/users/'+f.dataset.user,'PUT',d);toast('Gespeichert.')}))
};

/* Home page additions */
async function drawHomeExtras(){
 try{
  const[s,n,p]=await Promise.all([api('/api/guild-summary'),api('/api/news'),api('/api/progress')]);if(page!=='home')return;
  const list=[...p.instances].sort((a,b)=>({10:0,40:1,20:2})[a.size]-({10:0,40:1,20:2})[b.size]);
  $('#homeShields').innerHTML=list.map(i=>`<button class="sw-shield-wrap" onclick="openPage('progress')" aria-label="${esc(i.name)}: ${i.defeated} von ${i.boss_count} Bossen"><div class="sw-shield-rim"><div class="sw-shield-face"><b>${i.defeated}/${i.boss_count}</b><span>${esc(i.name)}</span><small>${i.size} Spieler</small></div></div></button>`).join('');
  if(s.nextRaid){$('#homeCallTitle').textContent=s.nextRaid.name;$('#homeCallText').innerHTML=`${timeText(s.nextRaid.starts_at)} · <button class="subtle" onclick="openPage('raid','${esc(s.nextRaid.id)}')">Zum Raid</button>`}
  else if(s.lastKill){$('#homeCallTitle').textContent=`${s.lastKill.boss} liegt`;$('#homeCallText').textContent=`${s.lastKill.instance}, zuletzt besiegt am ${dateText(s.lastKill.at)}.`}
  $('#homeNews').innerHTML=n.news.slice(0,5).map(x=>`<a class="sw-news-link" href="${esc(x.link)}" target="_blank" rel="noopener"><img src="art/sword-h.svg" alt=""><span>${esc(x.title)}</span></a>`).join('')||emptyBox('Keine News geladen.')
 }catch{}
}
