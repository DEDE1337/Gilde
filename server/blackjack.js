/* Blackjack with guild gold. Deck and hole card stay on the server; the stake leaves the balance when the hand starts. */
import {randomInt} from 'node:crypto';
import {route,fail,now,id,int,rateLimit} from './core.js';

const RANKS=['A','2','3','4','5','6','7','8','9','T','J','Q','K'],SUITS=['S','H','D','C'],DECKS=6,KEPT_CARDS=40,DEALER_STANDS=17;
function newDeck(){const cards=[];for(let d=0;d<DECKS;d++)for(const s of SUITS)for(const r of RANKS)cards.push(r+s);for(let i=cards.length-1;i>0;i--){const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]]}return cards.slice(0,KEPT_CARDS)}
export function handValue(cards){let total=0,aces=0;for(const c of cards){const r=c[0];if(r==='A'){aces++;total+=11}else total+=['T','J','Q','K'].includes(r)?10:Number(r)}while(total>21&&aces){total-=10;aces--}return total}
export const isBlackjack=cards=>cards.length===2&&handValue(cards)===21;
export function settleHand(player,dealer,deck,amount){
 const cards=[...dealer],rest=[...deck],mine=handValue(player);
 if(mine<=21)while(handValue(cards)<DEALER_STANDS)cards.push(rest.shift());
 const theirs=handValue(cards),result=mine>21?'bust':theirs>21?'dealerbust':mine>theirs?'win':mine<theirs?'lose':'push';
 return{dealer:cards,result,payout:['win','dealerbust'].includes(result)?amount*2:result==='push'?amount:0}
}
export function settleNatural(player,dealer,amount){
 const mine=isBlackjack(player),theirs=isBlackjack(dealer);
 if(!mine&&!theirs)return null;
 return mine&&theirs?{result:'push',payout:amount}:mine?{result:'blackjack',payout:Math.floor(amount*2.5)}:{result:'dealerblackjack',payout:0}
}
export const blackjackNet=(db,userId)=>db.prepare('SELECT COALESCE(SUM(payout-amount),0) n FROM blackjack_hands WHERE user_id=?').get(userId).n;
export function registerBlackjackRoutes(db,balanceOf){
 const openHand=userId=>db.prepare(`SELECT * FROM blackjack_hands WHERE user_id=? AND status='playing'`).get(userId);
 const needHand=userId=>openHand(userId)||fail(409,'Du hast gerade keine offene Hand.');
 const view=(row,userId)=>{
  const balance=balanceOf(userId);if(!row)return{balance,hand:null};
  const player=JSON.parse(row.player),dealer=JSON.parse(row.dealer),done=row.status==='done';
  return{balance,hand:{id:row.id,amount:row.amount,status:row.status,result:row.result,payout:row.payout,player,playerTotal:handValue(player),dealer:done?dealer:[dealer[0],null],dealerTotal:done?handValue(dealer):handValue([dealer[0]]),canDouble:!done&&player.length===2&&balance>=row.amount}}
 };
 const finish=(row,dealer,result,payout,player=JSON.parse(row.player))=>{db.prepare(`UPDATE blackjack_hands SET player=?,dealer=?,status='done',result=?,payout=? WHERE id=?`).run(JSON.stringify(player),JSON.stringify(dealer),result,payout,row.id);return db.prepare('SELECT * FROM blackjack_hands WHERE id=?').get(row.id)};
 const stand=(row,player,deck)=>{const s=settleHand(player,JSON.parse(row.dealer),deck,row.amount);return finish(row,s.dealer,s.result,s.payout,player)};
 route('GET','/api/blackjack','member',({user})=>view(openHand(user.id),user.id));
 route('POST','/api/blackjack/deal','member',({user,body})=>{
  rateLimit('blackjack:'+user.id,40,60e3);
  if(openHand(user.id))fail(409,'Spiel erst deine offene Hand zu Ende.');
  const balance=balanceOf(user.id);if(balance<1)fail(400,'Du hast kein Gildengold mehr.');
  const amount=int(body.amount,'Einsatz',1,balance),deck=newDeck(),player=[deck.shift(),deck.shift()],dealer=[deck.shift(),deck.shift()],rowId=id();
  db.prepare('INSERT INTO blackjack_hands(id,user_id,amount,deck,player,dealer,created_at) VALUES (?,?,?,?,?,?,?)').run(rowId,user.id,amount,JSON.stringify(deck),JSON.stringify(player),JSON.stringify(dealer),now());
  const row=db.prepare('SELECT * FROM blackjack_hands WHERE id=?').get(rowId),natural=settleNatural(player,dealer,amount);
  return view(natural?finish(row,dealer,natural.result,natural.payout):row,user.id)
 });
 route('POST','/api/blackjack/hit','member',({user})=>{
  const row=needHand(user.id),player=JSON.parse(row.player),deck=JSON.parse(row.deck);player.push(deck.shift());
  if(handValue(player)>=21)return view(stand(row,player,deck),user.id);
  db.prepare('UPDATE blackjack_hands SET player=?,deck=? WHERE id=?').run(JSON.stringify(player),JSON.stringify(deck),row.id);
  return view(db.prepare('SELECT * FROM blackjack_hands WHERE id=?').get(row.id),user.id)
 });
 route('POST','/api/blackjack/stand','member',({user})=>{const row=needHand(user.id);return view(stand(row,JSON.parse(row.player),JSON.parse(row.deck)),user.id)});
 route('POST','/api/blackjack/double','member',({user})=>{
  const row=needHand(user.id),player=JSON.parse(row.player),deck=JSON.parse(row.deck);
  if(player.length!==2)fail(400,'Verdoppeln geht nur mit den ersten zwei Karten.');
  if(balanceOf(user.id)<row.amount)fail(400,'Dafür reicht dein Gildengold nicht.');
  db.prepare('UPDATE blackjack_hands SET amount=? WHERE id=?').run(row.amount*2,row.id);player.push(deck.shift());
  return view(stand({...row,amount:row.amount*2},player,deck),user.id)
 });
}
