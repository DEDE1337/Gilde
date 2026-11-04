/* Waffenkammer levels and class abilities. Level 1 to 60 per character, like the real instances' levels: XP mostly from duels, a little from chests, a little more health, attack and
   defence per level, and four real class abilities unlocked on the way. The abilities are WoW names and icons; their duel effects are this game's own rules. */
import {id,now} from './core.js';

export const LEVEL_CAP=60,UNLOCK_LEVELS=[1,4,8,12];
// XP needed from level n to n+1: 100, 160, 220 ... up to level 20 (unchanged, so nobody's level moved when the cap rose), then 1,240 rising by 40 per level.
// Level 60 takes about 92,000 XP: a few weeks of daily dungeons, which pay more the higher the instance.
export const xpToNext=level=>level>=LEVEL_CAP?0:level<20?60*level+40:1240+(level-20)*40;
export function levelOf(xp){let level=1,rest=xp;while(level<LEVEL_CAP&&rest>=xpToNext(level)){rest-=xpToNext(level);level++}return{level,xp:level>=LEVEL_CAP?0:rest,next:xpToNext(level),total:xp}}
export const levelBonus=level=>({leben:25*(level-1),angriff:2*(level-1),verteidigung:level-1,krit:0,ausweichen:0,heilkraft:0});
// Chests give a small fixed amount plus one per 100 gold; duels are the main source and count for the first ten of a day only.
export const XP={chest:price=>5+Math.floor(price/100),duelWin:40,duelLoss:15,duelsPerDay:10};
const berlinDay=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);

// kind: dmg (multiplier), stun (light hit, enemy loses the next turn), heal (share of max health), shield (absorbs a share of max health),
// buff (next two attacks hit harder), drain (hit and heal half of the damage). pp: uses per duel like in old monster games, null means unlimited.
// The first ability of each class is its basic attack and never runs out.
const A=(key,name,icon,kind,value,pp,text)=>({key,name,icon,kind,value,pp,text});
export const ABILITIES={
 1:[A('heroic','Heldenhafter Stoß','ability_rogue_ambush','dmg',1.2,null,'Kräftiger Schlag'),A('charge','Sturmangriff','ability_warrior_charge','stun',.6,2,'Leichter Treffer, Gegner setzt eine Runde aus'),A('deathwish','Todeswunsch','spell_shadow_deathpact','buff',1.5,2,'Die nächsten zwei Angriffe 1,5-fach'),A('execute','Hinrichten','inv_sword_48','dmg',2.4,2,'Vernichtender Schlag, 2,4-fach')],
 2:[A('crusader','Kreuzfahrerstoß','spell_holy_crusaderstrike','dmg',1.2,null,'Heiliger Schlag'),A('hammer','Hammer der Gerechtigkeit','spell_holy_sealofmight','stun',.6,2,'Betäubt, Gegner setzt eine Runde aus'),A('holylight','Heiliges Licht','spell_holy_holybolt','heal',.3,3,'Heilt 30 % des Lebens'),A('bubble','Gottesschild','spell_holy_divineintervention','shield',.4,1,'Schild fängt 40 % des Lebens ab')],
 3:[A('raptor','Raptorstoß','ability_meleedamage','dmg',1.2,null,'Schneller Hieb'),A('concussive','Erschütternder Schuss','spell_frost_stun','stun',.6,2,'Lähmt, Gegner setzt eine Runde aus'),A('rapidfire','Schnellfeuer','ability_hunter_runningshot','buff',1.5,2,'Die nächsten zwei Angriffe 1,5-fach'),A('aimed','Gezielter Schuss','inv_spear_07','dmg',2.2,3,'Präziser Schuss, 2,2-fach')],
 4:[A('sinister','Finsterer Stoß','spell_shadow_ritualofsacrifice','dmg',1.2,null,'Schneller Stich'),A('gouge','Solarplexus','ability_gouge','stun',.6,2,'Gegner setzt eine Runde aus'),A('flurry','Klingenwirbel','ability_warrior_punishingblow','buff',1.5,2,'Die nächsten zwei Angriffe 1,5-fach'),A('eviscerate','Ausweiden','ability_rogue_eviscerate','dmg',2.3,3,'Finishing Move, 2,3-fach')],
 5:[A('smite','Göttliche Pein','spell_holy_holysmite','dmg',1.2,null,'Heiliger Schaden'),A('pwshield','Machtwort: Schild','spell_holy_powerwordshield','shield',.35,2,'Schild fängt 35 % des Lebens ab'),A('scream','Psychischer Schrei','spell_shadow_psychicscream','stun',.4,2,'Gegner flieht eine Runde'),A('greaterheal','Große Heilung','spell_holy_greaterheal','heal',.35,3,'Heilt 35 % des Lebens')],
 7:[A('lightning','Blitzschlag','spell_nature_lightning','dmg',1.2,null,'Naturschaden'),A('earthshock','Erdschock','spell_nature_earthshock','stun',.7,2,'Trifft und unterbricht, Gegner setzt aus'),A('healwave','Welle der Heilung','spell_nature_magicimmunity','heal',.3,3,'Heilt 30 % des Lebens'),A('chain','Kettenblitzschlag','spell_nature_chainlightning','dmg',2.2,3,'Springender Blitz, 2,2-fach')],
 8:[A('fireball','Feuerball','spell_fire_flamebolt','dmg',1.2,null,'Feuerschaden'),A('nova','Frostnova','spell_frost_frostnova','stun',.5,2,'Friert ein, Gegner setzt eine Runde aus'),A('manashield','Manaschild','spell_shadow_detectlesserinvisibility','shield',.35,2,'Schild fängt 35 % des Lebens ab'),A('pyro','Pyroschlag','spell_fire_fireball02','dmg',2.4,2,'Gewaltiger Feuerball, 2,4-fach')],
 9:[A('shadowbolt','Schattenblitz','spell_shadow_shadowbolt','dmg',1.2,null,'Schattenschaden'),A('fear','Furcht','spell_shadow_possession','stun',.3,2,'Gegner flieht eine Runde'),A('drain','Blutsauger','spell_shadow_lifedrain02','drain',1.2,3,'Saugt Leben ab und heilt die Hälfte'),A('soulfire','Seelenfeuer','spell_fire_fireball02','dmg',2.3,2,'Brennende Seele, 2,3-fach')],
 11:[A('wrath','Zorn','spell_nature_abolishmagic','dmg',1.2,null,'Naturschaden'),A('bash','Hieb','ability_druid_bash','stun',.6,2,'Betäubt, Gegner setzt eine Runde aus'),A('rejuv','Verjüngung','spell_nature_rejuvenation','heal',.3,3,'Heilt 30 % des Lebens'),A('starfire','Sternenfeuer','spell_arcane_starfire','dmg',2.2,3,'Mondlicht, 2,2-fach')]
};
export const abilitiesFor=(classId,level)=>(ABILITIES[classId]||[]).map((a,i)=>({...a,unlockLevel:UNLOCK_LEVELS[i],unlocked:level>=UNLOCK_LEVELS[i]}));

