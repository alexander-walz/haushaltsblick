# Plan 4: Semantik und Abfrageschicht – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard und KI bekommen eine einzige, geprüfte Abfrageschicht. Funktionen im Schema `api` liefern alle Kennzahlen, darunter Soll, Ist, Abweichung, Anteile, Beträge je Kopf und je Tag und Vorjahresvergleiche. Dazu kommen Suche, Titeldetails mit Zeitreihe über Ressortwechsel, Glossar und Datenstand. Jede Antwort ist an eine veröffentlichte Datenversion und eine Semantik-Version gebunden.

**Architecture:**
- **Semantik-Seeds:** Die Inhalte der Semantik (Kennzahlenkatalog, Synonyme, Glossar, Einwohnerzahlen) liegen als dbt-Seeds `core.semantik_*` im Repository.
- **Semantik-Version:** Jede Veröffentlichung legt diese Inhalte unveränderlich als `semantic.semantik_version` ab, neu nur bei geändertem Inhalt, und verknüpft die Datenversion damit (Roadmap E3).
- **Abfragefunktionen:** Alle Funktionen im Schema `api` sind `security definer` mit festem `search_path`. Sie lesen ausschließlich `mart.fct_titel_jahr_hist` der angefragten oder aktuellen Version, über die Hilfsfunktion `semantic.stand(version)`.
- **`api.query_metric`:** baut SQL nur aus Positivlisten. Filterwerte gehen als Parameter hinein, nie als Text.
- **Titel-Lineage:** Sie entsteht zur Abfragezeit, konservativ: gleiche Titelnummer, gleiche Bezeichnung, in beiden Richtungen eindeutig.
- **Speicher:** `core.dim_titel`, `core.fct_betrag` und `mart.agg_*` werden Views.

**Tech Stack:** wie Plan 1 bis 3 (Node 24, pnpm 11.0.9, TypeScript 7.0.2, Vitest 5.0.3, postgres 3.4.9, Supabase CLI 2.120.0, dbt-core 1.12.5 mit dbt-postgres 1.11.0). Neu sind die Postgres-Erweiterungen `pg_trgm` und `unaccent` im Schema `extensions`. Beide gehören zum Supabase-Standard und kosten nichts.

**Spec:** `docs/KONZEPT.md` Abschnitt 10 zusammen mit `docs/superpowers/plans/2026-10-08-00-roadmap.md`. E1, E3, E10, E13, E14, E16 und der Abschnitt „Übertrag aus Plan 3“ gelten vor dem Konzept, ebenso die Entscheidung „API und Frontend lesen ausschließlich `mart.fct_titel_jahr_hist`“.

## Global Constraints

- **Aus Plan 1 bis 3:**
  - Migrationen nur additiv, nie `db:reset`.
  - Anlagen nie im Gesamthaushalt.
  - Beträge `numeric(18,2)`.
  - Ist nicht verfügbarer Jahre ist `null`, nie 0.
  - User-Agent ohne E-Mail.
- **Lesequelle der Abfragefunktionen:** nur `mart.fct_titel_jahr_hist`, gefiltert auf eine Version: `gueltig_ab_version <= v and (gueltig_bis_version is null or gueltig_bis_version > v)`. Nie `mart.fct_titel_jahr`, `mart.agg_*` oder `core.*`.
- **Funktionen im Schema `api`:**
  - `language plpgsql`, `security definer`, `set search_path = pg_catalog, pg_temp`; mit Trigramm-Funktionen `set search_path = pg_catalog, extensions, pg_temp`.
  - Eigene Objekte immer schemaqualifiziert (`mart.`, `semantic.`, `ops.`).
  - `revoke all … from public` und `grant execute … to anon, authenticated, service_role`.
  - Keine Überladungen.
- **Hilfsfunktionen** liegen im Schema `semantic`, nie in `api`, weil die Data API jede Funktion in `api` als RPC anbietet. `anon` und `authenticated` haben keine Rechte auf `semantic`, `mart`, `ops`, `core` und `raw`.
- **Fehlermeldungen** deutsch mit `errcode = '22023'` bei unzulässigen Parametern. PostgREST antwortet darauf mit HTTP 400.
- **Zeitlimit:** Kein `set statement_timeout` an Funktionen, weil es dort für die laufende Anweisung nicht greift. Es gilt das Rollenlimit von Supabase (`anon` 3 s, `authenticated` 8 s).
- **Feste Werte:**
  - Höchstens 500 Zeilen je `query_metric`, Standard 50.
  - Höchstens 50 Treffer je Suche, Standard 20.
  - Anteile auf 6 Nachkommastellen gerundet, Beträge je Kopf und je Tag auf 2.
- **Einwohnerzahl:** Bevölkerung am 1. Januar des Haushaltsjahres, Eurostat `demo_pjan`. Jahre nach dem letzten Wert werden mit dem letzten Wert fortgeschrieben und in `hinweise` genannt.
- **`pipeline_version`** bleibt `0.3.0`, weil Parser und Crawler unverändert bleiben. Ein Erhöhen würde alle Rohdaten neu laden. Die dbt-Projektversion steigt auf `0.4.0`.
- **Neutralität (E13):** Glossar und Hinweise erklären, bewerten aber nicht. Keine Halbgeviert- oder Geviertstriche in Texten, die Nutzer sehen.

## Review Focus

1. **Ist für laufende oder kommende Jahre in einer Summe über mehrere Jahre.** Erwartet: Jede Ist-Kennzahl bleibt `null`, sobald ein Jahr der Gruppe kein Ist hat; nie eine Teilsumme, nie 0. Test: Task 5 („Ist über verfügbare und nicht verfügbare Jahre“).
2. **XML-Soll gegen API-Ist.** Erwartet: `abweichung`, `abweichung_rel` und `ist_quote` sind `null`, sobald ein Titel der Gruppe sein Soll aus der XML hat, mit Hinweis. Test: Task 5 („Abweichung nur mit Soll aus der internalapi“).
3. **Feindliche oder kaputte Eingaben** (SQL in Bezeichnern und Werten, verschachtelte Objekte, leere Listen, `null`, Zahlen als Text). Erwartet: verständliche Fehlermeldung mit 22023 oder leeres Ergebnis, nie ausgeführtes Fremd-SQL. Test: Task 5 („lehnt unzulässige Eingaben ab“, „Werte gehen als Parameter hinein“).
4. **Wiederholung einer alten Version nach Daten- oder Synonympflege.** Erwartet: Eine alte Version liefert exakt ihre alten Zahlen und alten Synonyme. Tests: Task 5 („liefert eine frühere Version unverändert“) und Task 6 („Synonyme der alten Version“).
5. **Rechte über die Data API.** Erwartet: `anon` darf die Funktionen in `api` ausführen. Tabellen in `mart`, `ops`, `semantic` und Hilfsfunktionen in `semantic` bleiben gesperrt. Test: Task 4 („Rechte für anon“).

## Dateistruktur

```text
dbt/seeds/semantik_kennzahlen.csv, semantik_synonyme.csv, semantik_glossar.csv, semantik_einwohner.csv
dbt/seeds/seeds.yml                          # erweitert: Spaltentypen und Prüfungen der Semantik-Seeds
dbt/tests/dq19_synonyme_treffen.sql
dbt/tests/semantik_synonyme_eindeutig.sql
dbt/models/core/dim_titel.sql, fct_betrag.sql             # als View
dbt/models/mart/agg_einzelplan_jahr.sql, agg_funktion_jahr.sql, agg_gruppierung_jahr.sql   # als View
dbt/dbt_project.yml                          # Version 0.4.0
supabase/migrations/20261013120000_dq19_synonyme.sql
supabase/migrations/20261013120100_semantik_version.sql
supabase/migrations/20261013120200_api_grundlagen.sql
supabase/migrations/20261013120300_api_query_metric.sql
supabase/migrations/20261013120400_api_suche.sql
supabase/migrations/20261013120500_api_titel_detail.sql
packages/ingest/src/db/semantik.int.test.ts
packages/ingest/src/abfrage/testdaten.ts                 # Testhilfe: Titel veröffentlichen
packages/ingest/src/abfrage/grundlagen.int.test.ts
packages/ingest/src/abfrage/query-metric.int.test.ts
packages/ingest/src/abfrage/suche.int.test.ts
packages/ingest/src/abfrage/titel-detail.int.test.ts
.github/workflows/ci.yml                     # dbt seed und Seed-Prüfungen vor den Integrationstests
docs/befunde/2026-10-semantik-api.md
docs/KONZEPT.md (Abschnitt 10), docs/betrieb.md, CLAUDE.md, Roadmap
```

---

### Task 1: Semantik-Seeds und Prüfung DQ-19

**Files:**
- Create: `dbt/seeds/semantik_kennzahlen.csv`, `dbt/seeds/semantik_synonyme.csv`, `dbt/seeds/semantik_glossar.csv`, `dbt/seeds/semantik_einwohner.csv`
- Create: `dbt/tests/dq19_synonyme_treffen.sql`, `dbt/tests/semantik_synonyme_eindeutig.sql`
- Create: `supabase/migrations/20261013120000_dq19_synonyme.sql`
- Modify: `dbt/seeds/seeds.yml`, `.github/workflows/ci.yml`
- Test: `packages/ingest/src/db/schema.int.test.ts`, `packages/ingest/src/db/veroeffentlichung.int.test.ts`, `packages/ingest/src/cli-veroeffentlichung.int.test.ts` (Katalog jetzt 19 Prüfungen)

**Interfaces:**
- Produces: Tabellen `core.semantik_kennzahlen(kennzahl_id, name, definition, formel, einheit, braucht_jahr, reihenfolge)`, `core.semantik_synonyme(begriff, typ, schluessel, konto, jahr_von, jahr_bis)`, `core.semantik_glossar(begriff, erklaerung, beispiel)`, `core.semantik_einwohner(jahr, einwohner, stichtag, quelle, hinweis)`; Katalogeintrag `DQ-19` (Schwere `warn`).
- Die 17 Kennzahl-IDs in dieser Reihenfolge sind verbindlich für Task 5: `soll, soll_xml, ist, abweichung, abweichung_rel, ist_quote, soll_anteil, ist_anteil, soll_pro_kopf, ist_pro_kopf, soll_pro_tag, ist_pro_tag, soll_vj_abs, soll_vj_rel, ist_vj_abs, ist_vj_rel, titel_anzahl`.
- Synonym-Typen (verbindlich für Task 2 und 6): `einzelplan, funktion, oberfunktion, hauptfunktion, gruppierung, obergruppe, hauptgruppe`.

- [ ] **Step 1: Katalog-Tests auf 19 Prüfungen umstellen (rot)**

In `packages/ingest/src/db/schema.int.test.ts` den Test „legt den DQ-Katalog mit 18 Prüfungen an“ ersetzen:

```ts
  it('legt den DQ-Katalog mit 19 Prüfungen an', () =>
    imRollback(async (tx) => {
      const rows = await tx<{ check_id: string; schwere: string }[]>`select check_id, schwere from ops.dq_check order by check_id`;
      expect(rows.map((r) => r.check_id)).toEqual(Array.from({ length: 19 }, (_, i) => `DQ-${String(i + 1).padStart(2, '0')}`));
      expect(rows.filter((r) => r.schwere === 'error').map((r) => r.check_id)).toEqual([
        'DQ-01', 'DQ-02', 'DQ-03', 'DQ-07', 'DQ-08', 'DQ-09', 'DQ-13', 'DQ-15', 'DQ-16', 'DQ-17',
      ]);
      const neu = await tx`select check_id, dimension, schwere from ops.dq_check where check_id in ('DQ-17', 'DQ-18', 'DQ-19') order by check_id`;
      expect(neu.map((r) => [r.check_id, r.dimension, r.schwere])).toEqual([
        ['DQ-17', 'Vollständigkeit', 'error'], ['DQ-18', 'Betrieb', 'warn'], ['DQ-19', 'Semantik', 'warn'],
      ]);
    }));
```

In `packages/ingest/src/db/veroeffentlichung.int.test.ts` den Test „lädt den Katalog mit 18 Prüfungen“ umbenennen in „lädt den Katalog mit 19 Prüfungen“ und `toHaveLength(18)` durch `toHaveLength(19)` ersetzen.

In `packages/ingest/src/cli-veroeffentlichung.int.test.ts` die beiden Konstanten ersetzen:

```ts
const IDS = Array.from({ length: 19 }, (_, i) => `DQ-${String(i + 1).padStart(2, '0')}`);
// Schwere wie im Katalog ops.dq_check (abweichende Schwere ist seit F6 ein Fehler)
const WARN = new Set(['DQ-04', 'DQ-05', 'DQ-06', 'DQ-10', 'DQ-11', 'DQ-12', 'DQ-14', 'DQ-18', 'DQ-19']);
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/db/schema.int.test.ts`
Expected: FAIL. Der Katalog enthält nur 18 Prüfungen.

- [ ] **Step 3: Migration für DQ-19 schreiben**

`supabase/migrations/20261013120000_dq19_synonyme.sql`:

```sql
-- Plan 4: Synonyme der Semantik müssen in ihrem Gültigkeitszeitraum auf vorhandene Schlüssel zeigen.
insert into ops.dq_check values
  ('DQ-19', 'Semantik', 'Jedes Synonym trifft in jedem Jahr seines Gültigkeitszeitraums mindestens einen Titel', 'warn');
```

Run: `pnpm dlx supabase@2.120.0 migration up --local`
Expected: `Applying migration 20261013120000_dq19_synonyme.sql...`

- [ ] **Step 4: Seeds anlegen**

`dbt/seeds/semantik_kennzahlen.csv` (Einheit `EUR`, `Anteil` als Bruch von 1 oder `Anzahl`; `braucht_jahr` heißt: nur mit einem einzelnen Jahr je Ergebniszeile):

```csv
kennzahl_id,name,definition,formel,einheit,braucht_jahr,reihenfolge
soll,Soll,"Maßgeblicher veranschlagter Betrag laut internalapi, einschließlich Nachtragshaushalten. Ohne API-Soll der Betrag aus der XML-Datei des Haushaltsplans.",Summe soll_eur,EUR,false,10
soll_xml,Soll laut Haushaltsplan,"Veranschlagter Betrag aus der veröffentlichten XML-Datei des Haushaltsplans. Das ist der ursprüngliche Planstand ohne Nachträge.",Summe soll_xml_eur,EUR,false,20
ist,Ist,"Tatsächlich gebuchter Betrag. Nur für abgeschlossene Jahre, sonst nicht verfügbar und nie 0.",Summe ist_eur,EUR,false,30
abweichung,Abweichung,"Ist minus Soll. Nur wenn das Soll aus der internalapi stammt und das Ist verfügbar ist.",Summe ist_eur minus Summe soll_eur,EUR,false,40
abweichung_rel,Abweichung relativ,Abweichung bezogen auf das Soll.,abweichung / soll,Anteil,false,50
ist_quote,Ist-Quote,"Anteil des Solls, der tatsächlich gebucht wurde.",ist / soll,Anteil,false,60
soll_anteil,Anteil am Gesamthaushalt (Soll),Soll bezogen auf das gesamte Soll des Kontos im selben Jahr.,soll / Summe soll über Jahr und Konto,Anteil,false,70
ist_anteil,Anteil am Gesamthaushalt (Ist),Ist bezogen auf das gesamte Ist des Kontos im selben Jahr.,ist / Summe ist über Jahr und Konto,Anteil,false,80
soll_pro_kopf,Soll je Einwohnerin und Einwohner,Soll geteilt durch die Bevölkerung am 1. Januar des Jahres (Eurostat).,soll / einwohner,EUR,true,90
ist_pro_kopf,Ist je Einwohnerin und Einwohner,Ist geteilt durch die Bevölkerung am 1. Januar des Jahres (Eurostat).,ist / einwohner,EUR,true,100
soll_pro_tag,Soll je Tag,Soll geteilt durch die Tage des Jahres (365 oder 366).,soll / tage,EUR,true,110
ist_pro_tag,Ist je Tag,Ist geteilt durch die Tage des Jahres (365 oder 366).,ist / tage,EUR,true,120
soll_vj_abs,Veränderung Soll zum Vorjahr,Soll minus Soll des Vorjahres beim gleichen Schlüssel.,soll(t) minus soll(t-1),EUR,true,130
soll_vj_rel,Veränderung Soll zum Vorjahr relativ,Veränderung bezogen auf das Soll des Vorjahres.,(soll(t) minus soll(t-1)) / soll(t-1),Anteil,true,140
ist_vj_abs,Veränderung Ist zum Vorjahr,Ist minus Ist des Vorjahres beim gleichen Schlüssel.,ist(t) minus ist(t-1),EUR,true,150
ist_vj_rel,Veränderung Ist zum Vorjahr relativ,Veränderung bezogen auf das Ist des Vorjahres.,(ist(t) minus ist(t-1)) / ist(t-1),Anteil,true,160
titel_anzahl,Anzahl Titel,"Anzahl der Titel in der Auswahl, Titel mit Betrag 0 eingeschlossen.",Anzahl Zeilen,Anzahl,false,170
```

`dbt/seeds/semantik_einwohner.csv` (Eurostat `demo_pjan`, Stand 25.09.2026, abgerufen 10.10.2026):

```csv
jahr,einwohner,stichtag,quelle,hinweis
2012,80327900,2012-01-01,Eurostat demo_pjan,
2013,80523746,2013-01-01,Eurostat demo_pjan,
2014,80767463,2014-01-01,Eurostat demo_pjan,
2015,81197537,2015-01-01,Eurostat demo_pjan,
2016,82175684,2016-01-01,Eurostat demo_pjan,
2017,82521653,2017-01-01,Eurostat demo_pjan,
2018,82792351,2018-01-01,Eurostat demo_pjan,
2019,83019213,2019-01-01,Eurostat demo_pjan,
2020,83166711,2020-01-01,Eurostat demo_pjan,
2021,83155031,2021-01-01,Eurostat demo_pjan,
2022,83237124,2022-01-01,Eurostat demo_pjan,
2023,83118501,2023-01-01,Eurostat demo_pjan,Bruch in der Zeitreihe durch den Zensus 2022
2024,83456045,2024-01-01,Eurostat demo_pjan,
2025,83577140,2025-01-01,Eurostat demo_pjan,
```

`dbt/seeds/semantik_glossar.csv`:

