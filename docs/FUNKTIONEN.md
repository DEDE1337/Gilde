# Funktionsstand und Testergebnisse

Stand: 02.11.2026, zwei Tage vor dem Start von WoW: Forever.

## Wichtig vorab

Der Auftrag setzte Login, Accounts, Mitgliederverwaltung, News und Patchnotes als vorhanden voraus. Im gelieferten Projekt gab es nichts davon. Alles wurde neu gebaut, die Mitgliederliste lag vorher nur im Browser.

## Umgesetzt und getestet

| Bereich | Stand |
|---|---|
| Gästezugang | Ohne Account sind nur Startseite und Anmeldung sichtbar. Der Server gibt Gästen außer Anmeldung und Registrierung keine Gilden-API frei. Statische Dateien wie Bilder, das Intro-Video und die allgemeinen Spieldaten (Katalog, Talente) bleiben per direkter Adresse abrufbar |
| Accounts | Registrierung mit Freischaltung, Login, Sitzungen, Passwortwechsel, Rollen und Einzelrechte serverseitig |
| Charaktere | Mehrere pro Account, Volk und Klasse geprüft, Hauptcharakter, Profil, Planer-Abgleich mit dem Server |
| Intro-Video | Erscheint einmal pro Browser beim ersten Besuch, überspringbar, im Footer erneut abrufbar. Blockiert der Browser den Ton, startet es per Knopf statt stumm |
| Kalender | Kleiner Monatskalender auf jeder Seite, auf schmalen Bildschirmen als Tages-Symbol, Großansicht per Klick mit Tagesdetails und kommenden Terminen, heutiger Tag orange markiert. Termine anlegen und bearbeiten sehen nur Berechtigte |
| Raidplaner | Erstellen, Rollenbedarf, Status, Anmeldung, Ersatzbank, Aufstellung, Verwaltung, Kalender-Sync, Benachrichtigungen |
| Raidfortschritt | Instanzen, Bosse, Kill-Dokumentation mit Teilnehmern und Screenshot, First Kill, Startseite |
| Hall of Fame | Einreichen, Prüfen, Suche, Filter, Chronik, Vorschlag aus First Kill |
| BiS | Listen mit Pflichtquelle, Items per Wowhead-ID, Alternativen, Status, Fortschritt nach Plätzen, gildenweite Wunschliste |
| Berufe | Berufe, Stufen, Rezepte per Wowhead-ID mit Materialien und Ergebnis, Handwerkersuche, Anfragen mit Status |
| Forum | Kategorien, Themen, Antworten, Bearbeiten, Löschen, Bilder, Suche, Likes (einer pro Mitglied, zweiter Klick nimmt ihn zurück), Moderation, Zugriffsschutz, Schwarzes Brett |
| Live und Navigation | Glocke im Kopf mit Zähler und Liste (als gelesen markieren, entfernen), Seiten aktualisieren sich selbst (Forum, Raids, Instanzen-Gruppen, Benachrichtigungen), Zurück/Vor und Neuladen bleiben über Hash-Adressen (`#topic/<id>`) auf der Seite |
| Dashboard | Alle sechs Bereiche, ein- und ausblendbar, sortierbar, im Account gespeichert |
| Legacy | Accountpunkte, Talente pro Charakter, Grenzen, Voraussetzungen, berechnete Meilensteine, Verlauf, Sichtbarkeit |
| News | Automatisch aus dem Wowhead-Forever-RSS |
| Tagesbonus | Slotmaschine mit elf Items mit eigenem Goldwert und Seltenheit, ein Dreh pro Tag nach deutscher Zeit, Ergebnis vom Server, Serie, eigene Ranglisten-Seite mit vier Wertungen. Epische und legendäre Items erscheinen nur als Dreier (zusammen 5 % pro Dreh) mit eigener Einblendung. Töne entstehen im Browser und lassen sich abschalten. Administratoren drehen unbegrenzt, Extra-Drehs zählen aber nicht. Gildengold ist nur ein Punktestand der Seite, weder Spielgold noch Geld, und lässt sich noch für nichts ausgeben |
| Spielunke | Eigener Reiter mit Automat, Roulette, Blackjack und Rangliste. Blackjack: sechs Decks, Geber zieht bis 17, Blackjack zahlt 3 zu 2, Karte, Halten und Verdoppeln, kein Teilen und keine Versicherung; Stapel und verdeckte Karte bleiben auf dem Server. Roulette: Rot und Schwarz zahlen 2-fach, Grün (nur die Null) 36-fach, die letzten 15 Zahlen sind gildenweit sichtbar, Einsatz nur bis zum Kontostand, Ergebnis vom Server |
| Patch-Tracker | Patches mit Prüfung vor Freigabe, Klassenübersicht, persönliche Auswirkungen, Talent-Marker, BiS-Kennzeichnung, Meldungen ohne Doppelte, automatischer Vergleich der Talentdaten als Entwurf |

