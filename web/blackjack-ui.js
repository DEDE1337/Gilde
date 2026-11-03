/* Blackjack in the Spielunke. The server holds deck and hole card; this page only draws what it receives. */
const SUIT_SIGNS={S:'♠',H:'♥',D:'♦',C:'♣'},RANK_NAMES={T:'10',J:'B',Q:'D',K:'K',A:'A'};
const BJ_RESULTS={win:'Gewonnen!',dealerbust:'Der Geber hat sich überkauft!',blackjack:'Blackjack!',push:'Unentschieden, Einsatz zurück.',lose:'Der Geber gewinnt.',bust:'Überkauft!',dealerblackjack:'Der Geber hat Blackjack.'};
let bjAmount=10,bjBusy=false;
function cardHtml(card,fresh){
 if(!card)return `<div class="bj-card back ${fresh?'dealt':''}"><img src="art/modcheck-crest.svg" alt="Verdeckte Karte"></div>`;
 const rank=RANK_NAMES[card[0]]||card[0],suit=SUIT_SIGNS[card[1]];
 return `<div class="bj-card ${'HD'.includes(card[1])?'red':''} ${fresh?'dealt':''}" aria-label="${rank} ${suit}"><span>${rank}<br>${suit}</span><b>${suit}</b></div>`
}
function bjHands(hand,oldPlayer=0,oldDealer=hand.dealer.length){
 return `<div class="bj-row"><p class="bj-label">Geber <b id="bjDealerTotal">${hand.dealerTotal}</b></p><div class="bj-cards" id="bjDealer">${hand.dealer.map((c,i)=>cardHtml(c,i>=oldDealer)).join('')}</div></div><div class="bj-row"><p class="bj-label">Du <b>${hand.playerTotal}</b> · Einsatz ${hand.amount}</p><div class="bj-cards">${hand.player.map((c,i)=>cardHtml(c,i>=oldPlayer)).join('')}</div></div>`
}
function bjBetPanel(balance){return `<label for="bjAmount">Einsatz in Gildengold</label><input id="bjAmount" type="number" min="1" step="1" inputmode="numeric" max="${balance}" value="${Math.max(1,Math.min(bjAmount,balance))}" oninput="bjAmount=+this.value||0"><div class="bet-quick">${[10,50,100].map(n=>`<button class="subtle" onclick="bjSetBet(${n})">${n}</button>`).join('')}<button class="subtle" onclick="bjSetBet('half')">Hälfte</button><button class="subtle" onclick="bjSetBet('max')">Alles</button></div><button class="primary bj-main" onclick="bjDeal()" ${balance<1?'disabled':''}>Karten geben</button>`}
function bjControls(hand){return `<div class="bj-actions"><button class="primary" onclick="bjMove('hit')">Karte</button><button class="primary" onclick="bjMove('stand')">Halten</button><button class="primary" onclick="bjMove('double')" ${hand.canDouble?'':'disabled'}>Verdoppeln</button></div>`}
function bjSetBet(value){const balance=parseInt($('#bjGold').textContent,10)||0,amount=value==='max'?balance:value==='half'?Math.max(1,Math.floor(balance/2)):Math.min(value,balance);bjAmount=amount;$('#bjAmount').value=amount}
function bjTable(){return `<section class="bj-table" aria-label="Blackjack-Tisch"><div id="bjHands"></div><p class="bj-rule">Blackjack zahlt 3 zu 2 · Geber zieht bis 17</p></section><p class="slot-result" id="bjResult"></p><div id="bjPanel" class="bj-panel"></div>`}
function bjDraw(data,oldPlayer,oldDealer){
 $('#bjGold').textContent=`${data.balance} Gildengold`;const hand=data.hand,done=!hand||hand.status==='done';
 $('#bjHands').innerHTML=hand?bjHands(hand,oldPlayer,oldDealer):'<p class="bj-empty">Setz dein Gold und der Geber teilt aus.</p>';
 $('#bjPanel').innerHTML=done?bjBetPanel(data.balance):bjControls(hand);
 if(!hand)$('#bjResult').textContent=data.balance<1?'Kein Gold mehr? Der Automat hilft morgen.':''
}
function bjFinish(data){
 const h=data.hand,net=h.payout-h.amount,won=net>0;
 $('#bjResult').textContent=`${BJ_RESULTS[h.result]} ${net>0?`+${net} Gold`:net<0?`${net} Gold`:''}`;$('#bjResult').classList.toggle('slot-win',won);
 if(won)SlotSound.coins(h.result==='blackjack'?20:6);
 if(h.result==='blackjack'){SlotSound.fanfare();bjShowWin(h)}
}
function bjShowWin(h){
 const dialog=document.createElement('dialog');dialog.className='win-dialog q-legendary';dialog.setAttribute('aria-labelledby','winTitle');
 dialog.innerHTML=`<div class="win-coins" aria-hidden="true">${Array.from({length:28},(_,i)=>`<i style="left:${Math.random()*100}%;animation-delay:${(i*.09).toFixed(2)}s;animation-duration:${(1.5+Math.random()*1.2).toFixed(2)}s"></i>`).join('')}</div><img class="win-crest" src="art/modcheck-crest.svg" alt=""><p class="win-rarity">Blackjack!</p><h2 id="winTitle">Glückwunsch, du hast gewonnen!</h2><p class="win-gold">+${h.payout-h.amount} Gildengold</p><button class="primary" onclick="this.closest('dialog').remove()">Einsacken</button>`;
 document.body.append(dialog);dialog.showModal()
}
async function bjReveal(data,oldPlayer){
 const calm=matchMedia('(prefers-reduced-motion: reduce)').matches,dealer=data.hand.dealer,steps=dealer.length;
 if(calm){bjDraw(data,oldPlayer,steps);return}
 const stage={...data,hand:{...data.hand,dealer:[dealer[0],null],status:'playing',canDouble:false}};
 stage.hand.dealerTotal='?';bjDraw(stage,oldPlayer,2);$('#bjPanel').innerHTML='';
 for(let shown=2;shown<=steps;shown++){
  await new Promise(done=>setTimeout(done,620));if(page!=='blackjack')return;
  $('#bjDealer').innerHTML=dealer.slice(0,shown).map((c,i)=>cardHtml(c,i===shown-1)).join('');SlotSound.card()
 }
 await new Promise(done=>setTimeout(done,350));if(page==='blackjack')bjDraw(data,oldPlayer,steps)
}
async function bjApply(data,oldPlayer=0,oldDealer=0){
 $('#bjResult').textContent='';$('#bjResult').classList.remove('slot-win');SlotSound.card();
 if(data.hand.status==='done'){await bjReveal(data,oldPlayer);if(page==='blackjack')bjFinish(data)}
 else bjDraw(data,oldPlayer,oldDealer)
}
const bjDeal=act(async()=>{if(bjBusy)return;bjBusy=true;try{const data=await api('/api/blackjack/deal','POST',{amount:Math.floor(+$('#bjAmount').value)});await bjApply(data)}finally{bjBusy=false}});
const bjMove=act(async move=>{if(bjBusy)return;bjBusy=true;try{const oldPlayer=document.querySelectorAll('#bjHands .bj-row:last-child .bj-card').length,data=await api('/api/blackjack/'+move,'POST',{});await bjApply(data,oldPlayer,2)}finally{bjBusy=false}});
pageViews.blackjack=async()=>{
 const data=await api('/api/blackjack');
 $('#content').innerHTML=head('Blackjack','Näher an die 21 als der Geber, aber nicht drüber.',`<span class="pill" id="bjGold">${data.balance} Gildengold</span>`)+tavernTabs('blackjack')+bjTable();
 bjDraw(data,2,2);$('#bjResult').classList.remove('slot-win')
};
