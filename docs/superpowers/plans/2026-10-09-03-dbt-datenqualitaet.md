# Plan 3: dbt, Datenqualität und veröffentlichte Datenversionen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus den Rohdaten entsteht mit dbt ein bereinigtes, geprüftes Datenmodell (`core`, `mart`). 16 Qualitätsprüfungen ergeben eine Ampel, und nur grüne oder gelbe Stände werden als nummerierte, jederzeit wiederholbare Datenversion veröffentlicht.

**Architecture:** Der Ingest lädt zusätzlich den Soll der internalapi für alle Jahre (maßgeblicher Stand inklusive Nachträgen, E14) und die Bezeichnungen der Funktionen und Gruppierungen je Jahr (E15). dbt baut daraus:
- **Staging-Views** mit Auswahl des maßgeblichen Laufs und Textbereinigung,
- **Core-Tabellen**: Dimensionen, Haushaltsstand, Betragsfakten,
- **Mart-Tabellen**: `fct_titel_jahr` mit Soll, Ist, XML-Soll und allen Bezeichnungen sowie Aggregate.

Die DQ-Prüfungen sind dbt-Tests mit `meta.dq_id`. Ein TypeScript-Kommando liest die dbt-Ergebnisse, bildet die Ampel, speichert sie und veröffentlicht über eine SQL-Funktion eine neue Version in `mart.fct_titel_jahr_hist` (E16). Danach räumt es die Rohdaten auf (E17).

**Tech Stack:** wie Plan 1 und 2, dazu dbt-core 1.12.5 und dbt-postgres 1.11.0 (Python 3.13, lokal über `uv`), GitHub Actions mit `actions/setup-python`.

**Spec:** `docs/KONZEPT.md` (Abschnitte 7, 9, 10) zusammen mit `docs/superpowers/plans/2026-10-08-00-roadmap.md` (E2, E3, E10, E12, E14 bis E17 und „Übertrag aus Plan 2“ gelten vor dem Konzept).

## Global Constraints

- Alles aus Plan 1 und 2 gilt weiter (Versionen, TypeScript-Einstellungen, Drossel, User-Agent ohne E-Mail, nie still verwerfen, Anlagen nie im Gesamthaushalt, Migrationen nur additiv, nie `db:reset`).
- dbt: `dbt-core==1.12.5`, `dbt-postgres==1.11.0`, Python 3.13. Keine dbt-Pakete aus dem Netz (kein `dbt deps`).
- dbt schreibt nur in die Schemas `core` und `mart`. `mart.fct_titel_jahr_hist` gehört nicht dbt, sondern der Migration und der Veröffentlichungsfunktion.
- Maßgeblicher Lauf: der letzte erfolgreiche Netzlauf je Schlüssel (`ops.load_run.status = 'succeeded'`, `params->>'datei' is null`), sortiert nach `started_at desc`. Soll-XML: Schlüssel ist das Jahr. API: Jahr, Konto, Quote. Systematik: Jahr, Konto, Sicht.
- `soll_eur` = API-Soll, wenn für Jahr und Konto geladen (fehlender Titel = 0), sonst XML-Soll. `ist_eur` = API-Ist, wenn für Jahr und Konto geladen (fehlender Titel = 0), sonst `null`, niemals 0 für nicht verfügbare Jahre.
- Beträge `numeric(18,2)`. Vergleiche von Summen sind centgenau, ohne Toleranz.
- Ampel: rot, wenn mindestens eine Prüfung mit Schwere `error` fehlschlägt oder nicht ausgeführt wurde; gelb, wenn nur Warnungen; sonst grün. Rot wird nie veröffentlicht.
- `pipeline_version` in diesem Plan: `0.3.0` (Schema-Erweiterung der API).

## Review Focus

1. **Zwei Läufe für dasselbe Jahr**, darunter ein Testlauf aus lokaler Datei oder ein quarantänierter Lauf. Erwartet: Staging nimmt genau den letzten erfolgreichen Netzlauf. Tests: Task 6.
2. **Jahr ohne API-Daten** (nur XML) oder laufendes Jahr ohne Ist. Erwartet: `soll_quelle = 'xml'`, `ist_eur = null`, `ist_verfuegbar = false`, keine Nullen statt „nicht verfügbar“. Test: Task 8.
3. **Bezeichnung fehlt in einem Jahr.** Erwartet: Bezeichnung des nächstgelegenen Jahres mit Herkunftsjahr, keine Lücke im Mart. Test: Task 7.
4. **Fehlerhafte Transformation** (Summe im Mart weicht von der API-Wurzel ab). Erwartet: DQ-16 rot, keine Veröffentlichung. Tests: Task 9 und Task 10.
5. **Veröffentlichung zweimal hintereinander mit Änderungen.** Erwartet: geänderte Zeilen werden geschlossen und neu eingefügt, unveränderte bleiben offen, und der frühere Stand ist exakt abfragbar. Test: Task 10.

## Dateistruktur

```text
packages/ingest/src/api/schema.ts                 # erweitert: unit function/group
packages/ingest/src/api/crawler.ts                # exportiert pruefeKonsistenz, pruefeElternwert, holeGeprueft
packages/ingest/src/api/systematik.ts             # Crawler Funktionen/Gruppierungen
packages/ingest/src/api/test-systematik.ts        # Testhilfe baueSystematikBaum
packages/ingest/fixtures/api/funktion_*.json, gruppierung_*.json
packages/ingest/src/db/lade-systematik.ts
packages/ingest/src/systematik-ingest.ts, cli-systematik.ts, bin-systematik.ts
packages/ingest/src/veroeffentlichung/dq.ts       # dbt-Ergebnisse lesen, Ampel bilden
packages/ingest/src/db/veroeffentlichung.ts       # DQ-Lauf speichern, Version veröffentlichen, aufräumen
packages/ingest/src/cli-veroeffentlichung.ts, bin-veroeffentlichung.ts
supabase/migrations/20261010120000_systematik_dq_versionen.sql
dbt/requirements.txt, dbt/dbt_project.yml, dbt/profiles.yml
dbt/macros/generate_schema_name.sql, dbt/macros/bereinige_text.sql
dbt/models/staging/*.sql, quellen.yml, staging.yml
dbt/models/core/*.sql, core.yml
dbt/models/mart/*.sql, mart.yml
dbt/seeds/kontrollsummen.csv, seeds.yml
dbt/tests/dq01_*.sql … dq16_*.sql
scripts/dbt.py                                    # startet dbt mit Zugangsdaten aus DATABASE_URL
docs/befunde/2026-10-dbt-dq.md
```

---

### Task 1: API-Schema für Funktions- und Gruppierungssicht, gemeinsame Prüfungen, abgesicherter Laufabschluss

**Files:**
- Modify: `packages/ingest/src/api/schema.ts`, `packages/ingest/src/api/crawler.ts`, `packages/ingest/src/api-ingest.ts`, `packages/ingest/src/soll-ingest.ts`, `packages/ingest/package.json` (Version `0.3.0`)
- Test: `packages/ingest/src/api/schema.test.ts`, `packages/ingest/src/api/crawler.test.ts`, `packages/ingest/src/api-ingest.int.test.ts`, `packages/ingest/src/soll-ingest.int.test.ts`; die Erwartungen `0.2.0` in `lauf-kontext.test.ts` und `cli.int.test.ts` auf `0.3.0` ändern

**Interfaces:**
- Produces:
  - Schema: `meta.unit` ∈ {`single`, `function`, `group`}, `meta.entity` zusätzlich `Function` und `Group`, `meta.levelMax` ∈ {3, 4}, Kind-ID zusätzlich `^[FG]-\d{1,3}$`
  - `crawler.ts` exportiert: `API_BASIS`, `ACCOUNT` (`{ ausgaben: 'expenses', einnahmen: 'income' }`), `holeGeprueft(url, abruf)`, `type Erwartung = { jahr: number; account: 'expenses' | 'income'; quota: 'target' | 'actual'; unit: 'single' | 'function' | 'group'; levelCur: number; levelMax: 3 | 4 }`, `pruefeKonsistenz(a: ApiAntwort, url: string, e: Erwartung): void`, `pruefeElternwert(ebene: string, id: string, eigenCent: number, elternCent: number, url: string): void`
  - `ApiIngestOptionen` und `SollIngestOptionen` erhalten das optionale Test-Seam `beende?: typeof beendeLauf`

- [ ] **Step 1: Failing Tests schreiben**

In `schema.test.ts` ergänzen:
```ts
describe('pruefeApiAntwort für Funktions- und Gruppierungssicht', () => {
  const basis = () => structuredClone(fixture('kap0411_ist_2024_ausgaben')) as Record<string, any>;

  it('akzeptiert unit function und group mit levelMax 4 und F-/G-Codes', () => {
    for (const [unit, entity, id] of [['function', 'Function', 'F-322'], ['group', 'Group', 'G-684']] as const) {
      const json = basis();
      json.meta.unit = unit;
      json.meta.entity = entity;
      json.meta.levelMax = 4;
      json.children[0].id = id;
      expect(pruefeApiAntwort(json, URL_X).warnungen).toEqual([]);
    }
  });

  it('lehnt unbekannte Sichten ab', () => {
    const json = basis();
    json.meta.unit = 'region';
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(ApiVertragsFehler);
  });
});
```

In `crawler.test.ts` ergänzen:
```ts
  it('lehnt in der Einzelplan-Sicht Antworten einer anderen Sicht ab', async () => {
    const baum = baueBaum(P, PLAN);
    const ep = baum.get(apiUrl(P, '04')) as { meta: { unit: string; levelMax: number } };
    ep.meta.unit = 'function';
    ep.meta.levelMax = 4;
    await expect(vollerCrawl(baum)).rejects.toThrow(/Antwort passt nicht zur Anfrage/);
  });
```

In `api-ingest.int.test.ts` ergänzen:
```ts
  it('liefert failed mit Hinweis, wenn der Lauf nicht abgeschlossen werden kann, und wirft nicht', () =>
    imRollback(async (tx) => {
      const beende = async () => { throw new Error('Verbindung verloren'); };
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baueBaum(P, PLAN, 777)), { beende }));
      expect(e.status).toBe('failed');
      expect(e.hinweis).toMatch(/Lauf konnte nicht abgeschlossen werden: Verbindung verloren/);
    }));
```
und analog in `soll-ingest.int.test.ts` mit `ladeSollJahr(tx, 2026, optionen({ lokaleDatei: einmaligeDatei(), beende }))`.

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test; pnpm --filter @hb/ingest test:int`
Expected: FAIL (Schema lehnt `function` ab, Einzelplan-Sicht prüft die Sicht nicht, `beende` unbekannt)

- [ ] **Step 3: Implementierung**

`schema.ts`: in `KIND` die ID-Regex auf `/^(\d{2}|\d{4}|\d{9}|[FG]-\d{1,3})$/` erweitern; in `META` `unit: z.enum(['single', 'function', 'group'])`, `entity: z.enum(['Budget', 'Section', 'Chapter', 'Title', 'Function', 'Group'])`, `levelMax: z.union([z.literal(3), z.literal(4)])`.

`crawler.ts`: die bisherige innere Prüffunktion von `crawle` (Anfrage-Abgleich, `levelCur`, Summe der Kinder) und die Elternwert-Prüfung als exportierte Funktionen herauslösen; `holeGeprueft`, `API_BASIS`, `ACCOUNT` exportieren. Die Meldungen bleiben wörtlich gleich.
```ts
export type Erwartung = {
  jahr: number;
  account: 'expenses' | 'income';
  quota: 'target' | 'actual';
  unit: 'single' | 'function' | 'group';
  levelCur: number;
  levelMax: 3 | 4;
};

/** Prüft, dass die Antwort zur Anfrage passt und der Knoten centgenau der Summe seiner Kinder entspricht. */
export function pruefeKonsistenz(a: ApiAntwort, url: string, e: Erwartung): void {
  if (a.meta.year !== e.jahr || a.meta.account !== e.account || a.meta.quota !== e.quota || a.meta.unit !== e.unit || a.meta.levelMax !== e.levelMax) {
    throw new ApiVertragsFehler('Antwort passt nicht zur Anfrage', url);
  }
  if (a.meta.levelCur !== e.levelCur) throw new ApiVertragsFehler(`levelCur ${a.meta.levelCur} statt ${e.levelCur}`, url);
  const kinderCent = a.children.reduce((s, k) => s + zuCent(k.value), 0);
  const knotenCent = zuCent(a.detail.value);
  if (kinderCent !== knotenCent) {
    throw new ApiVertragsFehler(`Summe der Kinder ${centZuDezimal(kinderCent)} weicht vom Knoten ${centZuDezimal(knotenCent)} ab`, url);
  }
}

export function pruefeElternwert(ebene: string, id: string, eigenCent: number, elternCent: number, url: string): void {
  if (eigenCent !== elternCent) {
    throw new ApiVertragsFehler(`${ebene} ${id}: Wert ${centZuDezimal(eigenCent)} weicht vom Elternknoten ${centZuDezimal(elternCent)} ab`, url);
  }
}
```
`crawle` ruft `pruefeKonsistenz(a, url, { jahr: p.jahr, account: ACCOUNT[p.konto], quota: QUOTA[p.quote], unit: 'single', levelCur, levelMax: 3 })` auf.

`api-ingest.ts` und `soll-ingest.ts`: Option `beende?: typeof beendeLauf`; in `ende` den Aufruf absichern:
```ts
    let endStatus = status;
    let endHinweis = extra.hinweis;
    try {
      await (opt.beende ?? beendeLauf)(sql, runId, { status, rowsLoaded: extra.titel /* bzw. extra.rowsLoaded */, fehler });
    } catch (e) {
      endStatus = 'failed';
      endHinweis = [extra.hinweis, `Lauf konnte nicht abgeschlossen werden: ${e instanceof Error ? e.message : String(e)}`].filter(Boolean).join('; ');
    }
```
und `endStatus`/`endHinweis` zurückgeben.

`package.json`: `"version": "0.3.0"`.

- [ ] **Step 4: Tests ausführen**

Run: `pnpm typecheck && pnpm test && pnpm test:int`
Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ingest
git commit -m "feat(ingest): API-Schema für Funktions- und Gruppierungssicht, abgesicherter Laufabschluss"
```

---

### Task 2: Crawler für die Systematik (Funktionen und Gruppierungen)

**Files:**
- Create: `packages/ingest/src/api/systematik.ts`, `packages/ingest/src/api/test-systematik.ts`
- Create: `packages/ingest/fixtures/api/funktion_wurzel_soll_2024_ausgaben.json`, `funktion_F-3_soll_2024_ausgaben.json`, `funktion_F-32_soll_2024_ausgaben.json`, `gruppierung_G-68_soll_2024_ausgaben.json`
- Test: `packages/ingest/src/api/systematik.test.ts`

**Interfaces:**
- Consumes: `holeGeprueft`, `pruefeKonsistenz`, `pruefeElternwert`, `API_BASIS`, `ACCOUNT`, `zuCent`, `ApiAbruf` (Task 1, Plan 2); `ApiVertragsFehler`, `ApiAntwort`; `fakeAbruf` (Plan 2)
- Produces:
  - `type Sicht = 'funktion' | 'gruppierung'`, `type SystematikParameter = { jahr: number; konto: Konto; sicht: Sicht }`
  - `systematikUrl(p: SystematikParameter, id?: string): string` (immer `quota=target`)
  - `type SystematikEintrag = { code: string; ebene: 1 | 2 | 3; label: string; betragCent: number }`
  - `type SystematikWurzel = { status: 'nicht_verfuegbar'; url: string } | { status: 'ok'; url: string; antwort: ApiAntwort; roh: Buffer; warnungen: string[] }`
  - `holeSystematikWurzel(p, abruf): Promise<SystematikWurzel>`
  - `type SystematikErgebnis = { quelleTimestamp: number; eintraege: SystematikEintrag[]; antworten: { url: string; roh: Buffer }[]; warnungen: string[] }`
  - `crawleSystematik(p, abruf, wurzel: Extract<SystematikWurzel, { status: 'ok' }>): Promise<SystematikErgebnis>`
  - Testhilfe `type SystematikPlan = Record<string, Record<string, Array<[code3: string, label: string, wert: number]>>>`, `baueSystematikBaum(p, plan, timestamp?): Map<string, unknown>`

