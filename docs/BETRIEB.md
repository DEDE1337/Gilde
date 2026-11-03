# ModCheck einrichten und betreiben

## Start unter Windows

1. Node.js 22.13 oder neuer installieren.
2. `START_MODCHECK.bat` doppelklicken und http://127.0.0.1:3000/ öffnen.
3. Fenster offen lassen. Beim ersten Start legt der Server die Datenbank an und holt rund 30 Sekunden lang die Wowhead-Daten.

## Ersten Administrator anlegen

Server einmal gestartet haben, dann im Projektordner:

```bash
node scripts/create-admin.mjs DeinName
```

Das Skript zeigt ein einmaliges Passwort. Melde dich damit an und ändere es unter Einstellungen. Derselbe Befehl setzt ein vergessenes Passwort zurück.

## Rechte

- Neue Konten warten auf Freischaltung unter Mitglieder → Benutzer verwalten.
- Der sichtbare Gildenrang ist frei wählbar und gibt keine Rechte.
- Rollen und Rechte vergibt nur ein Administrator. Offiziere brauchen Einzelrechte: Raids, Boss-Kills, Ankündigungen, Forum, Hall of Fame, BiS-Listen, Patchdaten, Mitglieder. „Automat ohne Limit“ erlaubt beliebig viele Drehs; nur der erste am Tag zählt fürs Gold.
- Der Kalender ist nur noch mit dem Recht „Raids“ beschreibbar.

## Schnell online zum Testen

`START_MODCHECK_ONLINE.bat` startet die Seite und einen Cloudflare-Tunnel und zeigt einen zufälligen Link. Dafür muss `cloudflared` installiert sein. Solange das Fenster offen ist, ist die Seite unter dem Link erreichbar, beim Schließen ist sie offline. Bei jedem Start gibt es einen neuen Link. Wer den Link hat, sieht Startseite und Anmeldung; alles andere braucht ein freigeschaltetes Konto.

## Eigene Domain (fester Cloudflare-Tunnel)

Voraussetzung: Die Domain ist bei Cloudflare eingetragen, also die Nameserver beim Domain-Anbieter auf die beiden Cloudflare-Nameserver umgestellt und im Dashboard als „Active“ angezeigt.

1. Im Cloudflare-Dashboard „Zero Trust“ öffnen (beim ersten Mal den kostenlosen Plan wählen), dann „Networks“ → „Tunnels“ → „Create a tunnel“ → „Cloudflared“, Name zum Beispiel `modcheck`.
2. Auf der Installationsseite steht ein langer Befehl mit einem Schlüssel hinter `--token` bzw. `install`. Nur diesen Schlüssel (beginnt meist mit `eyJ`) kopieren und in `data/tunnel-token.txt` speichern. Den Dienst **nicht** über den angezeigten Befehl installieren.
3. „Next“ → „Public Hostname“: Domain wählen, Subdomain leer lassen (oder `www`), Typ `HTTP`, URL `127.0.0.1:3000`. Speichern.
4. Die Domain ohne `https://` in `data/domain.txt` schreiben, zum Beispiel `modcheck.de`.
5. `START_MODCHECK_ONLINE.bat` starten. Ohne `tunnel-token.txt` gibt es weiter einen Zufallslink.

Der Tunnel-Schlüssel ist ein Geheimnis: Wer ihn hat, kann deine Domain auf seinen eigenen Rechner umleiten. Nicht teilen, nicht in Chats posten. Bei Verdacht im Dashboard den Tunnel löschen und neu anlegen.

Empfohlen im Cloudflare-Dashboard der Domain: unter „SSL/TLS“ den Modus „Full“ und „Always Use HTTPS“ an, unter „Security“ → „Bots“ den „Bot Fight Mode“ an.

## Discord

Die Website postet über Webhooks in den Gilden-Discord. Die Adressen stehen in `data/discord-webhooks.json`, ein Eintrag pro Kanal; fehlende Einträge werden übersprungen. Änderungen gelten nach einem Neustart, das Server-Fenster zeigt dann „Discord verbunden: …“.

| Schlüssel | Kanal | Was gepostet wird |
|---|---|---|
| `ankuendigungen` | #ankündigungen | neue Themen in der Forum-Kategorie Ankündigungen |
| `raids` | #raid-planung | neue Raids, Erinnerung eine Stunde vor Start |
| `allgemein` | #allgemein | Boss-Kills, neue Hall-of-Fame-Einträge |
| `spielunke` | #spielunke | epische und legendäre Dreier am Automaten |
| `offiziere` | #website-meldungen | neue Registrierungen, die auf Freischaltung warten |
| `umfragen` | #umfragen | jede neue Umfrage als echte Discord-Umfrage (ohne Eintrag: #allgemein) |

