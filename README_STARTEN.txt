MODCHECK – WEBSITE ALS DATEI
Stand: 02.11.2026

STARTEN UNTER WINDOWS
1. Das ZIP vollständig entpacken.
2. Node.js 22.13 oder neuer installieren, falls noch nicht vorhanden.
3. START_MODCHECK.bat doppelklicken.
4. Im Browser http://127.0.0.1:3000/ öffnen.

ALTERNATIV / MAC / LINUX
Im entpackten Ordner ausführen:
node start.mjs
Danach http://127.0.0.1:3000/ öffnen.
Es müssen für den lokalen Betrieb keine npm-Pakete installiert werden.

ERSTER ADMINISTRATOR
Nach dem ersten Start im Projektordner ausführen:
node scripts/create-admin.mjs DeinName
Das Skript zeigt ein einmaliges Passwort.
Betrieb, Rechte und Sicherung: docs/BETRIEB.md
Funktionsstand, Tests und Einschränkungen: docs/FUNKTIONEN.md

LIVE-DATEN
Der Server holt Itemwerte, Icons, Dropchancen und Talente selbst von Wowhead
Forever und speichert sie in data/modcheck.sqlite. Items werden alle 12 Stunden
erneuert, Talente und die Beutelisten aus den Forever-Guides alle 24 Stunden.
Beim ersten Start dauert das rund 30 Sekunden.
Ist Wowhead nicht erreichbar, zeigt die Seite den letzten gespeicherten Stand.
Instanzen, Bosse und die Basisliste stehen in web/seed-catalog.json.

WAS ENTHALTEN IST
- Aktueller Projektstand der bestehenden ModCheck-Website.
- HTML, CSS, JavaScript, Bilder, Icons und originale Dungeon-Karten.
- Charakter-/Ausrüstungsplanung, Fähigkeiten, Talentwerkstatt für alle Klassen.
- Gildenkalender mit Anlegen, Bearbeiten und Entfernen von Terminen.
- Lokaler Server mit SQLite-Datenbank und Modell-Dateirouten.
- Gespeicherter Forever-Talentdatensatz mit 465 Talenten für neun Klassen sowie
  Icons und Baumhintergründen als Rückfall, falls Wowhead nicht erreichbar ist.

WICHTIGER STATUS
Der zuletzt angeforderte vollständige Redesign-Durchgang ist noch nicht fertig.
Die enthaltene Oberfläche entspricht überwiegend dem vorhandenen Stand.
Die Talentwerkstatt zeigt alle neun Klassen mit Live-Daten von Wowhead.

3D-VIEWER
Ein echter interaktiver Viewer ist enthalten, kein statisches Ersatzbild.
Behoben: Konflikt zwischen jQuery und dem DOM-Helfer namens $.
Die Dateirouten unterstützen die aktuellen M2-/Skin-Dateien.
Der Viewer benötigt WebGL2, Hardwarebeschleunigung und Internetzugang zu
wow.zamimg.com. Bei fehlender WebGL2-Unterstützung erscheint eine konkrete
Fehlermeldung. In der hier verwendeten Testbrowser-Umgebung war kein WebGL2
verfügbar; ein tatsächlich gerendertes Modell konnte dort nicht bestätigt werden.
Modelle und einzelne Ausrüstungsdarstellungen hängen vom externen Anbieter ab.

DATEN
Kalendereinträge werden lokal in data/modcheck.sqlite gespeichert.
Diese Datei bleibt zwischen Starts erhalten. Für eine Sicherung den Server
beenden und den gesamten data-Ordner kopieren.
Accounts, Charaktere, Raids, Forum und alle Gildendaten liegen ebenfalls dort.
Ohne Anmeldung bleiben persönliches Gear, Talentpunkte und Notizen im Browser.
Angemeldet werden Gear und Talente beim aktiven Charakter gespeichert.
Vorhandene Browserdaten
der veröffentlichten Seite wandern nicht automatisch mit. Dort kann die
vorhandene Funktion "Notizen & Backup" zum Exportieren verwendet werden.
Die laufende veröffentlichte Kalenderdatenbank ist nicht Teil dieses Exports.

AUFBAU
web/                    Oberfläche und Assets
server/                 Plattform-API: Accounts, Raids, BiS, Forum, Legacy, Patches
worker/                 Kalender-API, Wowhead-Daten und Worker-Routen
tests/                  Automatische Tests (npm test)
docs/                   Betrieb, Funktionsstand, Einschränkungen
start.mjs               Sofort nutzbarer lokaler Server
scripts/build-export.mjs Optionaler Worker-Build
scripts/import-forever-talents.py Reproduzierbarer Datenimport
 db/ und drizzle/       Datenbankschema und Migrationen

OPTIONALER WORKER-BUILD
node scripts/build-export.mjs
Erzeugt build/worker.js für eine eigene Cloudflare-Workers-Installation.
Diese Fassung enthält weder Accounts noch die Gildenplattform.
Dafür DB als D1-Bindung verbinden und die mitgelieferten SQL-Migrationen anwenden.
Es sind keine Zugangsdaten oder Geheimnisse der veröffentlichten Seite enthalten.

RECHTE / QUELLEN
Schriften Grenze Gotisch und Barlow Semi Condensed: SIL Open Font License, lokal in web/fonts/.
Gildenwappen, Murloc, Bär und Schwerter: eigene Grafiken in web/art/.
Inoffizielles Fanprojekt. World of Warcraft, Allianz-Wappen, Spielgrafiken,
UI-Texturen und Kartenillustrationen sind Eigentum von Blizzard Entertainment.
Spiel-/Talentdaten: Wowhead Forever, Stand 02.11.2026.
Kartenbasis / Bossmarker: wowforever.be.
UI-Texturen: Gethe/wow-ui-textures (Blizzard-Interface-Assets).