- [ ] **Step 1: Echte Antworten als Fixtures speichern** (vier Anfragen, Git Bash)

```bash
cd packages/ingest
UA="Haushaltsblick/0.3.0 (+https://github.com/alexander-walz/haushaltsblick)"
B="https://www.bundeshaushalt.de/internalapi/budgetData?year=2024&account=expenses&quota=target"
curl -sS -A "$UA" "$B&unit=function" > fixtures/api/funktion_wurzel_soll_2024_ausgaben.json; sleep 1
curl -sS -A "$UA" "$B&unit=function&id=F-3" > fixtures/api/funktion_F-3_soll_2024_ausgaben.json; sleep 1
curl -sS -A "$UA" "$B&unit=function&id=F-32" > fixtures/api/funktion_F-32_soll_2024_ausgaben.json; sleep 1
curl -sS -A "$UA" "$B&unit=group&id=G-68" > fixtures/api/gruppierung_G-68_soll_2024_ausgaben.json
cd ../..
```

- [ ] **Step 2: Testhilfe schreiben**

`packages/ingest/src/api/test-systematik.ts`:
```ts
import { centZuDezimal, zuCent } from './crawler';
import { systematikUrl, type SystematikParameter } from './systematik';

export type SystematikPlan = Record<string, Record<string, Array<[code3: string, label: string, wert: number]>>>;

const ACCOUNT = { ausgaben: 'expenses', einnahmen: 'income' } as const;
const UNIT = { funktion: 'function', gruppierung: 'group' } as const;
const ENTITY = { funktion: 'Function', gruppierung: 'Group' } as const;
const PRAEFIX = { funktion: 'F-', gruppierung: 'G-' } as const;

/** Baut Wurzel, Ebene 1 und Ebene 2 einer Systematik-Sicht mit centgenauen Summen. Ebene 3 steht nur als Kinder in Ebene 2. */
export function baueSystematikBaum(p: SystematikParameter, plan: SystematikPlan, timestamp = 1711628039000): Map<string, unknown> {
  const baum = new Map<string, unknown>();
  const vor = PRAEFIX[p.sicht];
  const meta = (levelCur: number, entity: string) => ({
    year: p.jahr, unit: UNIT[p.sicht], quota: 'target', account: ACCOUNT[p.konto], timestamp,
    modifyDate: '28.03.2024', entity, levelCur, levelMax: 4,
  });
  const wert = (cent: number) => Number(centZuDezimal(cent));
  const kind = (code: string, label: string, cent: number) => ({
    id: `${vor}${code}`, budgetNumber: '____ ___ __ - ___', label: `${code} ${label}`, value: wert(cent), relativeToParentValue: 0, relativeValue: 0,
  });

  const hauptKinder = [];
  let gesamt = 0;
  for (const [h, ober] of Object.entries(plan)) {
    const oberKinder = [];
    let hCent = 0;
    for (const [o, codes] of Object.entries(ober)) {
      const oCent = codes.reduce((s, [, , w]) => s + zuCent(w), 0);
      baum.set(systematikUrl(p, `${vor}${o}`), {
        meta: meta(2, ENTITY[p.sicht]),
        detail: { id: `${vor}${o}`, label: `${o} Ober ${o}`, value: wert(oCent), relativeToParentValue: 0, relativeValue: 0 },
        children: codes.map(([c, label, w]) => kind(c, label, zuCent(w))),
      });
      oberKinder.push(kind(o, `Ober ${o}`, oCent));
      hCent += oCent;
    }
    baum.set(systematikUrl(p, `${vor}${h}`), {
      meta: meta(1, ENTITY[p.sicht]),
      detail: { id: `${vor}${h}`, label: `${h} Haupt ${h}`, value: wert(hCent), relativeToParentValue: 0, relativeValue: 0 },
      children: oberKinder,
    });
    hauptKinder.push(kind(h, `Haupt ${h}`, hCent));
    gesamt += hCent;
  }
  baum.set(systematikUrl(p), {
    meta: meta(0, 'Budget'),
    detail: { label: `Sollwerte des Haushaltsjahres ${p.jahr}`, value: wert(gesamt), relativeToParentValue: 100, relativeValue: 100 },
    children: hauptKinder,
  });
  return baum;
}
```

- [ ] **Step 3: Failing Tests schreiben**

`packages/ingest/src/api/systematik.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { zuCent } from './crawler';
import { ApiVertragsFehler, pruefeApiAntwort } from './schema';
import { crawleSystematik, holeSystematikWurzel, systematikUrl, type SystematikParameter } from './systematik';
import { fakeAbruf } from './test-baum';
import { baueSystematikBaum, type SystematikPlan } from './test-systematik';

const P: SystematikParameter = { jahr: 2024, konto: 'ausgaben', sicht: 'funktion' };
const PLAN: SystematikPlan = {
  '3': { '31': [['312', 'Krankenhäuser', 10]], '32': [['322', 'Sport', 5.5], ['325', 'Erholung', 0.5]] },
  '0': { '01': [['011', 'Politische Führung', 100]] },
};

async function crawl(baum = baueSystematikBaum(P, PLAN)) {
  const abruf = fakeAbruf(baum);
  const wurzel = await holeSystematikWurzel(P, abruf);
  if (wurzel.status !== 'ok') throw new Error('Wurzel fehlt');
  return { ergebnis: await crawleSystematik(P, abruf, wurzel), abruf };
}

describe('systematikUrl', () => {
  it('fragt immer den Soll der jeweiligen Sicht ab', () => {
    expect(systematikUrl(P)).toBe('https://www.bundeshaushalt.de/internalapi/budgetData?year=2024&account=expenses&quota=target&unit=function');
    expect(systematikUrl({ jahr: 2013, konto: 'einnahmen', sicht: 'gruppierung' }, 'G-1'))
      .toBe('https://www.bundeshaushalt.de/internalapi/budgetData?year=2013&account=income&quota=target&unit=group&id=G-1');
  });
});

describe('crawleSystematik', () => {
  it('liefert alle Codes der drei Ebenen mit Bezeichnung ohne Codepräfix', async () => {
    const { ergebnis } = await crawl();
    expect(ergebnis.eintraege).toContainEqual({ code: '3', ebene: 1, label: 'Haupt 3', betragCent: 1600 });
    expect(ergebnis.eintraege).toContainEqual({ code: '32', ebene: 2, label: 'Ober 32', betragCent: 600 });
    expect(ergebnis.eintraege).toContainEqual({ code: '322', ebene: 3, label: 'Sport', betragCent: 550 });
    expect(ergebnis.eintraege).toHaveLength(9);
    expect(ergebnis.quelleTimestamp).toBe(1711628039000);
  });

  it('ruft nur Wurzel, Ebene 1 und Ebene 2 ab', async () => {
    const { abruf } = await crawl();
    expect(abruf.aufrufe).toEqual([
      systematikUrl(P), systematikUrl(P, 'F-3'), systematikUrl(P, 'F-31'), systematikUrl(P, 'F-32'), systematikUrl(P, 'F-0'), systematikUrl(P, 'F-01'),
    ]);
  });

  it('prüft jede Ebene centgenau', async () => {
    const baum = baueSystematikBaum(P, PLAN);
    (baum.get(systematikUrl(P, 'F-32')) as { children: { value: number }[] }).children[0]!.value = 5.49;
    await expect(crawl(baum)).rejects.toThrow(/Summe der Kinder 5\.99 weicht vom Knoten 6\.00 ab/);
  });

  it('lehnt Codes ab, die nicht zum Elternknoten passen', async () => {
    const baum = baueSystematikBaum(P, PLAN);
    (baum.get(systematikUrl(P, 'F-32')) as { children: { id: string }[] }).children[0]!.id = 'F-412';
    await expect(crawl(baum)).rejects.toThrow(/Code F-412 gehört nicht zu 32/);
  });

  it('lehnt Codes der falschen Sicht ab', async () => {
    const baum = baueSystematikBaum(P, PLAN);
    (baum.get(systematikUrl(P)) as { children: { id: string }[] }).children[0]!.id = 'G-3';
    await expect(crawl(baum)).rejects.toThrow(ApiVertragsFehler);
  });

  it('meldet fehlende Knoten als Vertragsfehler', async () => {
    const baum = baueSystematikBaum(P, PLAN);
    baum.delete(systematikUrl(P, 'F-31'));
    await expect(crawl(baum)).rejects.toThrow(/Knoten nicht gefunden \(404\)/);
  });

  it('meldet nicht verfügbare Jahre', async () => {
    expect(await holeSystematikWurzel(P, fakeAbruf(new Map()))).toEqual({ status: 'nicht_verfuegbar', url: systematikUrl(P) });
  });
});

describe('echte Antworten der Systematik', () => {
  it.each(['funktion_wurzel_soll_2024_ausgaben', 'funktion_F-3_soll_2024_ausgaben', 'funktion_F-32_soll_2024_ausgaben', 'gruppierung_G-68_soll_2024_ausgaben'])(
    '%s ist schemakonform und centgenau',
    (name) => {
      const json = JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/api/${name}.json`, import.meta.url)), 'utf8'));
      const { antwort, warnungen } = pruefeApiAntwort(json, name);
      expect(warnungen).toEqual([]);
      expect(antwort.children.reduce((s, k) => s + zuCent(k.value), 0)).toBe(zuCent(antwort.detail.value));
    },
  );
});
```

- [ ] **Step 4: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test`
Expected: FAIL mit „Cannot find module ./systematik“

- [ ] **Step 5: Implementierung**

`packages/ingest/src/api/systematik.ts`:
```ts
import type { Konto } from '@hb/shared';
import { ACCOUNT, API_BASIS, holeGeprueft, pruefeElternwert, pruefeKonsistenz, zuCent, type ApiAbruf } from './crawler';
import { ApiVertragsFehler, type ApiAntwort } from './schema';

export type Sicht = 'funktion' | 'gruppierung';
export type SystematikParameter = { jahr: number; konto: Konto; sicht: Sicht };
export type SystematikEintrag = { code: string; ebene: 1 | 2 | 3; label: string; betragCent: number };
export type SystematikWurzel =
  | { status: 'nicht_verfuegbar'; url: string }
  | { status: 'ok'; url: string; antwort: ApiAntwort; roh: Buffer; warnungen: string[] };
export type SystematikErgebnis = {
  quelleTimestamp: number;
  eintraege: SystematikEintrag[];
  antworten: { url: string; roh: Buffer }[];
  warnungen: string[];
};

const UNIT = { funktion: 'function', gruppierung: 'group' } as const;
const PRAEFIX = { funktion: 'F-', gruppierung: 'G-' } as const;
const CODE_PRAEFIX = /^\d+\s+/;

export function systematikUrl(p: SystematikParameter, id?: string): string {
  const basis = `${API_BASIS}?year=${p.jahr}&account=${ACCOUNT[p.konto]}&quota=target&unit=${UNIT[p.sicht]}`;
  return id === undefined ? basis : `${basis}&id=${id}`;
}

export async function holeSystematikWurzel(p: SystematikParameter, abruf: ApiAbruf): Promise<SystematikWurzel> {
  const url = systematikUrl(p);
  const g = await holeGeprueft(url, abruf);
  if (!g) return { status: 'nicht_verfuegbar', url };
  return { status: 'ok', url, antwort: g.antwort, roh: g.roh, warnungen: g.warnungen };
}

/** Läuft Wurzel → Ebene 1 → Ebene 2 ab; die Codes der Ebene 3 stehen als Kinder in Ebene 2. Jede Ebene wird centgenau geprüft. */
export async function crawleSystematik(
  p: SystematikParameter,
  abruf: ApiAbruf,
  wurzel: Extract<SystematikWurzel, { status: 'ok' }>,
): Promise<SystematikErgebnis> {
  const vor = PRAEFIX[p.sicht];
  const eintraege: SystematikEintrag[] = [];
  const antworten = [{ url: wurzel.url, roh: wurzel.roh }];
  const warnungen = new Set(wurzel.warnungen);
  const codes = new Set<string>();
  const erwartung = (levelCur: number) => ({
    jahr: p.jahr, account: ACCOUNT[p.konto], quota: 'target' as const, unit: UNIT[p.sicht], levelCur, levelMax: 4 as const,
  });

  const code = (id: string, laenge: number, eltern: string, url: string): string => {
    const m = new RegExp(`^${vor}(\\d{${laenge}})$`).exec(id);
    if (!m) throw new ApiVertragsFehler(`Code ungültig: ${id}`, url);
    if (!m[1]!.startsWith(eltern)) throw new ApiVertragsFehler(`Code ${id} gehört nicht zu ${eltern}`, url);
    if (codes.has(m[1]!)) throw new ApiVertragsFehler(`Code ${id} mehrfach vorhanden`, url);
    codes.add(m[1]!);
    return m[1]!;
  };
  const eintrag = (c: string, ebene: 1 | 2 | 3, label: string, wert: number) =>
    eintraege.push({ code: c, ebene, label: label.replace(CODE_PRAEFIX, ''), betragCent: zuCent(wert) });
  const holeKnoten = async (id: string) => {
    const url = systematikUrl(p, id);
    const g = await holeGeprueft(url, abruf);
    if (!g) throw new ApiVertragsFehler('Knoten nicht gefunden (404)', url);
    if (g.antwort.detail.id !== id) throw new ApiVertragsFehler(`Antwort gehört zu Knoten ${g.antwort.detail.id} statt ${id}`, url);
    antworten.push({ url, roh: g.roh });
    for (const w of g.warnungen) warnungen.add(w);
    return { url, a: g.antwort };
  };

  pruefeKonsistenz(wurzel.antwort, wurzel.url, erwartung(0));
  for (const h of wurzel.antwort.children) {
    const c1 = code(h.id, 1, '', wurzel.url);
    eintrag(c1, 1, h.label, h.value);
    const { url: u1, a: a1 } = await holeKnoten(h.id);
    pruefeKonsistenz(a1, u1, erwartung(1));
    pruefeElternwert('Ebene 1', h.id, zuCent(a1.detail.value), zuCent(h.value), u1);
    for (const o of a1.children) {
      const c2 = code(o.id, 2, c1, u1);
      eintrag(c2, 2, o.label, o.value);
      const { url: u2, a: a2 } = await holeKnoten(o.id);
      pruefeKonsistenz(a2, u2, erwartung(2));
      pruefeElternwert('Ebene 2', o.id, zuCent(a2.detail.value), zuCent(o.value), u2);
      for (const f of a2.children) eintrag(code(f.id, 3, c2, u2), 3, f.label, f.value);
    }
  }
  return { quelleTimestamp: wurzel.antwort.meta.timestamp, eintraege, antworten, warnungen: [...warnungen] };
}
```

- [ ] **Step 6: Tests ausführen**

Run: `pnpm --filter @hb/ingest test && pnpm typecheck`
Expected: alle PASS. Erzeugt eine echte Fixture Warnungen oder scheitert an der Schemaprüfung: anhalten und melden, Schema nicht ohne Befund ändern.

- [ ] **Step 7: Commit**

```bash
git add packages/ingest/src/api packages/ingest/fixtures/api
git commit -m "feat(ingest): Crawler für Funktions- und Gruppierungssystematik"
```

