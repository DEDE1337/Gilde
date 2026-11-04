/* Per-class planner content: role banner, level milestones and which items a class can use.
   The warrior keeps its hand-written plan from app.js (steps). The other classes list their WoW Classic class quests and trainer steps;
   Forever may change details, so the plan links the Wowhead class guide for the current state. */
const CLASS_ROLES={
 1:['Schutz-Krieger / Tank','Du gehst voran. Deine Gruppe folgt.','Boss auswählen, Tank-Beute prüfen und direkt im Charakterfenster anlegen.'],
 2:['Paladin / Heiler oder Schutz','Licht für die Gruppe, Stahl für den Feind.','Segen verteilen, heilen oder die Gegner an dich binden. Passende Platten- und Kettenbeute findest du im Instanzjournal.'],
 3:['Jäger / Fernkampf','Du und dein Begleiter, unzertrennlich.','Fernkampfwaffe aktuell halten, Begleiter füttern und Beweglichkeit sammeln.'],
 4:['Schurke / Nahkampf','Aus dem Schatten zuschlagen.','Zwei schnelle Waffen, Gifte und Beweglichkeit. Die nächste Klinge wartet im Instanzjournal.'],
 5:['Priester / Heiler','Ohne dich fällt die Gruppe.','Heilen, Schilde verteilen und mit Intelligenz und Willenskraft lange durchhalten.'],
 7:['Schamane / Allrounder','Totems setzen, Elemente rufen.','Heilen, Blitze werfen oder mit Schild und Waffe kämpfen. Totems machen die Gruppe stärker.'],
 8:['Magier / Fernkampf','Feuer, Frost und Arkan.','Großer Schaden aus der Entfernung, Essen und Wasser für alle. Stoffrüstung mit Intelligenz zählt.'],
 9:['Hexenmeister / Fernkampf','Dämonen an deiner Seite.','Flüche, Schattenschaden und ein Dämon, der für dich kämpft. Seelensteine nicht vergessen.'],
 11:['Druide / Allrounder','Bär, Katze oder Heiler, je nach Lage.','Gestalten wechseln und genau das spielen, was der Gruppe fehlt. Leder mit Beweglichkeit oder Intelligenz zählt.']
};
const START_ZONES={Mensch:'Nordhain im Wald von Elwynn',Zwerg:'Coldridge-Tal in Dun Morogh',Gnom:'Coldridge-Tal in Dun Morogh',Nachtelf:'Shadowglen auf Teldrassil'};
const mile=(level,tag,title,text)=>({level,tag,title,text});
const CLASS_MILESTONES={
 2:[mile(10,'Lehrer','Handauflegung und Segen des Schutzes','Zwei Notfallknöpfe für dich und die Gruppe. Gut erreichbar legen.'),mile(12,'Klassenquest','Erlösung freischalten','Die Paladin-Klassenquest beim Lehrer abholen. Danach kannst du Gefallene wiederbeleben.'),mile(20,'Lehrer','Exorzismus lernen','Starker Zauber gegen Untote und Dämonen.'),mile(30,'Build-Check','Heilig, Schutz oder Vergeltung','Den Talentplan passend zur Rolle in der Gruppe prüfen.'),mile(40,'Klassenquest','Streitross beschwören','Die Paladin-Questreihe für dein eigenes Reittier beim Lehrer starten.')],
 3:[mile(10,'Klassenquest','Tier zähmen','Die Jäger-Klassenquest beim Lehrer abholen. Danach kämpft ein Begleiter an deiner Seite.'),mile(10,'Begleiter','Begleiter füttern und trainieren','Futter mitnehmen; der Begleiter lernt neue Fähigkeiten beim Tierausbilder.'),mile(20,'Lehrer','Aspekt des Geparden','Schneller unterwegs zwischen den Questgebieten.'),mile(30,'Build-Check','Tierherrschaft, Treffsicherheit oder Überleben','Den Talentplan mit deinem Spielstil abgleichen.'),mile(40,'Ausrüstung','Kettenrüstung tragen','Ab jetzt lohnt sich Kette mit Beweglichkeit.')],
 4:[mile(10,'Lehrer','Verstohlenheit und Kopfnuss','Gegner aus dem Schatten ausschalten, bevor der Kampf beginnt.'),mile(16,'Lehrer','Schlossknacken lernen','Verschlossene Kisten öffnen. Übung bekommst du an Kisten in Instanzen.'),mile(20,'Klassenquest','Gifte freischalten','Die Schurken-Klassenquest beim Lehrer abholen. Danach bekommst du Gifte für deine Waffen.'),mile(22,'Lehrer','Verschwinden','Rettet dich aus fast jedem Kampf.'),mile(30,'Build-Check','Meucheln, Kampf oder Täuschung','Den Talentplan mit deinem Spielstil abgleichen.')],
 5:[mile(10,'Lehrer','Volkszauber des Priesters','Jedes Volk hat eigene Priesterzauber. Beim Lehrer nachfragen.'),mile(10,'Lehrer','Gedankenschlag und Schattenwort: Schmerz','Schaden beim Questen, damit du nicht nur heilst.'),mile(20,'Lehrer','Große Heilung vorbereiten','Für Dungeons Manavorrat und Heilzauber im Blick behalten.'),mile(30,'Build-Check','Disziplin, Heilig oder Schatten','Heiler für die Gruppe oder Schatten zum Questen.'),mile(40,'Ausrüstung','Intelligenz und Willenskraft','Stoffrüstung mit Intelligenz und Willenskraft sammeln.')],
 7:[mile(4,'Klassenquest','Erdtotem','Die erste Totem-Klassenquest beim Schamanenlehrer.'),mile(10,'Klassenquest','Feuertotem','Die nächste Totem-Klassenquest beim Lehrer abholen.'),mile(20,'Klassenquest','Wassertotem','Die Totem-Questreihe weiterführen.'),mile(30,'Klassenquest','Lufttotem','Das letzte Element der Totem-Questreihe.'),mile(30,'Build-Check','Elementar, Verstärkung oder Wiederherstellung','Den Talentplan mit deiner Rolle abgleichen.')],
 8:[mile(8,'Lehrer','Verwandlung','Ein Gegner wird zum Schaf. Die wichtigste Kontrolle der Gruppe.'),mile(20,'Lehrer','Teleport in die Hauptstadt','Mit Teleportrunen sparst du dir lange Wege.'),mile(30,'Build-Check','Arkan, Feuer oder Frost','Den Talentplan mit deinem Spielstil abgleichen.'),mile(40,'Lehrer','Portale für die Gruppe','Mit Portalrunen bringst du die ganze Gruppe nach Hause.')],
 9:[mile(10,'Klassenquest','Leerwandler beschwören','Die Hexenmeister-Klassenquest beim Lehrer abholen: dein erster robuster Dämon.'),mile(20,'Klassenquest','Sukkubus beschwören','Die nächste Dämonen-Klassenquest beim Lehrer.'),mile(30,'Klassenquest','Teufelsjäger beschwören','Der Dämon gegen feindliche Zauberer.'),mile(40,'Klassenquest','Teufelsross','Die Hexenmeister-Questreihe für dein eigenes Reittier.'),mile(30,'Build-Check','Gebrechen, Dämonologie oder Zerstörung','Den Talentplan mit deinem Spielstil abgleichen.')],
 11:[mile(10,'Klassenquest','Bärengestalt','Die Druiden-Klassenquest beim Lehrer abholen. Danach kannst du tanken.'),mile(16,'Klassenquest','Wassergestalt','Schneller schwimmen und unter Wasser atmen.'),mile(20,'Lehrer','Katzengestalt','Schaden aus der Verstohlenheit wie ein Schurke.'),mile(30,'Lehrer','Reisegestalt','Schneller über Land reisen.'),mile(30,'Build-Check','Gleichgewicht, Wilder Kampf oder Wiederherstellung','Den Talentplan mit deiner Rolle abgleichen.')]
};
// The milestones of a class, sorted by level, with the start and the endgame step every class shares.
function classMilestones(cid,race){
 if(cid===1)return steps.map(([level,title,text,tag])=>({level,title,text,tag}));
 const zone=START_ZONES[race]||'deinem Startgebiet';
 return [mile(1,'Start',`Start in ${zone}`,'Erste Quests im Startgebiet, Waffe aktuell halten und regelmäßig zum Lehrer gehen.'),...(CLASS_MILESTONES[cid]||[]),mile(60,'Endgame','Deinen nächsten Weg wählen','Dungeon-Ausrüstung, Raids oder PvP: Wunschliste und Talentplan passend zum Ziel aktualisieren.')].sort((a,b)=>a.level-b.level)
}
const milestoneKey=(cid,m)=>`c${cid}-${m.level}-${m.title}`;