// Potions for the duel bag. Bought from the merchant, one use costs the turn, at most three uses per duel.
export const POTIONS={
 heal:{key:'heal',name:'Großer Heiltrank',icon:'inv_potion_54',price:40,text:'Heilt 35 % des Lebens'},
 mana:{key:'mana',name:'Großer Manatrank',icon:'inv_potion_76',price:60,text:'Lädt alle Fähigkeiten wieder auf'},
 stone:{key:'stone',name:'Großer Steinschildtrank',icon:'inv_potion_69',price:50,text:'Schild fängt 25 % des Lebens ab'}
};
export const STARTER_POTIONS={heal:2,mana:1};
export const POTIONS_PER_DUEL=3;

export function progressOf(db,characterId){
 const row=db.prepare('SELECT armory_xp FROM characters WHERE id=?').get(characterId);return levelOf(row?.armory_xp||0)
}
// Duel XP counts for the first duels of a day only, so endless duels between two friends level nobody.
export function grantXp(db,characterId,amount,reason){
 if(!characterId||amount<=0)return 0;
 if(reason.startsWith('duel')&&db.prepare(`SELECT COUNT(*) n FROM armory_xp_log WHERE character_id=? AND reason LIKE 'duel%' AND day=?`).get(characterId,berlinDay()).n>=XP.duelsPerDay)return 0;
 const before=progressOf(db,characterId).level;
 db.prepare('UPDATE characters SET armory_xp=armory_xp+? WHERE id=?').run(Math.round(amount),characterId);
 db.prepare('INSERT INTO armory_xp_log(id,character_id,amount,reason,day,created_at) VALUES (?,?,?,?,?,?)').run(id(),characterId,Math.round(amount),reason,berlinDay(),now());
 return progressOf(db,characterId).level>before?progressOf(db,characterId).level:0
}