---

### Task 3: Migration für Systematik, DQ-Katalog, Datenversionen und Aufräumen

**Files:**
- Create: `supabase/migrations/20261010120000_systematik_dq_versionen.sql`
- Test: `packages/ingest/src/db/schema.int.test.ts` (ergänzen)

**Interfaces:**
- Produces: `raw.api_systematik_abruf`, `raw.api_systematik`, `ops.dq_check` (16 Einträge), `ops.dq_lauf`, `ops.dq_ergebnis`, `ops.dataset_version`, `mart.fct_titel_jahr_hist`, Funktionen `ops.veroeffentliche_version(p_dq_lauf_id bigint) returns table (version_id bigint, zeilen_neu integer, zeilen_geschlossen integer, zeilen_gesamt integer)` und `ops.raeume_raw_auf() returns table (tabelle text, geloescht bigint)`

- [ ] **Step 1: Failing Tests schreiben**

In `schema.int.test.ts` ergänzen:
```ts
  it('legt den DQ-Katalog mit 16 Prüfungen an', () =>
    imRollback(async (tx) => {
      const rows = await tx<{ check_id: string; schwere: string }[]>`select check_id, schwere from ops.dq_check order by check_id`;
      expect(rows.map((r) => r.check_id)).toEqual(Array.from({ length: 16 }, (_, i) => `DQ-${String(i + 1).padStart(2, '0')}`));
      expect(rows.filter((r) => r.schwere === 'error').map((r) => r.check_id)).toEqual([
        'DQ-01', 'DQ-02', 'DQ-03', 'DQ-07', 'DQ-08', 'DQ-09', 'DQ-13', 'DQ-15', 'DQ-16',
      ]);
    }));

  it('verweigert anon den Zugriff auf mart und core', () =>
    imRollback(async (tx) => {
      await expect(inTransaktion(tx, async (t) => {
        await t.unsafe('set local role anon');
        await t`select 1 from mart.fct_titel_jahr_hist limit 1`;
      })).rejects.toThrow(/permission denied/);
    }));

  it('räumt Rohdaten nicht maßgeblicher Läufe auf', () =>
    imRollback(async (tx) => {
      const lauf = async (beginn: string) => {
        const [l] = await tx<{ run_id: string }[]>`
          insert into ops.load_run (source_id, trigger, git_sha, pipeline_version, status, started_at)
          values ('SRC_SOLL_XML', 'ci', 'test', '0.3.0', 'succeeded', ${beginn}) returning run_id`;
        await tx`insert into raw.source_file (run_id, source_id, jahr, source_url, fetched_at, sha256, byte_size, ablage_uri)
                 values (${l!.run_id}, 'SRC_SOLL_XML', 1999, ${'x' + beginn}, ${beginn}, ${'a'.repeat(64)}, 1, 'x')`;
        await tx`insert into raw.soll_kapitel (run_id, jahr, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text, anzahl_titel, entfallen, xml_pfad)
                 values (${l!.run_id}, 1999, '01', 'EP', '0101', 'K', 0, true, '/x')`;
        return l!.run_id;
      };
      const alt = await lauf('2026-01-01T00:00:00Z');
      const neu = await lauf('2026-02-01T00:00:00Z');
      const ergebnis = await tx<{ tabelle: string; geloescht: string }[]>`select * from ops.raeume_raw_auf()`;
      expect(ergebnis.map((r) => r.tabelle)).toEqual([
        'raw.soll_titel', 'raw.soll_kapitel', 'raw.api_titel', 'raw.api_knoten', 'raw.api_systematik',
      ]);
      const reste = await tx<{ run_id: string }[]>`select run_id from raw.soll_kapitel where jahr = 1999`;
      expect(reste.map((r) => r.run_id)).toEqual([neu]);
      expect(reste.map((r) => r.run_id)).not.toContain(alt);
    }));
```

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test:int`
Expected: FAIL (Tabellen und Funktionen fehlen)

- [ ] **Step 3: Migration schreiben**

`supabase/migrations/20261010120000_systematik_dq_versionen.sql`:
```sql
-- Systematik (Funktionen, Gruppierungen) je Jahr aus der internalapi (Roadmap E15)
create table raw.api_systematik_abruf (
  run_id           uuid primary key references ops.load_run on delete cascade,
  jahr             integer not null,
  konto            text not null check (konto in ('einnahmen', 'ausgaben')),
  sicht            text not null check (sicht in ('funktion', 'gruppierung')),
  quelle_timestamp bigint not null,
  anfragen         integer not null check (anfragen > 0),
  ablage_uri       text not null,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  warnungen        jsonb not null default '[]'
);
create index on raw.api_systematik_abruf (jahr, konto, sicht);

create table raw.api_systematik (
  run_id     uuid not null references ops.load_run on delete cascade,
  jahr       integer not null,
  konto      text not null check (konto in ('einnahmen', 'ausgaben')),
  sicht      text not null check (sicht in ('funktion', 'gruppierung')),
  code       text not null check (code ~ '^[0-9]{1,3}$'),
  ebene      integer not null check (ebene between 1 and 3),
  label      text not null,
  betrag_eur numeric(18,2) not null,
  primary key (run_id, code)
);

alter table raw.api_systematik_abruf enable row level security;
alter table raw.api_systematik enable row level security;

-- Katalog der Qualitätsprüfungen (Konzept Abschnitt 9, erweitert)
create table ops.dq_check (
  check_id     text primary key,
  dimension    text not null,
  beschreibung text not null,
  schwere      text not null check (schwere in ('error', 'warn'))
);
insert into ops.dq_check values
  ('DQ-01', 'Vollständigkeit', 'Jeder Einzelplan des API-Solls ist in der XML vorhanden (nur Jahre mit identischem Stand)', 'error'),
  ('DQ-02', 'Eindeutigkeit', 'Titelschlüssel je Jahr eindeutig im Mart', 'error'),
  ('DQ-03', 'Gültigkeit', 'Titel 5-, Kapitel 4-stellig mit Einzelplan als Präfix, Funktion 3-stellig', 'error'),
  ('DQ-04', 'Referenzielle Integrität', 'Jede Funktionskennziffer hat eine Bezeichnung', 'warn'),
  ('DQ-05', 'Referenzielle Integrität', 'Jede Gruppierungsnummer hat eine Bezeichnung', 'warn'),
  ('DQ-06', 'Konsistenz', 'Hauptgruppe 0 bis 3 nur in Einnahmen, 4 bis 9 nur in Ausgaben', 'warn'),
  ('DQ-07', 'Abgleich', 'Einzelplansummen XML gleich API-Soll (nur Jahre mit identischem Stand)', 'error'),
  ('DQ-08', 'Abgleich', 'API-Soll: Einnahmen gleich Ausgaben je Jahr', 'error'),
  ('DQ-09', 'Abgleich', 'Summen entsprechen den gepflegten Kontrollsummen', 'error'),
  ('DQ-10', 'Aktualität', 'Letzter Ladelauf je Quelle jünger als 8 Tage', 'warn'),
  ('DQ-11', 'Plausibilität', 'Anzahl Titel je Jahr und Konto weicht höchstens 15 % vom Vorjahr ab', 'warn'),
  ('DQ-12', 'Schema', 'Letzter Lauf je Schlüssel weder fehlgeschlagen noch in Quarantäne', 'warn'),
  ('DQ-13', 'Vollständigkeit', 'Ist für alle Jahre bis zum Vorvorjahr in beiden Konten geladen', 'error'),
  ('DQ-14', 'Abgleich', 'Unterschied XML- zu API-Soll nur bei Nachtrag oder Entwurf', 'warn'),
  ('DQ-15', 'Abgleich', 'API-Ist: Einnahmen gleich Ausgaben je Jahr', 'error'),
  ('DQ-16', 'Konsistenz', 'Mart-Summen je Jahr und Konto gleich der API-Wurzel (Soll und Ist)', 'error');

create table ops.dq_lauf (
  dq_lauf_id       bigint generated always as identity primary key,
  erstellt_am      timestamptz not null default now(),
  git_sha          text not null,
  dbt_manifest_sha text not null,
  ampel            text not null check (ampel in ('green', 'yellow', 'red')),
  score            numeric(5,2) not null
);

create table ops.dq_ergebnis (
  dq_lauf_id bigint not null references ops.dq_lauf on delete cascade,
  check_id   text not null references ops.dq_check,
  status     text not null check (status in ('pass', 'warn', 'fail')),
  failures   integer not null default 0,
  details    jsonb not null default '[]',
  primary key (dq_lauf_id, check_id)
);

-- Veröffentlichte Datenversionen (Roadmap E16), fortlaufend nummeriert
create table ops.dataset_version (
  version_id         bigint generated always as identity primary key,
  erstellt_am        timestamptz not null default now(),
  dq_lauf_id         bigint not null unique references ops.dq_lauf,
  zeilen_neu         integer not null,
  zeilen_geschlossen integer not null,
  zeilen_gesamt      integer not null,
  is_current         boolean not null default false
);
create unique index dataset_version_ein_aktueller on ops.dataset_version (is_current) where is_current;

-- Historie des Marts: Spalten exakt wie mart.fct_titel_jahr (dbt) plus Gültigkeit
create table mart.fct_titel_jahr_hist (
  jahr                 integer not null,
  konto                text not null,
  titel_key            text not null,
  einzelplan_nr        text,
  einzelplan_text      text,
  kapitel_nr           text,
  kapitel_text         text,
  titel_nr             text,
  titel_text           text,
  titelgruppe_nr       text,
  titelgruppe_text     text,
  ausgabeart_text      text,
  flexibilisiert       boolean,
  seite                integer,
  fkt                  text,
  funktion_text        text,
  oberfunktion         text,
  oberfunktion_text    text,
  hauptfunktion        text,
  hauptfunktion_text   text,
  gruppierung_nr       text,
  gruppierung_text     text,
  obergruppe           text,
  obergruppe_text      text,
  hauptgruppe          text,
  hauptgruppe_text     text,
  soll_eur             numeric(18,2),
  soll_quelle          text,
  soll_xml_eur         numeric(18,2),
  ist_eur              numeric(18,2),
  ist_verfuegbar       boolean,
  abweichung_eur       numeric(18,2),
  ist_quote            numeric,
  haushaltsstand       text,
  im_haushaltsplan_xml boolean,
  zeilen_hash          text not null,
  gueltig_ab_version   bigint not null references ops.dataset_version,
  gueltig_bis_version  bigint references ops.dataset_version,
  primary key (jahr, konto, titel_key, gueltig_ab_version)
);
create index fct_titel_jahr_hist_offen on mart.fct_titel_jahr_hist (jahr, konto, titel_key) where gueltig_bis_version is null;

revoke all on schema core, mart from anon, authenticated;
revoke all on all tables in schema raw, ops, mart from anon, authenticated;
alter default privileges in schema core, mart revoke all on tables from anon, authenticated;

-- Veröffentlicht den aktuellen Inhalt von mart.fct_titel_jahr als neue Version (nie bei roter Ampel)
create function ops.veroeffentliche_version(p_dq_lauf_id bigint)
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

  insert into ops.dataset_version (dq_lauf_id, zeilen_neu, zeilen_geschlossen, zeilen_gesamt)
  values (p_dq_lauf_id, 0, 0, 0) returning ops.dataset_version.version_id into v_version;

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

-- Behält in raw nur die maßgeblichen Läufe (Roadmap E17); ältere Rohdaten liegen im Release rohdaten
create function ops.raeume_raw_auf()
returns table (tabelle text, geloescht bigint)
language plpgsql
as $$
#variable_conflict use_column
declare
  n bigint;
begin
  create temporary table behalten_soll on commit drop as
    select distinct on (f.jahr) f.run_id
    from raw.source_file f join ops.load_run l on l.run_id = f.run_id
    where f.source_id = 'SRC_SOLL_XML' and l.status = 'succeeded' and l.params ->> 'datei' is null
    order by f.jahr, l.started_at desc, f.fetched_at desc;
  create temporary table behalten_api on commit drop as
    select distinct on (a.jahr, a.konto, a.quote) a.run_id
    from raw.api_abruf a join ops.load_run l on l.run_id = a.run_id
    where l.status = 'succeeded'
    order by a.jahr, a.konto, a.quote, l.started_at desc, a.quelle_timestamp desc;
  create temporary table behalten_systematik on commit drop as
    select distinct on (s.jahr, s.konto, s.sicht) s.run_id
    from raw.api_systematik_abruf s join ops.load_run l on l.run_id = s.run_id
    where l.status = 'succeeded'
    order by s.jahr, s.konto, s.sicht, l.started_at desc, s.quelle_timestamp desc;

  delete from raw.soll_titel t where t.run_id not in (select run_id from behalten_soll);
  get diagnostics n = row_count; tabelle := 'raw.soll_titel'; geloescht := n; return next;
  delete from raw.soll_kapitel t where t.run_id not in (select run_id from behalten_soll);
  get diagnostics n = row_count; tabelle := 'raw.soll_kapitel'; geloescht := n; return next;
  delete from raw.api_titel t where t.run_id not in (select run_id from behalten_api);
  get diagnostics n = row_count; tabelle := 'raw.api_titel'; geloescht := n; return next;
  delete from raw.api_knoten t where t.run_id not in (select run_id from behalten_api);
  get diagnostics n = row_count; tabelle := 'raw.api_knoten'; geloescht := n; return next;
  delete from raw.api_systematik t where t.run_id not in (select run_id from behalten_systematik);
  get diagnostics n = row_count; tabelle := 'raw.api_systematik'; geloescht := n; return next;

  drop table behalten_soll;
  drop table behalten_api;
  drop table behalten_systematik;
end $$;
```

- [ ] **Step 4: Migration anwenden und Tests ausführen**

Run: `pnpm dlx supabase@2.120.0 migration up --local && pnpm --filter @hb/ingest test:int && pnpm typecheck`
Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261010120000_systematik_dq_versionen.sql packages/ingest/src/db/schema.int.test.ts
git commit -m "feat(db): Systematik, DQ-Katalog, Datenversionen und Aufräumen der Rohdaten"
```

---

### Task 4: Systematik laden, Ablauf und CLI `systematik`

**Files:**
- Create: `packages/ingest/src/db/lade-systematik.ts`, `packages/ingest/src/systematik-ingest.ts`, `packages/ingest/src/cli-systematik.ts`, `packages/ingest/src/bin-systematik.ts`
- Modify: `packages/ingest/package.json` (Script `"systematik": "tsx src/bin-systematik.ts"`), `CLAUDE.md`
- Test: `packages/ingest/src/db/lade-systematik.int.test.ts`, `packages/ingest/src/systematik-ingest.int.test.ts`, `packages/ingest/src/cli-systematik.int.test.ts`

**Interfaces:**
- Consumes: Task 2 (`crawleSystematik`, `holeSystematikWurzel`, `systematikUrl`, `baueSystematikBaum`, `SystematikParameter`, `Sicht`), Plan 2 (`archiviere`, `starteLauf`, `beendeLauf`, `inTransaktion`, `laufKontext`, `Drossel`, `netzAbruf`, `parseJahre`, `fakeAbruf`, `imRollback`, `sha256Hex`, `centZuDezimal`)
- Produces:
  - `letzterSystematikStand(sql, p): Promise<{ quelleTimestamp: number; pipelineVersion: string } | null>`
  - `speichereSystematik(sql, runId, p, ergebnis: SystematikErgebnis, ablage: { uri: string; sha256: string; anfragen: number }): Promise<number>` (Anzahl Einträge)
  - `type SystematikErgebnisLauf = { parameter: SystematikParameter; runId: string; status: LaufStatus; anfragen: number; eintraege?: number; hinweis?: string }`
  - `ladeSystematikJahr(sql, p, opt: { trigger; gitSha; pipelineVersion; archiv: ArchivOptionen; abruf: ApiAbruf; neuLaden?: boolean; beende?: typeof beendeLauf }): Promise<SystematikErgebnisLauf>`
  - `formatiereSystematikBericht(ergebnisse): string` mit Spalten `Jahr | Konto | Sicht | Status | Codes | Anfragen | Hinweis`
  - `mainSystematik(argv, abh?: { sql?; heute?; ablageVerzeichnis?; abruf?; log? }): Promise<number>` mit Optionen `--jahre` (Standard `alle`), `--konten` (`beide` | `ausgaben` | `einnahmen`), `--sichten` (`beide` | `funktion` | `gruppierung`), `--neu-laden`

