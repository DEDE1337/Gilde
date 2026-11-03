/* WoW-style character select and creation after login. The 3D model uses the same viewer as the planner; appearance is {optionId: choiceId} from its customization data. */
const RACE_LOOK={Mensch:{model:1,slug:'human'},Zwerg:{model:5,slug:'dwarf'},Nachtelf:{model:7,slug:'nightelf'},Gnom:{model:13,slug:'gnome'},Skyborne:{model:0,slug:''}};
const LOOK_NAMES={'Skin Color':'Hautfarbe','Face':'Gesicht','Hair Style':'Frisur','Hair Color':'Haarfarbe','Facial Hair':'Gesichtsbehaarung','Piercings':'Piercings','Earrings':'Ohrringe','Features':'Merkmale','Markings':'Zeichnungen'};
const CS_ENTERED='modcheck-char-entered';
const cs={mode:'select',chars:[],sel:null,draft:null,viewer:null,modelId:null,options:[],token:0};
function charFaceIcon(c){const look=RACE_LOOK[c?.race];return look?.slug?`race_${look.slug}_${c.gender?'female':'male'}`:'ability_druid_flightform'}
const csEntered=()=>{try{return sessionStorage.getItem(CS_ENTERED)==='1'}catch{return true}};
const csMark=v=>{try{v?sessionStorage.setItem(CS_ENTERED,'1'):sessionStorage.removeItem(CS_ENTERED)}catch{}};

async function openCharScreen(){
 if(!P.user||document.getElementById('charScreen'))return;
 const{characters}=await api('/api/characters');cs.chars=characters;
 cs.sel=(P.activeChar&&characters.some(c=>c.id===P.activeChar.id))?P.activeChar.id:characters[0]?.id||null;
 cs.mode=characters.length?'select':'create';if(cs.mode==='create')csNewDraft();
 const el=document.createElement('div');el.id='charScreen';el.className='cs';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Charakterauswahl');
 el.innerHTML=`<div class="cs-top"><img src="art/modcheck-crest.svg" alt=""><span>ModCheck</span><small>Realm Forever · Allianz</small></div><div class="cs-stage"><div class="cs-glow" aria-hidden="true"></div><div id="csModel" class="cs-model"></div><p id="csStatus" class="cs-status"></p><div id="csPlate" class="cs-plate"></div></div><div id="csLeft" class="cs-panel cs-left"></div><div id="csRight" class="cs-panel cs-right"></div><div id="csBottom" class="cs-bottom"></div>`;
 document.body.append(el);document.documentElement.classList.add('cs-open');csRender()
}
function closeCharScreen(){csDispose();document.getElementById('charScreen')?.remove();document.documentElement.classList.remove('cs-open')}
function csDispose(){cs.token++;if(cs.viewer){try{cs.viewer.destroy()}catch{}}cs.viewer=null;cs.modelId=null;cs.options=[]}
function csNewDraft(){const race=['Mensch','Zwerg','Nachtelf','Gnom'][Math.floor(Math.random()*4)];cs.draft={race,gender:Math.random()<.5?0:1,classId:RACE_CLASSES[race][0],appearance:{},name:'',surname:''}}
const csChar=()=>cs.chars.find(c=>c.id===cs.sel);
function csLine(c){return `Stufe ${+c.level} ${esc(c.race)} ${esc(CLASS_INFO[c.classId]?.[0]||'')}`}

