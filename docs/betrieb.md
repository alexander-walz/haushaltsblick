# Betrieb

## Überblick

| Workflow | Auslöser | Aufgabe |
| --- | --- | --- |
| `ci` | Pull Request, Push auf `main` | Typecheck, Unit- und Integrationstests |
| `ingest` | montags 04:17 UTC, manuell | Migrationen, Soll aus XML, Ist und Soll-Entwurf aus der internalapi, Rohdaten ins Release `rohdaten` |
| `keepalive` | täglich 05:42 UTC, manuell | eine Abfrage, damit Supabase Free nicht nach 7 Tagen pausiert |

`ingest` und `keepalive` laufen nur, wenn die Repository-Variable `HB_INGEST_AKTIV` den Wert `true` hat.
Geplante Workflows laufen nur auf dem Standard-Branch `main`.

## Inbetriebnahme (einmalig)

1. Supabase: neues Projekt `haushaltsblick`, Tarif Free, Region Frankfurt (`eu-central-1`). Datenbank-Passwort im Passwort-Manager ablegen.
2. Supabase → Connect → „Session pooler“ (IPv4): Verbindungs-URL kopieren, Passwort einsetzen, `?sslmode=require` anhängen. Das Passwort muss URL-kodiert sein: Sonderzeichen wie `@`, `:`, `/`, `#` und `%` werden zu `%40`, `%3A`, `%2F`, `%23` und `%25`.
3. GitHub → Settings → Secrets and variables → Actions:
   - Secret `SUPABASE_DB_URL` = URL aus Schritt 2
   - Variable `HB_INGEST_AKTIV` = `true`
4. GitHub → Actions → `ingest` → „Run workflow“ (Branch `main`, Jahre `alle`). Der erste Lauf dauert etwa 70 Minuten.

## Wenn ein Lauf rot ist

| Hinweis im Bericht | Bedeutung | Vorgehen |
| --- | --- | --- |
| `quarantined` mit „Summe der Kinder … weicht vom Knoten … ab“ | API inkonsistent oder unvollständig | Lauf manuell wiederholen; bleibt es, Archivdatei des Laufs prüfen und Befund schreiben |
| `quarantined` mit „Antwort verletzt das Schema“ | API-Struktur geändert | Archivdatei prüfen, Datenvertrag und Schema per Pull Request anpassen, `pipeline_version` erhöhen |
| `quarantined` bei der XML | Datenvertrag der XML verletzt | wie in Plan 1: Fixture, roter Test, Parser anpassen |
| `failed` mit „nach 4 Versuchen“ | Quelle nicht erreichbar | nächsten Lauf abwarten; bei Dauerausfall bleiben die letzten Daten aktiv |
| Rohdaten-Upload fehlgeschlagen | Release `rohdaten` nicht beschreibbar oder GitHub gestört | betroffene Jahre mit `neu_laden` erneut laufen lassen (Archivnamen sind inhaltsbasiert, nichts wird überschrieben) |
| Warnungen „Unbekanntes Feld …“ | API liefert neue Felder | kein Handlungsbedarf, beim nächsten Schema-Update aufnehmen |

## Unbeaufsichtigter Betrieb

GitHub deaktiviert geplante Workflows in öffentlichen Repositories nach 60 Tagen ohne Aktivität im Repository. Danach pausiert Supabase Free etwa 7 Tage später die Datenbank.
Eine GitHub-Benachrichtigung kündigt die Deaktivierung an.

Wiederherstellen: GitHub → Actions → Workflow → „Enable workflow“, danach `keepalive` und `ingest` einmal manuell starten.

Nach einer Erhöhung der `pipeline_version` lädt der nächste Lauf alle Jahre automatisch neu (auch bei unverändertem Stand der Quelle). Die Dauer entspricht dem Erstlauf.

## Rohdaten

Alle Rohdaten liegen gzip-komprimiert im Release `rohdaten`. `raw.source_file.ablage_uri` und `raw.api_abruf.ablage_uri` verweisen auf die Download-URL.
Läufe vor Plan 2 verweisen noch auf lokale Pfade.

Ein Release fasst bis zu 1000 Assets; erwartet sind etwa 50 bis 100 neue Dateien pro Jahr.