Verhalten exakt wie `ladeApiJahr` (Plan 2 inklusive der Fixwelle):
- Lauf mit Quelle `SRC_PORTAL_API` und Parametern `{ jahr, konto, sicht, neu_laden }`.
- 404 der Wurzel ergibt `skipped` mit „nicht verfügbar“. Gleicher Quellstand und gleiche `pipeline_version` ergeben `skipped` mit „unverändert“ (eine Anfrage). Sonst wird gecrawlt.
- Archiv `systematik_<sicht>_<jahr>_<konto>_<timestamp>_<sha16>.ndjson` (NDJSON aller Antworten in Abrufreihenfolge).
- Speichern atomar über `inTransaktion`.
- `ApiVertragsFehler` ergibt `quarantined`, andere Fehler `failed`. Abgesicherter Laufabschluss wie in Task 1.
- Die CLI nutzt eine gemeinsame `Drossel(500)` und läuft sequenziell über Jahr, Konto und Sicht. Exit-Code 1 bei `failed` oder `quarantined`.

- [ ] **Step 1: Failing Tests schreiben**

`lade-systematik.int.test.ts`: (a) Speichern eines Crawls aus `baueSystematikBaum({ jahr: 1999, konto: 'ausgaben', sicht: 'funktion' }, PLAN)`. Prüft `raw.api_systematik_abruf` und `raw.api_systematik` (`code`, `ebene`, `label`, `betrag_eur::text`) mit den erwarteten Werten aus `PLAN` von Task 2. (b) `letzterSystematikStand` liefert Timestamp und Version des letzten erfolgreichen Laufs und `null` für eine andere Sicht.

`systematik-ingest.int.test.ts`: dieselben sieben Fälle wie `api-ingest.int.test.ts`, jeweils mit `baueSystematikBaum`:
- vollständiges Laden mit Archiv
- unverändert mit genau einer Anfrage
- `neuLaden`
- andere `pipeline_version` lädt neu
- nicht verfügbar
- inkonsistente Summe ergibt Quarantäne ohne Zeilen
- Netzwerkfehler ergibt `failed`

`cli-systematik.int.test.ts`: (a) Jahr 2013 mit beiden Konten und beiden Sichten ergibt vier Läufe in der Reihenfolge ausgaben/funktion, ausgaben/gruppierung, einnahmen/funktion, einnahmen/gruppierung, Exit-Code 0. (b) Ungültige Option `--sichten alle` wirft `Unbekannte Sichten: alle`.

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test:int`
Expected: FAIL (Module fehlen)

- [ ] **Step 3: Implementierung**

Nach dem Muster von `db/lade-api.ts`, `api-ingest.ts`, `api-bericht.ts`, `cli-api.ts` und `bin-api.ts` mit den oben genannten Namen und Abweichungen. Den Bericht `formatiereSystematikBericht` in `cli-systematik.ts` ablegen. Zellen werden wie in `api-bericht.ts` tabellensicher gemacht; dafür die Hilfsfunktion `zelle` aus `api-bericht.ts` exportieren und wiederverwenden.

CLAUDE.md unter „Befehle“:
```markdown
- pnpm --filter @hb/ingest systematik --jahre alle     Bezeichnungen der Funktionen und Gruppierungen je Jahr (--konten, --sichten, --neu-laden)
```

- [ ] **Step 4: Tests ausführen**

Run: `pnpm typecheck && pnpm test && pnpm test:int`
Expected: alle PASS

- [ ] **Step 5: Echter Lauf für ein Jahr** (etwa 200 Anfragen)

Run: `pnpm --filter @hb/ingest systematik --jahre 2024`
Expected: vier Zeilen `succeeded`. Funktion Ausgaben mit mehr als 150 Codes, Gruppierung Ausgaben mit mehr als 100 Codes. Bei `quarantined` anhalten und den Hinweis vollständig melden.

- [ ] **Step 6: Commit**

```bash
git add packages/ingest CLAUDE.md
git commit -m "feat(ingest): Systematik-Ingest mit CLI"
```

---

### Task 5: dbt-Grundgerüst, Startskript und CI

**Files:**
- Create: `dbt/requirements.txt`, `dbt/dbt_project.yml`, `dbt/profiles.yml`, `dbt/macros/generate_schema_name.sql`, `dbt/macros/bereinige_text.sql`, `dbt/models/staging/quellen.yml`, `scripts/dbt.py`
- Modify: `package.json` (Script `"dbt": "python scripts/dbt.py"`), `.gitignore`, `.github/workflows/ci.yml`, `CLAUDE.md`

**Interfaces:**
- Produces: `pnpm dbt <befehl>` startet dbt gegen `DATABASE_URL` (Standard lokale Datenbank); Quellen `source('raw', …)` und `source('ops', 'load_run')`; Makros `bereinige_text(ausdruck)` und `generate_schema_name`

- [ ] **Step 1: Dateien anlegen**

`dbt/requirements.txt`:
```text
dbt-core==1.12.5
dbt-postgres==1.11.0
```

`dbt/dbt_project.yml`:
```yaml
name: haushaltsblick
version: '0.3.0'
config-version: 2
profile: haushaltsblick

model-paths: ['models']
macro-paths: ['macros']
test-paths: ['tests']
seed-paths: ['seeds']
target-path: target
clean-targets: ['target', 'logs']

vars:
  dq13_ab_jahr: 2012

models:
  haushaltsblick:
    staging:
      +schema: core
      +materialized: view
    core:
      +schema: core
      +materialized: table
    mart:
      +schema: mart
      +materialized: table

seeds:
  haushaltsblick:
    +schema: core

flags:
  send_anonymous_usage_stats: false
```

`dbt/profiles.yml`:
```yaml
haushaltsblick:
  target: standard
  outputs:
    standard:
      type: postgres
      host: "{{ env_var('HB_DB_HOST') }}"
      port: "{{ env_var('HB_DB_PORT') | as_number }}"
      user: "{{ env_var('HB_DB_USER') }}"
      password: "{{ env_var('HB_DB_PASSWORD') }}"
      dbname: "{{ env_var('HB_DB_NAME') }}"
      schema: core
      sslmode: "{{ env_var('HB_DB_SSLMODE') }}"
      threads: 4
```

`dbt/macros/generate_schema_name.sql`:
```sql
{# Schemas exakt wie konfiguriert (core, mart) statt <ziel>_<schema> #}
{% macro generate_schema_name(custom_schema_name, node) -%}
  {%- if custom_schema_name is none -%}{{ target.schema }}{%- else -%}{{ custom_schema_name | trim }}{%- endif -%}
{%- endmacro %}
```

`dbt/macros/bereinige_text.sql`:
```sql
{# Entfernt unsichtbare Zeichen, verbindet Silbentrennung am Zeilenende, vereinheitlicht Leerraum (Roadmap: Übertrag aus Plan 1) #}
{% macro bereinige_text(ausdruck) -%}
nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace({{ ausdruck }},
  '[­​‌‍⁠﻿]', '', 'g'),
  ' ', ' ', 'g'),
  '-[ \t]*\n\s*', '-', 'g'),
  '\s+', ' ', 'g')), '')
{%- endmacro %}
```

`dbt/models/staging/quellen.yml`:
```yaml
version: 2
sources:
  - name: raw
    schema: raw
    tables:
      - name: soll_titel
      - name: soll_kapitel
      - name: source_file
      - name: api_abruf
      - name: api_knoten
      - name: api_titel
      - name: api_systematik_abruf
      - name: api_systematik
  - name: ops
    schema: ops
    tables:
      - name: load_run
```

`scripts/dbt.py`:
```python
"""Startet dbt mit den Zugangsdaten aus DATABASE_URL (Standard: lokale Supabase-Datenbank)."""
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

LOKALE_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
WURZEL = Path(__file__).resolve().parent.parent


def umgebung(url: str) -> dict[str, str]:
    teile = urlparse(url)
    abfrage = parse_qs(teile.query)
    return {
        "HB_DB_HOST": teile.hostname or "127.0.0.1",
        "HB_DB_PORT": str(teile.port or 5432),
        "HB_DB_USER": unquote(teile.username or "postgres"),
        "HB_DB_PASSWORD": unquote(teile.password or ""),
        "HB_DB_NAME": teile.path.lstrip("/") or "postgres",
        "HB_DB_SSLMODE": abfrage.get("sslmode", ["disable"])[0],
    }


def dbt_programm() -> str:
    for kandidat in (WURZEL / ".venv" / "Scripts" / "dbt.exe", WURZEL / ".venv" / "bin" / "dbt"):
        if kandidat.exists():
            return str(kandidat)
    gefunden = shutil.which("dbt")
    if not gefunden:
        sys.exit("dbt nicht gefunden. Einrichten: uv venv .venv --python 3.13 && uv pip install --python .venv -r dbt/requirements.txt")
    return gefunden


if __name__ == "__main__":
    env = {**os.environ, **umgebung(os.environ.get("DATABASE_URL") or LOKALE_DB)}
    befehl = [dbt_programm(), *sys.argv[1:], "--project-dir", str(WURZEL / "dbt"), "--profiles-dir", str(WURZEL / "dbt")]
    sys.exit(subprocess.call(befehl, env=env))
```

`.gitignore` ergänzen:
```text
.venv/
dbt/target/
dbt/logs/
```

`package.json` (Wurzel), Script ergänzen: `"dbt": "python scripts/dbt.py"`.

- [ ] **Step 2: Lokal einrichten und prüfen**

```bash
uv venv .venv --python 3.13
uv pip install --python .venv -r dbt/requirements.txt
pnpm dbt debug
pnpm dbt parse
```
Expected: `dbt debug` meldet „All checks passed!“, `dbt parse` ohne Fehler.

- [ ] **Step 3: CI erweitern**

In `.github/workflows/ci.yml` nach `supabase migration up --local` und vor `pnpm test:int` einfügen:
```yaml
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: pip install -r dbt/requirements.txt
      - name: dbt Modelle leer bauen und Unit-Tests ausführen
        run: |
          pnpm dbt run --empty
          pnpm dbt test --select "test_type:unit"
```
Danach prüfen: `npx -y yaml@2.8.1 valid < .github/workflows/ci.yml` und actionlint wie in Plan 2 (`MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo" --workdir /repo rhysd/actionlint:1.7.7 -color`).

- [ ] **Step 4: CLAUDE.md**

Unter „Stack“ ergänzen: `dbt-core 1.12.5 mit dbt-postgres 1.11.0 (Python 3.13, lokal in .venv über uv)`. Unter „Befehle“:
```markdown
- uv venv .venv --python 3.13 && uv pip install --python .venv -r dbt/requirements.txt   dbt einrichten (einmalig)
- pnpm dbt build                 Modelle, Unit-Tests und DQ-Prüfungen gegen DATABASE_URL (Standard lokal)
- pnpm dbt test --select "test_type:unit"   nur dbt-Unit-Tests
```

- [ ] **Step 5: Commit**

```bash
git add dbt scripts package.json .gitignore .github/workflows/ci.yml CLAUDE.md
git commit -m "feat(dbt): Grundgerüst, Startskript und CI"
```

---

### Task 6: Staging-Modelle mit maßgeblichem Lauf und Textbereinigung

**Files:**
- Create: `dbt/models/staging/stg_soll_laeufe.sql`, `stg_soll_titel.sql`, `stg_soll_kapitel.sql`, `stg_api_laeufe.sql`, `stg_api_titel.sql`, `stg_api_knoten.sql`, `stg_systematik_laeufe.sql`, `stg_api_systematik.sql`, `dbt/models/staging/staging.yml` (Unit-Tests)

**Interfaces:**
- Produces (Views im Schema `core`):
  - `stg_soll_laeufe(run_id, jahr, started_at)`
  - `stg_soll_titel(jahr, konto, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text, anlage_zu_kapitel_nr, ist_anlage, ausgabeart_text, titelgruppe_nr, titelgruppe_text, titel_nr, titel_key, titel_text, flexibilisiert, fkt, seite, soll_eur, run_id)`
  - `stg_soll_kapitel(jahr, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text, anlage_zu_kapitel_nr, entfallen, anzahl_titel)`
  - `stg_api_laeufe(run_id, jahr, konto, quote, modify_date, started_at)`
  - `stg_api_titel(jahr, konto, quote, einzelplan_nr, kapitel_nr, titel_nr, titel_key, fkt, label, betrag_eur)`
  - `stg_api_knoten(jahr, konto, quote, ebene, knoten_id, label, betrag_eur)` (Label ohne führenden Code, bei `gesamt` unverändert bereinigt)
  - `stg_systematik_laeufe(run_id, jahr, konto, sicht)`
  - `stg_api_systematik(jahr, konto, sicht, code, ebene, label, betrag_eur)`

- [ ] **Step 1: Unit-Tests schreiben** (rot, solange die Modelle fehlen)

