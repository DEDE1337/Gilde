/* Talent calculator for all classes. Data comes from /api/talents; points live per class in state.talentPlan. */
let talentData=null,talentLoading=false,talentFailed=false,talentSelected=null;
const talentIndex=new Map();
function talentPlan(){const plan=state.talentPlan;if(!plan||typeof plan!=='object'||!plan.ranks)state.talentPlan={classId:1,ranks:{}};return state.talentPlan}
function classRanks(id=talentPlan().classId){return talentPlan().ranks[id]||={}}
function sumRanks(ranks){return Object.values(ranks).reduce((a,b)=>a+b,0)}
count=function(){return sumRanks(classRanks())};
function activeClass(){return talentData.classes.find(c=>c.id===talentPlan().classId)||talentData.classes[0]}
function treePoints(tree,ranks,beforeRow=Infinity){return tree.talents.reduce((n,t)=>n+(t.row<beforeRow?ranks[t.id]||0:0),0)}
function rulesHold(tree,t,ranks){return treePoints(tree,ranks,t.row)>=t.requiredPoints&&t.requires.every(r=>(ranks[r.id]||0)>=r.rank)}
function treeValid(tree,ranks){return tree.talents.every(t=>!ranks[t.id]||rulesHold(tree,t,ranks))}
function blockedReason(tree,t,ranks){
 if((ranks[t.id]||0)>=t.maxRank)return 'Höchster Rang erreicht.';
 if(count()>=budget())return 'Keine Talentpunkte mehr verfügbar.';
 const missing=t.requiredPoints-treePoints(tree,ranks,t.row);if(missing>0)return `Benötigt ${t.requiredPoints} Punkte in ${tree.name}.`;
 const need=t.requires.find(r=>(ranks[r.id]||0)<r.rank);return need?`Benötigt ${need.rank} ${need.rank===1?'Punkt':'Punkte'} in ${talentIndex.get(need.id)?.talent.name}.`:''
}
function legalizeClass(cls){
 const ranks=classRanks(cls.id),clean={};
 for(const tree of cls.trees){
  for(const t of tree.talents)if(ranks[t.id])clean[t.id]=Math.min(ranks[t.id],t.maxRank);
  for(let bad=true;bad;){bad=false;for(const t of tree.talents)if(clean[t.id]&&!rulesHold(tree,t,clean)){delete clean[t.id];bad=true}}
 }
 talentPlan().ranks[cls.id]=clean
}
function adoptOldPlan(){
 if(!Object.keys(state.talents||{}).length)return;
 const warrior=talentData.classes.find(c=>c.id===1),ranks=classRanks(1);
 if(!sumRanks(ranks))for(const tree of warrior.trees)for(const t of tree.talents)if(state.talents[t.nameEnus])ranks[t.id]=state.talents[t.nameEnus];
 state.talents={};legalizeClass(warrior);save()
}
function enforceTalentBudget(){let reset=false;for(const[id,ranks]of Object.entries(talentPlan().ranks))if(sumRanks(ranks)>budget()){talentPlan().ranks[id]={};reset=true}if(reset){save();toast('Talentplan zurückgesetzt: Das Punktebudget wurde kleiner.')}}
async function loadTalents(){
 if(talentData||talentLoading)return;talentLoading=true;talentFailed=false;
 try{const r=await fetch('/api/talents',{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();talentData=await r.json();
  for(const cls of talentData.classes)for(const tree of cls.trees)for(const talent of tree.talents)talentIndex.set(talent.id,{cls,tree,talent});
  for(const cls of talentData.classes)legalizeClass(cls);adoptOldPlan();save()}
 catch{talentFailed=true}
 talentLoading=false;if(page==='talents')drawTalents()
}
function selectClass(id){talentPlan().classId=id;talentSelected=null;save();drawTalents()}
function resetTree(id){const tree=activeClass().trees.find(t=>t.id===id),ranks=classRanks();for(const t of tree.talents)delete ranks[t.id];save();drawTalents()}
function resetClass(){talentPlan().ranks[activeClass().id]={};save();drawTalents()}
function changeRank(id,delta){
 const entry=talentIndex.get(id);if(!entry)return;const{tree,talent}=entry,ranks=classRanks(),rank=ranks[id]||0;talentSelected=id;
 if(delta>0){const reason=blockedReason(tree,talent,ranks);if(reason){showTalent(id);return toast(reason)}}
 else if(!rank)return showTalent(id);
 const next={...ranks,[id]:rank+delta};if(!next[id])delete next[id];
 if(delta<0&&!treeValid(tree,next)){showTalent(id);return toast('Wird von einer höheren Reihe oder einem Talent benötigt.')}
 talentPlan().ranks[activeClass().id]=next;save();drawTalents();document.querySelector(`[data-talent="${id}"]`)?.focus({preventScroll:true})
}
function talentDetail(id){
 const entry=talentIndex.get(id);if(!entry)return '<small>Talent anklicken oder mit der Maus darüberfahren. Klick vergibt einen Punkt, Rechtsklick nimmt ihn zurück.</small>';
 const{tree,talent:t}=entry,ranks=classRanks(),rank=ranks[id]||0,blocked=rank<t.maxRank?blockedReason(tree,t,ranks):'';
 return `<img src="${t.icon}" alt=""><div><span class="tag">${esc(tree.name)} · RANG ${rank} / ${t.maxRank}</span><h3>${esc(t.name)}</h3>${rank?`<p>${esc(t.descriptions[rank-1])}</p>`:''}${rank<t.maxRank?`<p>${rank?'<b>Nächster Rang:</b> ':''}${esc(t.descriptions[rank])}</p>`:''}${blocked?`<p class="talent-blocked">${esc(blocked)}</p>`:''}${t.locale==='enUS'?'<small>Für dieses Talent gibt es noch keinen deutschen Text.</small>':''}${(window.talentChanges?.[id]||[]).map(c=>`<p class="talent-blocked">Patch ${esc(c.version)}: ${c.before_text?`bisher „${esc(c.before_text)}“, `:''}jetzt „${esc(c.after_text)}“ <a href="${esc(c.source_url)}" target="_blank" rel="noopener nofollow">Quelle ↗</a></p>`).join('')}</div><div class="talent-controls"><button aria-label="${esc(t.name)} verringern" ${rank?'':'disabled'} onclick="changeRank(${id},-1)">−</button><button aria-label="${esc(t.name)} erhöhen" ${blocked||rank>=t.maxRank?'disabled':''} onclick="changeRank(${id},1)">+</button></div>`
}
function showTalent(id){const panel=$('#talentDetail');if(panel)panel.innerHTML=talentDetail(id)}
function talentLinks(tree,ranks){return tree.talents.flatMap(t=>t.requires.map(r=>{const from=tree.talents.find(x=>x.id===r.id);if(!from)return '';const x1=from.col*100+50,y1=from.row*100+50,x2=t.col*100+50,y2=t.row*100+50;return `<path class="${(ranks[r.id]||0)>=r.rank?'met':''}" d="M${x1} ${y1}L${x2} ${y1}L${x2} ${y2}"/>`})).join('')}
function talentNode(tree,t,ranks){
 const rank=ranks[t.id]||0,open=!blockedReason(tree,t,ranks),kind=rank>=t.maxRank?'maxed':rank?'active':open?'open':'locked';
 return `<button class="talent-node ${kind}" style="grid-row:${t.row+1};grid-column:${t.col+1}" data-talent="${t.id}" aria-label="${esc(t.name)}, Rang ${rank} von ${t.maxRank}" onclick="changeRank(${t.id},1)" oncontextmenu="event.preventDefault();changeRank(${t.id},-1)" onmouseenter="showTalent(${t.id})" onfocus="showTalent(${t.id})"><img src="${t.icon}" alt="" loading="lazy"><span>${rank}/${t.maxRank}</span>${window.talentChanges?.[t.id]?'<i title="Durch einen Patch geändert">!</i>':''}</button>`
}
function talentTree(tree,ranks){
 const rows=Math.max(...tree.talents.map(t=>t.row))+1;
 return `<section class="talent-tree" aria-label="Talentbaum ${esc(tree.name)}"><header><img src="${tree.icon}" alt=""><strong>${esc(tree.name)}</strong><span>${treePoints(tree,ranks)}</span><button class="subtle" aria-label="${esc(tree.name)} zurücksetzen" onclick="resetTree(${tree.id})">↺</button></header><div class="tree-grid" style="--rows:${rows};background-image:linear-gradient(#0b1930b0,#0b1930d0),url(${tree.background})"><svg viewBox="0 0 400 ${rows*100}" aria-hidden="true">${talentLinks(tree,ranks)}</svg>${tree.talents.map(t=>talentNode(tree,t,ranks)).join('')}</div></section>`
}
function drawTalents(){
 if(!talentData){$('#content').innerHTML=head('Die Talentwerkstatt','Alle Klassen und Talentbäume')+(talentFailed?'<div class="empty">Die Talentdaten konnten nicht geladen werden. <button class="subtle" onclick="loadTalents()">Erneut versuchen</button></div>':'<div class="empty">Talentdaten werden geladen …</div>');return loadTalents()}
 const cls=activeClass(),ranks=classRanks(cls.id),meta=talentData.meta;
 $('#content').innerHTML=head('Die Talentwerkstatt',`${esc(cls.name)} · ${cls.trees.reduce((n,t)=>n+t.talents.length,0)} Talente · ${cls.trees.map(t=>treePoints(t,ranks)).join(' / ')}`,`<span class="pill">${count()} / ${budget()} Punkte</span>`)+
 `<div class="class-tabs">${talentData.classes.map(c=>`<button class="class-tab ${c.id===cls.id?'selected':''}" style="--class:${c.color}" aria-pressed="${c.id===cls.id}" onclick="selectClass(${c.id})"><img src="${c.icon}" alt=""><span>${esc(c.name)}</span><small>${sumRanks(classRanks(c.id))}</small></button>`).join('')}</div>`+
 `<div class="toolbar"><button class="subtle" onclick="state.level=60;$('#level').value=60;save();render()">Auf Level 60 planen</button><button class="subtle" onclick="resetClass()">Klasse zurücksetzen</button><label style="margin:0">TALENTED LEGACY <select aria-label="Talented Legacy Ränge" onchange="setLegacy(this.value)">${[0,1,2,3,4,5].map(i=>`<option ${state.legacy==i?'selected':''}>${i}</option>`).join('')}</select></label><a href="https://www.wowhead.com/forever/talent-calc/${cls.slug}" target="_blank" rel="noopener">${esc(cls.name)} auf Wowhead ↗</a></div>`+
 (budget()?'':'<div class="notice">Talentpunkte gibt es ab Level 10. Mit „Auf Level 60 planen“ kannst du schon jetzt deinen Build entwerfen.</div>')+
 `<div class="talent-trees" style="--class:${cls.color}">${cls.trees.map(t=>talentTree(t,ranks)).join('')}</div><aside class="talent-detail" id="talentDetail" aria-live="polite">${talentDetail(talentSelected)}</aside>`+
 `<div class="notice">${meta?.live?`Talentdaten live von Wowhead Forever, abgerufen ${new Date(meta.fetchedAt).toLocaleString('de-DE')}.`:`Talentdaten aus dem gespeicherten Stand vom ${esc(talentData.snapshot)}.`} Die Werkstatt prüft Punktekosten, Reihen und Talentabhängigkeiten; sie berechnet keinen Schaden. Dein Plan wird pro Klasse in diesem Browser gespeichert.</div>`
}
const oldRenderTalents=render;render=function(){enforceTalentBudget();oldRenderTalents();if(page==='talents')drawTalents()};
const oldTalentImporter=importState;importState=async function(file){if(!file)return;const text=await file.text();const before=state;await oldTalentImporter({text:async()=>text});if(state===before)return;let plan;try{plan=JSON.parse(text).talentPlan}catch{}const ranks={};for(const[cid,list]of Object.entries(plan?.ranks||{})){if(!Number.isInteger(+cid)||!list||typeof list!=='object')continue;ranks[cid]=Object.fromEntries(Object.entries(list).filter(([id,n])=>Number.isInteger(+id)&&Number.isInteger(n)&&n>0))}state.talentPlan={classId:Number.isInteger(plan?.classId)?plan.classId:1,ranks};try{const raw=JSON.parse(text).classId;if(CLASS_INFO[raw])state.classId=raw}catch{}if(talentData){for(const cls of talentData.classes)legalizeClass(cls);adoptOldPlan()}save();render()};
