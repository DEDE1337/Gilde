/* Roulette in the Spielunke. The server draws the number and books the gold; the wheel only shows the result. */
const WHEEL_ORDER=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const WHEEL_RED=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const pocketColor=n=>n===0?'green':WHEEL_RED.has(n)?'red':'black';
const COLOR_NAMES={red:'Rot',black:'Schwarz',green:'Grün'},WHEEL_MS=5200;
let rouletteBet='red',rouletteAmount=10,wheelAngle=0,wheelBusy=false;
function wheelSvg(){
 const step=360/37,point=(r,deg)=>{const a=(deg-90)*Math.PI/180;return `${(r*Math.cos(a)).toFixed(2)} ${(r*Math.sin(a)).toFixed(2)}`},fill={red:'#a81a16',black:'#14161c',green:'#1c7a4b'};
 const pockets=WHEEL_ORDER.map((n,i)=>{const a=i*step-step/2,b=a+step;return `<path d="M${point(196,a)} A196 196 0 0 1 ${point(196,b)} L${point(136,b)} A136 136 0 0 0 ${point(136,a)} Z" fill="${fill[pocketColor(n)]}" stroke="#e8b64c" stroke-width="1.2"/><text transform="rotate(${i*step}) translate(0 -168)" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">${n}</text>`}).join('');
 return `<svg class="wheel-svg" id="wheelDisc" viewBox="-200 -200 400 400" aria-hidden="true"><circle r="199" fill="#e8b64c"/>${pockets}<circle r="136" fill="#3a2410" stroke="#e8b64c" stroke-width="3"/><circle r="104" fill="#14171f" stroke="#7a5a2a" stroke-width="2"/></svg>`
}
const numberChip=n=>`<span class="num-chip chip-${esc(n.color)}">${+n.number}</span>`;
function showRouletteWin(r){
 const dialog=document.createElement('dialog');dialog.className='win-dialog q-legendary';dialog.setAttribute('aria-labelledby','winTitle');
 dialog.innerHTML=`<div class="win-coins" aria-hidden="true">${Array.from({length:28},(_,i)=>`<i style="left:${Math.random()*100}%;animation-delay:${(i*.09).toFixed(2)}s;animation-duration:${(1.5+Math.random()*1.2).toFixed(2)}s"></i>`).join('')}</div><img class="win-crest" src="art/modcheck-crest.svg" alt=""><p class="win-rarity">Die Null!</p><h2 id="winTitle">Glückwunsch, du hast gewonnen!</h2><p class="win-name">Grün hat gezahlt, Einsatz mal 36</p><p class="win-gold">+${r.payout} Gildengold</p><button class="primary" onclick="this.closest('dialog').remove()">Einsacken</button>`;
 document.body.append(dialog);dialog.showModal()
}
pageViews.roulette=async()=>{
 const r=await api('/api/roulette');rouletteAmount=Math.max(1,Math.min(rouletteAmount,r.balance));
 $('#content').innerHTML=head('Roulette','Setz dein Gildengold auf eine Farbe und hoff auf die Kugel.',`<span class="pill" id="rouletteGold">${r.balance} Gildengold</span>`)+tavernTabs('roulette')+`<div class="last-numbers" aria-label="Zuletzt gefallene Zahlen"><span>Zuletzt:</span><div id="lastNumbers">${r.last.map(numberChip).join('')||'<small class="muted">Noch keine Runde gespielt.</small>'}</div></div><div class="roulette-table"><div class="wheel-box"><img class="wheel-pointer" src="art/sword.svg" alt="">${wheelSvg()}<img class="wheel-crest" src="art/modcheck-crest.svg" alt=""></div><section class="bet-panel" aria-label="Einsatz"><div class="bet-colors" role="group" aria-label="Farbe wählen">${Object.entries(COLOR_NAMES).map(([k,name])=>`<button class="bet-color bet-${k} ${k===rouletteBet?'selected':''}" aria-pressed="${k===rouletteBet}" data-bet="${k}" onclick="pickBet('${k}')"><b>${name}</b><small>zahlt ${r.multipliers[k]}-fach</small></button>`).join('')}</div><label for="betAmount">Einsatz in Gildengold</label><input id="betAmount" type="number" min="1" step="1" inputmode="numeric" max="${r.balance}" value="${rouletteAmount}" oninput="rouletteAmount=+this.value||0"><div class="bet-quick">${[10,50,100].map(n=>`<button class="subtle" onclick="setBet(${n})">${n}</button>`).join('')}<button class="subtle" onclick="setBet('half')">Hälfte</button><button class="subtle" onclick="setBet('max')">Alles</button></div><button class="primary" id="wheelSpin" onclick="spinWheel()" ${r.balance<1?'disabled':''}>Kugel werfen</button><p class="slot-result" id="rouletteResult">${r.balance<1?'Kein Gold mehr? Der Automat hilft morgen.':'Mach dein Spiel.'}</p><p class="muted">Gildengold zählt nur hier auf der Seite, es ist weder Spielgold noch Geld. Grün trifft nur die Null.</p></section></div>`
};
function currentBalance(){return parseInt($('#rouletteGold').textContent,10)||0}
function pickBet(color){rouletteBet=color;document.querySelectorAll('.bet-color').forEach(b=>{const on=b.dataset.bet===color;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on)})}
function setBet(value){const balance=currentBalance(),amount=value==='max'?balance:value==='half'?Math.max(1,Math.floor(balance/2)):Math.min(value,balance);rouletteAmount=amount;$('#betAmount').value=amount}
const spinWheel=act(async()=>{
 if(wheelBusy)return;wheelBusy=true;const button=$('#wheelSpin');button.disabled=true;
 try{
  const bet=rouletteBet,r=await api('/api/roulette/spin','POST',{color:bet,amount:Math.floor(+$('#betAmount').value)}),calm=matchMedia('(prefers-reduced-motion: reduce)').matches,time=calm?0:WHEEL_MS,disc=$('#wheelDisc');
  const target=360-WHEEL_ORDER.indexOf(r.number)*360/37,now=((wheelAngle%360)+360)%360;wheelAngle+=(calm?0:360*6)+((target-now+360)%360);
  $('#rouletteResult').textContent='Die Kugel rollt ...';$('#rouletteResult').classList.remove('slot-win');SlotSound.lever();SlotSound.spin(time);
  disc.style.transition=calm?'none':`transform ${time}ms cubic-bezier(.12,.67,.1,1)`;disc.style.transform=`rotate(${wheelAngle}deg)`;
  await new Promise(done=>setTimeout(done,time+120));
  SlotSound.land();if(page!=='roulette')return;
  $('#lastNumbers').innerHTML=r.last.map(numberChip).join('');$('#rouletteGold').textContent=`${r.balance} Gildengold`;$('#betAmount').max=r.balance;if(+$('#betAmount').value>r.balance){rouletteAmount=r.balance;$('#betAmount').value=r.balance}
  $('#rouletteResult').textContent=`${r.number} ${COLOR_NAMES[r.color]}. ${r.won?`Gewonnen: +${r.payout-r.amount} Gold!`:`Verloren: -${r.amount} Gold.`}`;$('#rouletteResult').classList.toggle('slot-win',r.won);
  if(r.won){SlotSound.coins(bet==='green'?26:7);if(bet==='green'){SlotSound.fanfare();showRouletteWin(r)}}
  button.disabled=r.balance<1;if(r.balance<1)$('#rouletteResult').textContent+=' Kein Gold mehr? Der Automat hilft morgen.'
 }catch(e){button.disabled=currentBalance()<1;throw e}
 finally{wheelBusy=false}
});