`dbt/models/staging/staging.yml`:
```yaml
version: 2

unit_tests:
  - name: soll_nimmt_letzten_erfolgreichen_netzlauf_je_jahr
    model: stg_soll_laeufe
    given:
      - input: source('raw', 'source_file')
        rows:
          - {run_id: '00000000-0000-0000-0000-000000000001', source_id: SRC_SOLL_XML, jahr: 2026, fetched_at: '2026-01-01 00:00:00+00'}
          - {run_id: '00000000-0000-0000-0000-000000000002', source_id: SRC_SOLL_XML, jahr: 2026, fetched_at: '2026-02-01 00:00:00+00'}
          - {run_id: '00000000-0000-0000-0000-000000000003', source_id: SRC_SOLL_XML, jahr: 2026, fetched_at: '2026-03-01 00:00:00+00'}
          - {run_id: '00000000-0000-0000-0000-000000000004', source_id: SRC_SOLL_XML, jahr: 2025, fetched_at: '2026-03-01 00:00:00+00'}
      - input: source('ops', 'load_run')
        rows:
          - {run_id: '00000000-0000-0000-0000-000000000001', status: succeeded, started_at: '2026-01-01 00:00:00+00', params: '{}'}
          - {run_id: '00000000-0000-0000-0000-000000000002', status: succeeded, started_at: '2026-02-01 00:00:00+00', params: '{"datei": "fixtures/x.xml"}'}
          - {run_id: '00000000-0000-0000-0000-000000000003', status: quarantined, started_at: '2026-03-01 00:00:00+00', params: '{}'}
          - {run_id: '00000000-0000-0000-0000-000000000004', status: succeeded, started_at: '2026-03-01 00:00:00+00', params: '{}'}
    expect:
      rows:
        - {jahr: 2025, run_id: '00000000-0000-0000-0000-000000000004'}
        - {jahr: 2026, run_id: '00000000-0000-0000-0000-000000000001'}

  - name: soll_titel_bereinigt_texte
    model: stg_soll_titel
    given:
      - input: ref('stg_soll_laeufe')
        rows:
          - {run_id: '00000000-0000-0000-0000-000000000001', jahr: 2023}
      - input: source('raw', 'soll_titel')
        rows:
          - {run_id: '00000000-0000-0000-0000-000000000001', jahr: 2023, konto: ausgaben, titel_key: '091171121', titel_nr: '71121', titel_text: "Kleine Neu-﻿, Um- und Erweiterungsbauten", soll_eur: 1000.00}
          - {run_id: '00000000-0000-0000-0000-000000000001', jahr: 2023, konto: ausgaben, titel_key: '090366122', titel_nr: '66122', titel_text: "Zuschüsse an die KfW-\nBankengruppe für\nenergetische  Sanierung", soll_eur: 0.00}
          - {run_id: '00000000-0000-0000-0000-000000000001', jahr: 2023, konto: einnahmen, titel_key: '010138103', titel_nr: '38103', titel_text: "gemäß § 61 BHO", anlage_zu_kapitel_nr: '6002', soll_eur: 0.00}
          - {run_id: '00000000-0000-0000-0000-000000000099', jahr: 2023, konto: ausgaben, titel_key: '099999999', titel_nr: '99999', titel_text: 'anderer Lauf', soll_eur: 1.00}
    expect:
      rows:
        - {titel_key: '091171121', titel_text: 'Kleine Neu-, Um- und Erweiterungsbauten', ist_anlage: false}
        - {titel_key: '090366122', titel_text: 'Zuschüsse an die KfW-Bankengruppe für energetische Sanierung', ist_anlage: false}
        - {titel_key: '010138103', titel_text: 'gemäß § 61 BHO', ist_anlage: true}

  - name: api_nimmt_letzten_erfolgreichen_lauf_je_jahr_konto_quote
    model: stg_api_laeufe
    given:
      - input: source('raw', 'api_abruf')
        rows:
          - {run_id: '00000000-0000-0000-0000-000000000011', jahr: 2024, konto: ausgaben, quote: ist, quelle_timestamp: 1, modify_date: '01.01.2025'}
          - {run_id: '00000000-0000-0000-0000-000000000012', jahr: 2024, konto: ausgaben, quote: ist, quelle_timestamp: 2, modify_date: '01.02.2025'}
          - {run_id: '00000000-0000-0000-0000-000000000013', jahr: 2024, konto: ausgaben, quote: soll, quelle_timestamp: 3, modify_date: '01.03.2025'}
      - input: source('ops', 'load_run')
        rows:
          - {run_id: '00000000-0000-0000-0000-000000000011', status: succeeded, started_at: '2026-01-01 00:00:00+00'}
          - {run_id: '00000000-0000-0000-0000-000000000012', status: succeeded, started_at: '2026-02-01 00:00:00+00'}
          - {run_id: '00000000-0000-0000-0000-000000000013', status: failed, started_at: '2026-03-01 00:00:00+00'}
    expect:
      rows:
        - {jahr: 2024, konto: ausgaben, quote: ist, run_id: '00000000-0000-0000-0000-000000000012'}

  - name: api_knoten_ohne_codepraefix
    model: stg_api_knoten
    given:
      - input: ref('stg_api_laeufe')
        rows:
          - {run_id: '00000000-0000-0000-0000-000000000012', jahr: 2024, konto: ausgaben, quote: ist}
      - input: source('raw', 'api_knoten')
        rows:
          - {run_id: '00000000-0000-0000-0000-000000000012', jahr: 2024, konto: ausgaben, quote: ist, ebene: gesamt, knoten_id: '', label: 'Istwerte des Haushaltsjahres 2024', betrag_eur: 5.00}
          - {run_id: '00000000-0000-0000-0000-000000000012', jahr: 2024, konto: ausgaben, quote: ist, ebene: einzelplan, knoten_id: '04', label: '04 Bundeskanzler und Bundeskanzleramt', betrag_eur: 5.00}
    expect:
      rows:
        - {ebene: gesamt, label: 'Istwerte des Haushaltsjahres 2024'}
        - {ebene: einzelplan, label: 'Bundeskanzler und Bundeskanzleramt'}
```

- [ ] **Step 2: Unit-Tests ausführen und Fehlschlag prüfen**

Run: `pnpm dbt test --select "test_type:unit"`
Expected: Fehler, weil die Modelle fehlen („depends on a node named … which was not found“ o. ä.)

- [ ] **Step 3: Modelle schreiben**

`stg_soll_laeufe.sql`:
```sql
-- Maßgeblicher XML-Lauf je Jahr: letzter erfolgreicher Netzlauf (keine Testläufe aus lokalen Dateien)
select distinct on (f.jahr) f.run_id, f.jahr, l.started_at
from {{ source('raw', 'source_file') }} f
join {{ source('ops', 'load_run') }} l on l.run_id = f.run_id
where f.source_id = 'SRC_SOLL_XML' and l.status = 'succeeded' and l.params ->> 'datei' is null
order by f.jahr, l.started_at desc, f.fetched_at desc
```

`stg_soll_titel.sql`:
```sql
select
  t.jahr,
  t.konto,
  t.einzelplan_nr,
  {{ bereinige_text('t.einzelplan_text') }} as einzelplan_text,
  t.kapitel_nr,
  {{ bereinige_text('t.kapitel_text') }} as kapitel_text,
  t.anlage_zu_kapitel_nr,
  t.anlage_zu_kapitel_nr is not null as ist_anlage,
  {{ bereinige_text('t.ausgabeart_text') }} as ausgabeart_text,
  t.titelgruppe_nr,
  {{ bereinige_text('t.titelgruppe_text') }} as titelgruppe_text,
  t.titel_nr,
  t.titel_key,
  {{ bereinige_text('t.titel_text') }} as titel_text,
  t.flexibilisiert,
  t.fkt,
  t.seite,
  t.soll_eur,
  t.run_id
from {{ source('raw', 'soll_titel') }} t
join {{ ref('stg_soll_laeufe') }} l on l.run_id = t.run_id
```

`stg_soll_kapitel.sql`:
```sql
select
  k.jahr,
  k.einzelplan_nr,
  {{ bereinige_text('k.einzelplan_text') }} as einzelplan_text,
  k.kapitel_nr,
  {{ bereinige_text('k.kapitel_text') }} as kapitel_text,
  k.anlage_zu_kapitel_nr,
  k.entfallen,
  k.anzahl_titel
from {{ source('raw', 'soll_kapitel') }} k
join {{ ref('stg_soll_laeufe') }} l on l.run_id = k.run_id
```

`stg_api_laeufe.sql`:
```sql
-- Maßgeblicher API-Lauf je Jahr, Konto und Quote
select distinct on (a.jahr, a.konto, a.quote) a.run_id, a.jahr, a.konto, a.quote, a.modify_date, l.started_at
from {{ source('raw', 'api_abruf') }} a
join {{ source('ops', 'load_run') }} l on l.run_id = a.run_id
where l.status = 'succeeded'
order by a.jahr, a.konto, a.quote, l.started_at desc, a.quelle_timestamp desc
```

`stg_api_titel.sql`:
```sql
select t.jahr, t.konto, t.quote, t.einzelplan_nr, t.kapitel_nr, t.titel_nr, t.titel_key, t.fkt,
       {{ bereinige_text('t.label') }} as label, t.betrag_eur
from {{ source('raw', 'api_titel') }} t
join {{ ref('stg_api_laeufe') }} l on l.run_id = t.run_id
```

`stg_api_knoten.sql`:
```sql
select k.jahr, k.konto, k.quote, k.ebene, k.knoten_id,
       case when k.ebene = 'gesamt' then {{ bereinige_text('k.label') }}
            else {{ bereinige_text("regexp_replace(k.label, '^\\d+\\s+', '')") }} end as label,
       k.betrag_eur
from {{ source('raw', 'api_knoten') }} k
join {{ ref('stg_api_laeufe') }} l on l.run_id = k.run_id
```

`stg_systematik_laeufe.sql`:
```sql
select distinct on (s.jahr, s.konto, s.sicht) s.run_id, s.jahr, s.konto, s.sicht
from {{ source('raw', 'api_systematik_abruf') }} s
join {{ source('ops', 'load_run') }} l on l.run_id = s.run_id
where l.status = 'succeeded'
order by s.jahr, s.konto, s.sicht, l.started_at desc, s.quelle_timestamp desc
```

`stg_api_systematik.sql`:
```sql
select s.jahr, s.konto, s.sicht, s.code, s.ebene, {{ bereinige_text('s.label') }} as label, s.betrag_eur
from {{ source('raw', 'api_systematik') }} s
join {{ ref('stg_systematik_laeufe') }} l on l.run_id = s.run_id
```

Hinweis zum Escaping: Im Jinja-Ausdruck in `stg_api_knoten.sql` müssen im kompilierten SQL `'^\d+\s+'` stehen. Mit `pnpm dbt compile --select stg_api_knoten` prüfen und das Escaping bei Bedarf anpassen.

- [ ] **Step 4: Bauen und Unit-Tests ausführen**

Run: `pnpm dbt run --select staging && pnpm dbt test --select "test_type:unit"`
Expected: Views gebaut, alle vier Unit-Tests PASS

- [ ] **Step 5: Commit**

```bash
git add dbt/models/staging
git commit -m "feat(dbt): Staging mit maßgeblichem Lauf und Textbereinigung"
```

---

### Task 7: Core-Modelle (Dimensionen, Haushaltsstand, Beträge)

**Files:**
- Create: `dbt/models/core/dim_einzelplan.sql`, `dim_kapitel.sql`, `dim_titel.sql`, `dim_funktion.sql`, `dim_gruppierung.sql`, `dim_haushaltsstand.sql`, `dim_verfuegbarkeit.sql`, `fct_betrag.sql`, `dbt/models/core/core.yml` (Unit-Tests)

**Interfaces:**
- Consumes: Staging aus Task 6
- Produces (Tabellen im Schema `core`):
  - `dim_einzelplan(jahr, einzelplan_nr, einzelplan_text)`
  - `dim_kapitel(jahr, kapitel_nr, einzelplan_nr, kapitel_text)`
  - `dim_titel(jahr, konto, titel_key, einzelplan_nr, kapitel_nr, titel_nr, titel_text, titelgruppe_nr, titelgruppe_text, ausgabeart_text, flexibilisiert, seite, fkt, im_haushaltsplan_xml)` (ohne Anlagen)
  - `dim_funktion(jahr, fkt, funktion_text, funktion_text_jahr, oberfunktion, oberfunktion_text, hauptfunktion, hauptfunktion_text)`
  - `dim_gruppierung(jahr, gruppierung_nr, gruppierung_text, gruppierung_text_jahr, obergruppe, obergruppe_text, hauptgruppe, hauptgruppe_text)`
  - `dim_haushaltsstand(jahr, konto, stand_text, stand, anzahl_nachtraege, soll_api_eur, soll_xml_eur, differenz_xml_api_eur)`
  - `dim_verfuegbarkeit(jahr, konto, soll_api_geladen, ist_geladen, xml_geladen)`
  - `fct_betrag(jahr, konto, titel_key, wertart, betrag_eur, source_id)` mit `wertart` ∈ {`soll`, `ist`, `soll_xml`}

Regeln:
- Bezeichnungen von Einzelplan, Kapitel und Titel kommen aus dem maßgeblichen Soll-Stand der API (Soll vor Ist), sonst aus der XML.
- Titelgruppe, Ausgabeart, Flexibilisierung und Seite kommen nur aus der XML.
- Funktionen und Gruppierungen nutzen die Bezeichnung des nächstgelegenen Jahres, wenn das eigene Jahr keine hat (bei Gleichstand das spätere Jahr). `*_text_jahr` weist das Herkunftsjahr aus.
- `stand`: `Regierungsentwurf`, wenn das Label „entwurf“ enthält; `Gesetz inkl. Nachtragshaushalt` bei „nachtragshaushalt“; sonst `Gesetz`; ohne API-Soll `nur Haushaltsplan-XML`. `anzahl_nachtraege` ist die höchste genannte Nummer „N. Nachtrag“, sonst 0.

- [ ] **Step 1: Unit-Tests schreiben**

`dbt/models/core/core.yml`:
```yaml
version: 2

unit_tests:
  - name: haushaltsstand_aus_label
    model: dim_haushaltsstand
    given:
      - input: ref('stg_api_knoten')
        rows:
          - {jahr: 2020, konto: ausgaben, quote: soll, ebene: gesamt, label: 'Sollwerte des Haushaltsjahres 2020, inkl. 1. und 2. Nachtragshaushalt', betrag_eur: 508530000000.00}
          - {jahr: 2024, konto: ausgaben, quote: soll, ebene: gesamt, label: 'Sollwerte des Haushaltsjahres 2024', betrag_eur: 476807656000.00}
          - {jahr: 2027, konto: ausgaben, quote: soll, ebene: gesamt, label: 'Regierungsentwurf 2027', betrag_eur: 555435744000.00}
          - {jahr: 2024, konto: ausgaben, quote: ist, ebene: gesamt, label: 'Istwerte des Haushaltsjahres 2024', betrag_eur: 474753727609.58}
      - input: ref('stg_soll_titel')
        rows:
          - {jahr: 2020, konto: ausgaben, ist_anlage: false, soll_eur: 362000000000.00}
          - {jahr: 2024, konto: ausgaben, ist_anlage: false, soll_eur: 476807656000.00}
          - {jahr: 2024, konto: ausgaben, ist_anlage: true, soll_eur: 1.00}
          - {jahr: 2019, konto: ausgaben, ist_anlage: false, soll_eur: 356400000000.00}
    expect:
      rows:
        - {jahr: 2019, konto: ausgaben, stand: 'nur Haushaltsplan-XML', anzahl_nachtraege: 0, differenz_xml_api_eur: null}
        - {jahr: 2020, konto: ausgaben, stand: 'Gesetz inkl. Nachtragshaushalt', anzahl_nachtraege: 2, differenz_xml_api_eur: -146530000000.00}
        - {jahr: 2024, konto: ausgaben, stand: 'Gesetz', anzahl_nachtraege: 0, differenz_xml_api_eur: 0.00}
        - {jahr: 2027, konto: ausgaben, stand: 'Regierungsentwurf', anzahl_nachtraege: 0, differenz_xml_api_eur: null}

  - name: funktion_nutzt_naechstgelegenes_jahr
    model: dim_funktion
    given:
      - input: ref('stg_api_systematik')
        rows:
          - {jahr: 2024, konto: ausgaben, sicht: funktion, code: '3', ebene: 1, label: 'Gesundheit, Umwelt, Sport und Erholung'}
          - {jahr: 2024, konto: ausgaben, sicht: funktion, code: '32', ebene: 2, label: 'Sport und Erholung'}
          - {jahr: 2024, konto: ausgaben, sicht: funktion, code: '322', ebene: 3, label: 'Sport'}
          - {jahr: 2024, konto: ausgaben, sicht: gruppierung, code: '322', ebene: 3, label: 'falsche Sicht'}
      - input: ref('dim_titel')
        rows:
          - {jahr: 2024, konto: ausgaben, titel_key: '041668421', fkt: '322'}
          - {jahr: 2012, konto: ausgaben, titel_key: '060168421', fkt: '322'}
    expect:
      rows:
        - {jahr: 2012, fkt: '322', funktion_text: 'Sport', funktion_text_jahr: 2024, oberfunktion: '32', oberfunktion_text: 'Sport und Erholung', hauptfunktion: '3'}
        - {jahr: 2024, fkt: '322', funktion_text: 'Sport', funktion_text_jahr: 2024, oberfunktion: '32', oberfunktion_text: 'Sport und Erholung', hauptfunktion: '3'}

  - name: titel_vereint_xml_und_api
    model: dim_titel
    given:
      - input: ref('stg_soll_titel')
        rows:
          - {jahr: 2024, konto: ausgaben, titel_key: '041143257', einzelplan_nr: '04', kapitel_nr: '0411', titel_nr: '43257', titel_text: 'Versorgungsbezüge (XML)', titelgruppe_nr: '57', flexibilisiert: false, fkt: '018', seite: 12, ist_anlage: false}
          - {jahr: 2024, konto: ausgaben, titel_key: '609268309', einzelplan_nr: '60', kapitel_nr: '6092', titel_nr: '68309', titel_text: 'Anlage', fkt: '643', ist_anlage: true}
      - input: ref('stg_api_titel')
        rows:
          - {jahr: 2024, konto: ausgaben, quote: soll, titel_key: '041143257', einzelplan_nr: '04', kapitel_nr: '0411', titel_nr: '43257', fkt: '018', label: 'Versorgungsbezüge'}
          - {jahr: 2024, konto: ausgaben, quote: ist, titel_key: '041198101', einzelplan_nr: '04', kapitel_nr: '0411', titel_nr: '98101', fkt: '890', label: 'Nur im Ist'}
    expect:
      rows:
        - {titel_key: '041143257', titel_text: 'Versorgungsbezüge', titelgruppe_nr: '57', seite: 12, im_haushaltsplan_xml: true}
        - {titel_key: '041198101', titel_text: 'Nur im Ist', titelgruppe_nr: null, seite: null, im_haushaltsplan_xml: false}
```

