/* Silly lines for giving up a duel or leaving a dungeon run. {name} is the one who gives up. */
import {randomInt} from 'node:crypto';

export const FORFEIT_SAYINGS=[
 '{name} hat den Ruhestein gezogen. Mama ruft zum Abendessen.',
 '{name} rennt schreiend davon. Leeroy wäre enttäuscht.',
 '{name} hat sich ausgeloggt. Angeblich ist das Internet kaputt.',
 '{name} braucht erst mal was zu trinken. Das Mana ist alle, der Mut auch.',
 '{name}: „Ich hol nur kurz Pizza.“ Wurde nie wieder gesehen.',
 '{name} hat Angst vor Spinnen. Und vor Bossen. Und eigentlich vor allem.',
 '{name} hat den Gegner gesehen und sich spontan fürs Angeln entschieden.',
 '{name} würfelt „Gier“ auf den Ausgang und gewinnt.',
 '{name} läuft freiwillig zurück zum Friedhof. Die Geistheilerin winkt schon.',
 '{name} hat vergessen, wo die Taste 1 ist.',
 '{name} sagt, die Gruppe war eh zu schlecht. Ganz bestimmt.',
 '{name}: „Zu viel Feuer am Boden.“ Es gab kein Feuer.',
 '{name} geht kurz AFK nach Goldhain und kommt nicht wieder.',
 '{name} hat die Reparaturkosten gesehen und den Mut verloren.',
 '{name} wurde von einem Murloc ausgelacht und gibt auf. Mrglglgl!'
];
export const forfeitLine=name=>FORFEIT_SAYINGS[randomInt(FORFEIT_SAYINGS.length)].replaceAll('{name}',name);
