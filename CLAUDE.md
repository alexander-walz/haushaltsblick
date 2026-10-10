# Haushaltsblick

Vertrauenswürdiges KI-Dashboard zum Bundeshaushalt. Privater Showcase von Alexander, kostenfrei betrieben.
Konzept: docs/KONZEPT.md. Entscheidungen, die das Konzept ändern, stehen in
docs/superpowers/plans/2026-10-08-00-roadmap.md und gelten bei Widerspruch vor dem Konzept.
Umsetzungspläne: docs/superpowers/plans/.

## Nicht verhandelbare Prinzipien
- Das Sprachmodell rechnet nie. Jede Zahl stammt aus einer RPC-Funktion im Schema api.
- Kein freies SQL vom Modell.
- Keine Veröffentlichung eines Datenstands mit roter Qualitätsprüfung.
- Rohdaten nie still verwerfen: Unbekannte Struktur ist ein Vertragsfehler, der Lauf geht in Quarantäne.
- Anlagen (Wirtschaftspläne von Sondervermögen) zählen nie zum Gesamthaushalt (Roadmap E1).
- Audit-Tabellen sind nur anfügbar.
- Geheimnisse nur serverseitig, nie mit NEXT_PUBLIC_.
- Kostenfrei bleiben: nichts einbauen, was einen kostenpflichtigen Tarif voraussetzt.

## Stack (Stand Plan 4)
Node 24, pnpm Workspaces, TypeScript strict (ESM, moduleResolution Bundler, Quellpakete ohne Build),
Vitest, saxes, postgres (porsager), Supabase CLI 2.120.0 lokal über pnpm dlx.
dbt-core 1.12.5 mit dbt-postgres 1.11.0 (Python 3.13, lokal in .venv über uv).
Postgres-Erweiterungen pg_trgm und unaccent im Schema extensions.

## Befehle
- pnpm test                 Unit-Tests aller Pakete
- pnpm test:int             Integrationstests (lokale Datenbank muss laufen; braucht einmal `pnpm dbt seed` für die Semantik-Seeds)
- pnpm typecheck
- pnpm db:start | db:reset | db:stop    lokale Postgres-Datenbank mit Migrationen
- uv venv .venv --python 3.13 && uv pip install --python .venv -r dbt/requirements.txt   dbt einrichten (einmalig)
- pnpm dbt seed && pnpm dbt run && pnpm dbt test   Seeds, Modelle, Unit-Tests und DQ-Prüfungen gegen DATABASE_URL (Standard lokal); nicht dbt build, das überspringt nach einem roten Test die abhängigen Knoten und Prüfungen
- pnpm dbt test --select "test_type:unit"   nur dbt-Unit-Tests
- pnpm --filter @hb/ingest start --jahre 2024-2026     Soll-Ingest, INGEST_USER_AGENT muss gesetzt sein
- pnpm --filter @hb/ingest start --jahre 2026 --datei fixtures/soll_2026_auszug.xml   Ingest aus lokaler Datei
  Achtung: schreibt in die lokale Datenbank. Läufe mit params.datei sind Testläufe und müssen in allen Auswertungen ausgeschlossen werden (where params->>'datei' is null).
- pnpm --filter @hb/ingest api --quote ist --jahre 2012-2025   Ist aus der internalapi (beide Konten), --konten ausgaben|einnahmen, --neu-laden
- pnpm --filter @hb/ingest api --quote soll --jahre 2027       Soll-Entwurf des Folgejahres aus der internalapi
- pnpm --filter @hb/ingest systematik --jahre alle     Bezeichnungen der Funktionen und Gruppierungen je Jahr (--konten, --sichten, --neu-laden)
- pnpm --filter @hb/ingest veroeffentliche   Ampel aus dbt-Ergebnissen, DQ-Lauf speichern, bei grün/gelb neue Datenversion veröffentlichen und raw aufräumen (--ohne-aufraeumen: ohne Aufräumen; nach dbt mit --vars nur mit --testlauf)
- pnpm --filter @hb/ingest raeume-auf   raw auf die maßgeblichen Läufe reduzieren (im Workflow erst nach erfolgreichem Archiv-Upload)

## Konventionen
- Fachbegriffe deutsch (soll, einzelplan_nr, ladeSollJahr), technische Begriffe englisch.
- Datenbank: snake_case, Migrationen nur additiv, Dateien mit Zeitstempel unter supabase/migrations.
- Unit-Tests *.test.ts, Integrationstests gegen die lokale Datenbank *.int.test.ts, jeweils neben dem Code.
- Integrationstests laufen in einer Transaktion, die am Ende zurückgerollt wird (imRollback).
- UI-Texte: deutsch, kurz, partnerschaftlich, keine Halbgeviert- oder Geviertstriche.
- Funktionen im Schema api sind security definer mit festem search_path, lesen nur semantic.stand(version), haben keine Überladungen und werfen Fehler mit errcode 22023. Hilfsfunktionen liegen in semantic.
- Jede Funktion in api und semantic entzieht PUBLIC ausdrücklich das Ausführungsrecht (revoke all ... from public); Default-Privilegien je Schema wirken dafür nicht. Ein Wächtertest in packages/ingest/src/abfrage/grundlagen.int.test.ts prüft das.

## Arbeitsweise
- Testgetrieben: erst roter Test, dann Code.
- Externe Quellen höflich abrufen: eindeutiger User-Agent mit Kontakt, höchstens 2 Anfragen pro Sekunde.
- User-Agent ohne E-Mail: Standard ist Haushaltsblick/<version> (+https://github.com/alexander-walz/haushaltsblick).
- Bei jeder Änderung an Parser oder Crawler die Version in packages/ingest/package.json erhöhen (pipeline_version); bei Änderungen an dbt-Modellen die Version in dbt/dbt_project.yml (Roadmap E20).
- Alle Abrufe laufen nacheinander über die Drossel (500 ms), nie parallel.
- Definition of Done: pnpm typecheck, pnpm test und pnpm test:int grün, KONZEPT.md bei Abweichungen aktualisiert.