- [ ] **Step 2: Unit-Tests ausführen und Fehlschlag prüfen**

Run: `pnpm dbt test --select "test_type:unit"`
Expected: Fehler, weil Core-Modelle fehlen

- [ ] **Step 3: Modelle schreiben**

`dim_einzelplan.sql`:
```sql
with api as (
  select distinct on (jahr, knoten_id) jahr, knoten_id as einzelplan_nr, label
  from {{ ref('stg_api_knoten') }}
  where ebene = 'einzelplan'
  order by jahr, knoten_id, quote desc  -- soll vor ist
),
xml as (
  select distinct on (jahr, einzelplan_nr) jahr, einzelplan_nr, einzelplan_text
  from {{ ref('stg_soll_kapitel') }}
  where anlage_zu_kapitel_nr is null
  order by jahr, einzelplan_nr
)
select coalesce(a.jahr, x.jahr) as jahr,
       coalesce(a.einzelplan_nr, x.einzelplan_nr) as einzelplan_nr,
       coalesce(a.label, x.einzelplan_text) as einzelplan_text
from api a
full join xml x on x.jahr = a.jahr and x.einzelplan_nr = a.einzelplan_nr
```

`dim_kapitel.sql`:
```sql
with api as (
  select distinct on (jahr, knoten_id) jahr, knoten_id as kapitel_nr, label
  from {{ ref('stg_api_knoten') }}
  where ebene = 'kapitel'
  order by jahr, knoten_id, quote desc
),
xml as (
  select jahr, kapitel_nr, kapitel_text
  from {{ ref('stg_soll_kapitel') }}
  where anlage_zu_kapitel_nr is null
)
select coalesce(a.jahr, x.jahr) as jahr,
       coalesce(a.kapitel_nr, x.kapitel_nr) as kapitel_nr,
       left(coalesce(a.kapitel_nr, x.kapitel_nr), 2) as einzelplan_nr,
       coalesce(a.label, x.kapitel_text) as kapitel_text
from api a
full join xml x on x.jahr = a.jahr and x.kapitel_nr = a.kapitel_nr
```

`dim_titel.sql`:
```sql
with xml as (
  select * from {{ ref('stg_soll_titel') }} where not ist_anlage
),
api as (
  select jahr, konto, titel_key,
         min(einzelplan_nr) as einzelplan_nr,
         min(kapitel_nr) as kapitel_nr,
         min(titel_nr) as titel_nr,
         (array_agg(fkt order by quote desc))[1] as fkt,
         (array_agg(label order by quote desc))[1] as label
  from {{ ref('stg_api_titel') }}
  group by jahr, konto, titel_key
),
schluessel as (
  select jahr, konto, titel_key from xml
  union
  select jahr, konto, titel_key from api
)
select
  s.jahr,
  s.konto,
  s.titel_key,
  coalesce(a.einzelplan_nr, x.einzelplan_nr) as einzelplan_nr,
  coalesce(a.kapitel_nr, x.kapitel_nr) as kapitel_nr,
  coalesce(a.titel_nr, x.titel_nr) as titel_nr,
  coalesce(a.label, x.titel_text) as titel_text,
  x.titelgruppe_nr,
  x.titelgruppe_text,
  x.ausgabeart_text,
  x.flexibilisiert,
  x.seite,
  coalesce(a.fkt, x.fkt) as fkt,
  x.titel_key is not null as im_haushaltsplan_xml
from schluessel s
left join xml x on x.jahr = s.jahr and x.konto = s.konto and x.titel_key = s.titel_key
left join api a on a.jahr = s.jahr and a.konto = s.konto and a.titel_key = s.titel_key
```

`dim_funktion.sql`:
```sql
with je_code as (
  select distinct on (jahr, code) jahr, code, label
  from {{ ref('stg_api_systematik') }}
  where sicht = 'funktion'
  order by jahr, code, konto
),
bedarf as (
  select distinct jahr, fkt from {{ ref('dim_titel') }} where fkt is not null
)
select
  b.jahr,
  b.fkt,
  f.label as funktion_text,
  f.jahr as funktion_text_jahr,
  left(b.fkt, 2) as oberfunktion,
  o.label as oberfunktion_text,
  left(b.fkt, 1) as hauptfunktion,
  h.label as hauptfunktion_text
from bedarf b
left join lateral (
  select jahr, label from je_code where code = b.fkt order by abs(jahr - b.jahr), jahr desc limit 1
) f on true
left join lateral (
  select label from je_code where code = left(b.fkt, 2) order by abs(jahr - b.jahr), jahr desc limit 1
) o on true
left join lateral (
  select label from je_code where code = left(b.fkt, 1) order by abs(jahr - b.jahr), jahr desc limit 1
) h on true
```

`dim_gruppierung.sql`: wie `dim_funktion.sql`, mit `sicht = 'gruppierung'`, `bedarf` = `select distinct jahr, left(titel_nr, 3) as gruppierung_nr from dim_titel where titel_nr is not null` und den Spalten `gruppierung_nr`, `gruppierung_text`, `gruppierung_text_jahr`, `obergruppe` (`left(…, 2)`), `obergruppe_text`, `hauptgruppe` (`left(…, 1)`), `hauptgruppe_text`.

`dim_haushaltsstand.sql`:
```sql
with api as (
  select jahr, konto, label, betrag_eur
  from {{ ref('stg_api_knoten') }}
  where ebene = 'gesamt' and quote = 'soll'
),
xml as (
  select jahr, konto, sum(soll_eur) as betrag_eur
  from {{ ref('stg_soll_titel') }}
  where not ist_anlage
  group by jahr, konto
),
schluessel as (
  select jahr, konto from api union select jahr, konto from xml
)
select
  s.jahr,
  s.konto,
  a.label as stand_text,
  case
    when a.label is null then 'nur Haushaltsplan-XML'
    when a.label ilike '%entwurf%' then 'Regierungsentwurf'
    when a.label ilike '%nachtragshaushalt%' then 'Gesetz inkl. Nachtragshaushalt'
    else 'Gesetz'
  end as stand,
  coalesce((select max(m[1]::int) from regexp_matches(coalesce(a.label, ''), '(\d+)\. Nachtrag', 'g') as m), 0) as anzahl_nachtraege,
  a.betrag_eur as soll_api_eur,
  x.betrag_eur as soll_xml_eur,
  (x.betrag_eur - a.betrag_eur)::numeric(18,2) as differenz_xml_api_eur
from schluessel s
left join api a on a.jahr = s.jahr and a.konto = s.konto
left join xml x on x.jahr = s.jahr and x.konto = s.konto
```
Achtung: Das Label „inkl. 1. und 2. Nachtragshaushalt“ enthält „2. Nachtrag“ direkt, aber nicht „1. Nachtrag“. Deshalb sucht das Muster `(\d+)\. Nachtrag` nur die Nummer direkt vor „Nachtrag“; das Ergebnis ist 2 wie im Unit-Test erwartet.

`dim_verfuegbarkeit.sql`:
```sql
select
  t.jahr,
  t.konto,
  exists (select 1 from {{ ref('stg_api_laeufe') }} l where l.jahr = t.jahr and l.konto = t.konto and l.quote = 'soll') as soll_api_geladen,
  exists (select 1 from {{ ref('stg_api_laeufe') }} l where l.jahr = t.jahr and l.konto = t.konto and l.quote = 'ist') as ist_geladen,
  exists (select 1 from {{ ref('stg_soll_laeufe') }} l where l.jahr = t.jahr) as xml_geladen
from (select distinct jahr, konto from {{ ref('dim_titel') }}) t
```

`fct_betrag.sql`:
```sql
select jahr, konto, titel_key, quote as wertart, betrag_eur, 'SRC_PORTAL_API' as source_id
from {{ ref('stg_api_titel') }}
union all
select jahr, konto, titel_key, 'soll_xml' as wertart, soll_eur as betrag_eur, 'SRC_SOLL_XML' as source_id
from {{ ref('stg_soll_titel') }}
where not ist_anlage
```

- [ ] **Step 4: Bauen und Unit-Tests ausführen**

Run: `pnpm dbt run --select staging core && pnpm dbt test --select "test_type:unit"`
Expected: alle Modelle gebaut, alle Unit-Tests PASS

- [ ] **Step 5: Commit**

```bash
git add dbt/models/core
git commit -m "feat(dbt): Core-Dimensionen, Haushaltsstand und Beträge"
```

---

### Task 8: Mart-Modelle

**Files:**
- Create: `dbt/models/mart/fct_titel_jahr.sql`, `agg_einzelplan_jahr.sql`, `agg_funktion_jahr.sql`, `agg_gruppierung_jahr.sql`, `anlage_titel_jahr.sql`, `dbt/models/mart/mart.yml` (Unit-Tests)

**Interfaces:**
- Consumes: Core aus Task 7
- Produces (Tabellen im Schema `mart`):
  - `fct_titel_jahr` mit exakt den 36 Spalten von `mart.fct_titel_jahr_hist` (ohne `gueltig_*`), in derselben Reihenfolge
  - `agg_einzelplan_jahr(jahr, konto, einzelplan_nr, einzelplan_text, anzahl_titel, soll_eur, soll_xml_eur, ist_eur, anteil_soll)`
  - `agg_funktion_jahr(jahr, konto, hauptfunktion, hauptfunktion_text, oberfunktion, oberfunktion_text, fkt, funktion_text, soll_eur, ist_eur)`
  - `agg_gruppierung_jahr(jahr, konto, hauptgruppe, hauptgruppe_text, obergruppe, obergruppe_text, gruppierung_nr, gruppierung_text, soll_eur, ist_eur)`
  - `anlage_titel_jahr(jahr, konto, anlage_zu_kapitel_nr, kapitel_nr, kapitel_text, titel_key, titel_text, fkt, soll_eur)`

- [ ] **Step 1: Unit-Tests schreiben**

`dbt/models/mart/mart.yml`:
```yaml
version: 2

unit_tests:
  - name: titel_jahr_soll_ist_und_verfuegbarkeit
    model: fct_titel_jahr
    given:
      - input: ref('dim_titel')
        rows:
          - {jahr: 2024, konto: ausgaben, titel_key: '041143257', einzelplan_nr: '04', kapitel_nr: '0411', titel_nr: '43257', titel_text: 'Versorgungsbezüge', fkt: '018', im_haushaltsplan_xml: true}
          - {jahr: 2024, konto: ausgaben, titel_key: '041197201', einzelplan_nr: '04', kapitel_nr: '0411', titel_nr: '97201', titel_text: 'GMA', fkt: '880', im_haushaltsplan_xml: true}
          - {jahr: 2020, konto: ausgaben, titel_key: '060168421', einzelplan_nr: '06', kapitel_nr: '0601', titel_nr: '68421', titel_text: 'Sport', fkt: '322', im_haushaltsplan_xml: true}
      - input: ref('dim_verfuegbarkeit')
        rows:
          - {jahr: 2024, konto: ausgaben, soll_api_geladen: true, ist_geladen: true, xml_geladen: true}
          - {jahr: 2020, konto: ausgaben, soll_api_geladen: false, ist_geladen: false, xml_geladen: true}
      - input: ref('fct_betrag')
        rows:
          - {jahr: 2024, konto: ausgaben, titel_key: '041143257', wertart: soll, betrag_eur: 54926000.00}
          - {jahr: 2024, konto: ausgaben, titel_key: '041143257', wertart: ist, betrag_eur: 61346498.79}
          - {jahr: 2024, konto: ausgaben, titel_key: '041143257', wertart: soll_xml, betrag_eur: 54926000.00}
          - {jahr: 2024, konto: ausgaben, titel_key: '041197201', wertart: soll_xml, betrag_eur: -168000.00}
          - {jahr: 2020, konto: ausgaben, titel_key: '060168421', wertart: soll_xml, betrag_eur: 1000.00}
      - input: ref('dim_einzelplan')
        rows: []
      - input: ref('dim_kapitel')
        rows: []
      - input: ref('dim_funktion')
        rows: []
      - input: ref('dim_gruppierung')
        rows: []
      - input: ref('dim_haushaltsstand')
        rows:
          - {jahr: 2024, konto: ausgaben, stand: Gesetz}
    expect:
      rows:
        - {titel_key: '041143257', soll_eur: 54926000.00, soll_quelle: api, ist_eur: 61346498.79, ist_verfuegbar: true, abweichung_eur: 6420498.79, gruppierung_nr: '432', hauptgruppe: '4', haushaltsstand: Gesetz}
        - {titel_key: '041197201', soll_eur: 0.00, soll_quelle: api, soll_xml_eur: -168000.00, ist_eur: 0.00, ist_verfuegbar: true, abweichung_eur: 0.00, haushaltsstand: Gesetz}
        - {titel_key: '060168421', soll_eur: 1000.00, soll_quelle: xml, ist_eur: null, ist_verfuegbar: false, abweichung_eur: null, gruppierung_nr: '684', haushaltsstand: null}
```

- [ ] **Step 2: Unit-Tests ausführen und Fehlschlag prüfen**

Run: `pnpm dbt test --select "test_type:unit"`
Expected: Fehler, weil `fct_titel_jahr` fehlt

- [ ] **Step 3: Modelle schreiben**

