# ModCheck auf Railway betreiben

ModCheck läuft dort als Docker-Container. Railway erkennt das `Dockerfile` und `railway.json` im Repository selbst.

## 1. Dienst anlegen

1. Bei Railway: **New Project → Deploy from GitHub repo** und `DEDE1337/Gilde` wählen.
2. Beim ersten Build läuft die Seite noch ohne dauerhaften Speicher. Das ist nur zum Testen gedacht, sofort mit Schritt 2 weitermachen.

## 2. Volume für die Datenbank (wichtig)

Ohne Volume ist die Datenbank bei jedem Deploy weg: Konten, Raids, Forum, Gold, alles.

1. Im Projekt auf den Dienst, dann **Settings → Volumes** (oder Rechtsklick auf die Fläche → **Volume**).
2. **Mount path:** `/data`
3. Neu deployen.

## 3. Variablen (Dienst → Variables)

| Variable | Wert | Zweck |
|---|---|---|
| `MODCHECK_BOOTSTRAP_ADMIN` | dein Admin-Name, z. B. `Kevin` | legt beim ersten Start den Administrator an |
| `MODCHECK_DOMAIN` | `modcheck.de` | Link in den Discord-Meldungen |
| `MODCHECK_DISCORD_WEBHOOKS` | der Inhalt von `data/discord-webhooks.json` als eine Zeile | Meldungen und Umfragen in Discord |

Optional: `MODCHECK_DISCORD_BOT_TOKEN` (Freischalten per Emoji, siehe unten), `MODCHECK_IMPRESSUM` (Zeilen mit `\n` trennen), `MODCHECK_CF_ANALYTICS_TOKEN` und `MODCHECK_TWITCH_CHANNEL` (Twitch-Kanalname für das Stream-Fenster auf der Startseite).

Schon im Dockerfile gesetzt, nichts zu tun: `HOST`, `MODCHECK_DATA=/data`, `MODCHECK_HTTPS=1`, `MODCHECK_TRUST_PROXY=proxy`. Den Port setzt Railway selbst.

Die Webhook-Adressen sind geheim, wer sie hat, kann in deine Discord-Kanäle schreiben. Sie gehören in die Railway-Variablen und nie ins Repository.

## Registrierungen per Emoji freischalten (optional)

Jede neue Registrierung erscheint in `#offiziere` mit ✅ und ❌. Die erste Reaktion eines Offiziers entscheidet, die Seite prüft alle 15 Sekunden. Bei beiden Emojis gilt ❌. Eine Ablehnung sperrt das Konto nur, auf der Seite lässt es sich wieder freischalten. Ohne Bot-Token bleibt es bei der normalen Meldung ohne Emojis.

Webhooks können nicht reagieren, deshalb braucht es einen eigenen Bot:

1. Im Discord Developer Portal eine Anwendung anlegen, unter **Bot** den Token erzeugen (nur dort sichtbar).
2. Den Bot per **OAuth2 → URL Generator** (Scope `bot`) auf den Server einladen.
3. Im Kanal `#offiziere` dem Bot diese Rechte geben: Kanal ansehen, Nachrichtenverlauf lesen, Reaktionen hinzufügen. Der Kanal muss privat bleiben: Wer dort reagieren kann, darf entscheiden.
4. In Railway die Variable `MODCHECK_DISCORD_BOT_TOKEN` mit dem Token setzen. Der Token gehört nie ins Repository.

## 4. Domain

**Settings → Networking → Custom Domain:** `modcheck.de` eintragen. Railway zeigt dann zwei DNS-Einträge:

- **CNAME** `@` → `….up.railway.app`
- **TXT** `_railway-verify` → `railway-verify=…`

Hinweis: Auf einer Hauptdomain sind CNAME-Einträge normalerweise nicht erlaubt. Funktioniert das beim DNS-Anbieter nicht, die Domain über Cloudflare laufen lassen (Nameserver umstellen, dort ist ein CNAME auf `@` möglich) oder `www.modcheck.de` verwenden.

## 5. Erster Start

1. In **Deployments → Logs** steht eine Zeile `*** Administrator "…" angelegt. Einmaliges Passwort: …`.
2. Mit diesem Namen und Passwort anmelden, das Passwort unter **Einstellungen** ändern.
3. Die Variable `MODCHECK_BOOTSTRAP_ADMIN` löschen.

## 6. Prüfen, dass Besucher-IPs stimmen

Die Anmelde-Sperren arbeiten pro IP-Adresse. Sieht der Server hinter dem Proxy nur dessen Adresse, teilen sich alle Besucher dasselbe Limit.

Als Administrator `https://modcheck.de/api/admin/client-ip` öffnen. `seenAs` muss deine echte öffentliche IP sein (Vergleich z. B. mit wieistmeineip.de), nicht eine interne Adresse wie `10.x.x.x` oder `100.x.x.x`. Stimmt es nicht, die Variable `MODCHECK_TRUST_PROXY` ändern oder mir die Ausgabe schicken.

Läuft zusätzlich Cloudflare als Proxy vor Railway, passt der Modus `proxy` nicht mehr, dann `MODCHECK_TRUST_PROXY=cloudflare` setzen.

## Was nicht mitkommt

Railway startet mit einer **leeren Datenbank**. Alles, was bisher nur auf deinem PC in `data/modcheck.sqlite` steht, ist dort nicht vorhanden: Konten, Forenbeiträge, Umfragen, Kalendertermine. Die Datenbank in das Volume zu kopieren geht nur über die Railway-Kommandozeile und ist hier nicht getestet. Ein Neustart ohne Altdaten ist der einfachere Weg.

## Sicherung

Die Datenbank liegt nur im Volume. Prüfe in den Railway-Einstellungen des Volumes, ob automatische Sicherungen in deinem Tarif enthalten sind, und verlasse dich nicht darauf, ohne eine Wiederherstellung einmal ausprobiert zu haben.
