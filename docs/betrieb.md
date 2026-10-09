# Betrieb

## Überblick

| Workflow | Auslöser | Aufgabe |
| --- | --- | --- |
| `ci` | Pull Request, Push auf `main` | Typecheck, Unit- und Integrationstests |
| `ingest` | montags 04:17 UTC, manuell | Migrationen, Soll (XML und internalapi), Ist, Systematik, dbt (Seeds, Modelle, Tests), Ampel und Veröffentlichung, Rohdaten ins Release `rohdaten` |
| `keepalive` | täglich 05:42 UTC, manuell | eine Abfrage, damit Supabase Free nicht nach 7 Tagen pausiert |

`ingest` und `keepalive` laufen nur, wenn die Repository-Variable `HB_INGEST_AKTIV` den Wert `true` hat.
Geplante Workflows laufen nur auf dem Standard-Branch `main`.

## Inbetriebnahme (einmalig)

1. Supabase: neues Projekt `haushaltsblick`, Tarif Free, Region Frankfurt (`eu-central-1`). Datenbank-Passwort im Passwort-Manager ablegen.
2. Supabase → Connect → „Session pooler“ (IPv4): Verbindungs-URL kopieren, Passwort einsetzen, `?sslmode=require` anhängen. Das Passwort muss URL-kodiert sein: Sonderzeichen wie `@`, `:`, `/`, `#` und `%` werden zu `%40`, `%3A`, `%2F`, `%23` und `%25`.
3. GitHub → Settings → Secrets and variables → Actions:
   - Secret `SUPABASE_DB_URL` = URL aus Schritt 2
   - Variable `HB_INGEST_AKTIV` = `true`
4. GitHub → Actions → `ingest` → „Run workflow“ (Branch `main`, Jahre `alle`). Der erste Lauf dauert mehrere Stunden (Zeitlimit 300 Minuten).

## Wenn ein Lauf rot ist

| Hinweis im Bericht | Bedeutung | Vorgehen |
| --- | --- | --- |
| `quarantined` mit „Summe der Kinder … weicht vom Knoten … ab“ | API inkonsistent oder unvollständig | Lauf manuell wiederholen; bleibt es, Archivdatei des Laufs prüfen und Befund schreiben |
| `quarantined` mit „Antwort verletzt das Schema“ | API-Struktur geändert | Archivdatei prüfen, Datenvertrag und Schema per Pull Request anpassen, `pipeline_version` erhöhen |
| `quarantined` bei der XML | Datenvertrag der XML verletzt | wie in Plan 1: Fixture, roter Test, Parser anpassen |
| `failed` mit „nach 4 Versuchen“ | Quelle nicht erreichbar | nächsten Lauf abwarten; bei Dauerausfall bleiben die letzten Daten aktiv |
| Rohdaten-Upload fehlgeschlagen | Release `rohdaten` nicht beschreibbar oder GitHub gestört | betroffene Jahre mit `neu_laden` erneut laufen lassen (Archivnamen sind inhaltsbasiert, nichts wird überschrieben) |
| DQ-16 rot | Mart-Summen weichen von der API-Wurzel ab, Transformation fehlerhaft | dbt-Modelle prüfen (`dbt/models`), Befund in `ops.dq_ergebnis.details` lesen; die bisherige Version bleibt aktiv |
| DQ-13 rot | Ist eines abgeschlossenen Jahres fehlt in einem Konto | Lauf mit `neu_laden` für das Jahr starten |
| DQ-14 gelb | XML- und API-Soll unterscheiden sich ohne Nachtrag oder Entwurf | Befund prüfen; kein Blocker, die Veröffentlichung läuft weiter |
| Warnungen „Unbekanntes Feld …“ | API liefert neue Felder | kein Handlungsbedarf, beim nächsten Schema-Update aufnehmen |

## Datenqualität und Veröffentlichung

Nach den Ingest-Schritten laufen `dbt seed`, `dbt run` und `dbt test` (getrennt, damit ein fehlgeschlagener Test die übrigen Prüfungen nicht überspringt). Der Schritt „Ampel und Veröffentlichung“ liest `dbt/target/run_results.json`, speichert die Ergebnisse in `ops.dq_lauf` und `ops.dq_ergebnis` und bewertet die Ampel.