`fct_titel_jahr.sql`:
```sql
-- Ein Titel je Jahr und Konto mit maßgeblichem Soll (API, sonst XML), XML-Soll und Ist (Roadmap E14).
-- Spalten und Reihenfolge entsprechen mart.fct_titel_jahr_hist (Migration 20261010120000).
with betraege as (
  select jahr, konto, titel_key,
         sum(betrag_eur) filter (where wertart = 'soll') as soll_api,
         sum(betrag_eur) filter (where wertart = 'soll_xml') as soll_xml,
         sum(betrag_eur) filter (where wertart = 'ist') as ist
  from {{ ref('fct_betrag') }}
  group by jahr, konto, titel_key
),
werte as (
  select
    t.*,
    case when v.soll_api_geladen then coalesce(b.soll_api, 0) else b.soll_xml end::numeric(18,2) as soll_eur,
    case when v.soll_api_geladen then 'api' else 'xml' end as soll_quelle,
    b.soll_xml::numeric(18,2) as soll_xml_eur,
    case when v.ist_geladen then coalesce(b.ist, 0) end::numeric(18,2) as ist_eur,
    v.ist_geladen as ist_verfuegbar
  from {{ ref('dim_titel') }} t
  join {{ ref('dim_verfuegbarkeit') }} v on v.jahr = t.jahr and v.konto = t.konto
  left join betraege b on b.jahr = t.jahr and b.konto = t.konto and b.titel_key = t.titel_key
),
zeilen as (
  select
    w.jahr, w.konto, w.titel_key,
    w.einzelplan_nr, e.einzelplan_text,
    w.kapitel_nr, k.kapitel_text,
    w.titel_nr, w.titel_text,
    w.titelgruppe_nr, w.titelgruppe_text, w.ausgabeart_text, w.flexibilisiert, w.seite,
    w.fkt, f.funktion_text, left(w.fkt, 2) as oberfunktion, f.oberfunktion_text, left(w.fkt, 1) as hauptfunktion, f.hauptfunktion_text,
    left(w.titel_nr, 3) as gruppierung_nr, g.gruppierung_text, left(w.titel_nr, 2) as obergruppe, g.obergruppe_text,
    left(w.titel_nr, 1) as hauptgruppe, g.hauptgruppe_text,
    w.soll_eur, w.soll_quelle, w.soll_xml_eur, w.ist_eur, w.ist_verfuegbar,
    (w.ist_eur - w.soll_eur)::numeric(18,2) as abweichung_eur,
    round(w.ist_eur / nullif(w.soll_eur, 0), 6) as ist_quote,
    h.stand as haushaltsstand,
    w.im_haushaltsplan_xml
  from werte w
  left join {{ ref('dim_einzelplan') }} e on e.jahr = w.jahr and e.einzelplan_nr = w.einzelplan_nr
  left join {{ ref('dim_kapitel') }} k on k.jahr = w.jahr and k.kapitel_nr = w.kapitel_nr
  left join {{ ref('dim_funktion') }} f on f.jahr = w.jahr and f.fkt = w.fkt
  left join {{ ref('dim_gruppierung') }} g on g.jahr = w.jahr and g.gruppierung_nr = left(w.titel_nr, 3)
  left join {{ ref('dim_haushaltsstand') }} h on h.jahr = w.jahr and h.konto = w.konto
)
select z.*, md5(z::text) as zeilen_hash
from zeilen z
```

`agg_einzelplan_jahr.sql`:
```sql
select
  jahr, konto, einzelplan_nr, max(einzelplan_text) as einzelplan_text,
  count(*) as anzahl_titel,
  sum(soll_eur)::numeric(18,2) as soll_eur,
  sum(soll_xml_eur)::numeric(18,2) as soll_xml_eur,
  sum(ist_eur)::numeric(18,2) as ist_eur,
  round(sum(soll_eur) / nullif(sum(sum(soll_eur)) over (partition by jahr, konto), 0), 6) as anteil_soll
from {{ ref('fct_titel_jahr') }}
group by jahr, konto, einzelplan_nr
```

`agg_funktion_jahr.sql`:
```sql
select
  jahr, konto, hauptfunktion, max(hauptfunktion_text) as hauptfunktion_text,
  oberfunktion, max(oberfunktion_text) as oberfunktion_text,
  fkt, max(funktion_text) as funktion_text,
  sum(soll_eur)::numeric(18,2) as soll_eur,
  sum(ist_eur)::numeric(18,2) as ist_eur
from {{ ref('fct_titel_jahr') }}
group by jahr, konto, hauptfunktion, oberfunktion, fkt
```

`agg_gruppierung_jahr.sql`: wie `agg_funktion_jahr.sql` mit `hauptgruppe`, `obergruppe`, `gruppierung_nr` und den zugehörigen Texten.

`anlage_titel_jahr.sql`:
```sql
-- Wirtschaftspläne von Sondervermögen (Roadmap E1): nie Teil des Gesamthaushalts
select jahr, konto, anlage_zu_kapitel_nr, kapitel_nr, kapitel_text, titel_key, titel_text, fkt, soll_eur
from {{ ref('stg_soll_titel') }}
where ist_anlage
```

- [ ] **Step 4: Bauen, Unit-Tests und Spaltenabgleich**

Run: `pnpm dbt run && pnpm dbt test --select "test_type:unit"`
Expected: alle Modelle gebaut, alle Unit-Tests PASS.

Spaltenabgleich mit der Historie:
```bash
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -tAc "
select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='mart' and table_name='fct_titel_jahr'
union all
select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema='mart' and table_name='fct_titel_jahr_hist' and column_name not like 'gueltig_%';"
```
Expected: beide Zeilen identisch.

- [ ] **Step 5: Commit**

```bash
git add dbt/models/mart
git commit -m "feat(dbt): Mart mit Titel je Jahr, Aggregaten und Anlagen"
```

---

### Task 9: Qualitätsprüfungen DQ-01 bis DQ-16 und Kontrollsummen

**Files:**
- Create: `dbt/seeds/kontrollsummen.csv`, `dbt/seeds/seeds.yml`, `dbt/tests/dq01_einzelplaene_vollstaendig.sql` … `dbt/tests/dq16_mart_gleich_api.sql` (16 Dateien)

**Interfaces:**
- Consumes: Staging, Core, Mart (Tasks 6 bis 8), Variable `dq13_ab_jahr`
- Produces: Singuläre dbt-Tests mit `config(severity=…, meta={'dq_id': 'DQ-xx'})`; Schwere exakt wie in `ops.dq_check` (Task 3)

- [ ] **Step 1: Seed anlegen**

`dbt/seeds/kontrollsummen.csv`:
```text
jahr,konto,wertart,betrag_eur,quelle
2024,ausgaben,ist,474753727609.58,internalapi Ist 2024 Ausgaben (Abruf 08.10.2026)
2024,einnahmen,ist,474753727609.58,internalapi Ist 2024 Einnahmen (Abruf 08.10.2026)
2026,ausgaben,soll,524540138000.00,Haushaltsplan 2026 ohne Anlagen = internalapi Soll 2026
2026,einnahmen,soll,524540138000.00,Haushaltsplan 2026 ohne Anlagen = internalapi Soll 2026
```

`dbt/seeds/seeds.yml`:
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
```

- [ ] **Step 2: Tests schreiben**

Jede Datei beginnt mit `{{ config(severity='<schwere>', meta={'dq_id': 'DQ-xx'}) }}` und liefert nur verletzende Zeilen.

`dq01_einzelplaene_vollstaendig.sql` (error):
```sql
{{ config(severity='error', meta={'dq_id': 'DQ-01'}) }}
-- Nur Jahre, in denen XML und API denselben Stand zeigen
with gleich as (select jahr, konto from {{ ref('dim_haushaltsstand') }} where differenz_xml_api_eur = 0)
select k.jahr, k.konto, k.knoten_id as einzelplan_nr
from {{ ref('stg_api_knoten') }} k
join gleich g on g.jahr = k.jahr and g.konto = k.konto
where k.ebene = 'einzelplan' and k.quote = 'soll'
  and not exists (
    select 1 from {{ ref('stg_soll_titel') }} t
    where t.jahr = k.jahr and t.konto = k.konto and t.einzelplan_nr = k.knoten_id and not t.ist_anlage)
```

`dq02_titel_eindeutig.sql` (error):
```sql
{{ config(severity='error', meta={'dq_id': 'DQ-02'}) }}
select jahr, titel_key, count(*) as anzahl
from {{ ref('fct_titel_jahr') }}
group by jahr, titel_key
having count(*) > 1
```

`dq03_gueltigkeit.sql` (error):
```sql
{{ config(severity='error', meta={'dq_id': 'DQ-03'}) }}
select jahr, konto, titel_key, titel_nr, kapitel_nr, einzelplan_nr, fkt
from {{ ref('dim_titel') }}
where titel_nr !~ '^[0-9]{5}$' or kapitel_nr !~ '^[0-9]{4}$' or left(kapitel_nr, 2) <> einzelplan_nr
   or fkt is null or fkt !~ '^[0-9]{3}$' or titel_key <> kapitel_nr || titel_nr
```

`dq04_funktion_bezeichnet.sql` (warn): `select jahr, fkt from {{ ref('dim_funktion') }} where funktion_text is null`

`dq05_gruppierung_bezeichnet.sql` (warn): `select jahr, gruppierung_nr from {{ ref('dim_gruppierung') }} where gruppierung_text is null`

`dq06_konto_hauptgruppe.sql` (warn):
```sql
{{ config(severity='warn', meta={'dq_id': 'DQ-06'}) }}
select jahr, konto, titel_key, hauptgruppe
from {{ ref('fct_titel_jahr') }}
where (konto = 'einnahmen' and hauptgruppe not in ('0', '1', '2', '3'))
   or (konto = 'ausgaben' and hauptgruppe in ('0', '1', '2', '3'))
```

`dq07_einzelplansummen_xml_api.sql` (error):
```sql
{{ config(severity='error', meta={'dq_id': 'DQ-07'}) }}
with gleich as (select jahr, konto from {{ ref('dim_haushaltsstand') }} where differenz_xml_api_eur = 0),
xml as (
  select jahr, konto, einzelplan_nr, sum(soll_eur) as betrag
  from {{ ref('stg_soll_titel') }} where not ist_anlage group by 1, 2, 3
),
api as (
  select jahr, konto, knoten_id as einzelplan_nr, betrag_eur as betrag
  from {{ ref('stg_api_knoten') }} where ebene = 'einzelplan' and quote = 'soll'
)
select coalesce(x.jahr, a.jahr) as jahr, coalesce(x.konto, a.konto) as konto,
       coalesce(x.einzelplan_nr, a.einzelplan_nr) as einzelplan_nr, x.betrag as xml_eur, a.betrag as api_eur
from xml x
full join api a on a.jahr = x.jahr and a.konto = x.konto and a.einzelplan_nr = x.einzelplan_nr
join gleich g on g.jahr = coalesce(x.jahr, a.jahr) and g.konto = coalesce(x.konto, a.konto)
where coalesce(x.betrag, 0) <> coalesce(a.betrag, 0)
```

`dq08_haushaltsausgleich_soll.sql` (error):
```sql
{{ config(severity='error', meta={'dq_id': 'DQ-08'}) }}
select jahr, min(betrag_eur) as kleiner, max(betrag_eur) as groesser
from {{ ref('stg_api_knoten') }}
where ebene = 'gesamt' and quote = 'soll'
group by jahr
having count(*) = 2 and min(betrag_eur) <> max(betrag_eur)
```

`dq09_kontrollsummen.sql` (error):
```sql
{{ config(severity='error', meta={'dq_id': 'DQ-09'}) }}
with summen as (
  select jahr, konto,
         case when bool_and(soll_quelle = 'api') then sum(soll_eur) end as soll,
         sum(ist_eur) as ist
  from {{ ref('fct_titel_jahr') }}
  group by jahr, konto
)
select k.jahr, k.konto, k.wertart, k.betrag_eur as kontrollwert, s.soll, s.ist
from {{ ref('kontrollsummen') }} k
join summen s on s.jahr = k.jahr and s.konto = k.konto
where (k.wertart = 'soll' and s.soll is not null and s.soll <> k.betrag_eur)
   or (k.wertart = 'ist' and s.ist is not null and s.ist <> k.betrag_eur)
```

`dq10_aktualitaet.sql` (warn):
```sql
{{ config(severity='warn', meta={'dq_id': 'DQ-10'}) }}
select source_id, max(finished_at) as letzter_lauf
from {{ source('ops', 'load_run') }}
where status in ('succeeded', 'skipped') and params ->> 'datei' is null
group by source_id
having max(finished_at) < now() - interval '8 days'
```

`dq11_volumen.sql` (warn):
```sql
{{ config(severity='warn', meta={'dq_id': 'DQ-11'}) }}
with n as (select jahr, konto, count(*) as anzahl from {{ ref('fct_titel_jahr') }} group by jahr, konto)
select a.jahr, a.konto, v.anzahl as vorjahr, a.anzahl
from n a join n v on v.konto = a.konto and v.jahr = a.jahr - 1
where abs(a.anzahl - v.anzahl)::numeric / v.anzahl > 0.15
```

`dq12_letzter_lauf_ok.sql` (warn):
```sql
{{ config(severity='warn', meta={'dq_id': 'DQ-12'}) }}
with letzte as (
  select distinct on (source_id, params ->> 'jahr', params ->> 'konto', params ->> 'quote', params ->> 'sicht')
         source_id, params ->> 'jahr' as jahr, params ->> 'konto' as konto, params ->> 'quote' as quote,
         params ->> 'sicht' as sicht, status, error
  from {{ source('ops', 'load_run') }}
  where params ->> 'datei' is null
  order by source_id, params ->> 'jahr', params ->> 'konto', params ->> 'quote', params ->> 'sicht', started_at desc
)
select * from letzte where status in ('failed', 'quarantined')
```

`dq13_ist_vollstaendig.sql` (error):
```sql
{{ config(severity='error', meta={'dq_id': 'DQ-13'}) }}
select j.jahr, k.konto
from generate_series({{ var('dq13_ab_jahr') }}, extract(year from now())::int - 2) as j(jahr)
cross join (values ('ausgaben'), ('einnahmen')) as k(konto)
where not exists (
  select 1 from {{ ref('stg_api_laeufe') }} l where l.jahr = j.jahr and l.konto = k.konto and l.quote = 'ist')
```

`dq14_stand_erklaert.sql` (warn):
```sql
{{ config(severity='warn', meta={'dq_id': 'DQ-14'}) }}
select jahr, konto, stand, stand_text, soll_xml_eur, soll_api_eur, differenz_xml_api_eur
from {{ ref('dim_haushaltsstand') }}
where differenz_xml_api_eur <> 0 and anzahl_nachtraege = 0 and stand <> 'Regierungsentwurf'
```

`dq15_haushaltsausgleich_ist.sql` (error): wie `dq08` mit `quote = 'ist'` und `dq_id` `DQ-15`.

`dq16_mart_gleich_api.sql` (error):
```sql
{{ config(severity='error', meta={'dq_id': 'DQ-16'}) }}
with mart as (
  select jahr, konto,
         sum(soll_eur) filter (where soll_quelle = 'api') as soll,
         sum(ist_eur) as ist
  from {{ ref('fct_titel_jahr') }}
  group by jahr, konto
)
select a.jahr, a.konto, a.quote, a.betrag_eur as api_eur, m.soll as mart_soll_eur, m.ist as mart_ist_eur
from {{ ref('stg_api_knoten') }} a
join mart m on m.jahr = a.jahr and m.konto = a.konto
where a.ebene = 'gesamt'
  and ((a.quote = 'soll' and m.soll is distinct from a.betrag_eur) or (a.quote = 'ist' and m.ist is distinct from a.betrag_eur))
