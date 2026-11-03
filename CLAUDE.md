# ModCheck Website

Website der Allianz-Gilde ModCheck für World of Warcraft: Forever (inoffizielles Fanprojekt). Oberfläche und Texte sind deutsch. Nutzerdoku: `README_STARTEN.txt`.

## Befehle

- `npm start` oder `node start.mjs`: lokaler Server auf http://127.0.0.1:3000/ (Port über `PORT`)
- `npm test`: API-Tests gegen den echten Server mit Wegwerf-Datenbank
- `node scripts/create-admin.mjs <Name>`: Administrator anlegen oder Passwort zurücksetzen
- `npm run build`: erzeugt `build/worker.js` für Cloudflare Workers (D1-Bindung `DB` nötig, ohne Plattform)
- `python scripts/import-forever-talents.py`: baut `web/forever-talents.js` aus `source-data/talents/` neu

Voraussetzung ist Node.js >= 22.13 (`node:sqlite`). Es gibt keine npm-Abhängigkeiten, keinen Bundler und keinen Linter. Funktionsstand und Grenzen: `docs/FUNKTIONEN.md`, Betrieb: `docs/BETRIEB.md`.

## Aufbau

- `web/`: statische Oberfläche ohne Framework. `data-loader.js` holt `/api/catalog`, setzt die Globals `itemCatalog` und `dungeonCatalog` und lädt danach `app.js`, `tank-ui.js`, `guild-ui.js`, `calendar-ui.js`, `talent-ui.js` in dieser Reihenfolge.
- `web/platform-ui.js`, `web/guild-tools-ui.js`, `web/platform.css`: Gildenplattform. `pageViews[seite]` sind asynchrone Seiten, `openPage(seite, arg)` öffnet sie. Serverdaten immer durch `esc()` führen.
- `server/`: Plattform-API, nur mit `start.mjs`. `core.js` hat Routing, Validierung, Sitzungen und Rechte; Routen deklarieren ihren Zugriff (`public`, `member`, `admin` oder ein Recht). Rechte immer serverseitig prüfen.
- `web/schildwall.css`: das Design der Seite, wird zuletzt geladen und überschreibt die älteren Stylesheets. Schriften liegen lokal in `web/fonts/`, bitte nicht wieder von Google laden.
- `server/bonus.js`: Tagesbonus. Das Ergebnis entsteht nur auf dem Server, ein Dreh pro Tag nach `Europe/Berlin`. Gewinne und Symbole stehen in `SYMBOLS`.
- `web/calendar-ui.js`: Kalender. Der Mini-Kalender `#miniCal` liegt fest auf jeder Seite, ein Klick öffnet den Dialog `#calendarView`. Es gibt keine eigene Kalenderseite mehr, `go('calendar')` öffnet den Dialog.
- `server/discord.js`: Meldungen an Discord-Webhooks aus `data/discord-webhooks.json`, eine Warteschlange pro Kanal, Pings immer unterdrückt (`allowed_mentions`). Aufrufe sind fire-and-forget und dürfen eine Anfrage nie scheitern lassen. Die Raid-Erinnerung merkt sich Gesendetes in `discord_sent`.
- `server/polls.js`, `web/polls-ui.js`: Umfragen mit Login-Popup. Jede Umfrage wird über `discordPoll` als native Discord-Umfrage gepostet, `syncPolls` liest die Zählung zurück (`discord_counts_json`). Klassen- und Volk-Umfragen (`kind`) nehmen die Antworten aus `CLASSES` und `RACES`.
- YouTube im Forum: `bodyText` in `web/platform-ui.js` macht aus YouTube-Links Klick-Karten. Das Vorschaubild kommt über `/yt/<id>.jpg` aus `start.mjs` (nur angemeldet), der Player erst nach dem Klick von youtube-nocookie.com; dafür steht `frame-src` in der CSP.
- `web/charscreen.js`: Charakterauswahl und -erstellung nach dem Login (einmal pro Browser-Sitzung, Merker `modcheck-char-entered` in sessionStorage), Gesichts-Icon im Header öffnet sie wieder. Aussehen steht als `{optionId: choiceId}` in `characters.appearance_json`; Optionen liefert der Viewer (`getCustomizationOptions`), Auswahlen mit `CustReqId` 12 sind NPC-only und werden ausgeblendet. Skyborne hat kein Classic-Modell.
- `server/blackjack.js`, `web/roulette-ui.js`, `web/blackjack-ui.js`: Spielunke. Stapel und verdeckte Karte bleiben auf dem Server, der Kontostand entsteht aus Tagesdrehs, Roulette und Blackjack.
- Gäste: `server/index.js` lässt ohne Sitzung nur `OPEN_API` durch, `/api/events` prüft `start.mjs`. Neue Routen sind damit automatisch geschützt, das Routen-Recht `public` gilt erst für Angemeldete.
- `web/capsule-cursor.js`: Kapsel-Mauszeiger, nur bei Maus aktiv. In Dialogen und Textfeldern gilt der normale Zeiger.
- `web/talent-ui.js`, `web/talents.css`: Talentrechner für alle Klassen. Lädt `/api/talents` beim ersten Öffnen, Punkte liegen pro Klasse in `state.talentPlan`. Alte Fury-Pläne aus `state.talents` werden einmalig über `nameEnus` übernommen; dafür bleiben `talents` und `valid` in `app.js` bestehen, die Backups aus älteren Ständen prüfen.
- `web/seed-catalog.json`: gepflegte Basis und Rückfall. Instanzen, Bosse, 3D-`display` und die handgepflegte Tank-Bewertung stehen nur hier. `guideTab` an einem Boss nennt den Tab im Guide, wenn der Name nicht passt.
- `worker/wowhead.js`: Live-Daten (`/api/catalog`, `/api/talents`) mit Cache in `wowhead_cache`, dazu der Icon-Proxy für lokal fehlende `icons/`-Dateien. Wird von beiden Laufzeiten genutzt.
- `worker/events.js`: Kalender-API (`/api/events`), wird von beiden Laufzeiten genutzt.
- `start.mjs`: lokale Laufzeit mit SQLite in `data/modcheck.sqlite`; führt beim Start die Migrationen aus `drizzle/` aus und aktualisiert die Wowhead-Daten beim Start und stündlich.
- `worker/runtime.js`: Cloudflare-Laufzeit. Die Assets kommen eingebettet aus `build-export.mjs`; `handleGuildEvents` und `assets` sind dort erst im gebauten Bundle definiert, die Datei läuft nicht allein.
- `db/schema.ts`, `drizzle/`: Schema von `guild_events`. Das SQL wird direkt angewendet, `drizzle-kit` ist nicht installiert.
- `source-data/talents/`: Rohdaten von Wowhead Forever mit Herkunftsnachweis.

