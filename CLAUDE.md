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

## Stack (Stand Plan 1)
Node 24, pnpm Workspaces, TypeScript strict (ESM, moduleResolution Bundler, Quellpakete ohne Build),
Vitest, saxes, postgres (porsager), Supabase CLI 2.120.0 lokal über pnpm dlx.

## Befehle
- pnpm test                 Unit-Tests aller Pakete
- pnpm test:int             Integrationstests (lokale Datenbank muss laufen)
- pnpm typecheck
- pnpm db:start | db:reset | db:stop    lokale Postgres-Datenbank mit Migrationen
- pnpm --filter @hb/ingest start --jahre 2024-2026     Soll-Ingest, INGEST_USER_AGENT muss gesetzt sein
- pnpm --filter @hb/ingest start --jahre 2026 --datei fixtures/soll_2026_auszug.xml   Ingest aus lokaler Datei
  Achtung: schreibt in die lokale Datenbank. Läufe mit params.datei sind Testläufe und müssen in allen Auswertungen ausgeschlossen werden (where params->>'datei' is null).

## Konventionen
- Fachbegriffe deutsch (soll, einzelplan_nr, ladeSollJahr), technische Begriffe englisch.
- Datenbank: snake_case, Migrationen nur additiv, Dateien mit Zeitstempel unter supabase/migrations.
- Unit-Tests *.test.ts, Integrationstests gegen die lokale Datenbank *.int.test.ts, jeweils neben dem Code.
- Integrationstests laufen in einer Transaktion, die am Ende zurückgerollt wird (imRollback).
- UI-Texte: deutsch, kurz, partnerschaftlich, keine Halbgeviert- oder Geviertstriche.

## Arbeitsweise
- Testgetrieben: erst roter Test, dann Code.
- Externe Quellen höflich abrufen: eindeutiger User-Agent mit Kontakt, höchstens 2 Anfragen pro Sekunde.
- Definition of Done: pnpm typecheck, pnpm test und pnpm test:int grün, KONZEPT.md bei Abweichungen aktualisiert.