```csv
begriff,erklaerung,beispiel
Bundeshaushalt,"Der Haushaltsplan des Bundes legt fest, wie viel Geld der Bund in einem Jahr ausgeben darf und welche Einnahmen er erwartet. Der Bundestag beschließt ihn als Gesetz. Rechtlich verbindlich ist ausschließlich der veröffentlichte Haushaltsplan.",
Soll,"Der im Haushalt veranschlagte Betrag. Haushaltsblick verwendet den Soll der internalapi von bundeshaushalt.de, der Nachtragshaushalte enthält. Fehlt er, gilt der Wert aus der XML-Datei des Haushaltsplans.",
Ist,"Der tatsächlich gebuchte Betrag eines abgeschlossenen Haushaltsjahres. Für das laufende und das kommende Jahr gibt es noch kein Ist; der Wert bleibt dann leer.",
Ist-Quote,"Anteil des Solls, der tatsächlich ausgegeben oder eingenommen wurde. Eine Quote über 100 % bedeutet, dass mehr gebucht als veranschlagt wurde.",
Haushaltsstand,"Gibt an, auf welcher Fassung ein Soll beruht: Regierungsentwurf, beschlossenes Gesetz oder Gesetz einschließlich Nachtragshaushalt. Soll-Werte verschiedener Stände sind nur eingeschränkt vergleichbar.",
Regierungsentwurf,"Der von der Bundesregierung beschlossene Entwurf des Haushalts, über den der Bundestag noch berät. Die Beträge können sich bis zum Beschluss ändern.",
Nachtragshaushalt,"Ein Gesetz, das den beschlossenen Haushalt im laufenden Jahr ändert. Der Soll der internalapi enthält Nachträge, die XML-Datei des Haushaltsplans nicht.",
Einzelplan,"Oberste Gliederung des Haushalts, meist ein Ministerium oder ein Verfassungsorgan. Die Nummern bleiben über die Jahre meist gleich, Zuschnitt und Name eines Ressorts können sich ändern.",
Kapitel,"Untergliederung eines Einzelplans, etwa eine Behörde oder ein Aufgabenbereich. Die ersten zwei Ziffern der vierstelligen Kapitelnummer sind der Einzelplan.",
Titel,"Kleinste Einheit des Haushalts mit einem bestimmten Zweck. Der Titelschlüssel in Haushaltsblick besteht aus der Kapitelnummer und der fünfstelligen Titelnummer.",
Titelgruppe,"Fasst mehrere Titel eines Kapitels zu einem gemeinsamen Zweck zusammen, zum Beispiel einem Förderprogramm.",
Funktion,"Ordnet Ausgaben nach Aufgabenbereichen wie Verteidigung, Bildung oder Soziale Sicherung, unabhängig vom Ressort. Der Funktionenplan hat drei Ebenen: Hauptfunktion, Oberfunktion und Funktion.",
Gruppierung,"Ordnet Einnahmen und Ausgaben nach ihrer ökonomischen Art, zum Beispiel Steuern, Personalausgaben oder Investitionen. Die ersten drei Ziffern der Titelnummer bilden die Gruppierung.",
Globale Minderausgabe,"Ein negativer Ausgabeansatz, mit dem der Haushalt pauschale Einsparungen vorsieht, ohne sie schon einzelnen Titeln zuzuordnen. Im Lauf des Jahres wird sie durch geringere Ausgaben an anderer Stelle erwirtschaftet.",
Verpflichtungsermächtigung,"Erlaubt, im laufenden Jahr Verträge einzugehen, die erst in späteren Jahren zu Ausgaben führen. Verpflichtungsermächtigungen sind in Haushaltsblick nicht als Beträge enthalten.",
Flexibilisierung,"Für flexibilisierte Ausgaben gelten erleichterte Regeln: Mittel können in festgelegten Grenzen zwischen Titeln verschoben oder ins nächste Jahr übertragen werden. Bei Einnahmetiteln ist das Merkmal nicht anwendbar.",
Sondervermögen,"Vom Kernhaushalt getrennte Vermögensmasse des Bundes für eine bestimmte Aufgabe, etwa der Klima- und Transformationsfonds. Wirtschaftspläne von Sondervermögen erscheinen als Anlage zum Haushaltsplan und zählen in Haushaltsblick nie zum Gesamthaushalt.",
Haushaltsausgleich,"Einnahmen und Ausgaben eines Haushalts sind gleich hoch. Das gelingt, weil die Einnahmen auch Kredite enthalten; ausgeglichen heißt deshalb nicht schuldenfrei.",
Pro Kopf,"Betrag geteilt durch die Bevölkerung Deutschlands am 1. Januar des Haushaltsjahres laut Eurostat. Für Jahre ohne veröffentlichte Bevölkerungszahl gilt der letzte verfügbare Wert.",
Nominal,"Alle Beträge sind in Euro des jeweiligen Jahres angegeben, ohne Bereinigung um Preissteigerungen. Vergleiche über viele Jahre enthalten deshalb auch die Inflation.",
```

`dbt/seeds/semantik_synonyme.csv` (`jahr_bis` leer = offen; Zeiträume aus den lokalen Daten geprüft, Funktionscodes vieler Gruppen erst ab 2013, weil 2012 ein älterer Funktionenplan galt):

```csv
begriff,typ,schluessel,konto,jahr_von,jahr_bis
Bundespräsident,einzelplan,01,ausgaben,2012,
Bundespräsidialamt,einzelplan,01,ausgaben,2012,
Bundestag,einzelplan,02,ausgaben,2012,
Bundesrat,einzelplan,03,ausgaben,2012,
Kanzleramt,einzelplan,04,ausgaben,2012,
Bundeskanzleramt,einzelplan,04,ausgaben,2012,
Auswärtiges Amt,einzelplan,05,ausgaben,2012,
Außenministerium,einzelplan,05,ausgaben,2012,
Innenministerium,einzelplan,06,ausgaben,2012,
Justizministerium,einzelplan,07,ausgaben,2012,
Finanzministerium,einzelplan,08,ausgaben,2012,
Wirtschaftsministerium,einzelplan,09,ausgaben,2012,
Landwirtschaftsministerium,einzelplan,10,ausgaben,2012,
Arbeitsministerium,einzelplan,11,ausgaben,2012,
Sozialministerium,einzelplan,11,ausgaben,2012,
Verkehrsministerium,einzelplan,12,ausgaben,2012,
Bundeswehr,einzelplan,14,ausgaben,2012,
Verteidigungsministerium,einzelplan,14,ausgaben,2012,
Gesundheitsministerium,einzelplan,15,ausgaben,2012,
Umweltministerium,einzelplan,16,ausgaben,2012,
Familienministerium,einzelplan,17,ausgaben,2012,
Bundesverfassungsgericht,einzelplan,19,ausgaben,2012,
Verfassungsgericht,einzelplan,19,ausgaben,2012,
Bundesrechnungshof,einzelplan,20,ausgaben,2012,
Rechnungshof,einzelplan,20,ausgaben,2012,
Datenschutzbeauftragte,einzelplan,21,ausgaben,2016,
Datenschutz,einzelplan,21,ausgaben,2016,
Kontrollrat,einzelplan,22,ausgaben,2022,
Entwicklungsministerium,einzelplan,23,ausgaben,2012,
Digitalministerium,einzelplan,24,ausgaben,2025,
Bauministerium,einzelplan,25,ausgaben,2022,
Bildungsministerium,einzelplan,30,ausgaben,2012,
Forschungsministerium,einzelplan,30,ausgaben,2012,
Bundesschuld,einzelplan,32,ausgaben,2012,
Verteidigung,oberfunktion,03,ausgaben,2012,
Verteidigungsausgaben,oberfunktion,03,ausgaben,2012,
Streitkräfte,funktion,032,ausgaben,2012,
Entwicklungshilfe,funktion,023,ausgaben,2012,
Entwicklungszusammenarbeit,funktion,023,ausgaben,2012,
Polizei,funktion,042,ausgaben,2012,
Katastrophenschutz,funktion,045,ausgaben,2013,
Zivilschutz,funktion,045,ausgaben,2013,
Hochschulen,oberfunktion,13,ausgaben,2012,
Universitäten,oberfunktion,13,ausgaben,2012,
DFG,funktion,137,ausgaben,2012,
Deutsche Forschungsgemeinschaft,funktion,137,ausgaben,2012,
Schülerförderung,funktion,141,ausgaben,2012,
BAföG,funktion,142,ausgaben,2012,
Studienförderung,funktion,142,ausgaben,2012,
Forschung,oberfunktion,16,ausgaben,2012,
Wissenschaft,oberfunktion,16,ausgaben,2012,
Kultur,oberfunktion,18,ausgaben,2012,
Rente,funktion,221,ausgaben,2012,
Renten,funktion,221,ausgaben,2012,
Rentenversicherung,funktion,221,ausgaben,2012,
Rentenzuschuss,funktion,221,ausgaben,2012,
Krankenversicherung,funktion,224,ausgaben,2012,
Gesundheitsfonds,funktion,224,ausgaben,2012,
Arbeitslosenversicherung,funktion,225,ausgaben,2012,
Pflegeversicherung,funktion,227,ausgaben,2022,2026
Kindergeld,funktion,231,ausgaben,2012,
Kinderzuschlag,funktion,231,ausgaben,2012,
Elterngeld,funktion,232,ausgaben,2012,
Wohngeld,funktion,233,ausgaben,2012,
Hartz IV,funktion,251,ausgaben,2012,2022
Arbeitslosengeld II,funktion,251,ausgaben,2012,2022
Bürgergeld,funktion,251,ausgaben,2023,
Kosten der Unterkunft,funktion,252,ausgaben,2012,
Unterkunft und Heizung,funktion,252,ausgaben,2012,
Arbeitsförderung,funktion,253,ausgaben,2012,
Jobcenter,oberfunktion,25,ausgaben,2012,
Grundsicherung im Alter,funktion,282,ausgaben,2013,
Gesundheit,oberfunktion,31,ausgaben,2012,
Sport,funktion,322,ausgaben,2013,
Sportförderung,funktion,322,ausgaben,2013,
Umweltschutz,oberfunktion,33,ausgaben,2012,
Naturschutz,funktion,332,ausgaben,2012,
Reaktorsicherheit,oberfunktion,34,ausgaben,2012,
Strahlenschutz,oberfunktion,34,ausgaben,2012,
Wohnungsbau,funktion,411,ausgaben,2012,
Sozialer Wohnungsbau,funktion,411,ausgaben,2012,
Städtebauförderung,funktion,423,ausgaben,2013,
Landwirtschaft,oberfunktion,52,ausgaben,2012,
Erneuerbare Energien,funktion,642,ausgaben,2012,
Stromversorgung,funktion,643,ausgaben,2013,
Straßenbau,oberfunktion,72,ausgaben,2012,
Autobahn,funktion,721,ausgaben,2012,
Autobahnen,funktion,721,ausgaben,2012,
Bundesstraßen,funktion,722,ausgaben,2012,
Wasserstraßen,oberfunktion,73,ausgaben,2012,
Bahn,funktion,742,ausgaben,2013,
Deutsche Bahn,funktion,742,ausgaben,2013,
Schiene,funktion,742,ausgaben,2013,
ÖPNV,funktion,741,ausgaben,2012,
Nahverkehr,funktion,741,ausgaben,2012,
Luftfahrt,funktion,750,ausgaben,2013,
Rundfunk,funktion,772,ausgaben,2012,
Sondervermögen,funktion,813,ausgaben,2013,
Zinsen,funktion,830,ausgaben,2013,
Zinsausgaben,funktion,830,ausgaben,2013,
Schuldzinsen,funktion,830,ausgaben,2013,
Personalausgaben,hauptgruppe,4,ausgaben,2012,
Investitionen,hauptgruppe,7,ausgaben,2012,
Investitionen,hauptgruppe,8,ausgaben,2012,
Globale Minderausgabe,gruppierung,972,ausgaben,2012,
Lohnsteuer,gruppierung,011,einnahmen,2012,
Einkommensteuer,gruppierung,012,einnahmen,2012,
Körperschaftsteuer,gruppierung,014,einnahmen,2012,
Umsatzsteuer,gruppierung,015,einnahmen,2012,
Mehrwertsteuer,gruppierung,015,einnahmen,2012,
Einfuhrumsatzsteuer,gruppierung,016,einnahmen,2012,
Steuern,hauptgruppe,0,einnahmen,2012,
Steuereinnahmen,hauptgruppe,0,einnahmen,2012,
Kredite,obergruppe,32,einnahmen,2012,
Kreditaufnahme,obergruppe,32,einnahmen,2012,
Neuverschuldung,obergruppe,32,einnahmen,2012,
Neue Schulden,obergruppe,32,einnahmen,2012,
```

- [ ] **Step 5: Spaltentypen und Seed-Prüfungen**

`dbt/seeds/seeds.yml` vollständig ersetzen:

```yaml
version: 2
seeds:
  - name: kontrollsummen
    config:
      column_types:
        jahr: integer
        konto: text
        wertart: text
        betrag_eur: numeric(18,2)
        quelle: text
  - name: semantik_kennzahlen
    config:
      column_types:
        kennzahl_id: text
        name: text
        definition: text
        formel: text
        einheit: text
        braucht_jahr: boolean
        reihenfolge: integer
    columns:
      - name: kennzahl_id
        data_tests: [not_null, unique]
      - name: einheit
        data_tests:
          - accepted_values:
              arguments:
                values: ['EUR', 'Anteil', 'Anzahl']
  - name: semantik_synonyme
    config:
      column_types:
        begriff: text
        typ: text
        schluessel: text
        konto: text
        jahr_von: integer
        jahr_bis: integer
    columns:
      - name: begriff
        data_tests: [not_null]
      - name: typ
        data_tests:
          - accepted_values:
              arguments:
                values: ['einzelplan', 'funktion', 'oberfunktion', 'hauptfunktion', 'gruppierung', 'obergruppe', 'hauptgruppe']
      - name: konto
        data_tests:
          - accepted_values:
              arguments:
                values: ['ausgaben', 'einnahmen']
      - name: schluessel
        data_tests: [not_null]
      - name: jahr_von
        data_tests: [not_null]
  - name: semantik_glossar
    config:
      column_types:
        begriff: text
        erklaerung: text
        beispiel: text
    columns:
      - name: begriff
        data_tests: [not_null, unique]
      - name: erklaerung
        data_tests: [not_null]
  - name: semantik_einwohner
    config:
      column_types:
        jahr: integer
        einwohner: bigint
        stichtag: date
        quelle: text
        hinweis: text
    columns:
      - name: jahr
        data_tests: [not_null, unique]
      - name: einwohner
        data_tests: [not_null]
```

Hinweis: Wenn dbt 1.12.5 `arguments:` bei `accepted_values` nicht kennt, die in `dbt/models/*/*.yml` verwendete Schreibweise übernehmen (dort steht die bereits funktionierende Form).

`dbt/tests/semantik_synonyme_eindeutig.sql`:

```sql
-- Jede Kombination aus Begriff, Typ, Schlüssel, Konto und Beginn höchstens einmal (Primärschlüssel von semantic.synonym).
select begriff, typ, schluessel, konto, jahr_von, count(*) as anzahl
from {{ ref('semantik_synonyme') }}
group by begriff, typ, schluessel, konto, jahr_von
having count(*) > 1
```

- [ ] **Step 6: DQ-19 als dbt-Test**

`dbt/tests/dq19_synonyme_treffen.sql`:

```sql
{{ config(severity='warn', meta={'dq_id': 'DQ-19'}) }}
-- Jedes Synonym trifft in jedem Jahr seines Gültigkeitszeitraums, für das Daten des Kontos vorliegen, mindestens einen Titel.
with synonyme as (select * from {{ ref('semantik_synonyme') }}),
titel as (select * from {{ ref('fct_titel_jahr') }}),
jahre as (select konto, jahr from titel group by konto, jahr),
erwartet as (
  select s.begriff, s.typ, s.schluessel, s.konto, j.jahr
  from synonyme s
  join jahre j on j.konto = s.konto and j.jahr >= s.jahr_von and (s.jahr_bis is null or j.jahr <= s.jahr_bis)
)
select e.*
from erwartet e
where not exists (
  select 1 from titel t
  where t.jahr = e.jahr and t.konto = e.konto
    and case e.typ
          when 'einzelplan' then t.einzelplan_nr
          when 'funktion' then t.fkt
          when 'oberfunktion' then t.oberfunktion
          when 'hauptfunktion' then t.hauptfunktion
          when 'gruppierung' then t.gruppierung_nr
          when 'obergruppe' then t.obergruppe
          when 'hauptgruppe' then t.hauptgruppe
        end = e.schluessel
)
```

- [ ] **Step 7: Seeds laden und Prüfungen gegen die lokalen Echtdaten ausführen**

Run: `pnpm dbt seed && pnpm dbt run && pnpm dbt test --select semantik_kennzahlen semantik_synonyme semantik_glossar semantik_einwohner`
Expected: alle Seed-Prüfungen `PASS`, auch `dq19_synonyme_treffen` mit 0 Zeilen.

Schlägt DQ-19 fehl, die betroffenen Zeilen ansehen:

```bash
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -c "select * from core.semantik_synonyme s where not exists (select 1 from mart.fct_titel_jahr t where t.konto = s.konto and t.jahr = s.jahr_von)"
```

Dann `jahr_von` oder `jahr_bis` des Synonyms an die Daten anpassen oder die Zeile streichen. Keinen Schlüssel erfinden; jede verbleibende Zeile muss die Prüfung bestehen. Jede Anpassung im Bericht nennen.

- [ ] **Step 8: CI um Seeds und Seed-Prüfungen ergänzen**

In `.github/workflows/ci.yml` den Schritt „dbt Modelle leer bauen und Unit-Tests ausführen“ ersetzen:

```yaml
      - name: dbt Seeds laden, Modelle leer bauen, Unit- und Seed-Prüfungen ausführen
        run: |
          pnpm dbt seed
          pnpm dbt run --empty
          pnpm dbt test --select "test_type:unit" semantik_kennzahlen semantik_synonyme semantik_glossar semantik_einwohner
```

Die Integrationstests ab Task 2 brauchen die Seeds in der Datenbank.

- [ ] **Step 9: Integrationstests laufen lassen**

Run: `pnpm test:int`
Expected: PASS, darunter die drei angepassten Katalog-Tests.

- [ ] **Step 10: Commit**

```bash
git add dbt/seeds dbt/tests/dq19_synonyme_treffen.sql dbt/tests/semantik_synonyme_eindeutig.sql supabase/migrations/20261013120000_dq19_synonyme.sql .github/workflows/ci.yml packages/ingest/src/db/schema.int.test.ts packages/ingest/src/db/veroeffentlichung.int.test.ts packages/ingest/src/cli-veroeffentlichung.int.test.ts
git commit -m "feat(dbt): Semantik-Seeds (Kennzahlen, Synonyme, Glossar, Einwohner) und DQ-19"
```

---

### Task 2: Semantik-Versionen an Datenversionen binden (E3)

**Files:**
- Create: `supabase/migrations/20261013120100_semantik_version.sql`
- Test: `packages/ingest/src/db/semantik.int.test.ts`

