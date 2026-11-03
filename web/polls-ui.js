/* Guild polls: page, results and the login popup. Totals add website votes and the counts read back from the Discord poll. */
const RACE_ICONS={Mensch:'race_human_male',Zwerg:'race_dwarf_male',Nachtelf:'race_nightelf_male',Gnom:'race_gnome_male',Skyborne:'ability_druid_flightform'};
const CLASS_BY_NAME=Object.fromEntries(Object.entries(CLASS_INFO).map(([cid,c])=>[c[0],cid]));
const pollTotals=p=>p.options.map((_,i)=>(p.web[i]||0)+(p.discord[i]||0));
function pollFace(p,name){
 const cid=p.kind==='class'&&CLASS_BY_NAME[name];
 if(cid)return{icon:`talent-icons/classicon_${CLASS_INFO[cid][2]}.jpg`,color:CLASS_INFO[cid][1]};
 if(p.kind==='race'&&RACE_ICONS[name])return{icon:`icons/${RACE_ICONS[name]}.jpg`,color:'#ffb347'};
 return{icon:p.kind==='text'?'':'icons/inv_misc_questionmark.jpg',color:'#ffb347'}
}
const pollIcon=src=>src?`<img src="${src}" alt="" loading="lazy" onerror="this.onerror=null;this.src='icons/inv_misc_questionmark.jpg'">`:'';
function pollEnds(p){const ms=new Date(p.closesAt)-Date.now();if(!p.open)return 'Beendet';const h=Math.floor(ms/36e5);return h>=48?`Noch ${Math.floor(h/24)} Tage`:h>=1?`Noch ${h} Std.`:'Endet gleich'}
function pollChoices(p,where){
 return `<div class="poll-choices ${p.multi?'multi':''}" data-poll="${esc(p.id)}">${p.options.map((o,i)=>{const f=pollFace(p,o);return `<button type="button" class="poll-choice" style="--c:${f.color}" data-i="${i}" aria-pressed="false" onclick="pollPick(this,'${where}')">${pollIcon(f.icon)}<span>${esc(o)}</span></button>`}).join('')}</div>${p.multi?`<button class="primary poll-send" onclick="pollSend('${esc(p.id)}','${where}')">Abstimmen</button>`:''}`
}
function pollResults(p){
 const totals=pollTotals(p),sum=totals.reduce((a,b)=>a+b,0),top=Math.max(...totals),web=p.web.reduce((a,b)=>a+b,0),dc=p.discord.reduce((a,b)=>a+b,0);
 const rows=p.options.map((o,i)=>({o,i,n:totals[i]})).sort((a,b)=>b.n-a.n||a.i-b.i);
 return `<ol class="poll-results">${rows.map(({o,i,n})=>{const f=pollFace(p,o),pct=sum?Math.round(n/sum*100):0;return `<li class="${n&&n===top?'winner':''} ${p.mine.includes(i)?'mine':''}" style="--c:${f.color};--w:${pct}%">${pollIcon(f.icon)}<span class="poll-label">${esc(o)}${p.mine.includes(i)?' <em>Deine Wahl</em>':''}</span><span class="poll-pct">${pct}%</span><span class="poll-bar"><i></i></span><small>${n} ${n===1?'Stimme':'Stimmen'}${p.discord[i]?` · ${p.discord[i]} aus Discord`:''}</small></li>`}).join('')}</ol>
 <p class="poll-meta">${sum} ${sum===1?'Stimme':'Stimmen'} · ${web} Website${p.onDiscord?` · ${dc} Discord`:''}${p.onDiscord&&p.discordSyncedAt?` · Discord-Stand ${timeText(p.discordSyncedAt)}`:''}</p>`
}
function pollCard(p){
 const voted=p.mine.length>0,showResults=voted||!p.open;
 return `<article class="poll-card ${p.open?'':'closed'}" id="poll-${esc(p.id)}">
  <header><span class="poll-badge">${p.open?'Läuft':'Beendet'}</span>${p.onDiscord?'<span class="poll-badge discord">Auch im Discord</span>':''}${p.multi?'<span class="poll-badge">Mehrfachwahl</span>':''}<span class="poll-ends">${pollEnds(p)}</span></header>
  <h3>${esc(p.question)}</h3>
  ${showResults?pollResults(p):pollChoices(p,'page')}
  <footer>${voted&&p.open?`<button class="subtle" onclick="pollRevote('${esc(p.id)}')">Stimme ändern</button>`:''}${can('announce')?`${p.open?`<button class="subtle" onclick="pollClose('${esc(p.id)}')">Beenden</button>`:''}<button class="subtle danger" onclick="pollDelete('${esc(p.id)}')">Löschen</button>`:''}</footer>
 </article>`
}
function pollForm(){
 const end=toLocalInput(new Date(Date.now()+7*864e5));
 return `<details class="poll-new"><summary>＋ Neue Umfrage starten</summary>`+frame('',`<form id="pollForm" class="form-grid poll-form">
  <label class="wide">Frage<input name="question" required minlength="5" maxlength="300" placeholder="Welche Klasse spielst du in Forever?"></label>
  <label>Antworten<select name="kind" onchange="document.getElementById('pollOptions').hidden=this.value!=='text'"><option value="text">Eigene Antworten</option><option value="class">Alle Klassen</option><option value="race">Alle Völker</option></select></label>
  <label>Endet am<input type="datetime-local" name="closesAt" value="${end}" required></label>
  <label class="wide" id="pollOptions">Eine Antwort pro Zeile (2 bis 10, je höchstens 55 Zeichen)<textarea name="options" rows="5" placeholder="Ja&#10;Nein&#10;Vielleicht"></textarea></label>
  <label class="check"><input type="checkbox" name="multi"> Mehrere Antworten erlauben</label>
  <label class="check"><input type="checkbox" name="popup" checked> Nach dem Login als Popup zeigen</label>
  <button class="primary">Umfrage starten</button></form>`)+`</details>`
}
pageViews.polls=async()=>{
 const{polls}=await api('/api/polls');P.polls=polls;
 $('#content').innerHTML=head('Abstimmungen','Eure Stimme zählt – auf der Website und im Discord.',`<span class="pill">${polls.filter(p=>p.open).length} offen</span>`)+(can('announce')?pollForm():'')+(polls.length?`<div class="poll-list">${polls.map(pollCard).join('')}</div>`:emptyBox('Noch keine Umfragen. Die Gildenleitung startet bald eine.'));
 const f=$('#pollForm');if(f)f.onsubmit=act(async e=>{e.preventDefault();const d=formData(f);const r=await api('/api/polls','POST',{question:d.question,kind:d.kind,options:String(d.options||'').split('\n'),multi:!!d.multi,popup:!!d.popup,closesAt:new Date(d.closesAt).toISOString()});toast(r.onDiscord?'Umfrage gestartet und im Discord gepostet.':'Umfrage gestartet. Discord ist nicht verbunden.');openPage('polls')});
 requestAnimationFrame(()=>document.querySelectorAll('.poll-results').forEach(el=>el.classList.add('grow')))
};
function pollFind(pid){return(P.polls||[]).find(p=>p.id===pid)}
function pollPick(btn,where){
 const box=btn.closest('.poll-choices'),p=pollFind(box.dataset.poll);if(!p)return;
 if(p.multi){btn.setAttribute('aria-pressed',btn.getAttribute('aria-pressed')==='true'?'false':'true');return}
 btn.setAttribute('aria-pressed','true');pollVote(p.id,[+btn.dataset.i],where)
}
function pollSend(pid,where){const box=document.querySelector(`.poll-choices[data-poll="${CSS.escape(pid)}"]`);const picks=[...box.querySelectorAll('[aria-pressed="true"]')].map(b=>+b.dataset.i);if(!picks.length)return toast('Bitte wähle mindestens eine Antwort.');pollVote(pid,picks,where)}
const pollVote=act(async(pid,options,where)=>{
 const{poll}=await api(`/api/polls/${encodeURIComponent(pid)}/vote`,'POST',{options});
 P.polls=(P.polls||[]).map(p=>p.id===poll.id?poll:p);if(!pollFind(poll.id))P.polls.push(poll);
 if(typeof SlotSound!=='undefined')SlotSound.coins(3);
 if(where==='popup')return pollPopupResult(poll);
 const card=document.getElementById('poll-'+poll.id);if(card){card.outerHTML=pollCard(poll);requestAnimationFrame(()=>document.querySelector(`#poll-${CSS.escape(poll.id)} .poll-results`)?.classList.add('grow'))}
});
function pollRevote(pid){const p=pollFind(pid);if(!p)return;const card=document.getElementById('poll-'+pid);card.querySelector('.poll-results').outerHTML=pollChoices(p,'page');card.querySelector('.poll-meta')?.remove()}
const pollClose=act(async pid=>{if(!confirm('Umfrage jetzt beenden? Die Discord-Umfrage läuft bis zu ihrem eigenen Ende weiter.'))return;await api(`/api/polls/${encodeURIComponent(pid)}/close`,'POST');openPage('polls')});
const pollDelete=act(async pid=>{if(!confirm('Umfrage mit allen Stimmen löschen? Die Nachricht im Discord musst du dort selbst löschen.'))return;await api(`/api/polls/${encodeURIComponent(pid)}`,'DELETE');openPage('polls')});