function csRender(){
 const root=document.getElementById('charScreen');if(!root)return;root.dataset.mode=cs.mode;
 const left=root.querySelector('#csLeft'),right=root.querySelector('#csRight'),bottom=root.querySelector('#csBottom'),plate=root.querySelector('#csPlate');
 if(cs.mode==='select'){
  const c=csChar();left.innerHTML='';
  right.innerHTML=`<h2>Charaktere</h2><div class="cs-list">${cs.chars.map(x=>`<button type="button" class="cs-char ${x.id===cs.sel?'on':''}" onclick="csSelect('${esc(x.id)}')" ondblclick="csEnter()"><img src="icons/${charFaceIcon(x)}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><span><strong style="color:${CLASS_INFO[x.classId]?.[1]||'#fff'}">${esc(x.fullName||x.name)}</strong><small>${csLine(x)}</small></span></button>`).join('')}</div>${cs.chars.length<10?`<button type="button" class="cs-new" onclick="csCreate()">＋ Neuen Charakter erstellen</button>`:''}`;
  plate.innerHTML=c?`<strong style="color:${CLASS_INFO[c.classId]?.[1]||'#fff'}">${esc(c.fullName||c.name)}</strong><small>${csLine(c)}</small>`:'';
  bottom.innerHTML=`<div class="cs-side"><button type="button" class="subtle" onclick="csDelete()">Charakter löschen</button></div><button type="button" class="primary cs-enter" onclick="csEnter()" ${c?'':'disabled'}>Betreten</button><div class="cs-side right"><button type="button" class="subtle" onclick="csSkip()">Ohne Charakter weiter</button><button type="button" class="subtle" onclick="logout()">Abmelden</button></div>`;
  if(c)csModel(c.race,c.gender||0,c.appearance||{})
 }else{
  const d=cs.draft;
  left.innerHTML=`<h2>Volk</h2><div class="cs-grid races">${Object.keys(RACE_CLASSES).map(r=>`<button type="button" class="cs-pick ${d.race===r?'on':''}" onclick="csSetRace('${r}')"><img src="icons/${charFaceIcon({race:r,gender:d.gender})}.jpg" alt="" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'"><span>${r}</span></button>`).join('')}</div>
   <h2>Geschlecht</h2><div class="cs-gender"><button type="button" class="cs-pick ${d.gender===0?'on':''}" onclick="csSetGender(0)">♂ Männlich</button><button type="button" class="cs-pick ${d.gender===1?'on':''}" onclick="csSetGender(1)">♀ Weiblich</button></div>
   <h2>Klasse</h2><div class="cs-grid classes">${Object.keys(CLASS_INFO).map(id=>{const ok=RACE_CLASSES[d.race].includes(+id);return `<button type="button" class="cs-pick ${d.classId===+id?'on':''}" style="--c:${CLASS_INFO[id][1]}" ${ok?'':'disabled'} title="${CLASS_INFO[id][0]}${ok?'':' – nicht für '+d.race}" onclick="csSetClass(${id})"><img src="talent-icons/classicon_${CLASS_INFO[id][2]}.jpg" alt=""><span>${CLASS_INFO[id][0]}</span></button>`}).join('')}</div>`;
  csRenderLook();
  plate.innerHTML=`<strong style="color:${CLASS_INFO[d.classId]?.[1]}">${esc([d.name,d.surname].filter(Boolean).join(' ')||'Neuer Held')}</strong><small>Stufe 1 ${esc(d.race)} ${CLASS_INFO[d.classId][0]}</small>`;
  bottom.innerHTML=`<div class="cs-side">${cs.chars.length?`<button type="button" class="subtle" onclick="csBack()">Zurück</button>`:`<button type="button" class="subtle" onclick="logout()">Abmelden</button>`}</div><form class="cs-name" onsubmit="csCreateChar(event)"><input id="csName" maxlength="12" placeholder="Vorname" value="${esc(d.name)}" autocomplete="off" oninput="csNameInput(this,'name')" aria-label="Vorname"><input id="csSurname" maxlength="12" placeholder="Nachname" value="${esc(d.surname)}" autocomplete="off" oninput="csNameInput(this,'surname')" aria-label="Nachname"><button class="primary">Charakter erstellen</button></form><div class="cs-side right"></div>`;
  csModel(d.race,d.gender,d.appearance)
 }
}
function csRenderLook(){
 const right=document.getElementById('csRight');if(!right||cs.mode!=='create')return;
 const rows=cs.options.map(o=>{const cur=cs.draft.appearance[o.Id],i=Math.max(0,o.Choices.findIndex(c=>c.Id===cur));return `<div class="cs-opt"><button type="button" onclick="csStep(${o.Id},-1)" aria-label="${esc(LOOK_NAMES[o.Name]||o.Name)} zurück">‹</button><span><small>${esc(LOOK_NAMES[o.Name]||o.Name)}</small><b>${i+1} / ${o.Choices.length}</b></span><button type="button" onclick="csStep(${o.Id},1)" aria-label="${esc(LOOK_NAMES[o.Name]||o.Name)} weiter">›</button></div>`}).join('');
 right.innerHTML=`<h2>Aussehen</h2>${rows||`<p class="cs-hint">${RACE_LOOK[cs.draft.race]?.model?'Aussehen wird geladen …':'Für Skyborne gibt es noch kein 3D-Modell, also auch keine Frisuren. Der Charakter lässt sich trotzdem erstellen.'}</p>`}${rows?`<button type="button" class="cs-new" onclick="csRandom()">🎲 Zufälliges Aussehen</button>`:''}`
}

/* 3D model */
async function csModel(race,gender,appearance){
 const host=document.getElementById('csModel'),status=document.getElementById('csStatus');if(!host)return;
 const look=RACE_LOOK[race],id=look?.model?look.model+gender:0;
 if(!id){csDispose();host.innerHTML=`<div class="cs-nomodel"><img src="icons/${charFaceIcon({race,gender})}.jpg" alt=""><p>${esc(race)}: noch kein 3D-Modell verfügbar</p></div>`;status.textContent='';csRenderLook();return}
 if(cs.viewer&&cs.modelId===id){csApply(appearance);return}
 csDispose();const token=cs.token;cs.modelId=id;host.replaceChildren();status.textContent='Modell wird geladen …';
 try{
  const gl=document.createElement('canvas').getContext('webgl2');if(!gl)throw new Error('Dein Browser unterstützt kein WebGL2, deshalb gibt es hier nur die Vorschau ohne 3D.');
  await loadViewerLibraries();if(token!==cs.token)return;
  cs.viewer=new window.ZamModelViewer({type:2,contentPath:new URL('/model/',location.href).href,container:window.jQuery('#csModel'),aspect:Math.max(.4,host.clientWidth/Math.max(1,host.clientHeight)),hd:false,dataEnv:'classic',env:'classic',gameDataEnv:'classic',models:{id,type:16},items:[],physics:false});
  for(let i=0;i<120;i++){const a=cs.viewer?.renderer?.actors?.[0];if(token!==cs.token)return;if(a?.isLoaded?.()){cs.options=csPlayerOptions(a.getCustomizationOptions(true)||[]);status.textContent='Ziehen zum Drehen';
   // A new character starts on the first choice of every option, so the counters and the model agree.
   if(cs.mode==='create'&&appearance===cs.draft?.appearance)for(const o of cs.options)if(!o.Choices.some(c=>c.Id===appearance[o.Id]))appearance[o.Id]=o.Choices[0].Id;
   csApply(appearance);try{cs.viewer.method('setAnimation',['Stand'])}catch{}csRenderLook();return}await new Promise(r=>setTimeout(r,250))}
  throw new Error('Das Modell braucht zu lange. Die Auswahl funktioniert trotzdem.')
 }catch(e){if(token!==cs.token)return;csDispose();host.innerHTML=`<div class="cs-nomodel"><img src="icons/${charFaceIcon({race,gender})}.jpg" alt=""><p>${esc(e.message)}</p></div>`;status.textContent='';csRenderLook()}
}
// Requirement 12 marks NPC-only choices (e.g. skins without underwear) in every classic race file; players never get them.
const NPC_ONLY_REQUIREMENT=12;
function csPlayerOptions(options){return options.map(o=>({...o,Choices:(o.Choices||[]).filter(c=>c.CustReqId!==NPC_ONLY_REQUIREMENT)})).filter(o=>o.Choices.length>1)}
function csApply(appearance){const a=cs.viewer?.renderer?.actors?.[0];if(!a)return;const options=Object.entries(appearance||{}).filter(([o])=>cs.options.some(x=>x.Id===+o)).map(([o,c])=>({optionId:+o,choiceId:+c}));if(!options.length)return;try{a.setAppearance({options,sheathMain:-1,sheathOff:-1})}catch(e){console.warn('Aussehen:',e.message)}}

/* select mode */
function csSelect(id){cs.sel=id;csRender()}
const csEnter=act(async()=>{const c=csChar();if(!c)return;try{localStorage.setItem('modcheck-active-char',c.id)}catch{}csMark(true);closeCharScreen();await loadActiveCharacter();drawNav();redraw();toast(`Willkommen zurück, ${c.name}!`);setTimeout(()=>typeof checkPollPopup==='function'&&checkPollPopup(),800)});
function csSkip(){csMark(true);closeCharScreen();setTimeout(()=>typeof checkPollPopup==='function'&&checkPollPopup(),500)}
const csDelete=act(async()=>{const c=csChar();if(!c)return;const typed=prompt(`Zum Löschen den Vornamen „${c.name}“ eintippen. Ausrüstung, Berufe und Anmeldungen gehen dabei verloren.`);if(typed===null)return;if(typed.trim()!==c.name)return toast('Name stimmt nicht, nichts gelöscht.');await api('/api/characters/'+encodeURIComponent(c.id),'DELETE');cs.chars=cs.chars.filter(x=>x.id!==c.id);cs.sel=cs.chars[0]?.id||null;if(!cs.chars.length){cs.mode='create';csNewDraft()}csDispose();csRender();await loadActiveCharacter();drawNav();toast(`${c.fullName||c.name} wurde gelöscht.`)});

/* create mode */
function csCreate(){cs.mode='create';csNewDraft();csDispose();csRender()}
function csBack(){cs.mode='select';csDispose();csRender()}
function csSetRace(r){const d=cs.draft;d.race=r;d.appearance={};if(!RACE_CLASSES[r].includes(d.classId))d.classId=RACE_CLASSES[r][0];csRender()}
function csSetGender(g){cs.draft.gender=g;cs.draft.appearance={};csRender()}
function csSetClass(id){if(!RACE_CLASSES[cs.draft.race].includes(+id))return;cs.draft.classId=+id;csRender()}
function csStep(optionId,dir){const o=cs.options.find(x=>x.Id===optionId);if(!o)return;const cur=Math.max(0,o.Choices.findIndex(c=>c.Id===cs.draft.appearance[optionId]));cs.draft.appearance[optionId]=o.Choices[(cur+dir+o.Choices.length)%o.Choices.length].Id;csApply(cs.draft.appearance);csRenderLook()}
function csRandom(){for(const o of cs.options)cs.draft.appearance[o.Id]=o.Choices[Math.floor(Math.random()*o.Choices.length)].Id;csApply(cs.draft.appearance);csRenderLook()}
function csNameInput(el,field){const v=el.value.replace(/[^\p{L}]/gu,'').slice(0,12);el.value=v?v[0].toLocaleUpperCase('de')+v.slice(1).toLocaleLowerCase('de'):'';cs.draft[field]=el.value;const s=document.querySelector('#csPlate strong');if(s)s.textContent=[cs.draft.name,cs.draft.surname].filter(Boolean).join(' ')||'Neuer Held'}
const csCreateChar=act(async e=>{
 e.preventDefault();const d=cs.draft;if(d.name.length<2||d.surname.length<2)return toast('Vor- und Nachname brauchen je 2 bis 12 Buchstaben. Das ist neu in Forever.');
 const appearance=Object.fromEntries(Object.entries(d.appearance).filter(([o])=>cs.options.some(x=>x.Id===+o)));
 const{id}=await api('/api/characters','POST',{name:d.name,surname:d.surname,race:d.race,classId:d.classId,level:1,gender:d.gender,appearance});
 cs.chars=(await api('/api/characters')).characters;cs.sel=id;cs.mode='select';csDispose();csRender();await loadActiveCharacter();toast(`${d.name} ${d.surname} ist bereit für Azeroth!`)
});

/* Show the screen once per browser session after login; the face icon in the header reopens it. */
function maybeCharScreen(){if(!P.user){csMark(false);return}if(csEntered()||document.getElementById('charScreen'))return;if(document.querySelector('dialog[open]'))return setTimeout(maybeCharScreen,2500);openCharScreen().catch(e=>console.warn('Charakterauswahl:',e.message))}
const refreshUserBeforeChars=refreshUser;
refreshUser=async(...a)=>{const r=await refreshUserBeforeChars(...a);setTimeout(maybeCharScreen,300);return r};
document.addEventListener('keydown',e=>{if(!document.getElementById('charScreen'))return;if(e.key==='Enter'&&cs.mode==='select'&&!e.target.closest('input,button'))csEnter()});
setTimeout(maybeCharScreen,1200);