**Interfaces:**
- Consumes: Seeds `core.semantik_*` aus Task 1.
- Produces:
  - Tabellen `semantic.semantik_version(semantik_version_id bigint, erstellt_am, inhalt_hash)`, `semantic.kennzahl`, `semantic.synonym`, `semantic.glossar`, `semantic.einwohner`, jeweils mit `semantik_version_id` als erster Schlüsselspalte und den Spalten der Seeds.
  - Spalte `ops.dataset_version.semantik_version_id bigint` (bei Versionen vor Plan 4 `null`).
  - Funktion `ops.sichere_semantik() returns bigint`.
  - `ops.veroeffentliche_version(bigint)` setzt `semantik_version_id` bei jeder neuen Version; Signatur und Rückgabe bleiben gleich.

- [ ] **Step 1: Failing test schreiben**

`packages/ingest/src/db/semantik.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { imRollback } from './test-hilfen';
import { speichereDqLauf, veroeffentlicheVersion } from './veroeffentlichung';

describe('Semantik-Versionen', () => {
  it('legt den Inhalt der Seeds einmal ab und verwendet ihn bei gleichem Inhalt wieder', () =>
    imRollback(async (tx) => {
      const [a] = await tx`select ops.sichere_semantik() as id`;
      const [b] = await tx`select ops.sichere_semantik() as id`;
      expect(b!.id).toBe(a!.id);
      const [n] = await tx`
        select
          (select count(*)::int from semantic.kennzahl where semantik_version_id = ${a!.id}) as kennzahlen,
          (select count(*)::int from core.semantik_kennzahlen) as seed_kennzahlen,
          (select count(*)::int from semantic.synonym where semantik_version_id = ${a!.id}) as synonyme,
          (select count(*)::int from core.semantik_synonyme) as seed_synonyme,
          (select count(*)::int from semantic.glossar where semantik_version_id = ${a!.id}) as glossar,
          (select count(*)::int from core.semantik_glossar) as seed_glossar,
          (select count(*)::int from semantic.einwohner where semantik_version_id = ${a!.id}) as einwohner,
          (select count(*)::int from core.semantik_einwohner) as seed_einwohner`;
      expect(n!.kennzahlen).toBe(17);
      expect(n!.kennzahlen).toBe(n!.seed_kennzahlen);
      expect(n!.synonyme).toBe(n!.seed_synonyme);
      expect(n!.glossar).toBe(n!.seed_glossar);
      expect(n!.einwohner).toBe(n!.seed_einwohner);
    }));

  it('legt bei geändertem Inhalt eine neue Semantik-Version an und lässt die alte unverändert', () =>
    imRollback(async (tx) => {
      const [a] = await tx`select ops.sichere_semantik() as id`;
      const [vorher] = await tx`select count(*)::int as n from semantic.glossar where semantik_version_id = ${a!.id}`;
      await tx`insert into core.semantik_glossar (begriff, erklaerung, beispiel) values ('Testbegriff', 'Nur im Test.', null)`;
      const [b] = await tx`select ops.sichere_semantik() as id`;
      expect(b!.id).not.toBe(a!.id);
      const [alt] = await tx`select count(*)::int as n from semantic.glossar where semantik_version_id = ${a!.id}`;
      const [neu] = await tx`select count(*)::int as n from semantic.glossar where semantik_version_id = ${b!.id}`;
      expect(alt!.n).toBe(vorher!.n);
      expect(neu!.n).toBe(vorher!.n + 1);
    }));

  it('verknüpft jede neue Datenversion mit der Semantik-Version', () =>
    imRollback(async (tx) => {
      await tx`delete from mart.fct_titel_jahr_hist`;
      await tx`update ops.dataset_version set is_current = false`;
      await tx`delete from mart.fct_titel_jahr`;
      const dq = await speichereDqLauf(tx, { gitSha: 'test', manifestSha: 'test', ampel: 'green', score: 100 }, []);
      const v = await veroeffentlicheVersion(tx, dq);
      const [z] = await tx`select semantik_version_id, ops.sichere_semantik() as erwartet from ops.dataset_version where version_id = ${v.versionId}`;
      expect(z!.semantik_version_id).not.toBeNull();
      expect(z!.semantik_version_id).toBe(z!.erwartet);
    }));

  it('meldet fehlende Seeds verständlich', () =>
    imRollback(async (tx) => {
      await tx`alter table core.semantik_glossar rename to semantik_glossar_weg`;
      await expect(tx`select ops.sichere_semantik()`).rejects.toThrow(/Semantik-Seeds fehlen/);
    }));
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/db/semantik.int.test.ts`
Expected: FAIL mit `function ops.sichere_semantik() does not exist`.

- [ ] **Step 3: Migration schreiben**

`supabase/migrations/20261013120100_semantik_version.sql`:

```sql
-- Semantik an die Datenversion binden (Roadmap E3): Die Seeds core.semantik_* werden bei jeder
-- Veröffentlichung als unveränderliche semantik_version abgelegt, neu nur bei geändertem Inhalt.
create table semantic.semantik_version (
  semantik_version_id bigint generated always as identity primary key,
  erstellt_am         timestamptz not null default now(),
  inhalt_hash         text not null unique
);

create table semantic.kennzahl (
  semantik_version_id bigint not null references semantic.semantik_version,
  kennzahl_id         text not null,
  name                text not null,
  definition          text not null,
  formel              text not null,
  einheit             text not null check (einheit in ('EUR', 'Anteil', 'Anzahl')),
  braucht_jahr        boolean not null,
  reihenfolge         integer not null,
  primary key (semantik_version_id, kennzahl_id)
);

create table semantic.synonym (
  semantik_version_id bigint not null references semantic.semantik_version,
  begriff             text not null,
  typ                 text not null check (typ in ('einzelplan', 'funktion', 'oberfunktion', 'hauptfunktion', 'gruppierung', 'obergruppe', 'hauptgruppe')),
  schluessel          text not null,
  konto               text not null check (konto in ('einnahmen', 'ausgaben')),
  jahr_von            integer not null,
  jahr_bis            integer,
  primary key (semantik_version_id, begriff, typ, schluessel, konto, jahr_von)
);

create table semantic.glossar (
  semantik_version_id bigint not null references semantic.semantik_version,
  begriff             text not null,
  erklaerung          text not null,
  beispiel            text,
  primary key (semantik_version_id, begriff)
);

create table semantic.einwohner (
  semantik_version_id bigint not null references semantic.semantik_version,
  jahr                integer not null,
  einwohner           bigint not null check (einwohner > 0),
  stichtag            date not null,
  quelle              text not null,
  hinweis             text,
  primary key (semantik_version_id, jahr)
);

alter table semantic.semantik_version enable row level security;
alter table semantic.kennzahl enable row level security;
alter table semantic.synonym enable row level security;
alter table semantic.glossar enable row level security;
alter table semantic.einwohner enable row level security;
revoke all on all tables in schema semantic from anon, authenticated;
alter default privileges in schema semantic revoke all on tables from anon, authenticated;

-- Versionen vor Plan 4 bleiben ohne Semantik (null).
alter table ops.dataset_version add column semantik_version_id bigint references semantic.semantik_version;

-- Legt den Inhalt der Seeds als Semantik-Version ab oder liefert die bestehende Version mit gleichem Inhalt.
create function ops.sichere_semantik()
returns bigint
language plpgsql
as $$
declare
  v_hash text;
  v_id   bigint;
begin
  if to_regclass('core.semantik_kennzahlen') is null or to_regclass('core.semantik_synonyme') is null
     or to_regclass('core.semantik_glossar') is null or to_regclass('core.semantik_einwohner') is null then
    raise exception 'Semantik-Seeds fehlen in core (zuerst pnpm dbt seed ausführen)';
  end if;

  select md5(concat_ws('|',
    (select string_agg(k::text, ';' order by k.kennzahl_id) from core.semantik_kennzahlen k),
    (select string_agg(s::text, ';' order by s.begriff, s.typ, s.schluessel, s.konto, s.jahr_von) from core.semantik_synonyme s),
    (select string_agg(g::text, ';' order by g.begriff) from core.semantik_glossar g),
    (select string_agg(e::text, ';' order by e.jahr) from core.semantik_einwohner e)))
  into v_hash;

  select sv.semantik_version_id into v_id from semantic.semantik_version sv where sv.inhalt_hash = v_hash;
  if v_id is not null then return v_id; end if;

  insert into semantic.semantik_version (inhalt_hash) values (v_hash) returning semantik_version_id into v_id;
  insert into semantic.kennzahl (semantik_version_id, kennzahl_id, name, definition, formel, einheit, braucht_jahr, reihenfolge)
    select v_id, k.kennzahl_id, k.name, k.definition, k.formel, k.einheit, k.braucht_jahr, k.reihenfolge from core.semantik_kennzahlen k;
  insert into semantic.synonym (semantik_version_id, begriff, typ, schluessel, konto, jahr_von, jahr_bis)
    select v_id, s.begriff, s.typ, s.schluessel, s.konto, s.jahr_von, s.jahr_bis from core.semantik_synonyme s;
  insert into semantic.glossar (semantik_version_id, begriff, erklaerung, beispiel)
    select v_id, g.begriff, g.erklaerung, g.beispiel from core.semantik_glossar g;
  insert into semantic.einwohner (semantik_version_id, jahr, einwohner, stichtag, quelle, hinweis)
    select v_id, e.jahr, e.einwohner, e.stichtag, e.quelle, e.hinweis from core.semantik_einwohner e;
  return v_id;
end $$;

revoke execute on function ops.sichere_semantik() from public;

-- Wie 20261010120000, zusätzlich mit Semantik-Version (create or replace behält die Rechte).
create or replace function ops.veroeffentliche_version(p_dq_lauf_id bigint)
returns table (version_id bigint, zeilen_neu integer, zeilen_geschlossen integer, zeilen_gesamt integer)
language plpgsql
as $$
#variable_conflict use_column
declare
  v_ampel text;
  v_version bigint;
  v_neu integer;
  v_geschlossen integer;
  v_gesamt integer;
begin
  select l.ampel into v_ampel from ops.dq_lauf l where l.dq_lauf_id = p_dq_lauf_id;
  if v_ampel is null then raise exception 'Unbekannter DQ-Lauf %', p_dq_lauf_id; end if;
  if v_ampel = 'red' then raise exception 'Datenstand mit roter Ampel wird nicht veröffentlicht (DQ-Lauf %)', p_dq_lauf_id; end if;

  insert into ops.dataset_version (dq_lauf_id, zeilen_neu, zeilen_geschlossen, zeilen_gesamt, semantik_version_id)
  values (p_dq_lauf_id, 0, 0, 0, ops.sichere_semantik()) returning ops.dataset_version.version_id into v_version;

  update mart.fct_titel_jahr_hist h set gueltig_bis_version = v_version
  where h.gueltig_bis_version is null
    and not exists (
      select 1 from mart.fct_titel_jahr m
      where m.jahr = h.jahr and m.konto = h.konto and m.titel_key = h.titel_key and m.zeilen_hash = h.zeilen_hash);
  get diagnostics v_geschlossen = row_count;

  insert into mart.fct_titel_jahr_hist (
    jahr, konto, titel_key, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text, titel_nr, titel_text,
    titelgruppe_nr, titelgruppe_text, ausgabeart_text, flexibilisiert, seite, fkt, funktion_text, oberfunktion,
    oberfunktion_text, hauptfunktion, hauptfunktion_text, gruppierung_nr, gruppierung_text, obergruppe, obergruppe_text,
    hauptgruppe, hauptgruppe_text, soll_eur, soll_quelle, soll_xml_eur, ist_eur, ist_verfuegbar, abweichung_eur,
    ist_quote, haushaltsstand, im_haushaltsplan_xml, zeilen_hash, gueltig_ab_version)
  select
    m.jahr, m.konto, m.titel_key, m.einzelplan_nr, m.einzelplan_text, m.kapitel_nr, m.kapitel_text, m.titel_nr, m.titel_text,
    m.titelgruppe_nr, m.titelgruppe_text, m.ausgabeart_text, m.flexibilisiert, m.seite, m.fkt, m.funktion_text, m.oberfunktion,
    m.oberfunktion_text, m.hauptfunktion, m.hauptfunktion_text, m.gruppierung_nr, m.gruppierung_text, m.obergruppe, m.obergruppe_text,
    m.hauptgruppe, m.hauptgruppe_text, m.soll_eur, m.soll_quelle, m.soll_xml_eur, m.ist_eur, m.ist_verfuegbar, m.abweichung_eur,
    m.ist_quote, m.haushaltsstand, m.im_haushaltsplan_xml, m.zeilen_hash, v_version
  from mart.fct_titel_jahr m
  where not exists (
    select 1 from mart.fct_titel_jahr_hist h
    where h.gueltig_bis_version is null and h.jahr = m.jahr and h.konto = m.konto and h.titel_key = m.titel_key);
  get diagnostics v_neu = row_count;

  select count(*) into v_gesamt from mart.fct_titel_jahr_hist h where h.gueltig_bis_version is null;

  update ops.dataset_version d set is_current = false where d.is_current;
  update ops.dataset_version d
  set is_current = true, zeilen_neu = v_neu, zeilen_geschlossen = v_geschlossen, zeilen_gesamt = v_gesamt
  where d.version_id = v_version;

  return query select v_version, v_neu, v_geschlossen, v_gesamt;
end $$;
```

Run: `pnpm dlx supabase@2.120.0 migration up --local`
Expected: `Applying migration 20261013120100_semantik_version.sql...`

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/db/semantik.int.test.ts`
Expected: PASS (4 Tests).

Run: `pnpm test:int`
Expected: PASS. Die bestehenden Veröffentlichungstests laufen jetzt mit Semantik-Version.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013120100_semantik_version.sql packages/ingest/src/db/semantik.int.test.ts
git commit -m "feat(db): Semantik-Versionen an Datenversionen binden (E3)"
```

---

### Task 3: Arbeitstabellen als Views

**Files:**
- Modify: `dbt/models/core/dim_titel.sql`, `dbt/models/core/fct_betrag.sql`, `dbt/models/mart/agg_einzelplan_jahr.sql`, `dbt/models/mart/agg_funktion_jahr.sql`, `dbt/models/mart/agg_gruppierung_jahr.sql`, `dbt/dbt_project.yml`

**Interfaces:**
- Produces: dieselben Relationen unter denselben Namen, jetzt als Views. Keine Spalte ändert sich. `mart.fct_titel_jahr` bleibt eine Tabelle, weil die Veröffentlichung daraus liest.

- [ ] **Step 1: Größe vorher messen**

```bash
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -c "select n.nspname as schema, c.relname as tabelle, pg_size_pretty(pg_total_relation_size(c.oid)) as groesse from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ('core', 'mart') order by pg_total_relation_size(c.oid) desc" -c "select pg_size_pretty(pg_database_size(current_database())) as datenbank"
```

Ausgabe für den Befund (Task 8) in `data/raw/p4-speicher-vorher.md` speichern. `data/raw/` ist nicht versioniert.

- [ ] **Step 2: Materialisierung umstellen**

Als erste Zeile in jede der fünf Dateien `dim_titel.sql`, `fct_betrag.sql`, `agg_einzelplan_jahr.sql`, `agg_funktion_jahr.sql` und `agg_gruppierung_jahr.sql` einfügen:

```sql
{{ config(materialized='view') }}
```

Unmittelbar darunter einen Kommentar:

```sql
-- View statt Tabelle (Plan 4): Arbeitsrelation, wird nie ausgeliefert und spart Speicher.
```

In `dbt/dbt_project.yml` `version: '0.3.0'` durch `version: '0.4.0'` ersetzen.

- [ ] **Step 3: Modelle und alle Prüfungen ausführen**

Run: `pnpm dbt run && pnpm dbt test`
Expected: `dbt run` ohne Fehler. `dbt test` mit denselben Ergebnissen wie vor der Umstellung: alle `error`-Prüfungen bestanden, Warnungen wie im Befund Plan 3 (DQ-04, DQ-05, DQ-11, DQ-14 je nach lokaler Datenlage). Bei abweichenden Ergebnissen stoppen und berichten.

Prüfen, dass die Relationen jetzt Views sind:

```bash
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -tAc "select table_schema || '.' || table_name || ' ' || table_type from information_schema.tables where (table_schema, table_name) in (('core','dim_titel'),('core','fct_betrag'),('mart','agg_einzelplan_jahr'),('mart','agg_funktion_jahr'),('mart','agg_gruppierung_jahr'),('mart','fct_titel_jahr')) order by 1"
```

Expected: fünfmal `VIEW`, `mart.fct_titel_jahr BASE TABLE`.

- [ ] **Step 4: Größe nachher messen**

Den Befehl aus Step 1 wiederholen und die Ausgabe in `data/raw/p4-speicher-nachher.md` speichern.

- [ ] **Step 5: Tests und Commit**

Run: `pnpm test:int`
Expected: PASS.

```bash
git add dbt/models/core/dim_titel.sql dbt/models/core/fct_betrag.sql dbt/models/mart/agg_einzelplan_jahr.sql dbt/models/mart/agg_funktion_jahr.sql dbt/models/mart/agg_gruppierung_jahr.sql dbt/dbt_project.yml
git commit -m "perf(dbt): dim_titel, fct_betrag und Aggregate als Views"
```

---

### Task 4: Grundlagen der Abfrageschicht (Rechte, Hilfsfunktionen, Datenstand, Kennzahlen, Glossar)

**Files:**
- Create: `supabase/migrations/20261013120200_api_grundlagen.sql`
- Create: `packages/ingest/src/abfrage/testdaten.ts`
- Test: `packages/ingest/src/abfrage/grundlagen.int.test.ts`

**Interfaces:**
- Consumes: `semantic.*` und `ops.dataset_version.semantik_version_id` aus Task 2; `speichereDqLauf` und `veroeffentlicheVersion` aus `packages/ingest/src/db/veroeffentlichung.ts`.
- Produces (für Task 5 bis 7):
  - `semantic.normtext(p text) returns text`: klein, ohne Akzente, nur `[a-z0-9]` und einzelne Leerzeichen; `null` ergibt `''`.
  - `semantic.stand(p_version bigint) returns setof mart.fct_titel_jahr_hist`: Zeilen, die in dieser Version gelten.
  - `semantic.version_oder_aktuell(p_version bigint) returns ops.dataset_version`: `null` ergibt die aktuelle Version; Fehler bei unbekannter Version oder ohne veröffentlichte Version.
  - `semantic.semantik_von(p_version ops.dataset_version) returns bigint`: Fehler, wenn die Version keine Semantik hat.
  - `api.get_dataset_status(p_version bigint default null) returns jsonb`
  - `api.list_kennzahlen(p_version bigint default null) returns jsonb`
  - `api.get_glossar(p_begriff text default null, p_version bigint default null) returns jsonb`
  - Testhilfe `testdaten.ts`: `type TestTitel`, `leereMart(tx: Sql): Promise<void>`, `veroeffentlicheTitel(tx: Sql, titel: readonly TestTitel[]): Promise<number>` (liefert die Versionsnummer).

- [ ] **Step 1: Testhilfe schreiben**