/* Login popup: open popup polls the member has not answered yet, one after another. "Später" hides a poll for this browser session. */
const pollSkipped=pid=>{try{return sessionStorage.getItem('modcheck-poll-later-'+pid)==='1'}catch{return false}};
async function checkPollPopup(){
 if(!P.user||document.querySelector('.poll-dialog'))return;
 if(document.querySelector('dialog[open],#charScreen'))return setTimeout(checkPollPopup,3000);
 try{P.polls=(await api('/api/polls')).polls}catch{return}
 const next=P.polls.filter(p=>p.open&&p.popup&&!p.mine.length&&!pollSkipped(p.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];if(next)pollPopup(next)
}
function pollPopup(p){
 const left=P.polls.filter(x=>x.open&&x.popup&&!x.mine.length&&!pollSkipped(x.id)).length;
 const d=document.createElement('dialog');d.className='poll-dialog';d.setAttribute('aria-labelledby','pollDialogTitle');
 d.innerHTML=`<img class="poll-crest" src="art/modcheck-crest.svg" alt=""><p class="poll-eyebrow">Umfrage der Gilde${left>1?` · ${left} offen`:''}</p><h2 id="pollDialogTitle">${esc(p.question)}</h2><div class="poll-dialog-body">${pollChoices(p,'popup')}</div><div class="poll-dialog-actions"><button class="subtle" onclick="pollLater('${esc(p.id)}')">Später</button></div>`;
 d.addEventListener('cancel',e=>{e.preventDefault();pollLater(p.id)});
 document.body.append(d);d.showModal()
}
function pollLater(pid){try{sessionStorage.setItem('modcheck-poll-later-'+pid,'1')}catch{}pollPopupClose(false)}
function pollPopupClose(again=true){document.querySelector('.poll-dialog')?.remove();if(again)setTimeout(checkPollPopup,250)}
function pollPopupResult(p){
 const d=document.querySelector('.poll-dialog');if(!d)return;
 d.querySelector('.poll-eyebrow').textContent='Danke für deine Stimme!';
 d.querySelector('.poll-dialog-body').innerHTML=pollResults(p);
 const more=P.polls.some(x=>x.id!==p.id&&x.open&&x.popup&&!x.mine.length&&!pollSkipped(x.id));
 d.querySelector('.poll-dialog-actions').innerHTML=`<button class="subtle" onclick="pollPopupClose(false);openPage('polls')">Alle Umfragen</button><button class="primary" onclick="pollPopupClose(${more})">${more?'Nächste Frage':'Schließen'}</button>`;
 requestAnimationFrame(()=>d.querySelector('.poll-results')?.classList.add('grow'))
}
// Startup already ran refreshUser before this file loaded; later logins go through the wrapper.
const refreshUserBeforePolls=refreshUser;
refreshUser=async(...a)=>{const r=await refreshUserBeforePolls(...a);setTimeout(checkPollPopup,600);return r};
setTimeout(checkPollPopup,1500);
