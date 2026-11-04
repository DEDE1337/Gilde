/* One guild gold balance for every game. The casino games keep their own tables; everything else books into gold_ledger. Site-only score, never money. */
import {id,now} from './core.js';
import {blackjackNet} from './blackjack.js';
import {STARTER_POTIONS} from './progression.js';

export const START_GOLD=1500;
export function balanceOf(db,userId){
 return db.prepare('SELECT COALESCE(SUM(reward),0) n FROM daily_spins WHERE user_id=?').get(userId).n
  +db.prepare('SELECT COALESCE(SUM(payout-amount),0) n FROM roulette_rounds WHERE user_id=?').get(userId).n
  +blackjackNet(db,userId)
  +db.prepare('SELECT COALESCE(SUM(amount),0) n FROM gold_ledger WHERE user_id=?').get(userId).n
}
export const addPotions=(db,userId,potion,count)=>db.prepare('INSERT INTO potions(user_id,potion,count) VALUES (?,?,?) ON CONFLICT(user_id,potion) DO UPDATE SET count=count+excluded.count').run(userId,potion,count);
export const potionsOf=(db,userId)=>Object.fromEntries(db.prepare('SELECT potion,count FROM potions WHERE user_id=?').all(userId).map(r=>[r.potion,r.count]));
export const book=(db,userId,amount,reason,ref=null)=>db.prepare('INSERT INTO gold_ledger(id,user_id,amount,reason,ref,created_at) VALUES (?,?,?,?,?,?)').run(id(),userId,amount,reason,ref,now());
// Several writes that must land together (gold and item, buyer and seller). node:sqlite is synchronous, so nothing interleaves; the transaction makes a failure halfway roll back.
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
// Start gold (and a few potions) comes with the first character and only once per account (unique index on the ledger). Returns true when it was granted now.
export function grantStartGold(db,userId){
 if(!db.prepare('SELECT 1 FROM characters WHERE user_id=?').get(userId))return false;
 const granted=Number(db.prepare(`INSERT OR IGNORE INTO gold_ledger(id,user_id,amount,reason,ref,created_at) VALUES (?,?,?,'start',NULL,?)`).run(id(),userId,START_GOLD,now()).changes)>0;
 if(granted)for(const [potion,count] of Object.entries(STARTER_POTIONS))addPotions(db,userId,potion,count);
 return granted
}