Umfragen: Die Website liest alle 2 Minuten die Discord-Stimmen ihrer Umfragen aus und zählt sie zu den Website-Stimmen dazu. Webhooks sehen nur die Anzahl, nicht wer abgestimmt hat. Wer auf beiden Seiten abstimmt, zählt deshalb doppelt. „Beenden“ auf der Website stoppt nur die Website-Abstimmung, die Discord-Umfrage läuft bis zu ihrem eigenen Ende.

Neuer Webhook: In Discord Kanal → Zahnrad → Integrationen → WebHooks → Neuer WebHook → „WebHook-URL kopieren“ und in die Datei eintragen. Die Adressen sind geheim: Wer eine hat, kann in den Kanal posten. Bei Verdacht den Webhook in Discord löschen und neu anlegen. Die Website unterdrückt @everyone- und Rollen-Pings in allen Meldungen.

## Besucherstatistik mit Cloudflare Web Analytics

Ausgeschaltet, bis ein Schlüssel hinterlegt ist.

1. Kostenloses Konto auf https://dash.cloudflare.com anlegen.
2. Links „Analytics & Logs“ → „Web Analytics“ → „Add a site“. Als Hostname etwas Beliebiges eintragen, zum Beispiel `modcheck.trycloudflare.com`.
3. Im angezeigten Codeschnipsel steht `"token": "…"` mit 32 Zeichen. Nur diese Zeichen kopieren.
4. Im Ordner `data/` eine Datei `cf-analytics-token.txt` anlegen und den Schlüssel hineinschreiben.
5. Server neu starten. Die Startseite lädt dann das Messskript von Cloudflare, die Zahlen erscheinen nach einigen Minuten im Dashboard.

Ausschalten: Datei löschen und neu starten. Hinweise: Der Quick-Tunnel-Link wechselt bei jedem Start, Cloudflare zeigt deshalb mehrere Hostnamen. Werbeblocker unterdrücken das Skript oft, die Zahlen sind also eher zu niedrig. Cloudflare setzt keine Cookies, sieht aber die IP-Adressen der Besucher; bei öffentlichem Betrieb gehört das in die Datenschutzerklärung.

## Impressum und Datenschutz

Die Seite `rechtliches.html` ist auch für Gäste erreichbar und im Footer verlinkt. Sie enthält Fanprojekt-Vermerk, Impressum und Datenschutzhinweis. Der Absatz zur Besucherstatistik erscheint nur, wenn Cloudflare Web Analytics eingeschaltet ist.

Ohne weitere Angaben steht im Impressum nur „Privates, nicht-kommerzielles Projekt“. Das reicht für eine geschlossene Gildenseite meistens. Wird die Seite öffentlich, im Ordner `data/` eine Datei `impressum.txt` anlegen, eine Angabe pro Zeile, zum Beispiel:

```
Max Mustermann
Musterstraße 1
12345 Musterstadt
E-Mail: modcheck@example.de
```

Die Änderung gilt sofort, ohne Neustart. Der Datenschutztext ist allgemein gehalten und ersetzt keine Rechtsberatung.

## Sicherung

Server beenden, dann den ganzen Ordner `data/` kopieren. Darin liegen Datenbank und Uploads.

## Öffentlicher Betrieb

Der Server ist für den Betrieb hinter einem HTTPS-Proxy gedacht, zum Beispiel Caddy oder nginx.

- Den Node-Server auf `127.0.0.1` lassen und nur den Proxy öffentlich machen.
- `MODCHECK_HTTPS=1` setzen, sonst fehlt dem Sitzungscookie das Secure-Merkmal.
- `MODCHECK_TRUST_PROXY=1` nur setzen, wenn der Proxy `X-Forwarded-For` selbst schreibt. Sonst lassen sich die Anmelde-Limits umgehen.
- Der Proxy muss den `Host`-Header unverändert weitergeben, sonst scheitern Schreibzugriffe an der Ursprungsprüfung.
- `data/` regelmäßig sichern und nicht über den Webserver ausliefern.
- Vor der Veröffentlichung die Nutzungsbedingungen von Wowhead und Blizzard prüfen. Bilder, Icons und Karten gehören Blizzard. Beim öffentlichen Betrieb gelten zudem Impressums- und Datenschutzpflichten.

Die Anmelde-Limits liegen im Arbeitsspeicher und beginnen nach jedem Neustart von vorn. Der Server ist für eine einzelne Instanz gebaut.

## Cloudflare-Worker

`npm run build` erzeugt weiter eine Worker-Fassung, aber nur mit öffentlichem Katalog, Talenten und schreibgeschütztem Kalender. Accounts, Raids, Forum und alle weiteren Plattformfunktionen laufen ausschließlich mit `start.mjs`.

## Tests

```bash
npm test
```

Die Tests starten den echten Server mit einer Wegwerf-Datenbank und einer nachgestellten Wowhead-Antwort.