`packages/ingest/src/abfrage/testdaten.ts`:

```ts
import type { Sql } from '../db/client';
import { speichereDqLauf, veroeffentlicheVersion } from '../db/veroeffentlichung';

/** Eine Titelzeile für Tests der Abfragefunktionen; Einzelplan, Kapitel und Titelnummer folgen aus titelKey. */
export type TestTitel = {
  jahr: number;
  titelKey: string;
  soll: number;
  konto?: 'ausgaben' | 'einnahmen';
  /** Fehlt ist, gilt das Jahr als ohne Ist (ist_verfuegbar = false). */
  ist?: number;
  sollXml?: number;
  sollQuelle?: 'api' | 'xml';
  titelText?: string;
  einzelplanText?: string;
  kapitelText?: string;
  fkt?: string;
  funktionText?: string;
  haushaltsstand?: string;
  seite?: number;
};

/** Leert Mart und Historie in der laufenden Test-Transaktion; keine Version ist mehr aktuell. */
export async function leereMart(tx: Sql): Promise<void> {
  await tx`delete from mart.fct_titel_jahr_hist`;
  await tx`update ops.dataset_version set is_current = false`;
  await tx`delete from mart.fct_titel_jahr`;
}

/** Ersetzt mart.fct_titel_jahr durch die Titel und veröffentlicht sie als neue Datenversion (Ampel grün). */
export async function veroeffentlicheTitel(tx: Sql, titel: readonly TestTitel[]): Promise<number> {
  await tx`delete from mart.fct_titel_jahr`;
  for (const t of titel) {
    const quelle = t.sollQuelle ?? 'api';
    const istVerfuegbar = t.ist !== undefined;
    const titelNr = t.titelKey.slice(4);
    const fkt = t.fkt ?? '011';
    const abweichung = quelle === 'api' && t.ist !== undefined ? t.ist - t.soll : null;
    const istQuote = quelle === 'api' && t.ist !== undefined && t.soll !== 0 ? Math.round((t.ist / t.soll) * 1e6) / 1e6 : null;
    await tx`
      insert into mart.fct_titel_jahr (
        jahr, konto, titel_key, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text, titel_nr, titel_text,
        fkt, funktion_text, oberfunktion, hauptfunktion, gruppierung_nr, obergruppe, hauptgruppe,
        soll_eur, soll_quelle, soll_xml_eur, ist_eur, ist_verfuegbar, abweichung_eur, ist_quote,
        haushaltsstand, seite, im_haushaltsplan_xml, zeilen_hash)
      values (
        ${t.jahr}, ${t.konto ?? 'ausgaben'}, ${t.titelKey},
        ${t.titelKey.slice(0, 2)}, ${t.einzelplanText ?? `Einzelplan ${t.titelKey.slice(0, 2)}`},
        ${t.titelKey.slice(0, 4)}, ${t.kapitelText ?? `Kapitel ${t.titelKey.slice(0, 4)}`},
        ${titelNr}, ${t.titelText ?? `Titel ${t.titelKey}`},
        ${fkt}, ${t.funktionText ?? null}, ${fkt.slice(0, 2)}, ${fkt.slice(0, 1)},
        ${titelNr.slice(0, 3)}, ${titelNr.slice(0, 2)}, ${titelNr.slice(0, 1)},
        ${t.soll}, ${quelle}, ${t.sollXml ?? (quelle === 'xml' ? t.soll : null)},
        ${t.ist ?? null}, ${istVerfuegbar}, ${abweichung}, ${istQuote},
        ${t.haushaltsstand ?? 'Gesetz'}, ${t.seite ?? null}, true, ${JSON.stringify(t)})`;
  }
  const dqLaufId = await speichereDqLauf(tx, { gitSha: 'test', manifestSha: 'test', ampel: 'green', score: 100 }, []);
  return (await veroeffentlicheVersion(tx, dqLaufId)).versionId;
}
```

- [ ] **Step 2: Failing tests schreiben**

`packages/ingest/src/abfrage/grundlagen.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel } from './testdaten';

const MRD = 1e9;

describe('Grundlagen der Abfrageschicht', () => {
  it('normalisiert Texte für die Suche', () =>
    imRollback(async (tx) => {
      const [z] = await tx`
        select semantic.normtext('BAföG: Zuschüsse!') as a, semantic.normtext('Straße  der Einheit') as b, semantic.normtext(null) as c`;
      expect(z).toEqual({ a: 'bafog zuschusse', b: 'strasse der einheit', c: '' });
    }));

  it('liefert den Datenstand mit Ampel, Semantik-Version und Jahren', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      const v = await veroeffentlicheTitel(tx, [
        { jahr: 2024, titelKey: '140153201', soll: 100 * MRD, ist: 90 * MRD },
        { jahr: 2026, titelKey: '140153201', soll: 150 * MRD },
      ]);
      const [z] = await tx`select api.get_dataset_status() as s`;
      const s = z!.s;
      expect(s.version).toBe(v);
      expect(s.ist_aktuell).toBe(true);
      expect(s.ampel).toBe('green');
      expect(typeof s.semantik_version).toBe('number');
      expect(s.zeilen).toBe(2);
      expect(s.pruefungen).toEqual([]);
      expect(s.jahre).toEqual([
        { jahr: 2024, konto: 'ausgaben', haushaltsstand: 'Gesetz', soll_quelle: 'api', ist_verfuegbar: true, titel: 1 },
        { jahr: 2026, konto: 'ausgaben', haushaltsstand: 'Gesetz', soll_quelle: 'api', ist_verfuegbar: false, titel: 1 },
      ]);
    }));

  it('nennt nicht bestandene Prüfungen im Datenstand', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
      await tx`
        insert into ops.dq_ergebnis (dq_lauf_id, check_id, status, failures, details)
        select dq_lauf_id, 'DQ-05', 'warn', 3, '[]'::jsonb from ops.dataset_version where is_current`;
      const [z] = await tx`select api.get_dataset_status() as s`;
      expect(z!.s.pruefungen).toEqual([
        { check_id: 'DQ-05', status: 'warn', failures: 3, schwere: 'warn', beschreibung: 'Jede Gruppierungsnummer hat eine Bezeichnung' },
      ]);
    }));

  it('nennt eine unbekannte Version', () =>
    imRollback(async (tx) => {
      await expect(tx`select api.get_dataset_status(${-1}::bigint)`).rejects.toThrow(/Unbekannte Datenversion -1/);
    }));

  it('meldet, wenn noch keine Version veröffentlicht ist', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      await expect(tx`select api.get_dataset_status()`).rejects.toThrow(/Noch keine Datenversion veröffentlicht/);
    }));

  it('lehnt Versionen ohne Semantik ab', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      const v = await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
      await tx`update ops.dataset_version set semantik_version_id = null where version_id = ${v}`;
      await expect(tx`select api.list_kennzahlen()`).rejects.toThrow(/mit keiner Semantik verknüpft/);
    }));

  it('listet die Kennzahlen in fester Reihenfolge', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
      const [z] = await tx`select api.list_kennzahlen() as k`;
      expect(z!.k.kennzahlen.map((k: { kennzahl_id: string }) => k.kennzahl_id)).toEqual([
        'soll', 'soll_xml', 'ist', 'abweichung', 'abweichung_rel', 'ist_quote', 'soll_anteil', 'ist_anteil',
        'soll_pro_kopf', 'ist_pro_kopf', 'soll_pro_tag', 'ist_pro_tag', 'soll_vj_abs', 'soll_vj_rel',
        'ist_vj_abs', 'ist_vj_rel', 'titel_anzahl',
      ]);
      expect(z!.k.kennzahlen[0]).toEqual(expect.objectContaining({ kennzahl_id: 'soll', einheit: 'EUR', braucht_jahr: false }));
    }));

  it('findet Glossareinträge auch ungenau und listet ohne Begriff alle', () =>
    imRollback(async (tx) => {
      await leereMart(tx);
      await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
      const [a] = await tx`select api.get_glossar('minderausgabe') as g`;
      expect(a!.g.eintraege[0].begriff).toBe('Globale Minderausgabe');
      const [b] = await tx`select api.get_glossar() as g`;
      expect(b!.g.eintraege.length).toBeGreaterThanOrEqual(20);
      const [c] = await tx`select api.get_glossar('xyzxyz') as g`;
      expect(c!.g.eintraege).toEqual([]);
    }));

  describe('Rechte für anon', () => {
    it('darf die Funktionen in api ausführen', () =>
      imRollback(async (tx) => {
        await leereMart(tx);
        await veroeffentlicheTitel(tx, [{ jahr: 2024, titelKey: '140153201', soll: 1 }]);
        await tx`set local role anon`;
        const [z] = await tx`select api.get_dataset_status() as s, api.list_kennzahlen() as k, api.get_glossar('Soll') as g`;
        expect(z!.s.ampel).toBe('green');
      }));

    it('darf mart nicht lesen', () =>
      imRollback(async (tx) => {
        await tx`set local role anon`;
        await expect(tx`select 1 from mart.fct_titel_jahr_hist limit 1`).rejects.toThrow(/permission denied/);
      }));

    it('darf ops nicht lesen', () =>
      imRollback(async (tx) => {
        await tx`set local role anon`;
        await expect(tx`select 1 from ops.dataset_version limit 1`).rejects.toThrow(/permission denied/);
      }));

    it('darf Hilfsfunktionen in semantic nicht aufrufen', () =>
      imRollback(async (tx) => {
        await tx`set local role anon`;
        await expect(tx`select semantic.normtext('x')`).rejects.toThrow(/permission denied/);
      }));
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/abfrage/grundlagen.int.test.ts`
Expected: FAIL mit `function semantic.normtext(unknown) does not exist`.

- [ ] **Step 4: Migration schreiben**

`supabase/migrations/20261013120200_api_grundlagen.sql`:

```sql
-- Plan 4: Grundlagen der Abfrageschicht. Nach außen sichtbar sind nur Funktionen im Schema api.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

do $$
begin
  if (select e.extnamespace::regnamespace::text from pg_extension e where e.extname = 'pg_trgm') <> 'extensions'
     or (select e.extnamespace::regnamespace::text from pg_extension e where e.extname = 'unaccent') <> 'extensions' then
    raise exception 'pg_trgm und unaccent müssen im Schema extensions liegen (search_path der api-Funktionen)';
  end if;
end $$;

-- Funktionen sind in Postgres standardmäßig für public ausführbar: für api und semantic abschalten.
alter default privileges in schema api revoke execute on functions from public;
alter default privileges in schema semantic revoke execute on functions from public;
grant usage on schema api to anon, authenticated, service_role;

-- Für die Titel-Lineage (Task 7): Titel gleicher Nummer über die Jahre.
create index fct_titel_jahr_hist_titel_nr on mart.fct_titel_jahr_hist (titel_nr, konto, jahr);

-- Vergleichstext für Suche und Lineage: klein, ohne Akzente, nur Buchstaben a bis z, Ziffern und einfache Leerzeichen.
-- unaccent mit ausdrücklichem Wörterbuch, weil die Ein-Argument-Form das Wörterbuch über den search_path sucht.
create function semantic.normtext(p text)
returns text
language sql
stable
as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Alle Zeilen der Historie, die in einer Datenversion gelten (Roadmap E16). Einfache SQL-Funktion, damit Postgres sie einbettet.
create function semantic.stand(p_version bigint)
returns setof mart.fct_titel_jahr_hist
language sql
stable
as $$
  select * from mart.fct_titel_jahr_hist h
  where h.gueltig_ab_version <= p_version and (h.gueltig_bis_version is null or h.gueltig_bis_version > p_version)
$$;

create function semantic.version_oder_aktuell(p_version bigint)
returns ops.dataset_version
language plpgsql
stable
as $$
declare
  v ops.dataset_version;
begin
  if p_version is null then
    select * into v from ops.dataset_version d where d.is_current;
    if not found then raise exception 'Noch keine Datenversion veröffentlicht'; end if;
  else
    select * into v from ops.dataset_version d where d.version_id = p_version;
    if not found then raise exception 'Unbekannte Datenversion %', p_version using errcode = '22023'; end if;
  end if;
  return v;
end $$;

create function semantic.semantik_von(p_version ops.dataset_version)
returns bigint
language plpgsql
stable
as $$
begin
  if p_version.semantik_version_id is null then
    raise exception 'Datenversion % ist mit keiner Semantik verknüpft (vor Plan 4 veröffentlicht)', p_version.version_id using errcode = '22023';
  end if;
  return p_version.semantik_version_id;
end $$;

-- Datenstand: Version, Ampel, nicht bestandene Prüfungen, Jahre mit Haushaltsstand und Verfügbarkeit des Ist.
create function api.get_dataset_status(p_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  l ops.dq_lauf;
begin
  select * into l from ops.dq_lauf q where q.dq_lauf_id = v.dq_lauf_id;
  return jsonb_build_object(
    'version', v.version_id,
    'veroeffentlicht_am', v.erstellt_am,
    'ist_aktuell', v.is_current,
    'semantik_version', v.semantik_version_id,
    'ampel', l.ampel,
    'score', l.score,
    'zeilen', v.zeilen_gesamt,
    'pruefungen', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'check_id', e.check_id, 'status', e.status, 'failures', e.failures,
               'schwere', c.schwere, 'beschreibung', c.beschreibung) order by e.check_id), '[]'::jsonb)
      from ops.dq_ergebnis e join ops.dq_check c on c.check_id = e.check_id
      where e.dq_lauf_id = v.dq_lauf_id and e.status <> 'pass'),
    'jahre', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'jahr', j.jahr, 'konto', j.konto, 'haushaltsstand', j.haushaltsstand, 'soll_quelle', j.soll_quelle,
               'ist_verfuegbar', j.ist_verfuegbar, 'titel', j.titel) order by j.jahr, j.konto), '[]'::jsonb)
      from (
        select s.jahr, s.konto, min(s.haushaltsstand) as haushaltsstand, min(s.soll_quelle) as soll_quelle,
               bool_and(s.ist_verfuegbar) as ist_verfuegbar, count(*) as titel
        from semantic.stand(v.version_id) s
        group by s.jahr, s.konto) j));
end $$;

create function api.list_kennzahlen(p_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  v_sem bigint := semantic.semantik_von(v);
begin
  return jsonb_build_object(
    'version', v.version_id,
    'semantik_version', v_sem,
    'kennzahlen', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'kennzahl_id', k.kennzahl_id, 'name', k.name, 'definition', k.definition, 'formel', k.formel,
               'einheit', k.einheit, 'braucht_jahr', k.braucht_jahr) order by k.reihenfolge), '[]'::jsonb)
      from semantic.kennzahl k where k.semantik_version_id = v_sem));
end $$;

create function api.get_glossar(p_begriff text default null, p_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, pg_temp
as $$
declare
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  v_sem bigint := semantic.semantik_von(v);
  v_q text := semantic.normtext(p_begriff);
begin
  return jsonb_build_object(
    'version', v.version_id,
    'semantik_version', v_sem,
    'eintraege', (
      select coalesce(jsonb_agg(jsonb_build_object('begriff', g.begriff, 'erklaerung', g.erklaerung, 'beispiel', g.beispiel)
                                order by g.rang desc, g.begriff), '[]'::jsonb)
      from (
        select gl.begriff, gl.erklaerung, gl.beispiel,
               case when v_q = '' then 0
                    else greatest(similarity(semantic.normtext(gl.begriff), v_q), word_similarity(v_q, semantic.normtext(gl.begriff))) end as rang
        from semantic.glossar gl
        where gl.semantik_version_id = v_sem) g
      where v_q = '' or g.rang >= 0.4));
end $$;

revoke all on function api.get_dataset_status(bigint), api.list_kennzahlen(bigint), api.get_glossar(text, bigint) from public;
grant execute on function api.get_dataset_status(bigint), api.list_kennzahlen(bigint), api.get_glossar(text, bigint)
  to anon, authenticated, service_role;
revoke all on function semantic.normtext(text), semantic.stand(bigint), semantic.version_oder_aktuell(bigint),
  semantic.semantik_von(ops.dataset_version) from public;
```

Run: `pnpm dlx supabase@2.120.0 migration up --local`
Expected: `Applying migration 20261013120200_api_grundlagen.sql...`

- [ ] **Step 5: Tests laufen lassen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/abfrage/grundlagen.int.test.ts`
Expected: PASS (12 Tests).

Run: `pnpm typecheck && pnpm test:int`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261013120200_api_grundlagen.sql packages/ingest/src/abfrage/testdaten.ts packages/ingest/src/abfrage/grundlagen.int.test.ts
git commit -m "feat(api): Rechte, Hilfsfunktionen, Datenstand, Kennzahlen und Glossar"
```

---

### Task 5: `api.query_metric`

**Files:**
- Create: `supabase/migrations/20261013120300_api_query_metric.sql`
- Test: `packages/ingest/src/abfrage/query-metric.int.test.ts`

**Interfaces:**
- Consumes: `semantic.stand`, `semantic.version_oder_aktuell`, `semantic.semantik_von`, `semantic.kennzahl`, `semantic.einwohner` (Task 2 und 4); Testhilfe `leereMart`, `veroeffentlicheTitel` (Task 4).
- Produces: `api.query_metric(p_metrics text[], p_group_by text[] default '{}', p_filters jsonb default '{}', p_order_by text default null, p_absteigend boolean default true, p_limit integer default 50, p_version bigint default null) returns jsonb` mit den Schlüsseln:
  - `version`, `semantik_version`, `vorlage` (`'query_metric.v1'`)
  - `parameter` (normalisiert): `kennzahlen`, `gruppierung`, `filter` (jeder Wert als Liste, außer `jahr_von`/`jahr_bis`), `sortierung`, `absteigend`, `limit`
  - `einheiten`: Kennzahl → Einheit
  - `zeilen`: Liste von Objekten mit den Gruppierungen, je Gruppierung mit Bezeichnung auch der Textspalte (zum Beispiel `einzelplan_text`), und den Kennzahlen
  - `zeilen_gesamt`: Anzahl vor dem Limit
  - `hinweise`: Liste deutscher Sätze

Regeln:
- **Gruppierungen und Filter:** `jahr, konto, einzelplan_nr, kapitel_nr, titelgruppe_nr, titel_key, hauptfunktion, oberfunktion, fkt, hauptgruppe, obergruppe, gruppierung_nr, flexibilisiert, haushaltsstand, soll_quelle`; als Filter zusätzlich `jahr_von` und `jahr_bis`.
- **Konto** muss festgelegt sein: Filter mit genau einem Wert oder Gruppierung nach `konto`.
- **Kennzahlen mit `braucht_jahr`** brauchen ein Jahr je Zeile: Gruppierung nach `jahr` oder Filter `jahr` mit genau einem Wert.
- **Bezeichnung einer Gruppe** stammt aus dem jüngsten Jahr der Gruppe; bei Gleichstand gilt der alphabetisch erste Text.
- **Sortierung:** Ohne `p_order_by` aufsteigend nach den Gruppierungen in der angegebenen Reihenfolge. Mit `p_order_by` nach dieser Kennzahl oder Gruppierung (`nulls last`), danach nach den Gruppierungen.