// Classic proficiencies: which class may use an item from the catalog, read from its kind (armour type, weapon type).
const ALL_CLASSES=[1,2,3,4,5,7,8,9,11];
const PROFICIENCY=[[/Plate/,[1,2]],[/Mail/,[1,2,3,7]],[/Leather/,[1,2,3,4,7,11]],[/Cloth/,ALL_CLASSES],[/Shield/,[1,2,7]],[/Wand/,[5,8,9]],[/Gun|Bow|Crossbow/,[1,3,4]],[/Thrown/,[1,4]],[/Dagger/,[1,3,4,5,7,8,9,11]],[/Fist/,[1,3,4,7,11]],[/Polearm/,[1,2,3]],[/Staff/,[1,3,5,7,8,9,11]],[/Two-Hand Sword/,[1,2,3]],[/Sword/,[1,2,3,4,8,9]],[/Two-Hand Axe|Axe/,[1,2,3,7]],[/Two-Hand Mace/,[1,2,7,11]],[/Mace/,[1,2,4,5,7,11]]];
function classCanUse(item,cid){const rule=PROFICIENCY.find(([re])=>re.test(item.kind||''));return !rule||rule[1].includes(cid)}
// A rough hint which items suit the class: the item carries one of the class's main stats.
const CLASS_STATS={1:['str','sta'],2:['str','int','sta'],3:['agi'],4:['agi'],5:['int','spi'],7:['int','agi','str'],8:['int'],9:['int','sta'],11:['int','agi','spi']};
const classFits=(item,cid)=>(CLASS_STATS[cid]||[]).some(k=>item.stats?.[k]>0);