| ID | Kategorie | Prüfung | Schwere |
| --- | --- | --- | --- |
| DQ-01 | Vollständigkeit | Jeder Einzelplan des API-Solls ist in der XML vorhanden (nur Jahre mit identischem Stand) | error |
| DQ-02 | Eindeutigkeit | Titelschlüssel je Jahr eindeutig im Mart | error |
| DQ-03 | Gültigkeit | Titel 5-, Kapitel 4-stellig mit Einzelplan als Präfix, Funktion 3-stellig | error |
| DQ-04 | Referenzielle Integrität | Jede Funktionskennziffer hat eine Bezeichnung | warn |
| DQ-05 | Referenzielle Integrität | Jede Gruppierungsnummer hat eine Bezeichnung | warn |
| DQ-06 | Konsistenz | Hauptgruppe 0 bis 3 nur in Einnahmen, 4 bis 9 nur in Ausgaben | warn |
| DQ-07 | Abgleich | Einzelplansummen XML gleich API-Soll (nur Jahre mit identischem Stand) | error |
| DQ-08 | Abgleich | API-Soll: Einnahmen gleich Ausgaben je Jahr | error |
| DQ-09 | Abgleich | Summen entsprechen den gepflegten Kontrollsummen | error |
| DQ-10 | Aktualität | Letzter Ladelauf je Quelle jünger als 8 Tage | warn |
| DQ-11 | Plausibilität | Anzahl Titel je Jahr und Konto weicht höchstens 15 % vom Vorjahr ab | warn |
| DQ-12 | Schema | Letzter Lauf je Schlüssel weder fehlgeschlagen noch in Quarantäne | warn |
| DQ-13 | Vollständigkeit | Ist für alle Jahre bis zum Vorvorjahr in beiden Konten geladen | error |
| DQ-14 | Abgleich | Unterschied XML- zu API-Soll nur bei Nachtrag oder Entwurf | warn |
| DQ-15 | Abgleich | API-Ist: Einnahmen gleich Ausgaben je Jahr | error |
| DQ-16 | Konsistenz | Mart-Summen je Jahr und Konto gleich der API-Wurzel (Soll und Ist) | error |

Ampel: grün (alle Prüfungen bestanden), gelb (nur Warnungen), rot (mindestens eine Fehler-Prüfung fehlgeschlagen). Eine rote Ampel wird nie veröffentlicht, die bisherige Version bleibt aktiv.

Aktueller Stand:

```sql
select * from ops.dataset_version where is_current;
select check_id, status, details from ops.dq_ergebnis where dq_lauf_id = (select max(dq_lauf_id) from ops.dq_lauf);
```

### Lokale Nutzung

```bash
uv venv
pnpm dbt seed && pnpm dbt run && pnpm dbt test --vars '{dq13_ab_jahr: <jahr>}'
pnpm --filter @hb/ingest veroeffentliche
```

`dq13_ab_jahr` begrenzt DQ-13 bei unvollständigen lokalen Daten auf Jahre ab `<jahr>`.

## Aufräumen

Nach jeder Veröffentlichung bleiben in `raw` nur die maßgeblichen Läufe; ältere Rohdaten liegen weiterhin im Release `rohdaten`.

## Unbeaufsichtigter Betrieb

GitHub deaktiviert geplante Workflows in öffentlichen Repositories nach 60 Tagen ohne Aktivität im Repository. Danach pausiert Supabase Free etwa 7 Tage später die Datenbank.
Eine GitHub-Benachrichtigung kündigt die Deaktivierung an.

Wiederherstellen: GitHub → Actions → Workflow → „Enable workflow“, danach `keepalive` und `ingest` einmal manuell starten.

Nach einer Erhöhung der `pipeline_version` lädt der nächste Lauf alle Jahre automatisch neu (auch bei unverändertem Stand der Quelle). Die Dauer entspricht dem Erstlauf.

## Rohdaten

Alle Rohdaten liegen gzip-komprimiert im Release `rohdaten`. `raw.source_file.ablage_uri` und `raw.api_abruf.ablage_uri` verweisen auf die Download-URL.
Läufe vor Plan 2 verweisen noch auf lokale Pfade.

Ein Release fasst bis zu 1000 Assets; erwartet sind etwa 50 bis 100 neue Dateien pro Jahr.