- [ ] **Step 1: Failing tests schreiben**

`packages/ingest/src/abfrage/query-metric.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Sql } from '../db/client';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel, type TestTitel } from './testdaten';

const MRD = 1e9;

// Zwei Ausgabetitel 2023 bis 2026 (2023 mit Soll aus der XML, 2026 ohne Ist) und ein Einnahmetitel 2024.
const TITEL: TestTitel[] = [
  { jahr: 2023, titelKey: '140153201', soll: 80 * MRD, ist: 85 * MRD, sollQuelle: 'xml', einzelplanText: 'Verteidigung', titelText: 'Beschaffung von Flugzeugen' },
  { jahr: 2024, titelKey: '140153201', soll: 100 * MRD, ist: 90 * MRD, einzelplanText: 'Verteidigung', titelText: 'Beschaffung von Flugzeugen' },
  { jahr: 2025, titelKey: '140153201', soll: 120 * MRD, ist: 110 * MRD, einzelplanText: 'Verteidigung', titelText: 'Beschaffung von Flugzeugen' },
  { jahr: 2026, titelKey: '140153201', soll: 150 * MRD, einzelplanText: 'Verteidigung', titelText: 'Beschaffung von Flugzeugen' },
  { jahr: 2024, titelKey: '060168421', soll: 50 * MRD, ist: 70 * MRD, einzelplanText: 'Inneres, Bau und Heimat', titelText: 'Zuschüsse an die Bundespolizei' },
  { jahr: 2025, titelKey: '060168421', soll: 40 * MRD, ist: 30 * MRD, einzelplanText: 'Inneres', titelText: 'Zuschüsse an die Bundespolizei' },
  { jahr: 2026, titelKey: '060168421', soll: 50 * MRD, einzelplanText: 'Inneres', titelText: 'Zuschüsse an die Bundespolizei' },
  { jahr: 2024, titelKey: '600101101', konto: 'einnahmen', soll: 150 * MRD, ist: 150 * MRD },
];

type Ergebnis = {
  version: number;
  semantik_version: number;
  vorlage: string;
  parameter: Record<string, unknown>;
  einheiten: Record<string, string>;
  zeilen: Record<string, unknown>[];
  zeilen_gesamt: number;
  hinweise: string[];
};

type Abfrage = {
  kennzahlen: string[];
  gruppierung?: string[];
  filter?: Record<string, unknown>;
  sortierung?: string | null;
  absteigend?: boolean;
  limit?: number;
  version?: number | null;
};

async function abfrage(tx: Sql, a: Abfrage): Promise<Ergebnis> {
  const filter = tx.json((a.filter ?? {}) as Parameters<Sql['json']>[0]);
  const [z] = await tx`
    select api.query_metric(${a.kennzahlen}::text[], ${a.gruppierung ?? []}::text[], ${filter}::jsonb,
      ${a.sortierung ?? null}::text, ${a.absteigend ?? true}::boolean, ${a.limit ?? 50}::integer, ${a.version ?? null}::bigint) as r`;
  return z!.r as Ergebnis;
}

async function mitTestdaten(fn: (tx: Sql, version: number) => Promise<void>): Promise<void> {
  await imRollback(async (tx) => {
    await leereMart(tx);
    const version = await veroeffentlicheTitel(tx, TITEL);
    await fn(tx, version);
  });
}

describe('api.query_metric', () => {
  it('summiert das Soll je Jahr', () =>
    mitTestdaten(async (tx, version) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['jahr'], filter: { konto: 'ausgaben' } });
      expect(r.version).toBe(version);
      expect(r.vorlage).toBe('query_metric.v1');
      expect(r.einheiten).toEqual({ soll: 'EUR' });
      expect(r.zeilen).toEqual([
        { jahr: 2023, soll: 80 * MRD },
        { jahr: 2024, soll: 150 * MRD },
        { jahr: 2025, soll: 160 * MRD },
        { jahr: 2026, soll: 200 * MRD },
      ]);
      expect(r.parameter.filter).toEqual({ konto: ['ausgaben'] });
    }));

  it('zeigt fehlendes Ist als null, nie als 0', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['ist'], gruppierung: ['jahr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([
        { jahr: 2023, ist: 85 * MRD },
        { jahr: 2024, ist: 160 * MRD },
        { jahr: 2025, ist: 140 * MRD },
        { jahr: 2026, ist: null },
      ]);
      expect(r.hinweise.some((h) => h.includes('nie 0'))).toBe(true);
    }));

  it('Ist über verfügbare und nicht verfügbare Jahre bleibt null', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll', 'ist'], filter: { konto: 'ausgaben', jahr_von: 2025 } });
      expect(r.zeilen).toEqual([{ soll: 360 * MRD, ist: null }]);
    }));

  it('Abweichung nur mit Soll aus der internalapi', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['abweichung', 'abweichung_rel', 'ist_quote'], gruppierung: ['jahr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([
        { jahr: 2023, abweichung: null, abweichung_rel: null, ist_quote: null },
        { jahr: 2024, abweichung: 10 * MRD, abweichung_rel: 0.066667, ist_quote: 1.066667 },
        { jahr: 2025, abweichung: -20 * MRD, abweichung_rel: -0.125, ist_quote: 0.875 },
        { jahr: 2026, abweichung: null, abweichung_rel: null, ist_quote: null },
      ]);
      expect(r.hinweise.some((h) => h.includes('Haushaltsplan (XML)'))).toBe(true);
    }));

  it('bezieht den Anteil auf den ganzen Haushalt, auch bei Filter auf einen Einzelplan', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll_anteil', 'ist_anteil'], filter: { konto: 'ausgaben', jahr: 2024, einzelplan_nr: '14' } });
      expect(r.zeilen).toEqual([{ soll_anteil: 0.666667, ist_anteil: 0.5625 }]);
    }));

  it('rechnet je Kopf und je Tag, mit fortgeschriebener Einwohnerzahl', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll_pro_kopf', 'soll_pro_tag'], gruppierung: ['jahr'], filter: { konto: 'ausgaben', jahr: [2024, 2026] } });
      expect(r.zeilen).toEqual([
        { jahr: 2024, soll_pro_kopf: 1797.35, soll_pro_tag: 409836065.57 },
        { jahr: 2026, soll_pro_kopf: 2393, soll_pro_tag: 547945205.48 },
      ]);
      expect(r.hinweise.some((h) => h.includes('fortgeschrieben'))).toBe(true);
    }));

  it('vergleicht mit dem Vorjahr', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll_vj_abs', 'soll_vj_rel', 'ist_vj_abs'], gruppierung: ['jahr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([
        { jahr: 2023, soll_vj_abs: null, soll_vj_rel: null, ist_vj_abs: null },
        { jahr: 2024, soll_vj_abs: 70 * MRD, soll_vj_rel: 0.875, ist_vj_abs: 75 * MRD },
        { jahr: 2025, soll_vj_abs: 10 * MRD, soll_vj_rel: 0.066667, ist_vj_abs: -20 * MRD },
        { jahr: 2026, soll_vj_abs: 40 * MRD, soll_vj_rel: 0.25, ist_vj_abs: null },
      ]);
      expect(r.hinweise.some((h) => h.includes('Ressortwechsel'))).toBe(true);
    }));

  it('vergleicht mit dem Vorjahr auch bei Filter auf ein einzelnes Jahr', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll', 'soll_vj_abs'], gruppierung: ['einzelplan_nr'], filter: { konto: 'ausgaben', jahr: 2025 } });
      expect(r.zeilen).toEqual([
        { einzelplan_nr: '06', einzelplan_text: 'Inneres', soll: 40 * MRD, soll_vj_abs: -10 * MRD },
        { einzelplan_nr: '14', einzelplan_text: 'Verteidigung', soll: 120 * MRD, soll_vj_abs: 20 * MRD },
      ]);
    }));

  it('nimmt die Bezeichnung aus dem jüngsten Jahr der Gruppe', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll', 'titel_anzahl'], gruppierung: ['einzelplan_nr'], filter: { konto: 'ausgaben' } });
      expect(r.zeilen).toEqual([
        { einzelplan_nr: '06', einzelplan_text: 'Inneres', soll: 140 * MRD, titel_anzahl: 3 },
        { einzelplan_nr: '14', einzelplan_text: 'Verteidigung', soll: 450 * MRD, titel_anzahl: 4 },
      ]);
    }));

  it('sortiert, begrenzt und nennt die Kürzung', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['titel_key'], filter: { konto: 'ausgaben', jahr: 2024 }, sortierung: 'soll', limit: 1 });
      expect(r.zeilen).toEqual([{ titel_key: '140153201', titel_text: 'Beschaffung von Flugzeugen', soll: 100 * MRD }]);
      expect(r.zeilen_gesamt).toBe(2);
      expect(r.hinweise).toContain('Ergebnis auf 1 von 2 Zeilen gekürzt.');
      const auf = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['titel_key'], filter: { konto: 'ausgaben', jahr: 2024 }, sortierung: 'soll', absteigend: false });
      expect(auf.zeilen.map((z) => z.titel_key)).toEqual(['060168421', '140153201']);
    }));

  it('gruppiert nach Konto ohne Kontofilter', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], gruppierung: ['konto'], filter: { jahr: 2024 } });
      expect(r.zeilen).toEqual([
        { konto: 'ausgaben', soll: 150 * MRD },
        { konto: 'einnahmen', soll: 150 * MRD },
      ]);
    }));

  it('liefert eine frühere Version unverändert', () =>
    mitTestdaten(async (tx, v1) => {
      const geaendert = TITEL.map((t) => (t.jahr === 2024 && t.titelKey === '140153201' ? { ...t, soll: 101 * MRD } : t));
      const v2 = await veroeffentlicheTitel(tx, geaendert);
      const alt = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: 2024 }, version: v1 });
      const neu = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: 2024 } });
      expect(alt.version).toBe(v1);
      expect(alt.zeilen).toEqual([{ soll: 150 * MRD }]);
      expect(neu.version).toBe(v2);
      expect(neu.zeilen).toEqual([{ soll: 151 * MRD }]);
    }));

  it('liefert ohne Treffer keine Zeile', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: 1999 } });
      expect(r.zeilen).toEqual([]);
      expect(r.zeilen_gesamt).toBe(0);
    }));

  it('Werte gehen als Parameter hinein', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: ["14' or '1'='1"] } });
      expect(r.zeilen).toEqual([]);
      const [n] = await tx`select count(*)::int as n from mart.fct_titel_jahr_hist`;
      expect(n!.n).toBeGreaterThan(0);
    }));

  describe('lehnt unzulässige Eingaben ab', () => {
    const faelle: [string, Abfrage, RegExp][] = [
      ['ohne Kennzahl', { kennzahlen: [], filter: { konto: 'ausgaben' } }, /Mindestens eine Kennzahl/],
      ['unbekannte Kennzahl', { kennzahlen: ['cagr'], filter: { konto: 'ausgaben' } }, /Unbekannte Kennzahl: cagr/],
      ['Gruppierung mit SQL', { kennzahlen: ['soll'], gruppierung: ['jahr; drop table mart.fct_titel_jahr_hist'], filter: { konto: 'ausgaben' } }, /Unzulässige Gruppierung/],
      ['Filter auf unbekannte Spalte', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', titel_text: 'x' } }, /Unzulässiger Filter: titel_text/],
      ['verschachtelter Filterwert', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: { a: 1 } } }, /einfacher Werte/],
      ['leere Filterliste', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: [] } }, /einfacher Werte/],
      ['null als Filterwert', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', einzelplan_nr: null } }, /einfacher Werte/],
      ['Jahr als Text', { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr_von: '2024' } }, /Jahreszahl/],
      ['ohne Konto', { kennzahlen: ['soll'], gruppierung: ['jahr'] }, /Konto festlegen/],
      ['zwei Konten ohne Gruppierung', { kennzahlen: ['soll'], filter: { konto: ['ausgaben', 'einnahmen'] } }, /Konto festlegen/],
      ['je Kopf ohne einzelnes Jahr', { kennzahlen: ['soll_pro_kopf'], filter: { konto: 'ausgaben' } }, /einzelnes Jahr/],
      ['Sortierung nach nicht angefragter Kennzahl', { kennzahlen: ['soll'], filter: { konto: 'ausgaben' }, sortierung: 'ist' }, /Sortierung nur nach/],
    ];
    for (const [name, a, fehler] of faelle) {
      it(name, () =>
        mitTestdaten(async (tx) => {
          await expect(abfrage(tx, a)).rejects.toThrow(fehler);
        }));
    }
  });

  it('kürzt zu große Limits auf 500', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben' }, limit: 100000 });
      expect(r.parameter.limit).toBe(500);
    }));

  it('darf von anon ausgeführt werden', () =>
    mitTestdaten(async (tx) => {
      await tx`set local role anon`;
      const r = await abfrage(tx, { kennzahlen: ['soll'], filter: { konto: 'ausgaben', jahr: 2024 } });
      expect(r.zeilen).toEqual([{ soll: 150 * MRD }]);
    }));
});
```

Erwartete Werte, nachgerechnet:
- Anteil 2024: 100 von 150 Mrd. = 0,666667; Ist 90 von 160 Mrd. = 0,5625.
- Je Kopf 2024: 150 Mrd. / 83.456.045 = 1.797,35.
- Je Kopf 2026: 200 Mrd. / 83.577.140 (Wert 2025, fortgeschrieben) = 2.393,00.
- Je Tag: 150 Mrd. / 366 = 409.836.065,57 (2024 ist ein Schaltjahr) und 200 Mrd. / 365 = 547.945.205,48.
- Vorjahr Ist 2024: 160 minus 85 Mrd. = 75 Mrd. Das Ist 2023 ist verfügbar; nur die Abweichung braucht API-Soll.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/abfrage/query-metric.int.test.ts`
Expected: FAIL mit `function api.query_metric(text[], text[], jsonb, text, boolean, integer, bigint) does not exist`.

- [ ] **Step 3: Migration schreiben**

`supabase/migrations/20261013120300_api_query_metric.sql`:

```sql
-- Plan 4: eine generische Abfragefunktion für Dashboard und Agent (Konzept Abschnitt 10).
-- SQL entsteht nur aus Positivlisten (Bezeichner mit %I); Filterwerte gehen als Parameter $3 hinein.
create function api.query_metric(
  p_metrics    text[],
  p_group_by   text[]  default '{}',
  p_filters    jsonb   default '{}',
  p_order_by   text    default null,
  p_absteigend boolean default true,
  p_limit      integer default 50,
  p_version    bigint  default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  c_dims constant text[] := array['jahr', 'konto', 'einzelplan_nr', 'kapitel_nr', 'titelgruppe_nr', 'titel_key',
    'hauptfunktion', 'oberfunktion', 'fkt', 'hauptgruppe', 'obergruppe', 'gruppierung_nr',
    'flexibilisiert', 'haushaltsstand', 'soll_quelle'];
  c_texte constant jsonb := '{"einzelplan_nr": "einzelplan_text", "kapitel_nr": "kapitel_text",
    "titelgruppe_nr": "titelgruppe_text", "titel_key": "titel_text", "hauptfunktion": "hauptfunktion_text",
    "oberfunktion": "oberfunktion_text", "fkt": "funktion_text", "hauptgruppe": "hauptgruppe_text",
    "obergruppe": "obergruppe_text", "gruppierung_nr": "gruppierung_text"}';
  -- Für den Vorjahresvergleich nicht gleichsetzen: Jahr und Konto stehen in der Join-Bedingung, Stand und Quelle wechseln je Jahr.
  c_ohne_vj_join constant text[] := array['jahr', 'konto', 'haushaltsstand', 'soll_quelle'];
  c_ist constant text[] := array['ist', 'abweichung', 'abweichung_rel', 'ist_quote', 'ist_anteil', 'ist_pro_kopf',
    'ist_pro_tag', 'ist_vj_abs', 'ist_vj_rel'];
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  v_sem bigint := semantic.semantik_von(v);
  v_eingabe jsonb := coalesce(p_filters, '{}'::jsonb);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_metrics text[];
  v_dims text[];
  v_filter jsonb := '{}'::jsonb;
  v_key text;
  v_wert jsonb;
  v_where text := '';
  v_where_vj text := '';
  v_m text;
  v_d text;
  v_ausdruck text;
  v_liste text;
  v_sel_basis text[] := array[]::text[];
  v_group_basis text[] := array['h.jahr', 'h.konto'];
  v_sel_final text[] := array[]::text[];
  v_group_final text[] := array[]::text[];
  v_order text[] := array[]::text[];
  v_join_vj text := 'vj.b_jahr = b.b_jahr - 1 and vj.b_konto = b.b_konto';
  v_braucht_vj boolean;
  v_braucht_gesamt boolean;
  v_braucht_ew boolean;
  v_basis text;
  v_sql text;
  v_zeilen jsonb;
  v_gesamt bigint;
  v_ist_fehlt boolean;
  v_xml_soll boolean;
  v_entwurf boolean;
  v_max_jahr integer;
  v_ew_jahr integer;
  v_hinweise text[] := array[]::text[];