## Live-Daten

- Items: `nether.wowhead.com/forever/tooltip/item/<id>?locale=3`, Neuabruf nach 12 Stunden, nach Fehlern frühestens nach 15 Minuten. Name, Qualität, Icon, Level, Werte, Tooltip und Dropchance kommen von dort und überschreiben die Basis.
- Beutelisten: Tab „Loot“ der Forever-Guides (`d.guide`), Neuabruf nach 24 Stunden. Neue Items werden aus der Spalte „Type“ eingeordnet (`classifyWowheadItem`, `automatic: true`, ohne `display`), Items ohne Guide-Eintrag bekommen `retired: true`. Tabs ohne Tabelle (Gnomeregan „Miscellaneous“) enthalten keine Boss-Beute und entfallen. Findet ein Guide weniger als die Hälfte der bekannten Items, bleibt die letzte Liste bestehen.
- Talente: Datendatei des Forever-Talentrechners, Neuabruf nach 24 Stunden. `/api/talents` hat dieselbe Form wie `FOREVER_TALENTS`.
- Bei Ausfall bleibt der letzte gute Wert im Cache; ohne Cache antwortet die API mit Basis oder Snapshot.
- Item- und Zonenseiten auf `www.wowhead.com` antworten mit 403. Das nicht umgehen, also keinen Browser-User-Agent vortäuschen. `robots.txt` beachten; sie sperrt unter anderem KI-Crawler komplett.
- Eine neue Instanz braucht einen Eintrag in `seed-catalog.json` samt Guide-Link.

## Worauf zu achten ist

- Keine Spieldaten erfinden: Items und Rezepte nur per Wowhead-ID, BiS nur mit Quelle, Patchdaten erst nach Prüfung sichtbar.
- `start.mjs` und `worker/runtime.js` sind zwei getrennte Server. Änderungen an Routen und am `modelPath`-Regex für den `/model/`-Proxy gehören in beide.
- `web/forever-talents.js` ist generiert, also nicht von Hand ändern; es dient als Rückfall für `/api/talents`.
- Der 3D-Viewer braucht WebGL2 und Zugriff auf `wow.zamimg.com`. Das Gnom-Modell (männlich, ohne Ausrüstung) rendert nachweislich, mit angelegten Items ist es noch nicht geprüft. `$` ist ein DOM-Helfer und kollidiert mit jQuery, das war schon einmal ein Fehler.
- Der Kalender liegt in SQLite, Gear, Talentpunkte, Notizen und Mitgliederliste liegen im Browser des Nutzers.
- `data/` und `build/` werden erzeugt und gehören nicht in die Versionierung.

## Stand

Laut README ist der zuletzt angeforderte Redesign-Durchgang noch nicht fertig, die Oberfläche entspricht überwiegend dem alten Stand.
