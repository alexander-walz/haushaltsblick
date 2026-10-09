# Betrieb

## Überblick

| Workflow | Auslöser | Aufgabe |
| --- | --- | --- |
| `ci` | Pull Request, Push auf `main` | Typecheck, Unit- und Integrationstests |
| `ingest` | montags 04:17 UTC, manuell | Migrationen, Soll (XML und internalapi), Ist, Systematik, dbt (Seeds, Modelle, Tests), Rohdaten ins Release `rohdaten`, Ampel und Veröffentlichung, Rohdaten in `raw` aufräumen |
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
| DQ-14 gelb | XML- und API-Soll unterscheiden sich ohne Nachtrag oder Entwurf, oder das Stand-Label der API ist unbekannt (`stand = 'unbekannt'`) | Befund prüfen; bei neuem Label `dim_haushaltsstand.sql` ergänzen; kein Blocker, die Veröffentlichung läuft weiter |
| DQ-17 rot | API-Soll fehlt für ein Jahr und Konto mit Ist oder für ein Jahr bis zum laufenden Jahr | Lauf `api --quote soll` mit `neu_laden` für das Jahr starten; ohne API-Soll werden Abweichung und Ist-Quote nie aus dem XML-Soll berechnet |
| DQ-18 gelb | Datenbank größer als 400 MB (Supabase Free: 500 MB) | Abschnitt „Speicherbudget“ befolgen |
| „nicht veröffentlicht: dbt mit --vars ausgeführt (Testlauf)“ | dbt lief mit gelockerten Prüfungen (`--vars`) | im Workflow nicht vorgesehen; lokal bewusst mit `--testlauf` veröffentlichen |
| Schritt „Rohdaten aufräumen“ übersprungen | Archiv-Upload oder Veröffentlichung nicht erfolgreich | nichts tun; `raw` bleibt vollständig, der nächste erfolgreiche Lauf räumt auf |
| Warnungen „Unbekanntes Feld …“ | API liefert neue Felder | kein Handlungsbedarf, beim nächsten Schema-Update aufnehmen |

## Datenqualität und Veröffentlichung

Nach den Ingest-Schritten laufen `dbt seed`, `dbt run` und `dbt test` (getrennt, damit ein fehlgeschlagener Test die übrigen Prüfungen nicht überspringt). Danach werden die Rohdaten im Release `rohdaten` abgelegt. Der Schritt „Ampel und Veröffentlichung“ liest `dbt/target/run_results.json`, speichert die Ergebnisse in `ops.dq_lauf` und `ops.dq_ergebnis`, den dbt-Aufruf (`args` mit `vars`, `select`, `exclude`, `which` sowie `invocation_id`) in `ops.dq_lauf.dbt_aufruf` und bewertet die Ampel. Für die Ampel zählt die Schwere aus dem Katalog `ops.dq_check`; weicht die Schwere eines dbt-Tests davon ab, schlägt die Prüfung fehl.

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
| DQ-17 | Vollständigkeit | API-Soll für jedes Jahr und Konto mit Ist sowie für alle Jahre ab dq13_ab_jahr bis zum laufenden Jahr geladen | error |
| DQ-18 | Betrieb | Datenbankgröße unter 400 MB (Supabase Free: 500 MB) | warn |

Ampel: grün (alle Prüfungen bestanden), gelb (nur Warnungen), rot (mindestens eine Fehler-Prüfung fehlgeschlagen). Eine rote Ampel wird nie veröffentlicht, die bisherige Version bleibt aktiv.

Aktueller Stand:

```sql
select * from ops.dataset_version where is_current;
select check_id, status, details from ops.dq_ergebnis where dq_lauf_id = (select max(dq_lauf_id) from ops.dq_lauf);
```

### Lokale Nutzung

```bash
uv venv .venv --python 3.13 && uv pip install --python .venv -r dbt/requirements.txt
pnpm dbt seed && pnpm dbt run && pnpm dbt test --vars '{dq13_ab_jahr: <jahr>}'
pnpm --filter @hb/ingest veroeffentliche --testlauf --ohne-aufraeumen
```

`dq13_ab_jahr` begrenzt DQ-13 und DQ-17 bei unvollständigen lokalen Daten auf Jahre ab `<jahr>`. Ein dbt-Lauf mit `--vars` ist ein Testlauf: `veroeffentliche` speichert dann nur den DQ-Lauf, veröffentlicht nicht und endet mit 1 („nicht veröffentlicht: dbt mit --vars ausgeführt (Testlauf)“). Mit `--testlauf` wird trotzdem veröffentlicht; der Bericht nennt dann „Testlauf (vars: …)“, und `ops.dq_lauf.dbt_aufruf` hält die vars fest. `--ohne-aufraeumen` lässt `raw` unverändert; `pnpm --filter @hb/ingest raeume-auf` räumt separat auf.

Der erste Ingest-Lauf nach einem Wechsel der `pipeline_version` lädt alle Jahre neu und dauert etwa 2,5 Stunden.

## Aufräumen

Der Schritt „Rohdaten aufräumen“ (`pnpm --filter @hb/ingest raeume-auf`) läuft nur, wenn sowohl der Archiv-Upload ins Release `rohdaten` als auch die Veröffentlichung erfolgreich waren. Danach bleiben in `raw` nur die maßgeblichen Läufe; ältere Rohdaten liegen weiterhin im Release `rohdaten`. Die Veröffentlichung selbst läuft im Workflow mit `--ohne-aufraeumen`, damit nie Rohdaten gelöscht werden, deren Archiv noch nicht hochgeladen ist.

## Speicherbudget

Supabase Free erlaubt 500 MB; DQ-18 warnt ab 400 MB.

- Vor dem ersten Lauf nach diesem Update die Datenbankgröße im Supabase-Dashboard prüfen (Project → Database → Database size oder `select pg_size_pretty(pg_database_size(current_database()));` im SQL-Editor).
- Nach dem ersten Aufräumen im SQL-Editor `vacuum full raw.soll_titel; vacuum full raw.api_titel;` ausführen. Gelöschte Zeilen geben den Platz sonst nicht an das Dateisystem zurück, und die Größe sinkt nicht.
- Jede Schemaänderung von `mart.fct_titel_jahr`, die alle Zeilen ändert (neue Spalte, geänderte Berechnung), lässt die Historie `mart.fct_titel_jahr_hist` einmalig um eine volle Version wachsen (etwa 70 MB).

## Unbeaufsichtigter Betrieb

GitHub deaktiviert geplante Workflows in öffentlichen Repositories nach 60 Tagen ohne Aktivität im Repository. Danach pausiert Supabase Free etwa 7 Tage später die Datenbank.
Eine GitHub-Benachrichtigung kündigt die Deaktivierung an.

Wiederherstellen: GitHub → Actions → Workflow → „Enable workflow“, danach `keepalive` und `ingest` einmal manuell starten.

Nach einer Erhöhung der `pipeline_version` lädt der nächste Lauf alle Jahre automatisch neu (auch bei unverändertem Stand der Quelle). Die Dauer entspricht dem Erstlauf (etwa 2,5 Stunden).

## Rohdaten

Alle Rohdaten liegen gzip-komprimiert im Release `rohdaten`. `raw.source_file.ablage_uri` und `raw.api_abruf.ablage_uri` verweisen auf die Download-URL.
Läufe vor Plan 2 verweisen noch auf lokale Pfade.

Ein Release fasst bis zu 1000 Assets; erwartet sind etwa 50 bis 100 neue Dateien pro Jahr.