begin
  -- Kennzahlen: mindestens eine, ohne Dubletten, alle im Katalog der Semantik-Version
  if p_metrics is null or cardinality(p_metrics) = 0 then
    raise exception 'Mindestens eine Kennzahl angeben' using errcode = '22023';
  end if;
  select array_agg(x.m order by x.o) into v_metrics
  from (select u.m, min(u.o) as o from unnest(p_metrics) with ordinality as u(m, o) group by u.m) x;
  foreach v_m in array v_metrics loop
    if v_m is null or not exists (select 1 from semantic.kennzahl k where k.semantik_version_id = v_sem and k.kennzahl_id = v_m) then
      raise exception 'Unbekannte Kennzahl: %', coalesce(v_m, 'null') using errcode = '22023';
    end if;
  end loop;

  -- Gruppierungen aus der Positivliste
  select coalesce(array_agg(x.d order by x.o), array[]::text[]) into v_dims
  from (select u.d, min(u.o) as o from unnest(coalesce(p_group_by, array[]::text[])) with ordinality as u(d, o) group by u.d) x;
  foreach v_d in array v_dims loop
    if v_d is null or not v_d = any(c_dims) then
      raise exception 'Unzulässige Gruppierung: %', coalesce(v_d, 'null') using errcode = '22023';
    end if;
  end loop;

  -- Filter: Schlüssel aus der Positivliste, Werte als Liste einfacher Werte, eingesetzt nur über $3
  if jsonb_typeof(v_eingabe) <> 'object' then
    raise exception 'Filter müssen ein JSON-Objekt sein' using errcode = '22023';
  end if;
  for v_key, v_wert in select e.key, e.value from jsonb_each(v_eingabe) e loop
    if v_key in ('jahr_von', 'jahr_bis') then
      if jsonb_typeof(v_wert) <> 'number' or v_wert::text !~ '^[0-9]{4}$' then
        raise exception 'Filter % braucht eine Jahreszahl', v_key using errcode = '22023';
      end if;
      v_filter := v_filter || jsonb_build_object(v_key, v_wert);
      v_where := v_where || format(' and h.jahr %s ($3->>%L)::integer', case when v_key = 'jahr_von' then '>=' else '<=' end, v_key);
    elsif v_key = any(c_dims) then
      if jsonb_typeof(v_wert) <> 'array' then
        v_wert := jsonb_build_array(v_wert);
      end if;
      if jsonb_array_length(v_wert) = 0
         or exists (select 1 from jsonb_array_elements(v_wert) e where jsonb_typeof(e) not in ('string', 'number', 'boolean')) then
        raise exception 'Filter % braucht einen Wert oder eine Liste einfacher Werte', v_key using errcode = '22023';
      end if;
      v_filter := v_filter || jsonb_build_object(v_key, v_wert);
      v_where := v_where || format(' and h.%I::text = any(array(select jsonb_array_elements_text($3->%L)))', v_key, v_key);
      if v_key <> 'jahr' then
        v_where_vj := v_where_vj || format(' and h.%I::text = any(array(select jsonb_array_elements_text($3->%L)))', v_key, v_key);
      end if;
    else
      raise exception 'Unzulässiger Filter: %', v_key using errcode = '22023';
    end if;
  end loop;

  -- Konto und Jahr je Ergebniszeile
  if not ('konto' = any(v_dims) or (v_filter ? 'konto' and jsonb_array_length(v_filter -> 'konto') = 1)) then
    raise exception 'Konto festlegen: Filter konto (ausgaben oder einnahmen) oder Gruppierung nach konto' using errcode = '22023';
  end if;
  if not ('jahr' = any(v_dims) or (v_filter ? 'jahr' and jsonb_array_length(v_filter -> 'jahr') = 1)) then
    select string_agg(k.kennzahl_id, ', ' order by k.reihenfolge) into v_liste
    from semantic.kennzahl k
    where k.semantik_version_id = v_sem and k.kennzahl_id = any(v_metrics) and k.braucht_jahr;
    if v_liste is not null then
      raise exception 'Kennzahlen % brauchen ein einzelnes Jahr je Zeile: nach jahr gruppieren oder genau ein Jahr filtern', v_liste
        using errcode = '22023';
    end if;
  end if;

  if p_order_by is not null and not (p_order_by = any(v_metrics) or p_order_by = any(v_dims)) then
    raise exception 'Sortierung nur nach einer angefragten Kennzahl oder Gruppierung: %', p_order_by using errcode = '22023';
  end if;

  v_braucht_vj := v_metrics && array['soll_vj_abs', 'soll_vj_rel', 'ist_vj_abs', 'ist_vj_rel'];
  v_braucht_gesamt := v_metrics && array['soll_anteil', 'ist_anteil'];
  v_braucht_ew := v_metrics && array['soll_pro_kopf', 'ist_pro_kopf'];

  -- Stufe 1 (basis): je Gruppierung, Jahr und Konto. Stufe 2 (zeilen): je Gruppierung.
  foreach v_d in array v_dims loop
    v_sel_basis := v_sel_basis || format('h.%I as %I', v_d, v_d);
    v_group_basis := v_group_basis || format('h.%I', v_d);
    v_sel_final := v_sel_final || format('b.%I', v_d);
    v_group_final := v_group_final || format('b.%I', v_d);
    if c_texte ? v_d then
      v_sel_basis := v_sel_basis || format('max(h.%1$I) as %1$I', c_texte ->> v_d);
      v_sel_final := v_sel_final || format('(array_agg(b.%1$I order by b.b_jahr desc, b.%1$I))[1] as %1$I', c_texte ->> v_d);
    end if;
    if not v_d = any(c_ohne_vj_join) then
      v_join_vj := v_join_vj || format(' and vj.%1$I is not distinct from b.%1$I', v_d);
    end if;
  end loop;

  foreach v_m in array v_metrics loop
    v_ausdruck := case v_m
      when 'soll' then 'sum(b.soll)'
      when 'soll_xml' then 'sum(b.soll_xml)'
      when 'ist' then 'case when bool_and(b.ist_ok) then sum(b.ist) end'
      when 'abweichung' then 'case when bool_and(b.ist_ok and b.api_ok) then sum(b.abw) end'
      when 'abweichung_rel' then 'case when bool_and(b.ist_ok and b.api_ok) then round(sum(b.abw) / nullif(sum(b.soll), 0), 6) end'
      when 'ist_quote' then 'case when bool_and(b.ist_ok and b.api_ok) then round(sum(b.ist) / nullif(sum(b.soll), 0), 6) end'
      when 'soll_anteil' then 'round(sum(b.soll) / nullif(sum(g.soll_gesamt), 0), 6)'
      when 'ist_anteil' then 'case when bool_and(b.ist_ok and g.ist_ok_gesamt) then round(sum(b.ist) / nullif(sum(g.ist_gesamt), 0), 6) end'
      when 'soll_pro_kopf' then 'round(sum(b.soll) / nullif(max(ew.einwohner), 0), 2)'
      when 'ist_pro_kopf' then 'case when bool_and(b.ist_ok) then round(sum(b.ist) / nullif(max(ew.einwohner), 0), 2) end'
      when 'soll_pro_tag' then 'round(sum(b.soll) / max(extract(doy from make_date(b.b_jahr, 12, 31))), 2)'
      when 'ist_pro_tag' then 'case when bool_and(b.ist_ok) then round(sum(b.ist) / max(extract(doy from make_date(b.b_jahr, 12, 31))), 2) end'
      when 'soll_vj_abs' then 'sum(b.soll) - sum(vj.soll)'
      when 'soll_vj_rel' then 'round((sum(b.soll) - sum(vj.soll)) / nullif(sum(vj.soll), 0), 6)'
      when 'ist_vj_abs' then 'case when bool_and(b.ist_ok and vj.ist_ok) then sum(b.ist) - sum(vj.ist) end'
      when 'ist_vj_rel' then 'case when bool_and(b.ist_ok and vj.ist_ok) then round((sum(b.ist) - sum(vj.ist)) / nullif(sum(vj.ist), 0), 6) end'
      when 'titel_anzahl' then 'sum(b.n)'
    end;
    if v_ausdruck is null then
      raise exception 'Kennzahl % ist im Katalog, aber nicht umgesetzt', v_m;
    end if;
    v_sel_final := v_sel_final || (v_ausdruck || format(' as %I', v_m));
  end loop;

  if p_order_by is not null then
    v_order := v_order || format('f.%I %s nulls last', p_order_by, case when p_absteigend then 'desc' else 'asc' end);
  end if;
  foreach v_d in array v_dims loop
    v_order := v_order || format('f.%I', v_d);
  end loop;
  if cardinality(v_order) = 0 then
    v_order := array['null'];
  end if;

  v_basis := 'select ' || array_to_string(v_sel_basis || array[
      'h.jahr as b_jahr', 'h.konto as b_konto', 'sum(h.soll_eur) as soll', 'sum(h.soll_xml_eur) as soll_xml',
      'sum(h.ist_eur) as ist', 'bool_and(h.ist_verfuegbar) as ist_ok', 'bool_and(h.soll_quelle = ''api'') as api_ok',
      'sum(h.abweichung_eur) as abw', 'count(*) as n'], ', ')
    || ' from semantic.stand($1) h where true {where} group by ' || array_to_string(v_group_basis, ', ');

  v_sql := 'with basis as (' || replace(v_basis, '{where}', v_where) || ')'
    || case when v_braucht_vj then ', vorjahr as (' || replace(v_basis, '{where}', v_where_vj) || ')' else '' end
    || case when v_braucht_gesamt then
         ', gesamt as (select h.jahr as g_jahr, h.konto as g_konto, sum(h.soll_eur) as soll_gesamt, sum(h.ist_eur) as ist_gesamt,'
         || ' bool_and(h.ist_verfuegbar) as ist_ok_gesamt from semantic.stand($1) h group by h.jahr, h.konto)'
       else '' end
    || ', zeilen as (select ' || array_to_string(v_sel_final, ', ') || ' from basis b'
    || case when v_braucht_vj then ' left join vorjahr vj on ' || v_join_vj else '' end
    || case when v_braucht_gesamt then ' left join gesamt g on g.g_jahr = b.b_jahr and g.g_konto = b.b_konto' else '' end
    || case when v_braucht_ew then
         ' left join lateral (select e.einwohner from semantic.einwohner e where e.semantik_version_id = $2'
         || ' and e.jahr <= b.b_jahr order by e.jahr desc limit 1) ew on true'
       else '' end
    || case when cardinality(v_group_final) > 0 then ' group by ' || array_to_string(v_group_final, ', ') else '' end
    || ' having count(*) > 0)'
    || ' select coalesce(jsonb_agg(to_jsonb(r) - ''_nr'' - ''_gesamt'' order by r._nr), ''[]''::jsonb), coalesce(max(r._gesamt), 0)'
    || ' from (select f.*, row_number() over (order by ' || array_to_string(v_order, ', ') || ') as _nr,'
    || ' count(*) over () as _gesamt from zeilen f order by _nr limit ' || v_limit || ') r';

  execute v_sql into v_zeilen, v_gesamt using v.version_id, v_sem, v_filter;

  -- Hinweise zur Auswahl
  execute 'select bool_or(not h.ist_verfuegbar), bool_or(h.soll_quelle is distinct from ''api''),'
    || ' bool_or(h.haushaltsstand = ''Regierungsentwurf''), max(h.jahr) from semantic.stand($1) h where true' || v_where
    into v_ist_fehlt, v_xml_soll, v_entwurf, v_max_jahr
    using v.version_id, v_sem, v_filter;
  if v_metrics && c_ist and v_ist_fehlt then
    v_hinweise := array_append(v_hinweise, 'Ist liegt nur für abgeschlossene Jahre vor. Für die übrigen Jahre bleibt der Wert leer, nie 0.');
  end if;
  if v_metrics && array['abweichung', 'abweichung_rel', 'ist_quote'] and v_xml_soll then
    v_hinweise := array_append(v_hinweise, 'Abweichung und Ist-Quote gibt es nur mit maßgeblichem Soll aus der internalapi. Mit Soll aus dem Haushaltsplan (XML) bleiben sie leer.');
  end if;
  if v_braucht_ew then
    select max(e.jahr) into v_ew_jahr from semantic.einwohner e where e.semantik_version_id = v_sem;
    if v_max_jahr > v_ew_jahr then
      v_hinweise := array_append(v_hinweise, format('Einwohnerzahl für Jahre nach %s mit dem letzten verfügbaren Wert fortgeschrieben (Eurostat).', v_ew_jahr));
    end if;
  end if;
  if v_braucht_vj then
    v_hinweise := array_append(v_hinweise, 'Vorjahresvergleich je Schlüssel. Umbenennungen und Ressortwechsel sind nicht nachgeführt.');
  end if;
  if v_entwurf then
    v_hinweise := array_append(v_hinweise, 'Enthält den Regierungsentwurf: noch kein beschlossener Haushalt.');
  end if;
  if v_gesamt > v_limit then
    v_hinweise := array_append(v_hinweise, format('Ergebnis auf %s von %s Zeilen gekürzt.', v_limit, v_gesamt));
  end if;

  return jsonb_build_object(
    'version', v.version_id,
    'semantik_version', v_sem,
    'vorlage', 'query_metric.v1',
    'parameter', jsonb_build_object('kennzahlen', to_jsonb(v_metrics), 'gruppierung', to_jsonb(v_dims), 'filter', v_filter,
      'sortierung', p_order_by, 'absteigend', p_absteigend, 'limit', v_limit),
    'einheiten', (select jsonb_object_agg(k.kennzahl_id, k.einheit) from semantic.kennzahl k
                  where k.semantik_version_id = v_sem and k.kennzahl_id = any(v_metrics)),
    'zeilen', v_zeilen,
    'zeilen_gesamt', v_gesamt,
    'hinweise', to_jsonb(v_hinweise));
end $$;

revoke all on function api.query_metric(text[], text[], jsonb, text, boolean, integer, bigint) from public;
grant execute on function api.query_metric(text[], text[], jsonb, text, boolean, integer, bigint) to anon, authenticated, service_role;
```

Run: `pnpm dlx supabase@2.120.0 migration up --local`
Expected: `Applying migration 20261013120300_api_query_metric.sql...`

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/abfrage/query-metric.int.test.ts`
Expected: PASS (28 Tests).

Liefert eine Erwartung eine andere Zahl, zuerst den erwarteten Wert von Hand nachrechnen (siehe die Rechnungen unter Step 1), dann den Code korrigieren, nie die Erwartung anpassen. Eine Ausnahme ist eine nachweislich falsche Rechnung im Plan; dann im Bericht begründen.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013120300_api_query_metric.sql packages/ingest/src/abfrage/query-metric.int.test.ts
git commit -m "feat(api): query_metric mit Positivlisten, Anteilen, Pro-Kopf- und Vorjahreskennzahlen"
```

---

### Task 6: `api.search_entities`

**Files:**
- Create: `supabase/migrations/20261013120400_api_suche.sql`
- Test: `packages/ingest/src/abfrage/suche.int.test.ts`

**Interfaces:**
- Consumes: `semantic.normtext`, `semantic.stand`, `semantic.version_oder_aktuell`, `semantic.semantik_von`, `semantic.synonym` (Task 2 und 4); Testhilfe aus Task 4. Die Synonyme `Bundeswehr` (einzelplan 14, ab 2012), `Hartz IV` (funktion 251, 2012 bis 2022) und `Bürgergeld` (funktion 251, ab 2023) aus Task 1.
- Produces: `api.search_entities(p_q text, p_jahr integer default null, p_typ text default null, p_limit integer default 20, p_version bigint default null) returns jsonb` mit den Schlüsseln:
  - `version`, `semantik_version`
  - `jahr`: ohne `p_jahr` das jüngste Jahr bis zum laufenden Kalenderjahr, sonst das jüngste Jahr
  - `suchbegriff`
  - `treffer`: Liste von `{typ, konto, schluessel, bezeichnung, soll_eur, aehnlichkeit, treffer, filter}`
- Feldwerte der Treffer:
  - `treffer` ∈ {`schluessel`, `synonym`, `text`}
  - `filter` passt direkt als `p_filters` für `api.query_metric`, zum Beispiel `{"einzelplan_nr": "14", "konto": "ausgaben"}`
- Typen: `einzelplan, funktion, oberfunktion, hauptfunktion, kapitel, gruppierung, obergruppe, hauptgruppe, titel` (in dieser Rangfolge bei gleicher Ähnlichkeit).

- [ ] **Step 1: Failing tests schreiben**

`packages/ingest/src/abfrage/suche.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Sql } from '../db/client';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel, type TestTitel } from './testdaten';

const MRD = 1e9;

const TITEL: TestTitel[] = [
  { jahr: 2024, titelKey: '140153201', soll: 100 * MRD, einzelplanText: 'Bundesministerium der Verteidigung', kapitelText: 'Bundeswehr', titelText: 'Beschaffung von Flugzeugen', fkt: '032', funktionText: 'Deutsche Verteidigungsstreitkräfte' },
  { jahr: 2024, titelKey: '060168421', soll: 50 * MRD, einzelplanText: 'Bundesministerium des Innern', kapitelText: 'Bundespolizei', titelText: 'Zuschüsse an die Bundespolizei', fkt: '042', funktionText: 'Polizei' },
  { jahr: 2022, titelKey: '110168101', soll: 20 * MRD, einzelplanText: 'Bundesministerium für Arbeit und Soziales', titelText: 'Arbeitslosengeld II', fkt: '251', funktionText: 'Arbeitslosengeld II nach dem SGB II' },
  { jahr: 2024, titelKey: '110168101', soll: 26 * MRD, einzelplanText: 'Bundesministerium für Arbeit und Soziales', titelText: 'Bürgergeld', fkt: '251', funktionText: 'Arbeitslosengeld II nach dem SGB II' },
  { jahr: 2026, titelKey: '140153201', soll: 150 * MRD, einzelplanText: 'Bundesministerium der Verteidigung', titelText: 'Beschaffung von Flugzeugen', fkt: '032' },
];

type Treffer = { typ: string; konto: string; schluessel: string; bezeichnung: string; soll_eur: number; aehnlichkeit: number; treffer: string; filter: Record<string, string> };
type Suche = { version: number; semantik_version: number; jahr: number; suchbegriff: string; treffer: Treffer[] };

async function suche(tx: Sql, q: string, opt: { jahr?: number; typ?: string; limit?: number; version?: number } = {}): Promise<Suche> {
  const [z] = await tx`
    select api.search_entities(${q}, ${opt.jahr ?? null}::integer, ${opt.typ ?? null}::text, ${opt.limit ?? 20}::integer, ${opt.version ?? null}::bigint) as r`;
  return z!.r as Suche;
}

async function mitTestdaten(fn: (tx: Sql, version: number) => Promise<void>): Promise<void> {
  await imRollback(async (tx) => {
    await leereMart(tx);
    const version = await veroeffentlicheTitel(tx, TITEL);
    await fn(tx, version);
  });
}