```

- [ ] **Step 3: Gegenprobe, dass die Tests anschlagen**

Für DQ-16 und DQ-09 je einmal einen Fehler simulieren und das Ergebnis im Report festhalten:
1. Lokal eine Zeile in `mart.fct_titel_jahr` um 0,01 € ändern: `update mart.fct_titel_jahr set soll_eur = soll_eur + 0.01 where ctid = (select ctid from mart.fct_titel_jahr where soll_quelle = 'api' limit 1);`
2. `pnpm dbt test --select dq16_mart_gleich_api` ausführen. Erwartet: FAIL. Falls lokal kein API-Soll geladen ist, zuerst Task 4 Step 5 und `pnpm --filter @hb/ingest api --quote soll --jahre 2024 --konten ausgaben` ausführen.
3. Mit `pnpm dbt run --select fct_titel_jahr` wiederherstellen.

- [ ] **Step 4: Ausführen**

Run: `pnpm dbt seed && pnpm dbt build --vars '{dq13_ab_jahr: 2024}'`
Expected: alle Modelle gebaut. Ergebnisse der DQ-Tests im Report notieren (pass, warn oder fail je Test). Rote Tests wegen lokal fehlender Daten sind hier erlaubt und werden im Report mit Ursache genannt. Die Schwere wird nicht angepasst, das ist Aufgabe von Task 12.

- [ ] **Step 5: Commit**

```bash
git add dbt/seeds dbt/tests
git commit -m "feat(dbt): Qualitätsprüfungen DQ-01 bis DQ-16 und Kontrollsummen"
```

---

### Task 10: Veröffentlichung (Ampel, DQ-Lauf, Datenversion, Aufräumen)

**Files:**
- Create: `packages/ingest/src/veroeffentlichung/dq.ts`, `packages/ingest/src/db/veroeffentlichung.ts`, `packages/ingest/src/cli-veroeffentlichung.ts`, `packages/ingest/src/bin-veroeffentlichung.ts`
- Modify: `packages/ingest/package.json` (Script `"veroeffentliche": "tsx src/bin-veroeffentlichung.ts"`), `CLAUDE.md`
- Test: `packages/ingest/src/veroeffentlichung/dq.test.ts`, `packages/ingest/src/db/veroeffentlichung.int.test.ts`, `packages/ingest/src/cli-veroeffentlichung.int.test.ts`

**Interfaces:**
- Consumes: `ops.dq_check`, `ops.veroeffentliche_version`, `ops.raeume_raw_auf` (Task 3), dbt-Artefakte `dbt/target/run_results.json` und `dbt/target/manifest.json`, `mart.fct_titel_jahr` (Task 8)
- Produces:
  - `type KatalogEintrag = { checkId: string; schwere: 'error' | 'warn' }`
  - `type DbtTest = { name: string; dqId: string; schwere: 'error' | 'warn'; status: string; failures: number; nachricht: string | null }`
  - `leseDbtTests(runResults: unknown, manifest: unknown): DbtTest[]` (nur Knoten mit `resource_type = 'test'` und `config.meta.dq_id`)
  - `type DqErgebnis = { checkId: string; status: 'pass' | 'warn' | 'fail'; failures: number; details: string[] }`
  - `bewerteDq(tests: DbtTest[], katalog: KatalogEintrag[]): { ergebnisse: DqErgebnis[]; ampel: 'green' | 'yellow' | 'red'; score: number }`
  - `ladeDqKatalog(sql): Promise<KatalogEintrag[]>`, `speichereDqLauf(sql, lauf: { gitSha: string; manifestSha: string; ampel; score }, ergebnisse: DqErgebnis[]): Promise<number>`, `veroeffentlicheVersion(sql, dqLaufId: number): Promise<{ versionId: number; zeilenNeu: number; zeilenGeschlossen: number; zeilenGesamt: number }>`, `raeumeRawAuf(sql): Promise<{ tabelle: string; geloescht: number }[]>`
  - `mainVeroeffentlichung(argv, abh?: { sql?: Sql; log?: (t: string) => void; targetVerzeichnis?: string }): Promise<number>`, Option `--target` (Standard `<repo>/dbt/target`)

Regeln für `bewerteDq`:
- Status je Test:
  - `pass` → pass
  - `warn` → warn
  - `fail` → bei Schwere `warn` warn, sonst fail
  - jeder andere Status (`error`, `skipped`, …) → fail mit Detail `<name>: nicht ausgeführt (<status>)`
- Je Prüfung zählt der schlechteste Status ihrer Tests. Eine Katalogprüfung ohne Test ist fail mit Detail `kein Test gefunden`. Ein Test mit unbekannter `dq_id` wirft `Error('Test <name> verweist auf unbekannte Prüfung <id>')`.
- `details` enthält je nicht bestandenem Test `<name>: <failures> Zeilen` oder die Nachricht.
- Ampel: mindestens ein fail ergibt red; mindestens ein warn ergibt yellow; sonst green.
- Score: `100 * Σ(Gewicht × bestanden) / Σ Gewicht`, Gewicht 3 für Schwere `error` und 1 für `warn`, bestanden nur bei pass, auf 2 Nachkommastellen gerundet.

Ablauf von `mainVeroeffentlichung`:
1. Dateien lesen und `manifestSha = sha256Hex(manifest.json-Inhalt)` bilden.
2. Katalog laden und bewerten.
3. In einer Transaktion: DQ-Lauf speichern. Ist die Ampel nicht rot, die Version veröffentlichen und danach aufräumen.
4. Bericht ausgeben: Ampel, Score, Tabelle der nicht bestandenen Prüfungen, Version mit neuen, geschlossenen und gesamten Zeilen, gelöschte Rohzeilen je Tabelle.
5. Exit-Code 0 bei Veröffentlichung, 1 bei roter Ampel.

- [ ] **Step 1: Failing Tests schreiben**

`dq.test.ts`:
- (a) `leseDbtTests` mit einem minimalen `run_results` (drei Tests: `pass`, `warn` mit 2 failures, `fail`) und passendem `manifest` (Knoten mit `resource_type: 'test'`, `config: { severity: 'ERROR' | 'WARN', meta: { dq_id } }`; Unit-Test-Knoten mit `resource_type: 'unit_test'` werden ignoriert). Liefert drei `DbtTest`. Die Schwere wird kleingeschrieben.
- (b) `bewerteDq` mit Katalog `[DQ-01 error, DQ-02 error, DQ-04 warn]`:
  - alle pass → green, 100
  - DQ-04 warn → yellow, 85,71
  - DQ-02 fail → red, 57,14
  - DQ-01 skipped → red mit Detail „nicht ausgeführt (skipped)“
  - fehlender Test für DQ-02 → red mit Detail „kein Test gefunden“
- (c) Ein Test mit `dq_id` `DQ-99` wirft.

`veroeffentlichung.int.test.ts` (alles in `imRollback`; zuerst `delete from mart.fct_titel_jahr_hist`, `update ops.dataset_version set is_current = false`, `delete from mart.fct_titel_jahr`):
- (a) Zwei Zeilen A, B (alle Pflichtspalten; `zeilen_hash` explizit setzen) einfügen, DQ-Lauf `green`, veröffentlichen → `{ zeilenNeu: 2, zeilenGeschlossen: 0, zeilenGesamt: 2 }`, `is_current`.
- (b) Danach A mit geändertem Hash, B löschen, C neu, DQ-Lauf `yellow`, veröffentlichen → `{ zeilenNeu: 2, zeilenGeschlossen: 2, zeilenGesamt: 2 }`. Abfrage „Stand von Version 1“ (`gueltig_ab_version <= v1 and (gueltig_bis_version is null or gueltig_bis_version > v1)`) liefert genau A (alter Hash) und B. Nur die zweite Version ist `is_current`.
- (c) DQ-Lauf `red` → `veroeffentlicheVersion` wirft `/roter Ampel/`.
- (d) Spalten von `mart.fct_titel_jahr` gleich `mart.fct_titel_jahr_hist` ohne `gueltig_*` (Reihenfolge und Namen).

`cli-veroeffentlichung.int.test.ts` (Zielverzeichnis mit selbst geschriebenen `run_results.json` und `manifest.json` in einem Temp-Ordner):
- (a) Alle 16 Prüfungen pass → Exit 0, Bericht enthält `Ampel: grün` und `Version`.
- (b) DQ-16 fail → Exit 1, Bericht enthält `Ampel: rot` und `nicht veröffentlicht`, ein DQ-Lauf ist gespeichert, keine neue Version.
- (c) Fehlende Datei → Fehler `run_results.json nicht gefunden`.

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test; pnpm --filter @hb/ingest test:int`
Expected: FAIL (Module fehlen)

- [ ] **Step 3: Implementierung**

Nach den Interfaces und Regeln oben. Ganzzahlen aus `bigint`-Spalten mit `Number(...)` umwandeln. Den Bericht mit der Hilfsfunktion `zelle` aus `api-bericht.ts` tabellensicher machen. Ampel im Bericht deutsch: `grün`, `gelb`, `rot`.

CLAUDE.md unter „Befehle“:
```markdown
- pnpm --filter @hb/ingest veroeffentliche   Ampel aus dbt-Ergebnissen, DQ-Lauf speichern, bei grün/gelb neue Datenversion veröffentlichen und raw aufräumen
```

- [ ] **Step 4: Tests ausführen**

Run: `pnpm typecheck && pnpm test && pnpm test:int`
Expected: alle PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ingest CLAUDE.md
git commit -m "feat(ingest): Veröffentlichung mit Ampel, DQ-Lauf und Datenversion"
```

---

### Task 11: Workflow und Betriebsdokumentation

**Files:**
- Modify: `.github/workflows/ingest.yml`, `docs/betrieb.md`

**Interfaces:**
- Consumes: CLIs `start`, `api`, `systematik`, `veroeffentliche`; `pnpm dbt build`

- [ ] **Step 1: `ingest.yml` erweitern**

Änderungen gegenüber Plan 2:
- `timeout-minutes: 300` (Erstlauf nach Versionswechsel lädt alles neu).
- Der Schritt „Soll-Entwurf des Folgejahres“ wird ersetzt durch „Soll aus der internalapi“: `pnpm --silent --filter @hb/ingest api --quote soll --jahre "$JAHRE" $NEU_LADEN | tee -a bericht.md` (id `sollapi`).
- Neuer Schritt „Systematik aus der internalapi“ (id `systematik`, `continue-on-error: true`): `pnpm --silent --filter @hb/ingest systematik --jahre "$JAHRE" $NEU_LADEN | tee -a bericht.md`.
- Nach den Ingest-Schritten:
```yaml
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: pip install -r dbt/requirements.txt
      - name: dbt build
        id: dbt
        continue-on-error: true
        env:
          DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          pnpm --silent dbt seed
          pnpm --silent dbt build
      - name: Ampel und Veröffentlichung
        id: veroeffentlichung
        if: always() && steps.migration.outcome == 'success'
        continue-on-error: true
        env:
          DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: pnpm --silent --filter @hb/ingest veroeffentliche | tee -a bericht.md
```
  Dem Migrationsschritt `id: migration` geben, falls noch nicht vorhanden.
- Schritt „Ergebnis“: zusätzlich `steps.sollapi.outcome == 'failure' || steps.systematik.outcome == 'failure' || steps.veroeffentlichung.outcome == 'failure'`. `steps.dbt` zählt nicht separat, weil die Veröffentlichung die Ampel bewertet.
- Danach `npx -y yaml@2.8.1 valid` und actionlint wie in Plan 2.

- [ ] **Step 2: `docs/betrieb.md` ergänzen**

- Überblick: `ingest` umfasst jetzt Soll (XML und API), Ist, Systematik, dbt, Ampel und Veröffentlichung.
- Neuer Abschnitt „Datenqualität und Veröffentlichung“: Tabelle der 16 Prüfungen (aus `ops.dq_check`), Bedeutung der Ampel, rot wird nie veröffentlicht, die bisherige Version bleibt aktiv. Abfrage des aktuellen Stands:
  `select * from ops.dataset_version where is_current;` und `select check_id, status, details from ops.dq_ergebnis where dq_lauf_id = (select max(dq_lauf_id) from ops.dq_lauf);`
- Neuer Abschnitt „Aufräumen“: Nach jeder Veröffentlichung bleiben in `raw` nur die maßgeblichen Läufe; ältere Rohdaten im Release.
- Fehlerbilder ergänzen:
  - DQ-16 rot (Transformation fehlerhaft, dbt-Modell prüfen)
  - DQ-13 rot (Ist eines abgeschlossenen Jahres fehlt, Lauf mit `neu_laden` für das Jahr)
  - DQ-14 gelb (XML- und API-Soll unterscheiden sich ohne Nachtrag, Befund prüfen)
- Lokale Nutzung: `uv venv`, `pnpm dbt build --vars '{dq13_ab_jahr: <jahr>}'` bei unvollständigen lokalen Daten.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ingest.yml docs/betrieb.md
git commit -m "ci: Ingest mit Soll aus der API, Systematik, dbt und Veröffentlichung"
```

---

### Task 12: Lokaler Durchlauf mit echten Daten und Befund

**Files:**
- Create: `docs/befunde/2026-10-dbt-dq.md`
- Modify: bei begründetem Bedarf Schwere einzelner DQ-Prüfungen (Test-Config **und** `ops.dq_check` über neue additive Migration), `docs/superpowers/plans/2026-10-08-00-roadmap.md` (Übertrag aus Plan 3)

- [ ] **Step 1: Lokale Daten 2023 bis 2027 laden** (etwa 4.500 Anfragen, rund 40 Minuten, im Hintergrund)

```bash
pnpm --filter @hb/ingest api --quote soll --jahre 2023-2027 | tee data/raw/p3-soll.md
pnpm --filter @hb/ingest api --quote ist --jahre 2023-2025 | tee data/raw/p3-ist.md
pnpm --filter @hb/ingest systematik --jahre 2023-2027 | tee data/raw/p3-systematik.md
pnpm --filter @hb/ingest start --jahre alle --neu-laden | tee data/raw/p3-xml.md
```
Expected: alle `succeeded` oder `skipped` (2026/2027 Ist nicht verfügbar). Bei `quarantined` anhalten und melden.

- [ ] **Step 2: dbt und Veröffentlichung**

```bash
pnpm dbt seed
pnpm dbt build --vars '{dq13_ab_jahr: 2023}'
pnpm --filter @hb/ingest veroeffentliche | tee data/raw/p3-veroeffentlichung.md
```
Expected: Ampel grün oder gelb, Version 1 veröffentlicht. Zweiter Aufruf von `veroeffentliche` direkt danach: Version 2 mit `zeilen_neu = 0` und `zeilen_geschlossen = 0`.

- [ ] **Step 3: Befund prüfen und kalibrieren**

Für jede Prüfung mit `warn` oder `fail` die verletzenden Zeilen ansehen (`pnpm dbt test --select <test> --store-failures` oder die SQL der Testdatei direkt ausführen) und einordnen: echter Datenbefund oder falsch formulierte Prüfung.
- Eine Prüfung darf nur geändert werden, wenn sie nachweislich falsch formuliert ist. Die Änderung wird mit Beispielzeilen im Befund begründet.
- Die Schwere wird nur mit Begründung herabgestuft.
- Echte Datenbefunde (z. B. DQ-14 für 2025) bleiben bestehen und werden im Befund erklärt.

- [ ] **Step 4: Abgleich und Speicher messen**

```bash
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -c "
select jahr, konto, stand, stand_text, soll_xml_eur, soll_api_eur, differenz_xml_api_eur from core.dim_haushaltsstand where jahr >= 2023 order by 1, 2;"
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -c "
select jahr, konto, sum(soll_eur) soll, sum(ist_eur) ist, count(*) titel from mart.fct_titel_jahr group by 1, 2 order by 1, 2;"
docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -c "
select n.nspname, pg_size_pretty(sum(pg_total_relation_size(c.oid))) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('raw', 'ops', 'core', 'mart') and c.relkind in ('r', 'm') group by 1 order by 1;"
```

- [ ] **Step 5: Befund schreiben**

`docs/befunde/2026-10-dbt-dq.md`: Kurzfassung (Ampel, Version, Dauer), Ergebnisse aller 16 Prüfungen mit Status und Erklärung, Haushaltsstände 2023 bis 2027, Mart-Summen gegen API, Beispiele bereinigter Texte (vorher, nachher), Speicher je Schema und Hochrechnung auf alle Jahre gegen 500 MB, Kalibrierungen mit Begründung, Folgerungen für Plan 4.

Roadmap: Abschnitt „Übertrag aus Plan 3“ mit offenen Punkten.

- [ ] **Step 6: Commit**

```bash
git add docs supabase/migrations dbt
git commit -m "docs: Befund dbt, Datenqualität und erste Datenversion"
```