## Testergebnisse

- `npm test`: 17 von 17 Testgruppen bestanden. Geprüft werden Rechte, Fremdzugriffe, Ursprungsprüfung, Uploads, Grenzen und die Abläufe aller Systeme gegen den echten Server, Wowhead ist nachgestellt.
- Browser mit echten Wowhead-Daten und eigener Test-Datenbank: Login, Charakter, Raid, Anmeldung, Bestätigung, Kalender, Bosskill, First Kill, Hall of Fame, BiS mit Fortschritt, Beruf, Rezept, Handwerkersuche, Forum, Schwarzes Brett, Legacy, Patch-Freigabe, Impact, Talent-Marker und Dashboard.
- Ein XSS-Versuch im Thementitel wurde als Text angezeigt.
- Handybreite 375 px: zwölf Seiten ohne seitliches Scrollen.
- Die Tests fanden einen echten Fehler: Eine ungültige Anfrage löschte gespeicherte Ausrüstung. Behoben.

## Nicht oder nur teilweise umgesetzt

- **Bossbilder:** Das Projekt enthält keine. Raidfortschritt und Instanzen zeigen Namen und Marker. Ich habe keine Bilder erfunden.
- **BiS-Listen sind leer.** Für Forever liegen vor dem Start keine belastbaren Listen vor. Das System ist bereit, Einträge brauchen eine Quelle.
- **Raids öffnen erst am 09.12.2026.** Hyjal Summit hat 13 Bosse ohne bekannte Namen, sie werden nachgetragen. Die acht Namen von Barrow Deeps sind aus Legacy-Herausforderungen abgeleitet und als unbestätigt markiert. Boss-Kills und BiS-Quellen sind daher noch nicht praxiserprobt.
- **Beutetabellen für Raids fehlen.** Bossbeute gibt es weiter nur für Todesminen, Burg Schattenfang und Gnomeregan.
- **Alle neun Klassen** sind in Planer, Talenten, Fähigkeiten, Levelreise, Katalog und Instanzen wählbar. Der Katalog enthält weiter nur Beute aus drei Dungeons. Rüstungs- und Waffenrechte werden nicht gesperrt, weil Forever von Classic abweicht und keine verlässliche Tabelle vorliegt; nur Zauberstäbe sind an Priester, Magier und Hexenmeister gebunden. Tank-Bewertungen gibt es nur für Krieger. Die Statistiken summieren Item-Grundwerte und sind keine vollständige Charakterberechnung.
- **Skyborne:** Für das 3D-Modell gibt es keine Daten; es erscheint ersatzweise ein Mensch. Die Klassenliste stammt aus Beta-Quellen.
- **Fähigkeiten:** Die Liste liegt als Zauber-IDs in `web/seed-abilities.json`. Der Server prüft jede ID live gegen die Klasse im Wowhead-Tooltip (216 von 219 bestätigt). Sie ist keine vollständige Rangliste, Forever-eigene Fähigkeiten können fehlen, zum Beispiel Siegesrausch beim Krieger. Wowheads Fähigkeiten-Listen antworten mit 403.
- **Levelreise:** Für alle Klassen außer Krieger aus Fähigkeitsstufen, Talentstart und Dungeons berechnet. Klassenquests sind nur beim Krieger gepflegt, sonst verweist die Seite auf den Klassenguide.
- **Patchnotes:** Es gibt keinen offiziellen maschinenlesbaren Forever-Feed. Der Tracker verlässt sich auf Wowhead-Meldungen, den Talentdatenvergleich und die Prüfung durch Admins. Buff oder Nerf setzt ein Mensch; Vergleiche beginnen neutral. Der automatische Vergleich deckt Talente ab, nicht Items.
- **Legacy-Daten** beruhen auf Beta-Quellen und sind teils unbestätigt. Die Herausforderungen selbst fehlen, drei Knoten je Baum sind in der Quelle noch unbekannt. Alles wird manuell gepflegt.
- **Bilder in Forum und Kill-Form** wurden über die API getestet, der Datei-Dialog nicht im Browser.
- **Offiziersrechte** wurden über die API getestet, in der Oberfläche nur mit dem Administrator.
- **Passwort vergessen:** Nur per Skript, kein E-Mail-Versand. Benachrichtigungen erscheinen nur auf der Seite.
- **Cloudflare-Worker** enthält die Plattform nicht.
- **Design:** Die Seite nutzt das Design „Schildwall“ (`web/schildwall.css`). Die älteren Stylesheets bleiben als Basis geladen. Jede Unterseite wurde auf Überbreite geprüft, im Detail angesehen wurden nur Startseite, Raidfortschritt, Charakter, Talente und Kalender.