describe('api.search_entities', () => {
  it('findet den Einzelplan über ein Synonym', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Bundeswehr', { jahr: 2024 });
      expect(r.jahr).toBe(2024);
      expect(r.treffer[0]).toEqual({
        typ: 'einzelplan', konto: 'ausgaben', schluessel: '14', bezeichnung: 'Bundesministerium der Verteidigung',
        soll_eur: 100 * MRD, aehnlichkeit: 1, treffer: 'synonym', filter: { einzelplan_nr: '14', konto: 'ausgaben' },
      });
    }));

  it('findet ein Synonym auch innerhalb einer Frage', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Was gibt der Bund für die Bundeswehr aus?', { jahr: 2024 });
      expect(r.treffer[0]).toMatchObject({ typ: 'einzelplan', schluessel: '14', treffer: 'synonym' });
    }));

  it('findet Titel über ähnliche Wörter', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Flugzeuge', { jahr: 2024 });
      expect(r.treffer).toContainEqual(expect.objectContaining({ typ: 'titel', schluessel: '140153201', treffer: 'text' }));
    }));

  it('findet ein Kapitel über seine Nummer', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, '1401', { jahr: 2024 });
      expect(r.treffer[0]).toMatchObject({ typ: 'kapitel', schluessel: '1401', treffer: 'schluessel', aehnlichkeit: 1 });
    }));

  it('beachtet den Gültigkeitszeitraum eines Synonyms', () =>
    mitTestdaten(async (tx) => {
      const frueher = await suche(tx, 'Hartz IV', { jahr: 2022 });
      expect(frueher.treffer).toContainEqual(expect.objectContaining({ typ: 'funktion', schluessel: '251', treffer: 'synonym' }));
      const spaeter = await suche(tx, 'Hartz IV', { jahr: 2024 });
      expect(spaeter.treffer.filter((t) => t.treffer === 'synonym')).toEqual([]);
    }));

  it('schränkt auf einen Typ ein', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Verteidigung', { jahr: 2024, typ: 'einzelplan' });
      expect(r.treffer.length).toBeGreaterThan(0);
      expect(r.treffer.every((t) => t.typ === 'einzelplan')).toBe(true);
      expect(r.treffer.map((t) => t.schluessel)).toContain('14');
    }));

  it('nimmt ohne Jahr das jüngste Jahr bis zum laufenden Kalenderjahr', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Flugzeuge');
      expect(r.jahr).toBe(Math.min(2026, new Date().getFullYear()));
    }));

  it('begrenzt die Treffer', () =>
    mitTestdaten(async (tx) => {
      const r = await suche(tx, 'Bundesministerium', { jahr: 2024, limit: 1 });
      expect(r.treffer).toHaveLength(1);
    }));

  it('Synonyme der alten Version gelten für die alte Version', () =>
    mitTestdaten(async (tx, v1) => {
      await tx`delete from core.semantik_synonyme where begriff = 'Bundeswehr'`;
      const v2 = await veroeffentlicheTitel(tx, TITEL);
      const alt = await suche(tx, 'Bundeswehr', { jahr: 2024, version: v1 });
      const neu = await suche(tx, 'Bundeswehr', { jahr: 2024, version: v2 });
      expect(alt.treffer[0]).toMatchObject({ typ: 'einzelplan', schluessel: '14', treffer: 'synonym' });
      expect(neu.treffer.filter((t) => t.treffer === 'synonym' && t.schluessel === '14')).toEqual([]);
      expect(neu.semantik_version).not.toBe(alt.semantik_version);
    }));

  it('lehnt zu kurze Suchbegriffe ab', () =>
    mitTestdaten(async (tx) => {
      await expect(suche(tx, ' x ')).rejects.toThrow(/zu kurz/);
    }));

  it('lehnt unbekannte Typen ab', () =>
    mitTestdaten(async (tx) => {
      await expect(suche(tx, 'Bundeswehr', { typ: 'ressort' })).rejects.toThrow(/Unbekannter Typ: ressort/);
    }));

  it('darf von anon ausgeführt werden', () =>
    mitTestdaten(async (tx) => {
      await tx`set local role anon`;
      const r = await suche(tx, 'Polizei', { jahr: 2024 });
      expect(r.treffer.length).toBeGreaterThan(0);
    }));
});
```

Jeder Fehlerfall steht in einem eigenen Test, weil eine Transaktion nach dem ersten Fehler abgebrochen ist.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/abfrage/suche.int.test.ts`
Expected: FAIL mit `function api.search_entities(unknown, integer, text, integer, bigint) does not exist`.

- [ ] **Step 3: Migration schreiben**

`supabase/migrations/20261013120400_api_suche.sql`:

```sql
-- Plan 4: Freitextsuche über Einzelpläne, Kapitel, Titel, Funktionen und Gruppierungen eines Jahres,
-- mit Synonymen der Semantik-Version und Trigramm-Ähnlichkeit (pg_trgm).
create function api.search_entities(
  p_q       text,
  p_jahr    integer default null,
  p_typ     text    default null,
  p_limit   integer default 20,
  p_version bigint  default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, extensions, pg_temp
as $$
declare
  c_typen constant text[] := array['einzelplan', 'funktion', 'oberfunktion', 'hauptfunktion', 'kapitel',
    'gruppierung', 'obergruppe', 'hauptgruppe', 'titel'];
  c_filter constant jsonb := '{"einzelplan": "einzelplan_nr", "kapitel": "kapitel_nr", "titel": "titel_key",
    "funktion": "fkt", "oberfunktion": "oberfunktion", "hauptfunktion": "hauptfunktion",
    "gruppierung": "gruppierung_nr", "obergruppe": "obergruppe", "hauptgruppe": "hauptgruppe"}';
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  v_sem bigint := semantic.semantik_von(v);
  v_q text := semantic.normtext(p_q);
  v_schluessel text := regexp_replace(coalesce(p_q, ''), '\s', '', 'g');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_jahr integer;
  v_treffer jsonb;
begin
  if length(v_q) < 2 then
    raise exception 'Suchbegriff zu kurz (mindestens zwei Zeichen)' using errcode = '22023';
  end if;
  if p_typ is not null and not p_typ = any(c_typen) then
    raise exception 'Unbekannter Typ: % (erlaubt: %)', p_typ, array_to_string(c_typen, ', ') using errcode = '22023';
  end if;

  select coalesce(p_jahr, max(s.jahr) filter (where s.jahr <= extract(year from current_date)::integer), max(s.jahr))
  into v_jahr
  from semantic.stand(v.version_id) s;

  with stand as (
    select * from semantic.stand(v.version_id) s where s.jahr = v_jahr
  ),
  entitaeten as (
    select 'einzelplan' as typ, s.konto, s.einzelplan_nr as schluessel, max(s.einzelplan_text) as bezeichnung, sum(s.soll_eur) as soll
      from stand s group by s.konto, s.einzelplan_nr
    union all
    select 'kapitel', s.konto, s.kapitel_nr, max(s.kapitel_text), sum(s.soll_eur) from stand s group by s.konto, s.kapitel_nr
    union all
    select 'titel', s.konto, s.titel_key, max(s.titel_text), sum(s.soll_eur) from stand s group by s.konto, s.titel_key
    union all
    select 'funktion', s.konto, s.fkt, max(s.funktion_text), sum(s.soll_eur) from stand s where s.fkt is not null group by s.konto, s.fkt
    union all
    select 'oberfunktion', s.konto, s.oberfunktion, max(s.oberfunktion_text), sum(s.soll_eur)
      from stand s where s.oberfunktion is not null group by s.konto, s.oberfunktion
    union all
    select 'hauptfunktion', s.konto, s.hauptfunktion, max(s.hauptfunktion_text), sum(s.soll_eur)
      from stand s where s.hauptfunktion is not null group by s.konto, s.hauptfunktion
    union all
    select 'gruppierung', s.konto, s.gruppierung_nr, max(s.gruppierung_text), sum(s.soll_eur)
      from stand s where s.gruppierung_nr is not null group by s.konto, s.gruppierung_nr
    union all
    select 'obergruppe', s.konto, s.obergruppe, max(s.obergruppe_text), sum(s.soll_eur)
      from stand s where s.obergruppe is not null group by s.konto, s.obergruppe
    union all
    select 'hauptgruppe', s.konto, s.hauptgruppe, max(s.hauptgruppe_text), sum(s.soll_eur)
      from stand s where s.hauptgruppe is not null group by s.konto, s.hauptgruppe
  ),
  normiert as (
    select e.*, semantic.normtext(e.bezeichnung) as n
    from entitaeten e
    where p_typ is null or e.typ = p_typ
  ),
  synonyme as (
    select sy.typ, sy.konto, sy.schluessel,
           max(case
                 when semantic.normtext(sy.begriff) = v_q then 1.0
                 when (' ' || v_q || ' ') like ('% ' || semantic.normtext(sy.begriff) || ' %') then 0.95
                 when similarity(semantic.normtext(sy.begriff), v_q) >= 0.5 then round((similarity(semantic.normtext(sy.begriff), v_q) * 0.9)::numeric, 3)
               end) as wert
    from semantic.synonym sy
    where sy.semantik_version_id = v_sem
      and v_jahr >= sy.jahr_von and (sy.jahr_bis is null or v_jahr <= sy.jahr_bis)
    group by sy.typ, sy.konto, sy.schluessel
  ),
  bewertet as (
    select x.*,
           greatest(coalesce(x.w_schluessel, 0), coalesce(x.w_synonym, 0), coalesce(x.w_text, 0)) as aehnlichkeit,
           case when x.w_schluessel is not null then 'schluessel'
                when x.w_synonym is not null and x.w_synonym >= coalesce(x.w_text, 0) then 'synonym'
                else 'text' end as treffer
    from (
      select n.*,
             case when n.schluessel = v_schluessel then 1.0 end as w_schluessel,
             sy.wert as w_synonym,
             greatest(similarity(v_q, n.n), word_similarity(v_q, n.n),
                      case when n.n <> '' and position(v_q in n.n) > 0 then 0.8 else 0 end)::numeric as w_text
      from normiert n
      left join synonyme sy on sy.typ = n.typ and sy.konto = n.konto and sy.schluessel = n.schluessel
    ) x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'typ', r.typ, 'konto', r.konto, 'schluessel', r.schluessel, 'bezeichnung', r.bezeichnung,
           'soll_eur', r.soll, 'aehnlichkeit', round(r.aehnlichkeit, 3), 'treffer', r.treffer,
           'filter', jsonb_build_object(c_filter ->> r.typ, r.schluessel, 'konto', r.konto)) order by r.rang), '[]'::jsonb)
  into v_treffer
  from (
    select b.*, row_number() over (
             order by b.aehnlichkeit desc, array_position(c_typen, b.typ), abs(b.soll) desc nulls last, b.schluessel) as rang
    from bewertet b
    where b.aehnlichkeit >= 0.35
    order by rang
    limit v_limit
  ) r;

  return jsonb_build_object(
    'version', v.version_id,
    'semantik_version', v_sem,
    'jahr', v_jahr,
    'suchbegriff', p_q,
    'treffer', v_treffer);
end $$;

revoke all on function api.search_entities(text, integer, text, integer, bigint) from public;
grant execute on function api.search_entities(text, integer, text, integer, bigint) to anon, authenticated, service_role;
```

Run: `pnpm dlx supabase@2.120.0 migration up --local`
Expected: `Applying migration 20261013120400_api_suche.sql...`

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/abfrage/suche.int.test.ts`
Expected: PASS.

Scheitert „findet Titel über ähnliche Wörter“ an der Schwelle 0,35, `select extensions.word_similarity('flugzeuge', 'beschaffung von flugzeugen')` ausgeben und im Bericht nennen. Die Schwelle nur senken, wenn der Wert knapp darunter liegt (mindestens 0,3), sonst stoppen und berichten.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013120400_api_suche.sql packages/ingest/src/abfrage/suche.int.test.ts
git commit -m "feat(api): search_entities mit Synonymen und Trigramm-Suche"
```

---

### Task 7: `api.get_titel_detail` mit Lineage und Fundstelle

**Files:**
- Create: `supabase/migrations/20261013120500_api_titel_detail.sql`
- Test: `packages/ingest/src/abfrage/titel-detail.int.test.ts`

**Interfaces:**
- Consumes: `semantic.normtext`, `semantic.stand`, `semantic.version_oder_aktuell`, Index `fct_titel_jahr_hist_titel_nr` (Task 4); Testhilfe aus Task 4.
- Produces:
  - `semantic.fundstelle(p_jahr integer, p_einzelplan_nr text, p_seite integer) returns jsonb`: `{url, seite, dokument}` oder `null` ohne Seite. Die URL hat das Muster `https://www.bundeshaushalt.de/static/daten/{jahr}/soll/epl{nn}.pdf#page={seite}`; Stichprobe 2024: identisch mit dem PDF-Link der internalapi.
  - `semantic.titel_kette(p_version bigint, p_konto text, p_titel_key text, p_jahr integer) returns table (jahr integer, titel_key text, verknuepfung text)`:
    - `verknuepfung` ∈ {`ausgangspunkt`, `gleich`, `nachgefuehrt`}.
    - Sie verbindet ein Nachbarjahr mit anderem Schlüssel nur, wenn Titelnummer und normierter Text gleich sind.
    - Dort darf genau ein Kandidat fehlen, dessen Schlüssel im Ausgangsjahr fehlt, und umgekehrt.
  - `api.get_titel_detail(p_titel_key text, p_jahr integer default null, p_version bigint default null) returns jsonb` mit den Schlüsseln:
    - `version`
    - `titel`: alle Spalten der Historienzeile ohne `zeilen_hash` und `gueltig_*`
    - `fundstelle`
    - `zeitreihe`: Liste je Jahr mit `jahr, titel_key, verknuepfung, einzelplan_nr, kapitel_nr, titel_text, soll_eur, soll_quelle, soll_xml_eur, ist_eur, ist_verfuegbar, abweichung_eur, ist_quote, haushaltsstand, fundstelle`
    - `hinweise`

- [ ] **Step 1: Failing tests schreiben**

`packages/ingest/src/abfrage/titel-detail.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Sql } from '../db/client';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel, type TestTitel } from './testdaten';

const MRD = 1e9;
const SPORT = 'Zuschüsse für den Sport';
const BEITRAEGE = 'Beiträge an internationale Organisationen';

const TITEL: TestTitel[] = [
  // Ressortwechsel: Sport 2024 im Einzelplan 06, ab 2025 im Einzelplan 04
  { jahr: 2024, titelKey: '060168421', soll: 300_000_000, ist: 290_000_000, titelText: SPORT, seite: 19 },
  { jahr: 2025, titelKey: '041668421', soll: 310_000_000, ist: 300_000_000, titelText: SPORT, seite: 7 },
  { jahr: 2026, titelKey: '041668421', soll: 330_000_000, titelText: SPORT },
  // Mehrdeutig: zwei Kandidaten mit gleicher Nummer und gleichem Text
  { jahr: 2024, titelKey: '090153201', soll: 1 * MRD, titelText: BEITRAEGE },
  { jahr: 2024, titelKey: '090253201', soll: 2 * MRD, titelText: BEITRAEGE },
  { jahr: 2025, titelKey: '091053201', soll: 3 * MRD, titelText: BEITRAEGE },
  // Anderer Text: keine Verknüpfung
  { jahr: 2024, titelKey: '300168101', soll: 1 * MRD, titelText: 'Alte Bezeichnung' },
  { jahr: 2025, titelKey: '300268101', soll: 1 * MRD, titelText: 'Neue Bezeichnung' },
];

type Zeile = { jahr: number; titel_key: string; verknuepfung: string; soll_eur: number; ist_eur: number | null; fundstelle: Record<string, unknown> | null };
type Detail = { version: number; titel: Record<string, unknown>; fundstelle: Record<string, unknown> | null; zeitreihe: Zeile[]; hinweise: string[] };

async function detail(tx: Sql, titelKey: string, jahr: number | null = null): Promise<Detail> {
  const [z] = await tx`select api.get_titel_detail(${titelKey}, ${jahr}::integer, null::bigint) as r`;
  return z!.r as Detail;
}

async function mitTestdaten(fn: (tx: Sql) => Promise<void>): Promise<void> {
  await imRollback(async (tx) => {
    await leereMart(tx);
    await veroeffentlicheTitel(tx, TITEL);
    await fn(tx);
  });
}

describe('api.get_titel_detail', () => {
  it('führt die Zeitreihe über einen Ressortwechsel zurück', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '041668421');
      expect(r.titel.jahr).toBe(2026);
      expect(r.zeitreihe.map((z) => [z.jahr, z.titel_key, z.verknuepfung])).toEqual([
        [2024, '060168421', 'nachgefuehrt'],
        [2025, '041668421', 'gleich'],
        [2026, '041668421', 'ausgangspunkt'],
      ]);
      expect(r.zeitreihe.map((z) => z.ist_eur)).toEqual([290_000_000, 300_000_000, null]);
      expect(r.hinweise.some((h) => h.includes('Titelnummer und Bezeichnung'))).toBe(true);
    }));

  it('führt die Zeitreihe auch vorwärts', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '060168421', 2024);
      expect(r.zeitreihe.map((z) => [z.jahr, z.titel_key, z.verknuepfung])).toEqual([
        [2024, '060168421', 'ausgangspunkt'],
        [2025, '041668421', 'nachgefuehrt'],
        [2026, '041668421', 'gleich'],
      ]);
    }));

  it('verknüpft nicht bei mehreren Kandidaten', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '091053201');
      expect(r.zeitreihe.map((z) => z.jahr)).toEqual([2025]);
    }));

  it('verknüpft nicht bei anderem Text', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '300268101');
      expect(r.zeitreihe.map((z) => z.jahr)).toEqual([2025]);
    }));

  it('nennt die Fundstelle im Haushaltsplan', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '060168421', 2024);
      expect(r.fundstelle).toEqual({
        url: 'https://www.bundeshaushalt.de/static/daten/2024/soll/epl06.pdf#page=19',
        seite: 19,
        dokument: 'Haushaltsplan 2024, Einzelplan 06',
      });
      expect(r.zeitreihe.find((z) => z.jahr === 2026)!.fundstelle).toBeNull();
      expect(r.titel).not.toHaveProperty('zeilen_hash');
      expect(r.titel).not.toHaveProperty('gueltig_ab_version');
    }));

  it('lehnt ungültige und unbekannte Schlüssel ab', () =>
    mitTestdaten(async (tx) => {
      await expect(detail(tx, '0601 68421')).rejects.toThrow(/neunstellig/);
    }));

  it('meldet einen unbekannten Titel', () =>
    mitTestdaten(async (tx) => {
      await expect(detail(tx, '999999999')).rejects.toThrow(/nicht gefunden/);
    }));

  it('darf von anon ausgeführt werden', () =>
    mitTestdaten(async (tx) => {
      await tx`set local role anon`;
      const r = await detail(tx, '041668421');
      expect(r.zeitreihe).toHaveLength(3);
    }));
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/abfrage/titel-detail.int.test.ts`
Expected: FAIL mit `function api.get_titel_detail(unknown, integer, bigint) does not exist`.

- [ ] **Step 3: Migration schreiben**

`supabase/migrations/20261013120500_api_titel_detail.sql`:

```sql
-- Plan 4: Titeldetail mit Zeitreihe über Ressortwechsel (Roadmap E10, zur Abfragezeit statt als Tabelle) und Fundstelle.

-- Seite im PDF des Einzelplans; die Seitenzahl der XML entspricht dem PDF-Link der internalapi (Stichprobe 2024).
create function semantic.fundstelle(p_jahr integer, p_einzelplan_nr text, p_seite integer)
returns jsonb
language sql
immutable
as $$
  select case when p_seite is not null and p_einzelplan_nr ~ '^[0-9]{2}$' then jsonb_build_object(
    'url', format('https://www.bundeshaushalt.de/static/daten/%s/soll/epl%s.pdf#page=%s', p_jahr, p_einzelplan_nr, p_seite),
    'seite', p_seite,
    'dokument', format('Haushaltsplan %s, Einzelplan %s', p_jahr, p_einzelplan_nr)) end
$$;

-- Zeitreihe eines Titels: gleicher Schlüssel im Nachbarjahr, sonst genau ein Kandidat mit gleicher Titelnummer
-- und gleichem normierten Text, dessen Schlüssel im Ausgangsjahr fehlt (und umgekehrt). Sonst endet die Kette.
create function semantic.titel_kette(p_version bigint, p_konto text, p_titel_key text, p_jahr integer)
returns table (jahr integer, titel_key text, verknuepfung text)
language plpgsql
stable
as $$
#variable_conflict use_column
declare
  v_nr       text;
  v_start    text;
  v_text     text;
  v_key      text;
  v_jahr     integer;
  v_richtung integer;
  v_naechst  text;
  v_kand     text[];
  v_rueck    integer;
begin
  select h.titel_nr, semantic.normtext(h.titel_text) into v_nr, v_start
  from semantic.stand(p_version) h
  where h.konto = p_konto and h.titel_key = p_titel_key and h.jahr = p_jahr;
  if v_nr is null then return; end if;

  jahr := p_jahr; titel_key := p_titel_key; verknuepfung := 'ausgangspunkt';
  return next;

  foreach v_richtung in array array[-1, 1] loop
    v_key := p_titel_key;
    v_jahr := p_jahr;
    v_text := v_start;
    loop
      select semantic.normtext(h.titel_text) into v_naechst
      from semantic.stand(p_version) h
      where h.konto = p_konto and h.jahr = v_jahr + v_richtung and h.titel_key = v_key;
      if found then
        v_jahr := v_jahr + v_richtung;
        v_text := v_naechst;
        jahr := v_jahr; titel_key := v_key; verknuepfung := 'gleich';
        return next;
        continue;
      end if;

      select array_agg(n.titel_key) into v_kand
      from semantic.stand(p_version) n
      where n.konto = p_konto and n.jahr = v_jahr + v_richtung and n.titel_nr = v_nr
        and semantic.normtext(n.titel_text) = v_text
        and not exists (select 1 from semantic.stand(p_version) a
                        where a.konto = p_konto and a.jahr = v_jahr and a.titel_key = n.titel_key);
      exit when coalesce(cardinality(v_kand), 0) <> 1;

      select count(*) into v_rueck
      from semantic.stand(p_version) a
      where a.konto = p_konto and a.jahr = v_jahr and a.titel_nr = v_nr
        and semantic.normtext(a.titel_text) = v_text
        and not exists (select 1 from semantic.stand(p_version) n
                        where n.konto = p_konto and n.jahr = v_jahr + v_richtung and n.titel_key = a.titel_key);
      exit when v_rueck <> 1;

      v_jahr := v_jahr + v_richtung;
      v_key := v_kand[1];
      jahr := v_jahr; titel_key := v_key; verknuepfung := 'nachgefuehrt';
      return next;
    end loop;
  end loop;
end $$;

create function api.get_titel_detail(p_titel_key text, p_jahr integer default null, p_version bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v ops.dataset_version := semantic.version_oder_aktuell(p_version);
  t mart.fct_titel_jahr_hist;
  v_zeitreihe jsonb;
  v_nachgefuehrt boolean;
  v_hinweise text[] := array['Rechtlich verbindlich ist ausschließlich der veröffentlichte Haushaltsplan. Die Fundstelle verweist auf den ursprünglichen Haushaltsplan ohne Nachträge.'];
begin
  if p_titel_key is null or p_titel_key !~ '^[0-9]{9}$' then
    raise exception 'Titelschlüssel muss neunstellig sein (Kapitel und Titelnummer ohne Leerzeichen)' using errcode = '22023';
  end if;

  select * into t
  from semantic.stand(v.version_id) h
  where h.titel_key = p_titel_key and (p_jahr is null or h.jahr = p_jahr)
  order by h.jahr desc, h.konto
  limit 1;
  if not found then
    raise exception 'Titel % im Jahr % nicht gefunden', p_titel_key, coalesce(p_jahr::text, 'beliebig') using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'jahr', h.jahr, 'titel_key', h.titel_key, 'verknuepfung', k.verknuepfung,
           'einzelplan_nr', h.einzelplan_nr, 'kapitel_nr', h.kapitel_nr, 'titel_text', h.titel_text,
           'soll_eur', h.soll_eur, 'soll_quelle', h.soll_quelle, 'soll_xml_eur', h.soll_xml_eur,
           'ist_eur', h.ist_eur, 'ist_verfuegbar', h.ist_verfuegbar, 'abweichung_eur', h.abweichung_eur,
           'ist_quote', h.ist_quote, 'haushaltsstand', h.haushaltsstand,
           'fundstelle', semantic.fundstelle(h.jahr, h.einzelplan_nr, h.seite)) order by h.jahr), '[]'::jsonb),
         bool_or(k.verknuepfung = 'nachgefuehrt')
  into v_zeitreihe, v_nachgefuehrt
  from semantic.titel_kette(v.version_id, t.konto, t.titel_key, t.jahr) k
  join semantic.stand(v.version_id) h on h.jahr = k.jahr and h.konto = t.konto and h.titel_key = k.titel_key;

  if v_nachgefuehrt then
    v_hinweise := array_append(v_hinweise, 'Die Zeitreihe verbindet Jahre mit anderem Titelschlüssel, wenn Titelnummer und Bezeichnung übereinstimmen und die Zuordnung eindeutig ist, zum Beispiel nach einem Ressortwechsel.');
  end if;

  return jsonb_build_object(
    'version', v.version_id,
    'titel', to_jsonb(t) - 'zeilen_hash' - 'gueltig_ab_version' - 'gueltig_bis_version',
    'fundstelle', semantic.fundstelle(t.jahr, t.einzelplan_nr, t.seite),
    'zeitreihe', v_zeitreihe,
    'hinweise', to_jsonb(v_hinweise));
end $$;

revoke all on function api.get_titel_detail(text, integer, bigint) from public;
grant execute on function api.get_titel_detail(text, integer, bigint) to anon, authenticated, service_role;
revoke all on function semantic.fundstelle(integer, text, integer), semantic.titel_kette(bigint, text, text, integer) from public;
```

Run: `pnpm dlx supabase@2.120.0 migration up --local`
Expected: `Applying migration 20261013120500_api_titel_detail.sql...`

- [ ] **Step 4: Tests laufen lassen**

Run: `pnpm --filter @hb/ingest exec vitest run --project integration src/abfrage/titel-detail.int.test.ts`
Expected: PASS (8 Tests).

Run: `pnpm typecheck && pnpm test && pnpm test:int`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013120500_api_titel_detail.sql packages/ingest/src/abfrage/titel-detail.int.test.ts
git commit -m "feat(api): get_titel_detail mit Lineage über Ressortwechsel und Fundstelle"
```

---

### Task 8: Abnahme mit Echtdaten, Befund und Dokumentation

**Files:**
- Create: `docs/befunde/2026-10-semantik-api.md`
- Modify: `docs/KONZEPT.md` (Abschnitt 10), `docs/superpowers/plans/2026-10-08-00-roadmap.md`, `docs/betrieb.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: alle Funktionen aus Task 4 bis 7, lokale Datenbank mit den Echtdaten aus Plan 3.

- [ ] **Step 1: Lokale Datenversion mit Echtdaten veröffentlichen**

Run:

```bash
pnpm dbt seed && pnpm dbt run && pnpm dbt test
pnpm --filter @hb/ingest veroeffentliche --ohne-aufraeumen | tee data/raw/p4-veroeffentlichung.md
```

Expected: Ampel grün oder gelb, `Version N veröffentlicht`. Bei roter Ampel stoppen und berichten.

- [ ] **Step 2: Kontrollwerte prüfen**

Ein Skript im Scratchpad oder direkt über `docker exec … psql` ausführen und die Ausgabe in `data/raw/p4-abnahme.md` speichern:

```sql
\timing on
select api.query_metric('{ist}', '{}', '{"konto": "ausgaben", "jahr": 2024}') -> 'zeilen';
select api.query_metric('{soll}', '{jahr}', '{"konto": "ausgaben", "jahr": [2024, 2026, 2027]}') -> 'zeilen';
select api.query_metric('{soll,soll_anteil,soll_pro_kopf}', '{einzelplan_nr}', '{"konto": "ausgaben", "jahr": 2026}', 'soll', true, 3);
select api.query_metric('{soll,ist,abweichung,ist_quote}', '{titel_key}', '{"konto": "ausgaben", "jahr": 2024}', 'abweichung', true, 5);
select api.query_metric('{soll,soll_vj_abs,soll_vj_rel}', '{jahr}', '{"konto": "ausgaben", "einzelplan_nr": "14"}');
select api.search_entities('Bundeswehr') -> 'treffer' -> 0;
select api.search_entities('BAföG') -> 'treffer' -> 0;
select api.search_entities('Bürgergeld') -> 'treffer' -> 0;
select api.get_titel_detail('041668421') -> 'zeitreihe';
select api.get_dataset_status() - 'jahre';
```

Erwartet:

| Abfrage | Erwartung |
| --- | --- |
| Ist 2024 Ausgaben | `474753727609.58` (Kontrollsumme, Datenvertrag) |
| Soll 2024, 2026, 2027 | `476807656000.00`, `524540138000.00`, `555435744000.00`; Hinweis „Regierungsentwurf“ |
| Größte Einzelpläne 2026 | `11` mit `197341040000.00` zuerst, dann `14` mit `82687312000.00`, dann `60` |
| Bundeswehr, BAföG, Bürgergeld | Einzelplan `14`, Funktion `142`, Funktion `251`, jeweils `treffer = synonym` |
| Titel 041668421 | Zeitreihe enthält Jahre vor 2025 aus Einzelplan 06, soweit Nummer und Text eindeutig passen; sonst im Befund erklären |
| Laufzeit | jede Abfrage unter 1 s (das Rollenlimit von `anon` ist 3 s) |

Weicht ein Kontrollwert ab: stoppen und berichten, nichts anpassen.

- [ ] **Step 3: Befund schreiben**

`docs/befunde/2026-10-semantik-api.md` mit diesen Abschnitten. Die Werte stammen aus den Dateien in `data/raw/p4-*.md`; nichts schätzen, was gemessen wurde.

```markdown
# Befund: Semantik und Abfrageschicht (Plan 4, lokal)

## Kurzfassung
(Version, Ampel, Semantik-Version, Anzahl Synonyme, Glossar, Kennzahlen; ob alle Kontrollwerte getroffen wurden)

## Kontrollwerte
(Tabelle aus Step 2 mit Erwartung, Ergebnis und Laufzeit)

## Suche und Lineage
(Treffer für Bundeswehr, BAföG, Bürgergeld; Zeitreihe von 041668421 und ob der Ressortwechsel erkannt wurde; auffällige Fehltreffer)

## Speicher
(Tabelle vorher/nachher aus Task 3; Einsparung durch Views in MB)

## Anpassungen an Synonymen
(jede in Task 1 Step 7 angepasste oder gestrichene Zeile mit Grund; „keine“, wenn keine)

## Folgerungen für Plan 5
```

- [ ] **Step 4: Konzept Abschnitt 10 aktualisieren**

In `docs/KONZEPT.md` Abschnitt 10:
- **Kennzahlen-Tabelle:** durch die 17 Kennzahlen aus `dbt/seeds/semantik_kennzahlen.csv` ersetzen (Spalten ID, Name, Definition, Formel, Einheit). Darunter ein Satz: CAGR entfällt, weil Haushaltsstände und Ressortwechsel die Rate über viele Jahre verzerren und das Sprachmodell nie selbst rechnet. Für Entwicklungen gibt es die Zeitreihe und die Vorjahreskennzahlen.
- **Dimensionen:** `soll_quelle` ergänzen; Filter `jahr_von` und `jahr_bis` nennen.
- **Codeblock `api.query_metric`:** durch die tatsächliche Signatur ersetzen: `p_version bigint` statt `p_dataset_version_id uuid`, `p_absteigend`, Rückgabe-Schlüssel. Dazu ein Absatz zu den Regeln: Konto festlegen, `braucht_jahr`, Bezeichnung aus dem jüngsten Jahr, Hinweise, Limit 500. Ein weiterer Absatz zum Zeitlimit über die Rolle statt `set statement_timeout`.
- **Tabelle „Weitere RPC-Funktionen“:** tatsächliche Signaturen von `search_entities`, `get_titel_detail`, `get_dataset_status`, `get_glossar` und `list_kennzahlen`; `get_receipt` bleibt mit Verweis auf Plan 7.
- **Absatz „Synonyme und Glossar“:** Pflege über die Seeds `dbt/seeds/semantik_*.csv` per Pull Request; jede Veröffentlichung bindet den Stand als Semantik-Version (E3, E19); DQ-19 prüft die Synonyme gegen die Daten.

- [ ] **Step 5: Roadmap ergänzen**

In `docs/superpowers/plans/2026-10-08-00-roadmap.md` nach „Übertrag aus Plan 3“ einen Abschnitt „Entscheidungen für Plan 4 (10.10.2026)“ mit:

```markdown
### E18 Titel-Lineage zur Abfragezeit
Statt einer Tabelle `core.titel_lineage` (E10) verknüpft `semantic.titel_kette` die Jahre beim Abruf eines Titels. Gleicher Schlüssel im Nachbarjahr gilt als derselbe Titel. Ein anderer Schlüssel wird nur verbunden, wenn Titelnummer und Bezeichnung gleich sind und die Zuordnung in beiden Richtungen eindeutig ist. Eine Tabelle müsste je Datenversion historisiert werden und wäre bei wöchentlichen Versionen zu groß für Supabase Free.

### E19 Semantik aus Seeds mit Schnappschuss je Veröffentlichung
Kennzahlen, Synonyme, Glossar und Einwohnerzahlen liegen als Seeds `core.semantik_*` im Repository. `ops.veroeffentliche_version` legt sie als `semantic.semantik_version` ab (neu nur bei geändertem Inhalt) und verknüpft die Datenversion damit (E3). Datenversionen vor Plan 4 haben keine Semantik; die Abfragefunktionen lehnen sie mit Hinweis ab.

### E20 pipeline_version nur für Parser und Crawler
`pipeline_version` steuert das Neuladen der Rohdaten und steigt nur bei Änderungen an Parser oder Crawler. Änderungen an dbt-Modellen erhöhen die Version in `dbt/dbt_project.yml`.
```

Danach einen Abschnitt „Übertrag aus Plan 4“ mit den Folgerungen aus dem Befund. Mindestens diese Punkte aufnehmen:
- Produktion: Data API für Schema `api` freischalten (Task 9).
- Offene Punkte aus „Übertrag aus Plan 3“, die Plan 4 nicht erledigt hat: `xml_pfad` kürzen, DQ-Lauf in eigener Transaktion, Rohantworten quarantänierter Läufe archivieren.

- [ ] **Step 6: Betrieb und CLAUDE.md**

In `docs/betrieb.md` einen Abschnitt „Abfrageschicht (Data API)“ ergänzen:
1. **Freischalten (einmalig):** Supabase → Project Settings → Data API → „Exposed schemas“ um `api` ergänzen und speichern.
2. **Prüfen** mit dem Publishable Key (Supabase → Project Settings → API Keys). Steht `api` nicht an erster Stelle der Exposed schemas, braucht es den Header `Content-Profile: api`:

   ```bash
   curl -s -X POST "https://<projekt>.supabase.co/rest/v1/rpc/get_dataset_status" \
     -H "apikey: <publishable key>" -H "Content-Type: application/json" -H "Content-Profile: api" -d '{}'
   ```

3. **Synonyme oder Glossar pflegen:** CSV in `dbt/seeds/` per Pull Request ändern. Der nächste Lauf von `ingest` erzeugt eine neue Semantik-Version. DQ-19 gelb heißt: ein Synonym trifft in einem Jahr nichts; Zeitraum anpassen.
4. **Tabelle „Wenn ein Lauf rot ist“:** Zeile für „Semantik-Seeds fehlen in core“ (Ursache: `dbt seed` nicht gelaufen; Vorgehen: Schritt dbt im Bericht prüfen).

In `CLAUDE.md`:
- **Stack:** „Stand Plan 4“; `pg_trgm` und `unaccent` im Schema `extensions`.
- **Befehle:** bei `pnpm test:int` ergänzen: „braucht einmal `pnpm dbt seed` (Semantik-Seeds)“.
- **Konventionen:** Funktionen im Schema `api` sind `security definer` mit festem `search_path`, lesen nur `semantic.stand(version)`, haben keine Überladungen und werfen Fehler mit `errcode 22023`. Hilfsfunktionen liegen in `semantic`.
- **Arbeitsweise:** den Satz zur `pipeline_version` ersetzen durch „Bei jeder Änderung an Parser oder Crawler die Version in packages/ingest/package.json erhöhen (pipeline_version); bei Änderungen an dbt-Modellen die Version in dbt/dbt_project.yml (Roadmap E20).“

- [ ] **Step 7: Alles prüfen und committen**

Run: `pnpm typecheck && pnpm test && pnpm test:int`
Expected: PASS.

```bash
git add docs/befunde/2026-10-semantik-api.md docs/KONZEPT.md docs/superpowers/plans/2026-10-08-00-roadmap.md docs/betrieb.md CLAUDE.md
git commit -m "docs: Befund Plan 4, Konzept Abschnitt 10, Roadmap E18 bis E20, Betrieb der Data API"
```

---

### Task 9: Inbetriebnahme in der Produktion (nach dem Merge, mit Alexander)

Diese Task führt der Controller erst nach dem Merge des Pull Requests aus. Push, Merge und Workflow-Start brauchen jeweils Alexanders ausdrückliches Ja.

- [ ] **Step 1:** Pull Request mergen (nach Alexanders „merge“).
- [ ] **Step 2:** Workflow `ingest` manuell starten (Jahre `alle`, ohne `neu_laden`). Die Migrationen laufen, die Quellen sind unverändert, `dbt seed` legt die Semantik-Seeds an, und die Veröffentlichung erzeugt eine neue Version mit Semantik-Version.
  - **Erwartet:** Ampel gelb, DQ-19 bestanden, Bericht mit `Version N veröffentlicht`.
- [ ] **Step 3:** Alexander schaltet in Supabase das Schema `api` frei (Project Settings → Data API → Exposed schemas).
- [ ] **Step 4:** Prüfung mit dem Publishable Key wie in `docs/betrieb.md`. Alexander führt die Befehle aus oder gibt den Publishable Key frei; er ist öffentlich, aber nur er entscheidet:
  - `get_dataset_status` liefert die neue Version mit `semantik_version`.
  - `query_metric` mit `{"p_metrics": ["soll"], "p_filters": {"konto": "ausgaben", "jahr": 2020}}` liefert rund 508,5 Mrd. € (API-Soll inklusive Nachträgen, E14).
  - Ein Aufruf von `/rest/v1/fct_titel_jahr_hist` mit `Accept-Profile: mart` scheitert mit einer Fehlermeldung.
- [ ] **Step 5:** Ergebnis als Nachtrag in `docs/befunde/2026-10-semantik-api.md`, Datenbankgröße aus dem Dashboard eintragen, Memory `haushaltsblick-stand` aktualisieren.
