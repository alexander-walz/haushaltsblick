# Plan 1: Fundament und Soll-Ingest – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Monorepo, das die amtlichen Haushaltsplan-XML-Dateien 2012 bis 2026 höflich abruft, gegen den Datenvertrag prüft, in eine lokale Supabase-Datenbank (`raw`, `ops`) lädt und jeden Ladelauf protokolliert.

**Architecture:** pnpm-Monorepo mit zwei Quellpaketen ohne Build-Schritt (`@hb/shared`, `@hb/ingest`). Der Ingest ist eine Kette reiner, einzeln getesteter Bausteine (Abruf, Streaming-Parser, Zusammenfassung, Loader). Ein dünner Ablauf `ladeSollJahr` verbindet sie, und eine CLI ruft ihn je Jahr auf. Die Datenbank läuft lokal über die Supabase-CLI. Migrationen legen die sieben Schemas aus Konzept Abschnitt 7 an, in diesem Plan aber nur die Tabellen für `ops` und `raw`.

**Tech Stack:** Node 24, pnpm 11, TypeScript 7 (strict, ESM), Vitest 5, saxes 6, postgres 3 (porsager), Supabase CLI 2.120.0, GitHub Actions.

**Spec:** `docs/KONZEPT.md` (Abschnitte 3, 4, 6, 7, 8) zusammen mit `docs/superpowers/plans/2026-10-08-00-roadmap.md` (Entscheidungen E1, E8, E12 gelten vor dem Konzept).

## Global Constraints

- Node `>=24` (`engines`), pnpm `11.0.9` (`packageManager`), Windows und Linux (CI) müssen funktionieren.
- TypeScript `7.0.2`, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ESM, `moduleResolution: "Bundler"`, Pakete exportieren `./src/index.ts` direkt.
- Versionen: vitest `5.0.3`, saxes `6.0.0`, postgres `3.4.9`, tsx `4.23.15`, @types/node `24`, Supabase CLI `2.120.0`.
- Soll steht in der XML in Tausend Euro. Die Datenbank speichert Original (`soll_tsd_eur`) und Euro (`soll_eur = soll_tsd_eur * 1000`).
- Abruf nur mit `User-Agent` samt Kontaktadresse, höchstens 2 Anfragen pro Sekunde (500 ms Pause zwischen Jahren), Wiederholung mit Backoff 1 s, 4 s, 16 s, bedingter Abruf über `ETag`.
- Quelle: `https://www.bundeshaushalt.de/static/daten/{jahr}/soll/haushalt_{jahr}.xml`. Lizenzvermerk: `Amtliches Werk, Quellenvermerk "Bundesministerium der Finanzen, bundeshaushalt.de"`.
- Verletzung des Datenvertrags führt zum Laufstatus `quarantined`. Daten werden nie still verworfen.
- Anlagen (`<anlage>`, Wirtschaftspläne von Sondervermögen) zählen nie zum Gesamthaushalt (Roadmap E1).
- Rohdateien liegen unter `data/raw/` (git-ignoriert), nicht in Supabase Storage (Roadmap E8).
- Nur kostenfreie Dienste. Fachbegriffe deutsch, technische Begriffe englisch. Migrationen nur additiv.

## Review Focus

1. **Ältere Jahrgänge mit unbekannter Struktur** (2012 bis 2025 sind nicht als Fixture abgedeckt). Erwartet: Vertragsfehler mit Pfadangabe und Laufstatus `quarantined`, nie stilles Überspringen von Elementen. Tests: Task 2 „unbekanntes Element“, Task 7 „Quarantäne“.
2. **Folgejahr noch nicht veröffentlicht** (2027 liefert heute 404). Erwartet: Lauf `skipped` mit Hinweis, Exit-Code 0. Tests: Task 4 „404“, Task 7 „nicht veröffentlichte Jahre“ und „Exit-Code“.
3. **Wiederholter Lauf ohne Änderung.** Erwartet: `skipped`, keine doppelten Zeilen, ETag wird weitergereicht. Tests: Task 7.
4. **Abbruch mitten im Speichern.** Erwartet: keine Teildaten in `raw`, Lauf `failed`. Test: Task 6.
5. **Anlagen in Summen.** Erwartet: Gesamthaushalt ohne Anlagen; für die echte Datei 2026 genau 524.540.138 Tsd. € auf beiden Seiten. Tests: Task 3.

## Dateistruktur

```text
.gitignore, .nvmrc, package.json, pnpm-workspace.yaml, tsconfig.base.json, CLAUDE.md
docs/KONZEPT.md                         # verschoben aus Konzept/
contracts/src_soll_xml.yaml             # Datenvertrag, aktualisiert
packages/shared/src/index.ts            # Re-Exports
packages/shared/src/haushalt.ts         # Konto, titelKey, zerlegeTitelKey
packages/ingest/
  fixtures/soll_2026_auszug.xml         # echte Ausschnitte 2026 mit allen Sonderfällen
  src/xml/typen.ts                      # SollTitel, SollKapitel, SollZeile, XmlVertragsFehler
  src/xml/parse-soll.ts                 # Streaming-Parser mit Vertragsprüfung
  src/xml/zusammenfassung.ts            # Summen je Konto, Anlagen getrennt
  src/xml/test-hilfen.ts                # sammle, nurTitel, titelAus, FIXTURE_2026
  src/abruf/soll-xml.ts                 # bedingter Abruf mit Backoff
  src/db/client.ts                      # verbinde, inTransaktion
  src/db/test-hilfen.ts                 # imRollback
  src/db/lade-soll.ts                   # Läufe und Rohdaten schreiben
  src/jahre.ts                          # parseJahre
  src/bericht.ts                        # formatiereBericht
  src/soll-ingest.ts                    # ladeSollJahr (Ablauf je Jahr)
  src/cli.ts, src/bin.ts                # main und Einstiegspunkt
supabase/config.toml
supabase/migrations/20261008120000_schemas.sql
supabase/migrations/20261008120100_ops_raw.sql
.github/workflows/ci.yml
docs/befunde/2026-10-soll-ingest.md     # Ergebnis des echten Laufs
```

---

### Task 1: Repository, Monorepo-Gerüst und Paket `@hb/shared`

**Files:**
- Create: `.gitignore`, `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `CLAUDE.md`
- Move: `Konzept/KI-Dashboard_Bundeshaushalt.md` nach `docs/KONZEPT.md`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/haushalt.ts`
- Test: `packages/shared/src/haushalt.test.ts`

**Interfaces:**
- Produces: `type Konto = 'einnahmen' | 'ausgaben'`, `KONTEN`, `titelKey(kapitelNr: string, titelNr: string): string`, `zerlegeTitelKey(key: string): { kapitelNr: string; titelNr: string }`, alles exportiert aus `@hb/shared`

- [ ] **Step 1: Repository anlegen und Konzept verschieben** (Arbeitsverzeichnis `C:\Users\alexw\Documents\bundeshaushalt`, Git Bash)

```bash
git init -b main
mkdir -p docs packages/shared/src
mv Konzept/KI-Dashboard_Bundeshaushalt.md docs/KONZEPT.md
rmdir Konzept
```

- [ ] **Step 2: Wurzeldateien anlegen**

`.gitignore`:
```text
node_modules/
data/raw/
.env
.env.*
coverage/
*.log
supabase/.temp/
supabase/.branches/
```

`.nvmrc`:
```text
24
```

`package.json`:
```json
{
  "name": "haushaltsblick",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.0.9",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "pnpm -r --if-present test",
    "test:int": "pnpm -r --if-present test:int",
    "typecheck": "pnpm -r --if-present typecheck",
    "db:start": "pnpm dlx supabase@2.120.0 db start && pnpm dlx supabase@2.120.0 migration up --local",
    "db:reset": "pnpm dlx supabase@2.120.0 db reset --local",
    "db:stop": "pnpm dlx supabase@2.120.0 stop"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 3: Paket `@hb/shared` anlegen und Abhängigkeiten installieren**

`packages/shared/package.json`:
```json
{
  "name": "@hb/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p ."
  }
}
```

`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/shared/src/index.ts`:
```ts
export * from './haushalt';
```

```bash
pnpm --filter @hb/shared add -D vitest@5.0.3 typescript@7.0.2 @types/node@24
```

- [ ] **Step 4: Failing Test schreiben**

`packages/shared/src/haushalt.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { KONTEN, titelKey, zerlegeTitelKey } from './haushalt';

describe('Titelschlüssel', () => {
  it('bildet den neunstelligen Schlüssel der internalapi aus Kapitel und Titel', () => {
    expect(titelKey('0901', '68301')).toBe('090168301');
  });

  it('zerlegt den Schlüssel wieder in Kapitel und Titel', () => {
    expect(zerlegeTitelKey('041197201')).toEqual({ kapitelNr: '0411', titelNr: '97201' });
  });

  it.each([
    ['901', '68301'],
    ['0901', '6830'],
    ['0901', '68A01'],
  ])('lehnt ungültige Bestandteile ab: %s / %s', (kapitel, titel) => {
    expect(() => titelKey(kapitel, titel)).toThrow(/Ungültige/);
  });

  it('lehnt Schlüssel mit falscher Länge ab', () => {
    expect(() => zerlegeTitelKey('04119720')).toThrow('Ungültiger Titelschlüssel: 04119720');
  });

  it('kennt genau zwei Konten', () => {
    expect(KONTEN).toEqual(['einnahmen', 'ausgaben']);
  });
});
```

- [ ] **Step 5: Test ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/shared test`
Expected: FAIL, weil `./haushalt` nicht existiert („Failed to load url ./haushalt“ oder „Cannot find module“)

- [ ] **Step 6: Minimale Implementierung**

`packages/shared/src/haushalt.ts`:
```ts
export const KONTEN = ['einnahmen', 'ausgaben'] as const;
export type Konto = (typeof KONTEN)[number];

const KAPITEL_NR = /^\d{4}$/;
const TITEL_NR = /^\d{5}$/;

/** Neunstelliger Titelschlüssel der internalapi, z. B. 090168301 für Kapitel 0901, Titel 68301. */
export function titelKey(kapitelNr: string, titelNr: string): string {
  if (!KAPITEL_NR.test(kapitelNr)) throw new Error(`Ungültige Kapitelnummer: ${kapitelNr}`);
  if (!TITEL_NR.test(titelNr)) throw new Error(`Ungültige Titelnummer: ${titelNr}`);
  return kapitelNr + titelNr;
}

export function zerlegeTitelKey(key: string): { kapitelNr: string; titelNr: string } {
  if (!/^\d{9}$/.test(key)) throw new Error(`Ungültiger Titelschlüssel: ${key}`);
  return { kapitelNr: key.slice(0, 4), titelNr: key.slice(4) };
}
```

- [ ] **Step 7: Tests und Typecheck ausführen**

Run: `pnpm test && pnpm typecheck`
Expected: 7 Tests PASS, Typecheck ohne Fehler

- [ ] **Step 8: `CLAUDE.md` anlegen**

`CLAUDE.md`:
```markdown
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
```

- [ ] **Step 9: Commit**

```bash
git add .gitignore .nvmrc package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json CLAUDE.md docs packages/shared
git commit -m "chore: Monorepo-Gerüst, Paket @hb/shared und Konzept unter docs/"
```

---

### Task 2: Datenvertrag, Fixture und XML-Parser

**Files:**
- Create: `contracts/src_soll_xml.yaml`
- Create: `packages/ingest/package.json`, `packages/ingest/tsconfig.json`, `packages/ingest/vitest.config.ts`
- Create: `packages/ingest/fixtures/soll_2026_auszug.xml`
- Create: `packages/ingest/src/xml/typen.ts`, `packages/ingest/src/xml/parse-soll.ts`, `packages/ingest/src/xml/test-hilfen.ts`
- Test: `packages/ingest/src/xml/parse-soll.test.ts`

**Interfaces:**
- Consumes: `Konto` aus `@hb/shared`
- Produces:
  - `type SollTitel = { art: 'titel'; jahr: number; einzelplanNr: string; einzelplanText: string; kapitelNr: string; kapitelText: string; anlageZuKapitelNr: string | null; konto: Konto; kontoBlock: number; ausgabeartText: string | null; titelgruppeNr: string | null; titelgruppeText: string | null; titelNr: string; titelText: string; flexibilisiert: boolean; fkt: string; seite: number | null; sollTsdEur: number; xmlPfad: string; zeilenHash: string }`
  - `type SollKapitel = { art: 'kapitel'; jahr: number; einzelplanNr: string; einzelplanText: string; kapitelNr: string; kapitelText: string; anlageZuKapitelNr: string | null; anzahlTitel: number; entfallen: boolean; xmlPfad: string }`
  - `type SollZeile = SollTitel | SollKapitel`
  - `class XmlVertragsFehler extends Error { readonly pfad: string }`
  - `parseSollXml(quelle: Iterable<string> | AsyncIterable<string>): AsyncGenerator<SollZeile>`
  - `leseXmlDatei(pfad: string): AsyncIterable<string>`
  - Testhilfen: `FIXTURE_2026`, `sammle(quelle)`, `nurTitel(zeilen)`, `nurKapitel(zeilen)`, `titelAus(zeilen, kapitelNr, titelNr)`

- [ ] **Step 1: Datenvertrag aktualisieren**

`contracts/src_soll_xml.yaml`:
```yaml
id: SRC_SOLL_XML
owner: haushaltsblick-data
beschreibung: Haushaltsplan des Bundes, Soll je Titel
url_muster: https://www.bundeshaushalt.de/static/daten/{jahr}/soll/haushalt_{jahr}.xml
lizenz: Amtliches Werk, Quellenvermerk "Bundesministerium der Finanzen, bundeshaushalt.de"
aktualisierung: bei neuem Haushaltsstand, Prüfung wöchentlich, bedingter Abruf über ETag
verfuegbarkeit: 2012 bis 2026 bestätigt am 08.10.2026, Folgejahr liefert 404 bis zur Veröffentlichung
einheit_betrag: tausend_eur
schema:
  wurzel: haushalt[@jahr]
  pfad: einzelplan[@nr]/kapitel[@nr]/(anlage/kapitel[@nr])?/(einnahmen|ausgaben)/(einnahmen-ausgaben-art|titelgruppe[@nr])?/titel[@nr]
  elemente: [haushalt, einzelplan, kapitel, anlage, text, einnahmen, ausgaben, einnahmen-ausgaben-art, titelgruppe, titel, soll]
  titel_attribute: [nr, flexibilisiert, fkt, seite]
  betrag: titel/soll[@wert]
erwartungen:
  - haushalt_jahr: "^[0-9]{4}$"
  - einzelplan_nr: "^[0-9]{2}$"
  - kapitel_nr: "^[0-9]{4}$ und beginnt mit der Einzelplannummer"
  - titel_nr: "^[0-9]{5}$"
  - fkt: "^[0-9]{3}$"
  - flexibilisiert: [ja, nein]
  - soll_wert: "^-?[0-9]+$"
  - seite: "^[0-9]+$, optional"
  - titel: liegt innerhalb von einnahmen oder ausgaben und hat genau ein soll
besonderheiten:
  - anlage: Wirtschaftspläne von Sondervermögen, 2026 Kapitel 6092 (Klima- und Transformationsfonds) in Kapitel 6002. Nicht Teil des Gesamthaushalts, getrennt summieren.
  - mehrere Blöcke einnahmen oder ausgaben je Kapitel (erst mit Ausgabeart, dann flexibilisierte Titel ohne)
  - entfallene Kapitel ohne Titel, teils mit leerem Element (2026 Kapitel 0618 mit <ausgaben/>)
  - negative Soll-Werte bei globalen Minderausgaben (Gruppe 972)
kontrollwerte_2026:
  haushalt_tsd_eur: 524540138 (Einnahmen gleich Ausgaben, entspricht dem Wurzelwert der internalapi)
  anlagen_tsd_eur: 34803623 (Einnahmen gleich Ausgaben)
  anzahl_titel: 6995
  entfallene_kapitel: ["0415", "0454", "0618", "1204", "1608"]
bei_verletzung: lauf_in_quarantaene
```

- [ ] **Step 2: Paket `@hb/ingest` anlegen**

`packages/ingest/package.json`:
```json
{
  "name": "@hb/ingest",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/bin.ts",
    "test": "vitest run --project unit",
    "test:int": "vitest run --project integration",
    "typecheck": "tsc --noEmit -p ."
  },
  "dependencies": {
    "@hb/shared": "workspace:*"
  }
}
```

`packages/ingest/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "vitest.config.ts"] }
```

`packages/ingest/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: ['src/**/*.int.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
```

```bash
pnpm --filter @hb/ingest add saxes@6.0.0
pnpm --filter @hb/ingest add -D vitest@5.0.3 typescript@7.0.2 @types/node@24 tsx@4.23.15
```

- [ ] **Step 3: Fixture aus echten Ausschnitten anlegen**

Die Ausschnitte stammen wörtlich aus der Datei 2026 (Abruf 08.10.2026). Nur Titeltexte von 38103 sind gekürzt. Leerraum zwischen Elementen ist Absicht, denn der Parser muss ihn ignorieren.

`packages/ingest/fixtures/soll_2026_auszug.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- Auszug aus https://www.bundeshaushalt.de/static/daten/2026/soll/haushalt_2026.xml (Abruf 08.10.2026), reduziert auf Sonderfälle -->
<haushalt xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" jahr="2026">
  <einzelplan nr="01">
    <text>Bundespräsident und Bundespräsidialamt</text>
    <kapitel nr="0101">
      <text>Bundespräsident</text>
      <einnahmen>
        <einnahmen-ausgaben-art>
          <text>Übrige Einnahmen</text>
          <titel nr="38103" flexibilisiert="nein" fkt="890" seite="6"><text>Verrechnungseinnahmen gemäß §&#160;61 BHO</text><soll wert="0"/></titel>
        </einnahmen-ausgaben-art>
      </einnahmen>
      <ausgaben>
        <einnahmen-ausgaben-art>
          <text>Zuweisungen und Zuschüsse (ohne Investitionen)</text>
          <titel nr="68101" flexibilisiert="nein" fkt="011" seite="6"><text>Übernahme von Patenschaften, Ausgaben aus besonderer Veranlassung und besondere Bewilligungen.</text><soll wert="1348"/></titel>
        </einnahmen-ausgaben-art>
      </ausgaben>
      <ausgaben>
        <titel nr="42101" flexibilisiert="ja" fkt="011" seite="7"><text>Bezüge des Bundespräsidenten</text><soll wert="277"/></titel>
      </ausgaben>
    </kapitel>
  </einzelplan>
  <einzelplan nr="04">
    <text>Bundeskanzler und Bundeskanzleramt</text>
    <kapitel nr="0411">
      <text>Zentral veranschlagte Verwaltungseinnahmen und -ausgaben des Geschäftsbereichs des BKAmts</text>
      <einnahmen>
        <titelgruppe nr="57">
          <text>Versorgung der Beamtinnen und Beamten sowie der Richterinnen und Richter</text>
          <titel nr="11957" flexibilisiert="nein" fkt="018" seite="12"><text>Vermischte Einnahmen</text><soll wert="16"/></titel>
        </titelgruppe>
      </einnahmen>
      <ausgaben>
        <einnahmen-ausgaben-art>
          <text>Besondere Finanzierungsausgaben</text>
          <titel nr="97201" flexibilisiert="nein" fkt="880" seite="13"><text>Globale Minderausgabe Konsolidierungsbeitrag</text><soll wert="-168"/></titel>
        </einnahmen-ausgaben-art>
      </ausgaben>
    </kapitel>
    <kapitel nr="0415"><text>Die Beauftragte der Bundesregierung für Ostdeutschland (entfallenes Kapitel)</text></kapitel>
  </einzelplan>
  <einzelplan nr="06">
    <text>Bundesministerium des Innern</text>
    <kapitel nr="0618"><text>Bundesinstitut für Sportwissenschaft (entfallenes Kapitel)</text><ausgaben/></kapitel>
  </einzelplan>
  <einzelplan nr="60">
    <text>Allgemeine Finanzverwaltung</text>
    <kapitel nr="6002">
      <text>Allgemeine Bewilligungen</text>
      <einnahmen>
        <einnahmen-ausgaben-art>
          <text>Steuern und steuerähnliche Abgaben</text>
          <titel nr="09201" flexibilisiert="nein" fkt="820" seite="25"><text>Münzeinnahmen</text><soll wert="145000"/></titel>
        </einnahmen-ausgaben-art>
      </einnahmen>
      <anlage>
        <kapitel nr="6092">
          <text>Anlage 3 Wirtschaftsplan des Klima- und Transformationsfonds (6092)</text>
          <einnahmen>
            <einnahmen-ausgaben-art>
              <text>Verwaltungseinnahmen</text>
              <titel nr="13203" flexibilisiert="nein" fkt="332" seite="72"><text>Erlöse aus der CO2-Bepreisung gemäß Brennstoffemissionshandelsgesetz</text><soll wert="16713426"/></titel>
            </einnahmen-ausgaben-art>
          </einnahmen>
          <ausgaben>
            <einnahmen-ausgaben-art>
              <text>Zuweisungen und Zuschüsse (ohne Investitionen)</text>
              <titel nr="68309" flexibilisiert="nein" fkt="643" seite="81"><text>Zuschuss zu den Übertragungsnetzkosten</text><soll wert="6500000"/></titel>
            </einnahmen-ausgaben-art>
          </ausgaben>
        </kapitel>
      </anlage>
    </kapitel>
  </einzelplan>
</haushalt>
```

- [ ] **Step 4: Typen und Testhilfen anlegen** (ohne Logik, damit die Tests kompilieren)

`packages/ingest/src/xml/typen.ts`:
```ts
import type { Konto } from '@hb/shared';

export type SollTitel = {
  art: 'titel';
  jahr: number;
  einzelplanNr: string;
  einzelplanText: string;
  kapitelNr: string;
  kapitelText: string;
  /** Kapitel, unter dessen <anlage> der Titel steht; null für den Gesamthaushalt. */
  anlageZuKapitelNr: string | null;
  konto: Konto;
  /** Position des <einnahmen>- bzw. <ausgaben>-Blocks im Kapitel, ab 1. */
  kontoBlock: number;
  ausgabeartText: string | null;
  titelgruppeNr: string | null;
  titelgruppeText: string | null;
  titelNr: string;
  titelText: string;
  flexibilisiert: boolean;
  fkt: string;
  seite: number | null;
  sollTsdEur: number;
  xmlPfad: string;
  zeilenHash: string;
};

export type SollKapitel = {
  art: 'kapitel';
  jahr: number;
  einzelplanNr: string;
  einzelplanText: string;
  kapitelNr: string;
  kapitelText: string;
  anlageZuKapitelNr: string | null;
  anzahlTitel: number;
  entfallen: boolean;
  xmlPfad: string;
};

export type SollZeile = SollTitel | SollKapitel;

export class XmlVertragsFehler extends Error {
  readonly pfad: string;

  constructor(meldung: string, pfad: string) {
    super(`${meldung} (bei ${pfad})`);
    this.name = 'XmlVertragsFehler';
    this.pfad = pfad;
  }
}
```

`packages/ingest/src/xml/test-hilfen.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { parseSollXml } from './parse-soll';
import type { SollKapitel, SollTitel, SollZeile } from './typen';

export const FIXTURE_2026 = fileURLToPath(new URL('../../fixtures/soll_2026_auszug.xml', import.meta.url));

export async function sammle(quelle: Iterable<string> | AsyncIterable<string>): Promise<SollZeile[]> {
  const zeilen: SollZeile[] = [];
  for await (const zeile of parseSollXml(quelle)) zeilen.push(zeile);
  return zeilen;
}

export const nurTitel = (zeilen: readonly SollZeile[]): SollTitel[] =>
  zeilen.filter((z): z is SollTitel => z.art === 'titel');

export const nurKapitel = (zeilen: readonly SollZeile[]): SollKapitel[] =>
  zeilen.filter((z): z is SollKapitel => z.art === 'kapitel');

export function titelAus(zeilen: readonly SollZeile[], kapitelNr: string, titelNr: string): SollTitel {
  const titel = nurTitel(zeilen).find((t) => t.kapitelNr === kapitelNr && t.titelNr === titelNr);
  if (!titel) throw new Error(`Titel ${kapitelNr} ${titelNr} fehlt`);
  return titel;
}
```

`packages/ingest/src/xml/parse-soll.ts` (Stub):
```ts
import type { SollZeile } from './typen';

export function leseXmlDatei(_pfad: string): AsyncIterable<string> {
  throw new Error('nicht implementiert');
}

export async function* parseSollXml(_quelle: Iterable<string> | AsyncIterable<string>): AsyncGenerator<SollZeile> {
  throw new Error('nicht implementiert');
}
```

- [ ] **Step 5: Failing Tests schreiben**

`packages/ingest/src/xml/parse-soll.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leseXmlDatei } from './parse-soll';
import { FIXTURE_2026, nurKapitel, nurTitel, sammle, titelAus } from './test-hilfen';
import { XmlVertragsFehler } from './typen';

const fixtureText = () => readFileSync(FIXTURE_2026, 'utf8');

describe('parseSollXml mit dem Auszug 2026', () => {
  it('liest alle Titel und Kapitel', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(nurTitel(zeilen)).toHaveLength(8);
    expect(nurKapitel(zeilen).map((k) => k.kapitelNr).sort()).toEqual(['0101', '0411', '0415', '0618', '6002', '6092']);
  });

  it('liefert vollständige Stammdaten je Titel', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '0101', '68101')).toEqual({
      art: 'titel',
      jahr: 2026,
      einzelplanNr: '01',
      einzelplanText: 'Bundespräsident und Bundespräsidialamt',
      kapitelNr: '0101',
      kapitelText: 'Bundespräsident',
      anlageZuKapitelNr: null,
      konto: 'ausgaben',
      kontoBlock: 1,
      ausgabeartText: 'Zuweisungen und Zuschüsse (ohne Investitionen)',
      titelgruppeNr: null,
      titelgruppeText: null,
      titelNr: '68101',
      titelText: 'Übernahme von Patenschaften, Ausgaben aus besonderer Veranlassung und besondere Bewilligungen.',
      flexibilisiert: false,
      fkt: '011',
      seite: 6,
      sollTsdEur: 1348,
      xmlPfad: '/haushalt[2026]/einzelplan[01]/kapitel[0101]/ausgaben[1]/einnahmen-ausgaben-art[1]/titel[68101]',
      zeilenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('trennt mehrere <ausgaben>-Blöcke je Kapitel', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    const flex = titelAus(zeilen, '0101', '42101');
    expect(flex).toMatchObject({ kontoBlock: 2, ausgabeartText: null, flexibilisiert: true, sollTsdEur: 277 });
    expect(flex.xmlPfad).toBe('/haushalt[2026]/einzelplan[01]/kapitel[0101]/ausgaben[2]/titel[42101]');
  });

  it('liest Titelgruppen direkt unter <einnahmen>', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '0411', '11957')).toMatchObject({
      konto: 'einnahmen',
      titelgruppeNr: '57',
      titelgruppeText: 'Versorgung der Beamtinnen und Beamten sowie der Richterinnen und Richter',
      ausgabeartText: null,
    });
  });

  it('übernimmt negative Soll-Werte', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '0411', '97201').sollTsdEur).toBe(-168);
  });

  it('meldet entfallene Kapitel, auch mit leerem <ausgaben/>', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    const entfallen = nurKapitel(zeilen).filter((k) => k.entfallen).map((k) => [k.kapitelNr, k.anzahlTitel]);
    expect(entfallen).toEqual([['0415', 0], ['0618', 0]]);
  });

  it('kennzeichnet Titel und Kapitel in Anlagen', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '6092', '13203')).toMatchObject({
      einzelplanNr: '60',
      anlageZuKapitelNr: '6002',
      xmlPfad: '/haushalt[2026]/einzelplan[60]/kapitel[6002]/anlage[1]/kapitel[6092]/einnahmen[1]/einnahmen-ausgaben-art[1]/titel[13203]',
    });
    expect(titelAus(zeilen, '6002', '09201').anlageZuKapitelNr).toBeNull();
    const kapitel = nurKapitel(zeilen);
    expect(kapitel.find((k) => k.kapitelNr === '6092')).toMatchObject({ anlageZuKapitelNr: '6002', anzahlTitel: 2, entfallen: false });
    expect(kapitel.find((k) => k.kapitelNr === '6002')).toMatchObject({ anlageZuKapitelNr: null, anzahlTitel: 1 });
  });

  it('bewahrt Umlaute, Paragrafenzeichen und geschützte Leerzeichen', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(titelAus(zeilen, '0101', '38103').titelText).toBe('Verrechnungseinnahmen gemäß §\u00a061 BHO');
  });

  it('liefert gleiche Hashes für gleichen Inhalt und einen anderen bei geänderter Zahl', async () => {
    const original = await sammle([fixtureText()]);
    const geaendert = await sammle([fixtureText().replace('wert="1348"', 'wert="1349"')]);
    for (const t of nurTitel(original)) {
      const gegenstueck = titelAus(geaendert, t.kapitelNr, t.titelNr);
      if (t.titelNr === '68101') expect(gegenstueck.zeilenHash).not.toBe(t.zeilenHash);
      else expect(gegenstueck.zeilenHash).toBe(t.zeilenHash);
    }
  });

  it('liefert dasselbe Ergebnis bei beliebig zerteilter Eingabe', async () => {
    const text = fixtureText();
    const stuecke = text.match(/[\s\S]{1,7}/g) ?? [];
    expect(await sammle(stuecke)).toEqual(await sammle([text]));
  });
});

describe('Datenvertrag', () => {
  const huelle = (inhalt: string, kapitelNr = '0101') =>
    `<?xml version="1.0" encoding="UTF-8"?><haushalt jahr="2026"><einzelplan nr="01"><text>EP</text>` +
    `<kapitel nr="${kapitelNr}"><text>K</text>${inhalt}</kapitel></einzelplan></haushalt>`;
  const titelXml = (attrs: string, soll = '<soll wert="1"/>') =>
    `<ausgaben><titel ${attrs}><text>T</text>${soll}</titel></ausgaben>`;

  it.each([
    ['unbekanntes Element', huelle('<verpflichtung/>'), /Unbekanntes Element <verpflichtung>/],
    ['Titelnummer vierstellig', huelle(titelXml('nr="6810" flexibilisiert="nein" fkt="011"')), /Titelnummer ungültig/],
    ['Funktionskennziffer fehlt', huelle(titelXml('nr="68101" flexibilisiert="nein"')), /Funktionskennziffer ungültig/],
    ['flexibilisiert unbekannt', huelle(titelXml('nr="68101" flexibilisiert="vielleicht" fkt="011"')), /flexibilisiert ungültig/],
    ['Soll nicht ganzzahlig', huelle(titelXml('nr="68101" flexibilisiert="nein" fkt="011"', '<soll wert="1.5"/>')), /Soll-Wert ungültig/],
    ['Titel ohne Soll', huelle(titelXml('nr="68101" flexibilisiert="nein" fkt="011"', '')), /Titel 68101 ohne <soll>/],
    ['Kapitel passt nicht zum Einzelplan', huelle('', '0201'), /Kapitelnummer ungültig: 0201 passt nicht zu Einzelplan 01/],
    ['Titel außerhalb von Einnahmen und Ausgaben', huelle('<titel nr="68101" flexibilisiert="nein" fkt="011"><text>T</text><soll wert="1"/></titel>'), /außerhalb von <einnahmen>/],
    ['Freitext zwischen Elementen', huelle('Hallo'), /Unerwarteter Text: Hallo/],
  ])('meldet %s als Vertragsfehler', async (_name, xml, meldung) => {
    const fehler = await sammle([xml]).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(XmlVertragsFehler);
    expect((fehler as Error).message).toMatch(meldung);
  });

  it('nennt den Pfad der Fundstelle', async () => {
    const fehler = (await sammle([huelle('<verpflichtung/>')]).catch((e: unknown) => e)) as XmlVertragsFehler;
    expect(fehler.pfad).toBe('/haushalt[2026]/einzelplan[01]/kapitel[0101]');
  });

  it('bricht bei abgeschnittener Datei ab', async () => {
    await expect(sammle(['<haushalt jahr="2026"><einzelplan nr="01">'])).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test`
Expected: FAIL, alle Tests mit „nicht implementiert“

- [ ] **Step 7: Parser implementieren**

`packages/ingest/src/xml/parse-soll.ts`:
```ts
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { SaxesParser } from 'saxes';
import type { Konto } from '@hb/shared';
import { XmlVertragsFehler, type SollKapitel, type SollTitel, type SollZeile } from './typen';

const ELEMENTE = new Set([
  'haushalt', 'einzelplan', 'kapitel', 'anlage', 'text', 'einnahmen', 'ausgaben',
  'einnahmen-ausgaben-art', 'titelgruppe', 'titel', 'soll',
]);

type Rahmen = {
  name: string;
  attrs: Record<string, string>;
  /** Position unter gleichnamigen Geschwistern, ab 1. */
  pos: number;
  /** Pfadsegment, z. B. kapitel[0411] oder ausgaben[2]. */
  segment: string;
  kinder: Map<string, number>;
  /** Inhalt des direkten <text>-Kinds. */
  text?: string;
  /** Nur bei <titel>: Rohwert aus <soll wert>. */
  soll?: string;
  /** Nur bei <kapitel>: Anzahl direkt zugeordneter Titel. */
  anzahlTitel: number;
};

export function leseXmlDatei(pfad: string): AsyncIterable<string> {
  return createReadStream(pfad, { encoding: 'utf8' });
}

/**
 * Streaming-Parser für die Haushaltsplan-XML. Liefert Titel und Kapitel in Dokumentreihenfolge
 * (Kapitel beim schließenden Tag) und wirft XmlVertragsFehler bei jeder Abweichung vom Datenvertrag.
 */
export async function* parseSollXml(quelle: Iterable<string> | AsyncIterable<string>): AsyncGenerator<SollZeile> {
  const parser = new SaxesParser();
  const stack: Rahmen[] = [];
  const fertig: SollZeile[] = [];
  let jahr = 0;
  let textPuffer = '';

  const pfad = () => '/' + stack.map((r) => r.segment).join('/');
  const verletze = (meldung: string): never => {
    throw new XmlVertragsFehler(meldung, pfad());
  };
  const pruefe = (wert: string | undefined, muster: RegExp, feld: string): string =>
    wert !== undefined && muster.test(wert) ? wert : verletze(`${feld} ungültig: ${String(wert)}`);
  const finde = (name: string) => stack.findLast((r) => r.name === name);
  const anlageZuKapitelNr = (): string | null => {
    const i = stack.findLastIndex((r) => r.name === 'anlage');
    return i < 0 ? null : (stack.slice(0, i).findLast((r) => r.name === 'kapitel')?.attrs.nr ?? null);
  };

  function baueTitel(r: Rahmen): SollTitel {
    const ep = finde('einzelplan') ?? verletze('<titel> außerhalb von <einzelplan>');
    const kap = finde('kapitel') ?? verletze('<titel> außerhalb von <kapitel>');
    const kontoRahmen =
      stack.findLast((s) => s.name === 'einnahmen' || s.name === 'ausgaben') ??
      verletze('<titel> außerhalb von <einnahmen>/<ausgaben>');
    const soll = r.soll ?? verletze(`Titel ${r.attrs.nr} ohne <soll>`);
    kap.anzahlTitel += 1;
    const tg = finde('titelgruppe');
    const ohneHash: Omit<SollTitel, 'zeilenHash'> = {
      art: 'titel',
      jahr,
      einzelplanNr: ep.attrs.nr!,
      einzelplanText: ep.text ?? '',
      kapitelNr: kap.attrs.nr!,
      kapitelText: kap.text ?? '',
      anlageZuKapitelNr: anlageZuKapitelNr(),
      konto: kontoRahmen.name as Konto,
      kontoBlock: kontoRahmen.pos,
      ausgabeartText: finde('einnahmen-ausgaben-art')?.text ?? null,
      titelgruppeNr: tg?.attrs.nr ?? null,
      titelgruppeText: tg?.text ?? null,
      titelNr: r.attrs.nr!,
      titelText: r.text ?? '',
      flexibilisiert: r.attrs.flexibilisiert === 'ja',
      fkt: r.attrs.fkt!,
      seite: r.attrs.seite === undefined ? null : Number(r.attrs.seite),
      sollTsdEur: Number(soll),
      xmlPfad: `${pfad()}/${r.segment}`,
    };
    const zeilenHash = createHash('sha256').update(JSON.stringify(ohneHash)).digest('hex');
    return { ...ohneHash, zeilenHash };
  }

  function baueKapitel(r: Rahmen): SollKapitel {
    const ep = finde('einzelplan') ?? verletze('<kapitel> außerhalb von <einzelplan>');
    return {
      art: 'kapitel',
      jahr,
      einzelplanNr: ep.attrs.nr!,
      einzelplanText: ep.text ?? '',
      kapitelNr: r.attrs.nr!,
      kapitelText: r.text ?? '',
      anlageZuKapitelNr: anlageZuKapitelNr(),
      anzahlTitel: r.anzahlTitel,
      entfallen: r.anzahlTitel === 0,
      xmlPfad: `${pfad()}/${r.segment}`,
    };
  }

  parser.on('opentag', (tag) => {
    if (!ELEMENTE.has(tag.name)) verletze(`Unbekanntes Element <${tag.name}>`);
    const attrs = tag.attributes as Record<string, string>;
    const eltern = stack.at(-1);
    const pos = (eltern?.kinder.get(tag.name) ?? 0) + 1;
    eltern?.kinder.set(tag.name, pos);

    switch (tag.name) {
      case 'haushalt':
        jahr = Number(pruefe(attrs.jahr, /^\d{4}$/, 'Haushaltsjahr'));
        break;
      case 'einzelplan':
        pruefe(attrs.nr, /^\d{2}$/, 'Einzelplannummer');
        break;
      case 'kapitel': {
        const nr = pruefe(attrs.nr, /^\d{4}$/, 'Kapitelnummer');
        const ep = finde('einzelplan')?.attrs.nr ?? verletze('<kapitel> außerhalb von <einzelplan>');
        if (!nr.startsWith(ep)) verletze(`Kapitelnummer ungültig: ${nr} passt nicht zu Einzelplan ${ep}`);
        break;
      }
      case 'titel':
        pruefe(attrs.nr, /^\d{5}$/, 'Titelnummer');
        pruefe(attrs.fkt, /^\d{3}$/, 'Funktionskennziffer');
        pruefe(attrs.flexibilisiert, /^(ja|nein)$/, 'flexibilisiert');
        if (attrs.seite !== undefined) pruefe(attrs.seite, /^\d+$/, 'Seite');
        if (!finde('einnahmen') && !finde('ausgaben')) verletze('<titel> außerhalb von <einnahmen>/<ausgaben>');
        break;
      case 'soll':
        if (eltern?.name !== 'titel') verletze('<soll> außerhalb von <titel>');
        eltern!.soll = pruefe(attrs.wert, /^-?\d+$/, 'Soll-Wert');
        break;
      case 'text':
        textPuffer = '';
        break;
    }

    const kennung = tag.name === 'haushalt' ? attrs.jahr : (attrs.nr ?? String(pos));
    stack.push({ name: tag.name, attrs, pos, segment: `${tag.name}[${kennung}]`, kinder: new Map(), anzahlTitel: 0 });
  });

  parser.on('text', (t) => {
    if (stack.at(-1)?.name === 'text') textPuffer += t;
    else if (t.trim() !== '') verletze(`Unerwarteter Text: ${t.trim().slice(0, 40)}`);
  });

  parser.on('closetag', (tag) => {
    const r = stack.pop()!;
    if (tag.name === 'text') {
      const eltern = stack.at(-1);
      if (eltern) eltern.text = textPuffer.trim();
    } else if (tag.name === 'titel') {
      fertig.push(baueTitel(r));
    } else if (tag.name === 'kapitel') {
      fertig.push(baueKapitel(r));
    }
  });

  for await (const stueck of quelle) {
    parser.write(stueck);
    yield* fertig.splice(0);
  }
  parser.close();
  if (jahr === 0) throw new XmlVertragsFehler('Kein <haushalt>-Element gefunden', '/');
  yield* fertig.splice(0);
}
```

- [ ] **Step 8: Tests und Typecheck ausführen**

Run: `pnpm --filter @hb/ingest test && pnpm typecheck`
Expected: alle 21 Tests in `parse-soll.test.ts` PASS, Typecheck ohne Fehler

- [ ] **Step 9: Commit**

```bash
git add contracts packages/ingest pnpm-lock.yaml
git commit -m "feat(ingest): Streaming-Parser für die Soll-XML mit Datenvertrag und Anlagen"
```

---

### Task 3: Zusammenfassung je Haushaltsjahr

**Files:**
- Create: `packages/ingest/src/xml/zusammenfassung.ts`
- Test: `packages/ingest/src/xml/zusammenfassung.test.ts`

**Interfaces:**
- Consumes: `SollZeile`, Testhilfen aus Task 2
- Produces: `type Summen = { einnahmen: number; ausgaben: number }`, `type SollZusammenfassung = { jahr: number; anzahlTitel: number; anzahlKapitel: number; entfalleneKapitel: string[]; haushaltTsdEur: Summen; anlagenTsdEur: Summen; ausgeglichen: boolean }`, `fasseSollZusammen(zeilen: readonly SollZeile[]): SollZusammenfassung`

- [ ] **Step 1: Failing Tests schreiben**

`packages/ingest/src/xml/zusammenfassung.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { leseXmlDatei } from './parse-soll';
import { FIXTURE_2026, sammle, titelAus } from './test-hilfen';
import { fasseSollZusammen } from './zusammenfassung';

describe('fasseSollZusammen', () => {
  it('summiert den Gesamthaushalt ohne Anlagen und weist Anlagen getrennt aus', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    expect(fasseSollZusammen(zeilen)).toEqual({
      jahr: 2026,
      anzahlTitel: 8,
      anzahlKapitel: 6,
      entfalleneKapitel: ['0415', '0618'],
      haushaltTsdEur: { einnahmen: 145016, ausgaben: 1457 },
      anlagenTsdEur: { einnahmen: 16713426, ausgaben: 6500000 },
      ausgeglichen: false,
    });
  });

  it('erkennt einen ausgeglichenen Haushalt', async () => {
    const xml =
      '<haushalt jahr="2026"><einzelplan nr="01"><text>EP</text><kapitel nr="0101"><text>K</text>' +
      '<einnahmen><titel nr="11901" flexibilisiert="nein" fkt="011"><text>E</text><soll wert="5"/></titel></einnahmen>' +
      '<ausgaben><titel nr="52901" flexibilisiert="nein" fkt="011"><text>A</text><soll wert="5"/></titel></ausgaben>' +
      '</kapitel></einzelplan></haushalt>';
    expect(fasseSollZusammen(await sammle([xml])).ausgeglichen).toBe(true);
  });

  it('lehnt leere Eingaben ab', () => {
    expect(() => fasseSollZusammen([])).toThrow('Keine Zeilen zum Zusammenfassen');
  });

  it('lehnt Zeilen aus mehreren Jahren ab', async () => {
    const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
    const gemischt = [...zeilen, { ...titelAus(zeilen, '0101', '68101'), jahr: 2025 }];
    expect(() => fasseSollZusammen(gemischt)).toThrow('Zeilen aus mehreren Haushaltsjahren');
  });

  // Abnahme gegen die echte Datei (Stand 08.10.2026). Aufruf:
  // HB_ECHTE_XML=<pfad zu haushalt_2026.xml> pnpm --filter @hb/ingest test
  const echteDatei = process.env.HB_ECHTE_XML;
  it.skipIf(!echteDatei)('stimmt für die echte Datei 2026 mit dem amtlichen Gesamtvolumen überein', async () => {
    const s = fasseSollZusammen(await sammle(leseXmlDatei(echteDatei!)));
    expect(s.anzahlTitel).toBe(6995);
    expect(s.haushaltTsdEur).toEqual({ einnahmen: 524540138, ausgaben: 524540138 });
    expect(s.anlagenTsdEur).toEqual({ einnahmen: 34803623, ausgaben: 34803623 });
    expect(s.entfalleneKapitel).toEqual(['0415', '0454', '0618', '1204', '1608']);
    expect(s.ausgeglichen).toBe(true);
  });
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test`
Expected: FAIL mit „Failed to load url ./zusammenfassung“ oder „Cannot find module“

- [ ] **Step 3: Implementierung**

`packages/ingest/src/xml/zusammenfassung.ts`:
```ts
import type { SollZeile } from './typen';

export type Summen = { einnahmen: number; ausgaben: number };

export type SollZusammenfassung = {
  jahr: number;
  anzahlTitel: number;
  anzahlKapitel: number;
  entfalleneKapitel: string[];
  /** Gesamthaushalt ohne Anlagen, in Tausend Euro. */
  haushaltTsdEur: Summen;
  /** Wirtschaftspläne in Anlagen, in Tausend Euro (Roadmap E1). */
  anlagenTsdEur: Summen;
  ausgeglichen: boolean;
};

export function fasseSollZusammen(zeilen: readonly SollZeile[]): SollZusammenfassung {
  const erste = zeilen[0];
  if (!erste) throw new Error('Keine Zeilen zum Zusammenfassen');
  if (zeilen.some((z) => z.jahr !== erste.jahr)) throw new Error('Zeilen aus mehreren Haushaltsjahren');

  const haushalt: Summen = { einnahmen: 0, ausgaben: 0 };
  const anlagen: Summen = { einnahmen: 0, ausgaben: 0 };
  const entfallen: string[] = [];
  let anzahlTitel = 0;
  let anzahlKapitel = 0;

  for (const z of zeilen) {
    if (z.art === 'kapitel') {
      anzahlKapitel += 1;
      if (z.entfallen) entfallen.push(z.kapitelNr);
      continue;
    }
    anzahlTitel += 1;
    (z.anlageZuKapitelNr === null ? haushalt : anlagen)[z.konto] += z.sollTsdEur;
  }

  return {
    jahr: erste.jahr,
    anzahlTitel,
    anzahlKapitel,
    entfalleneKapitel: entfallen.sort(),
    haushaltTsdEur: haushalt,
    anlagenTsdEur: anlagen,
    ausgeglichen: haushalt.einnahmen === haushalt.ausgaben,
  };
}
```

- [ ] **Step 4: Tests ausführen**

Run: `pnpm --filter @hb/ingest test`
Expected: 4 neue Tests PASS, 1 übersprungen (echte Datei), alle Tests aus Task 2 weiterhin PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ingest/src/xml/zusammenfassung.ts packages/ingest/src/xml/zusammenfassung.test.ts
git commit -m "feat(ingest): Zusammenfassung je Jahr mit getrennten Anlagen"
```

---

### Task 4: Abruf der XML-Datei

**Files:**
- Create: `packages/ingest/src/abruf/soll-xml.ts`
- Test: `packages/ingest/src/abruf/soll-xml.test.ts`

**Interfaces:**
- Produces:
  - `sollXmlUrl(jahr: number): string`
  - `sha256Hex(daten: Buffer | string): string`
  - `type AbrufOptionen = { userAgent: string; etag?: string | null; fetchImpl?: typeof fetch; wartezeitenMs?: readonly number[] }`
  - `type AbrufErgebnis = { status: 'neu'; url: string; inhalt: Buffer; sha256: string; etag: string | null; lastModified: string | null; abgerufenAm: Date } | { status: 'unveraendert'; url: string } | { status: 'nicht_vorhanden'; url: string }`
  - `holeSollXml(jahr: number, opt: AbrufOptionen): Promise<AbrufErgebnis>`

- [ ] **Step 1: Failing Tests schreiben**

`packages/ingest/src/abruf/soll-xml.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { holeSollXml, sha256Hex, sollXmlUrl } from './soll-xml';

const UA = 'Haushaltsblick-Test/0.1 (+mailto:test@example.org)';
const KEINE_WARTEZEIT = [0, 0, 0] as const;

function fakeFetch(...antworten: Array<Response | Error>) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const naechste = antworten.shift();
    if (!naechste) throw new Error('keine weitere Antwort vorbereitet');
    if (naechste instanceof Error) throw naechste;
    return naechste;
  });
}

describe('holeSollXml', () => {
  it('baut die URL nach dem Muster des Datenvertrags', () => {
    expect(sollXmlUrl(2026)).toBe('https://www.bundeshaushalt.de/static/daten/2026/soll/haushalt_2026.xml');
  });

  it('lädt eine neue Datei mit Hash und Metadaten', async () => {
    const f = fakeFetch(new Response('<haushalt/>', { status: 200, headers: { etag: '"abc"', 'last-modified': 'Tue, 29 Sep 2026 06:50:38 GMT' } }));
    const ergebnis = await holeSollXml(2026, { userAgent: UA, fetchImpl: f as unknown as typeof fetch });
    expect(ergebnis).toMatchObject({
      status: 'neu',
      url: sollXmlUrl(2026),
      sha256: sha256Hex('<haushalt/>'),
      etag: '"abc"',
      lastModified: 'Tue, 29 Sep 2026 06:50:38 GMT',
    });
    expect(ergebnis.status === 'neu' && ergebnis.inhalt.toString('utf8')).toBe('<haushalt/>');
    expect(f).toHaveBeenCalledWith(sollXmlUrl(2026), { headers: { 'User-Agent': UA } });
  });

  it('sendet den ETag und erkennt eine unveränderte Datei', async () => {
    const f = fakeFetch(new Response(null, { status: 304 }));
    const ergebnis = await holeSollXml(2026, { userAgent: UA, etag: '"abc"', fetchImpl: f as unknown as typeof fetch });
    expect(ergebnis).toEqual({ status: 'unveraendert', url: sollXmlUrl(2026) });
    expect(f).toHaveBeenCalledWith(sollXmlUrl(2026), { headers: { 'User-Agent': UA, 'If-None-Match': '"abc"' } });
  });

  it('meldet noch nicht veröffentlichte Jahre ohne Fehler', async () => {
    const f = fakeFetch(new Response('', { status: 404 }));
    expect(await holeSollXml(2027, { userAgent: UA, fetchImpl: f as unknown as typeof fetch })).toEqual({
      status: 'nicht_vorhanden',
      url: sollXmlUrl(2027),
    });
  });

  it('wiederholt bei Netzwerkfehlern und Serverfehlern', async () => {
    const f = fakeFetch(new Error('ECONNRESET'), new Response('', { status: 503 }), new Response('<haushalt/>', { status: 200 }));
    const ergebnis = await holeSollXml(2026, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, wartezeitenMs: KEINE_WARTEZEIT });
    expect(ergebnis.status).toBe('neu');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('gibt nach drei Wiederholungen auf', async () => {
    const f = fakeFetch(...Array.from({ length: 4 }, () => new Response('', { status: 503 })));
    await expect(
      holeSollXml(2026, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, wartezeitenMs: KEINE_WARTEZEIT }),
    ).rejects.toThrow(/nach 4 Versuchen fehlgeschlagen: Error: HTTP 503/);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('wiederholt keine Client-Fehler', async () => {
    const f = fakeFetch(new Response('', { status: 403 }));
    await expect(
      holeSollXml(2026, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, wartezeitenMs: KEINE_WARTEZEIT }),
    ).rejects.toThrow(/HTTP 403/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test`
Expected: FAIL mit „Cannot find module ./soll-xml“

- [ ] **Step 3: Implementierung**

`packages/ingest/src/abruf/soll-xml.ts`:
```ts
import { createHash } from 'node:crypto';

export type AbrufOptionen = {
  userAgent: string;
  etag?: string | null;
  fetchImpl?: typeof fetch;
  wartezeitenMs?: readonly number[];
};

export type AbrufErgebnis =
  | { status: 'neu'; url: string; inhalt: Buffer; sha256: string; etag: string | null; lastModified: string | null; abgerufenAm: Date }
  | { status: 'unveraendert'; url: string }
  | { status: 'nicht_vorhanden'; url: string };

const STANDARD_WARTEZEITEN_MS = [1_000, 4_000, 16_000] as const;

export const sollXmlUrl = (jahr: number): string =>
  `https://www.bundeshaushalt.de/static/daten/${jahr}/soll/haushalt_${jahr}.xml`;

export const sha256Hex = (daten: Buffer | string): string => createHash('sha256').update(daten).digest('hex');

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function holeSollXml(jahr: number, opt: AbrufOptionen): Promise<AbrufErgebnis> {
  const url = sollXmlUrl(jahr);
  const holen = opt.fetchImpl ?? fetch;
  const wartezeiten = opt.wartezeitenMs ?? STANDARD_WARTEZEITEN_MS;
  const headers: Record<string, string> = { 'User-Agent': opt.userAgent };
  if (opt.etag) headers['If-None-Match'] = opt.etag;

  for (let versuch = 0; ; versuch++) {
    let ursache: unknown;
    try {
      const antwort = await holen(url, { headers });
      if (antwort.status === 304) return { status: 'unveraendert', url };
      if (antwort.status === 404) return { status: 'nicht_vorhanden', url };
      if (antwort.ok) {
        const inhalt = Buffer.from(await antwort.arrayBuffer());
        return {
          status: 'neu',
          url,
          inhalt,
          sha256: sha256Hex(inhalt),
          etag: antwort.headers.get('etag'),
          lastModified: antwort.headers.get('last-modified'),
          abgerufenAm: new Date(),
        };
      }
      if (antwort.status < 500 && antwort.status !== 429) {
        throw new Error(`Abruf ${url} fehlgeschlagen: HTTP ${antwort.status}`);
      }
      ursache = new Error(`HTTP ${antwort.status}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith(`Abruf ${url} fehlgeschlagen`)) throw e;
      ursache = e;
    }
    const warte = wartezeiten[versuch];
    if (warte === undefined) {
      throw new Error(`Abruf ${url} nach ${versuch + 1} Versuchen fehlgeschlagen: ${String(ursache)}`, { cause: ursache });
    }
    await pause(warte);
  }
}
```

- [ ] **Step 4: Tests ausführen**

Run: `pnpm --filter @hb/ingest test`
Expected: 7 neue Tests PASS, alle bisherigen PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ingest/src/abruf
git commit -m "feat(ingest): bedingter Abruf der Soll-XML mit Backoff"
```

---

### Task 5: Lokale Supabase-Datenbank und Migrationen für `ops` und `raw`

**Files:**
- Create: `supabase/config.toml` (über `supabase init`, dann angepasst)
- Create: `supabase/migrations/20261008120000_schemas.sql`, `supabase/migrations/20261008120100_ops_raw.sql`
- Create: `packages/ingest/src/db/client.ts`, `packages/ingest/src/db/test-hilfen.ts`
- Test: `packages/ingest/src/db/schema.int.test.ts`

**Interfaces:**
- Produces:
  - `type Sql = postgres.Sql`, `LOKALE_DB`, `verbinde(url?: string): Sql`
  - `inTransaktion<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T>`: Transaktion auf einer Verbindung, Savepoint innerhalb einer Transaktion
  - `imRollback(fn: (tx: Sql) => Promise<void>): Promise<void>`: Testhilfe, rollt immer zurück
  - Tabellen `ops.source_registry`, `ops.load_run`, `raw.source_file`, `raw.soll_kapitel`, `raw.soll_titel` (Spalten siehe Migration)

- [ ] **Step 1: Supabase initialisieren und auf das Schema `api` beschränken**

```bash
pnpm dlx supabase@2.120.0 init --with-vscode-settings=false --with-intellij-settings=false
```

In `supabase/config.toml` diese Schlüssel setzen (Rest unverändert lassen):
```toml
project_id = "haushaltsblick"

[api]
schemas = ["api"]
extra_search_path = ["api", "extensions"]
```

- [ ] **Step 2: Client und Testhilfe anlegen**

```bash
pnpm --filter @hb/ingest add postgres@3.4.9
```

`packages/ingest/src/db/client.ts`:
```ts
import postgres from 'postgres';

export type Sql = postgres.Sql;

export const LOKALE_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function verbinde(url: string = process.env.DATABASE_URL ?? LOKALE_DB): Sql {
  return postgres(url, { max: 4, onnotice: () => {} });
}

/** Führt fn atomar aus: als Transaktion auf einer Verbindung, als Savepoint innerhalb einer Transaktion. */
export function inTransaktion<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  if ('savepoint' in sql && typeof sql.savepoint === 'function') {
    return (sql as postgres.TransactionSql).savepoint((tx) => fn(tx)) as unknown as Promise<T>;
  }
  return sql.begin((tx) => fn(tx)) as unknown as Promise<T>;
}
```

`packages/ingest/src/db/test-hilfen.ts`:
```ts
import { verbinde, type Sql } from './client';

const ROLLBACK = new Error('rollback');

/** Führt fn in einer Transaktion aus, die immer zurückgerollt wird. Lokale Daten bleiben unberührt. */
export async function imRollback(fn: (tx: Sql) => Promise<void>): Promise<void> {
  const sql = verbinde();
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  } finally {
    await sql.end();
  }
}
```

- [ ] **Step 3: Failing Integrationstest schreiben**

`packages/ingest/src/db/schema.int.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { inTransaktion } from './client';
import { imRollback } from './test-hilfen';

describe('Datenbankschema', () => {
  it('legt alle sieben Schemas an', () =>
    imRollback(async (tx) => {
      const rows = await tx<{ schema_name: string }[]>`
        select schema_name from information_schema.schemata
        where schema_name in ('raw', 'core', 'mart', 'semantic', 'ops', 'audit', 'api') order by 1`;
      expect(rows.map((r) => r.schema_name)).toEqual(['api', 'audit', 'core', 'mart', 'ops', 'raw', 'semantic']);
    }));

  it('registriert die Soll-Quelle als offiziell', () =>
    imRollback(async (tx) => {
      const rows = await tx`select source_id, offiziell, vertrag_pfad from ops.source_registry order by 1`;
      expect(rows).toEqual([{ source_id: 'SRC_SOLL_XML', offiziell: true, vertrag_pfad: 'contracts/src_soll_xml.yaml' }]);
    }));

  it('aktiviert RLS auf allen Tabellen in raw und ops', () =>
    imRollback(async (tx) => {
      const ohneRls = await tx`
        select n.nspname || '.' || c.relname as tabelle
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('raw', 'ops') and c.relkind = 'r' and not c.relrowsecurity`;
      expect(ohneRls).toEqual([]);
    }));

  it.each(['anon', 'authenticated'])('verweigert der Rolle %s den Zugriff auf Rohdaten', (rolle) =>
    imRollback(async (tx) => {
      await expect(
        inTransaktion(tx, async (t) => {
          await t.unsafe(`set local role ${rolle}`);
          await t`select 1 from raw.soll_titel limit 1`;
        }),
      ).rejects.toThrow(/permission denied/);
    }));

  it('rechnet Tausend Euro in Euro um und bildet den Titelschlüssel', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_SOLL_XML', 'ci', 'test', '0') returning run_id`;
      const [titel] = await tx`
        insert into raw.soll_titel (run_id, jahr, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text,
          konto, konto_block, titel_nr, titel_text, flexibilisiert, fkt, soll_tsd_eur, xml_pfad, zeilen_hash)
        values (${lauf!.run_id}, 2026, '04', 'EP', '0411', 'K', 'ausgaben', 1, '97201', 'GMA', false, '880', -168, '/x', 'h')
        returning titel_key, soll_eur::text as soll_eur`;
      expect(titel).toEqual({ titel_key: '041197201', soll_eur: '-168000.00' });
    }));

  it('lehnt unbekannte Konten ab', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_SOLL_XML', 'ci', 'test', '0') returning run_id`;
      await expect(
        inTransaktion(tx, (t) => t`
          insert into raw.soll_titel (run_id, jahr, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text,
            konto, konto_block, titel_nr, titel_text, flexibilisiert, fkt, soll_tsd_eur, xml_pfad, zeilen_hash)
          values (${lauf!.run_id}, 2026, '04', 'EP', '0411', 'K', 'sonstiges', 1, '97201', 'GMA', false, '880', 1, '/x', 'h')`),
      ).rejects.toThrow(/soll_titel_konto_check/);
    }));
});
```

- [ ] **Step 4: Datenbank starten, Test ausführen und Fehlschlag prüfen**

Run: `pnpm db:start && pnpm --filter @hb/ingest test:int`
Expected: Datenbank startet (Docker muss laufen), Tests FAIL, unter anderem „relation "ops.source_registry" does not exist“

- [ ] **Step 5: Migrationen schreiben**

`supabase/migrations/20261008120000_schemas.sql`:
```sql
-- Sieben Schemas laut Konzept Abschnitt 7. Nach außen sichtbar ist nur api (config.toml).
create schema if not exists raw;
create schema if not exists core;
create schema if not exists mart;
create schema if not exists semantic;
create schema if not exists ops;
create schema if not exists audit;
create schema if not exists api;

revoke all on schema raw, core, mart, semantic, ops, audit from anon, authenticated;
```

`supabase/migrations/20261008120100_ops_raw.sql`:
```sql
-- Quellenregister
create table ops.source_registry (
  source_id      text primary key,
  bezeichnung    text not null,
  url_muster     text not null,
  offiziell      boolean not null,
  lizenz         text not null,
  vertrag_pfad   text not null
);

insert into ops.source_registry values (
  'SRC_SOLL_XML',
  'Haushaltsplan des Bundes (XML), Soll je Titel',
  'https://www.bundeshaushalt.de/static/daten/{jahr}/soll/haushalt_{jahr}.xml',
  true,
  'Amtliches Werk, Quellenvermerk "Bundesministerium der Finanzen, bundeshaushalt.de"',
  'contracts/src_soll_xml.yaml'
);

-- Ein Ladelauf je Quelle und Jahr
create table ops.load_run (
  run_id           uuid primary key default gen_random_uuid(),
  source_id        text not null references ops.source_registry,
  trigger          text not null check (trigger in ('schedule', 'manual', 'ci')),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running'
                   check (status in ('running', 'succeeded', 'failed', 'quarantined', 'skipped')),
  git_sha          text not null,
  pipeline_version text not null,
  params           jsonb not null default '{}',
  rows_loaded      integer,
  error            text
);
create index on ops.load_run (source_id, started_at desc);

-- Metadaten der Rohdateien; die Datei selbst liegt unter ablage_uri (Roadmap E8)
create table raw.source_file (
  run_id        uuid not null references ops.load_run on delete cascade,
  source_id     text not null references ops.source_registry,
  jahr          integer not null,
  source_url    text not null,
  http_etag     text,
  last_modified text,
  fetched_at    timestamptz not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size     integer not null check (byte_size > 0),
  ablage_uri    text not null,
  primary key (run_id, source_url)
);
create index on raw.source_file (source_id, jahr, fetched_at desc);

-- Kapitel aus der XML-Datei, auch entfallene und Anlagen
create table raw.soll_kapitel (
  run_id               uuid not null references ops.load_run on delete cascade,
  jahr                 integer not null,
  einzelplan_nr        text not null,
  einzelplan_text      text not null,
  kapitel_nr           text not null,
  kapitel_text         text not null,
  anlage_zu_kapitel_nr text,
  anzahl_titel         integer not null,
  entfallen            boolean not null,
  xml_pfad             text not null,
  primary key (run_id, kapitel_nr)
);

-- Abgeflachte Titelzeilen; Eindeutigkeit prüft dbt (DQ-02), raw nimmt alles auf
create table raw.soll_titel (
  id                   bigint generated always as identity primary key,
  run_id               uuid not null references ops.load_run on delete cascade,
  jahr                 integer not null,
  einzelplan_nr        text not null,
  einzelplan_text      text not null,
  kapitel_nr           text not null,
  kapitel_text         text not null,
  anlage_zu_kapitel_nr text,
  konto                text not null check (konto in ('einnahmen', 'ausgaben')),
  konto_block          integer not null check (konto_block >= 1),
  ausgabeart_text      text,
  titelgruppe_nr       text,
  titelgruppe_text     text,
  titel_nr             text not null,
  titel_text           text not null,
  titel_key            text generated always as (kapitel_nr || titel_nr) stored,
  flexibilisiert       boolean not null,
  fkt                  text not null,
  seite                integer,
  soll_tsd_eur         numeric(18,0) not null,
  soll_eur             numeric(18,2) generated always as (soll_tsd_eur * 1000) stored,
  xml_pfad             text not null,
  zeilen_hash          text not null
);
create index on raw.soll_titel (run_id, jahr, kapitel_nr, titel_nr);

-- Kein Zugriff von außen: RLS ohne Policies, Rechte entzogen
alter table ops.source_registry enable row level security;
alter table ops.load_run enable row level security;
alter table raw.source_file enable row level security;
alter table raw.soll_kapitel enable row level security;
alter table raw.soll_titel enable row level security;

revoke all on all tables in schema raw, ops from anon, authenticated;
alter default privileges in schema raw, ops revoke all on tables from anon, authenticated;
```

- [ ] **Step 6: Datenbank zurücksetzen und Tests ausführen**

Run: `pnpm db:reset && pnpm --filter @hb/ingest test:int && pnpm typecheck`
Expected: 7 Integrationstests PASS, Typecheck ohne Fehler

- [ ] **Step 7: Commit**

```bash
git add supabase packages/ingest/src/db packages/ingest/package.json pnpm-lock.yaml
git commit -m "feat(db): lokale Supabase mit Schemas, ops und raw inklusive RLS"
```

---

### Task 6: Laden von Läufen und Rohdaten

**Files:**
- Create: `packages/ingest/src/db/lade-soll.ts`
- Test: `packages/ingest/src/db/lade-soll.int.test.ts`

**Interfaces:**
- Consumes: `Sql`, `inTransaktion`, `imRollback` (Task 5), `SollZeile` und Testhilfen (Task 2)
- Produces:
  - `type Trigger = 'schedule' | 'manual' | 'ci'`, `type LaufStatus = 'succeeded' | 'failed' | 'quarantined' | 'skipped'`
  - `type LaufStart = { sourceId: string; trigger: Trigger; gitSha: string; pipelineVersion: string; params: Record<string, string | number | null> }`
  - `starteLauf(sql: Sql, l: LaufStart): Promise<string>` (liefert `run_id`)
  - `beendeLauf(sql: Sql, runId: string, e: { status: LaufStatus; rowsLoaded?: number; fehler?: string }): Promise<void>`
  - `letzteSollDatei(sql: Sql, jahr: number): Promise<{ sha256: string; etag: string | null } | null>`
  - `type QuellDatei = { runId: string; sourceId: string; jahr: number; url: string; etag: string | null; lastModified: string | null; abgerufenAm: Date; sha256: string; byteSize: number; ablageUri: string }`
  - `speichereQuellDatei(sql: Sql, d: QuellDatei): Promise<void>`
  - `speichereSollZeilen(sql: Sql, runId: string, zeilen: readonly SollZeile[]): Promise<{ titel: number; kapitel: number }>`

- [ ] **Step 1: Failing Tests schreiben**

`packages/ingest/src/db/lade-soll.int.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { leseXmlDatei } from '../xml/parse-soll';
import { FIXTURE_2026, sammle } from '../xml/test-hilfen';
import type { SollZeile } from '../xml/typen';
import { inTransaktion, type Sql } from './client';
import {
  beendeLauf, letzteSollDatei, speichereQuellDatei, speichereSollZeilen, starteLauf,
  type LaufStart, type QuellDatei,
} from './lade-soll';
import { imRollback } from './test-hilfen';

const LAUF: LaufStart = { sourceId: 'SRC_SOLL_XML', trigger: 'ci', gitSha: 'test', pipelineVersion: '0.0.0-test', params: { jahr: 2026 } };

const datei = (runId: string, jahr: number, sha256: string, abgerufenAm: Date, etag: string | null = null): QuellDatei => ({
  runId, sourceId: 'SRC_SOLL_XML', jahr, url: `https://example.org/${jahr}/${sha256}.xml`, etag, lastModified: null,
  abgerufenAm, sha256, byteSize: 1, ablageUri: 'file:///tmp/x.xml',
});

async function laufMitDatei(tx: Sql, status: 'succeeded' | 'failed', d: Omit<QuellDatei, 'runId'>): Promise<void> {
  const runId = await starteLauf(tx, LAUF);
  await speichereQuellDatei(tx, { ...d, runId });
  await beendeLauf(tx, runId, { status });
}

describe('Laden der Soll-Rohdaten', () => {
  it('legt einen Lauf an und schließt ihn ab', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, LAUF);
      const [vorher] = await tx`select status, finished_at, params from ops.load_run where run_id = ${runId}`;
      expect(vorher).toEqual({ status: 'running', finished_at: null, params: { jahr: 2026 } });
      await beendeLauf(tx, runId, { status: 'quarantined', fehler: 'Unbekanntes Element' });
      const [nachher] = await tx`select status, error, finished_at is not null as beendet from ops.load_run where run_id = ${runId}`;
      expect(nachher).toEqual({ status: 'quarantined', error: 'Unbekanntes Element', beendet: true });
    }));

  it('speichert Titel und Kapitel des Auszugs mit Euro-Beträgen und Titelschlüssel', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, LAUF);
      const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
      expect(await speichereSollZeilen(tx, runId, zeilen)).toEqual({ titel: 8, kapitel: 6 });

      const [gma] = await tx`
        select titel_key, soll_tsd_eur::text as tsd, soll_eur::text as eur, konto_block, anlage_zu_kapitel_nr
        from raw.soll_titel where run_id = ${runId} and titel_key = '041197201'`;
      expect(gma).toEqual({ titel_key: '041197201', tsd: '-168', eur: '-168000.00', konto_block: 1, anlage_zu_kapitel_nr: null });

      const [ktf] = await tx`select anlage_zu_kapitel_nr from raw.soll_titel where run_id = ${runId} and titel_key = '609213203'`;
      expect(ktf).toEqual({ anlage_zu_kapitel_nr: '6002' });

      const [entfallen] = await tx`select entfallen, anzahl_titel from raw.soll_kapitel where run_id = ${runId} and kapitel_nr = '0618'`;
      expect(entfallen).toEqual({ entfallen: true, anzahl_titel: 0 });
    }));

  it('findet die zuletzt erfolgreich geladene Datei eines Jahres', () =>
    imRollback(async (tx) => {
      // Jahr 1999 kommt in echten Daten nicht vor, damit lokale Ladeläufe den Test nicht beeinflussen.
      await laufMitDatei(tx, 'succeeded', { ...datei('', 1999, 'c'.repeat(64), new Date('2025-12-01'), '"alt"') });
      await laufMitDatei(tx, 'succeeded', { ...datei('', 1999, 'a'.repeat(64), new Date('2026-01-01'), '"neu"') });
      await laufMitDatei(tx, 'failed', { ...datei('', 1999, 'b'.repeat(64), new Date('2026-02-01'), '"kaputt"') });
      expect(await letzteSollDatei(tx, 1999)).toEqual({ sha256: 'a'.repeat(64), etag: '"neu"' });
      expect(await letzteSollDatei(tx, 1998)).toBeNull();
    }));

  it('hinterlässt keine Teildaten, wenn das Speichern scheitert', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, LAUF);
      const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
      const kaputt: SollZeile[] = zeilen.map((z) =>
        z.art === 'titel' && z.titelNr === '68309' ? { ...z, konto: 'sonstiges' as never } : z,
      );
      await expect(
        inTransaktion(tx, async (t) => {
          await speichereQuellDatei(t, datei(runId, 2026, 'd'.repeat(64), new Date()));
          await speichereSollZeilen(t, runId, kaputt);
        }),
      ).rejects.toThrow(/soll_titel_konto_check/);
      const [anzahl] = await tx`
        select (select count(*)::int from raw.soll_titel where run_id = ${runId}) as titel,
               (select count(*)::int from raw.soll_kapitel where run_id = ${runId}) as kapitel,
               (select count(*)::int from raw.source_file where run_id = ${runId}) as dateien`;
      expect(anzahl).toEqual({ titel: 0, kapitel: 0, dateien: 0 });
    }));
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test:int`
Expected: FAIL mit „Cannot find module ./lade-soll“

- [ ] **Step 3: Implementierung**

`packages/ingest/src/db/lade-soll.ts`:
```ts
import type { SollKapitel, SollTitel, SollZeile } from '../xml/typen';
import type { Sql } from './client';

export type Trigger = 'schedule' | 'manual' | 'ci';
export type LaufStatus = 'succeeded' | 'failed' | 'quarantined' | 'skipped';

export type LaufStart = {
  sourceId: string;
  trigger: Trigger;
  gitSha: string;
  pipelineVersion: string;
  params: Record<string, string | number | null>;
};

export type QuellDatei = {
  runId: string;
  sourceId: string;
  jahr: number;
  url: string;
  etag: string | null;
  lastModified: string | null;
  abgerufenAm: Date;
  sha256: string;
  byteSize: number;
  ablageUri: string;
};

const STUECKGROESSE = 1000;

function* stuecke<T>(werte: readonly T[], groesse: number): Generator<T[]> {
  for (let i = 0; i < werte.length; i += groesse) yield werte.slice(i, i + groesse);
}

export async function starteLauf(sql: Sql, l: LaufStart): Promise<string> {
  const [lauf] = await sql<{ run_id: string }[]>`
    insert into ops.load_run (source_id, trigger, git_sha, pipeline_version, params)
    values (${l.sourceId}, ${l.trigger}, ${l.gitSha}, ${l.pipelineVersion}, ${sql.json(l.params)})
    returning run_id`;
  return lauf!.run_id;
}

export async function beendeLauf(
  sql: Sql,
  runId: string,
  e: { status: LaufStatus; rowsLoaded?: number; fehler?: string },
): Promise<void> {
  await sql`
    update ops.load_run
    set status = ${e.status}, finished_at = now(), rows_loaded = ${e.rowsLoaded ?? null}, error = ${e.fehler ?? null}
    where run_id = ${runId}`;
}

export async function letzteSollDatei(sql: Sql, jahr: number): Promise<{ sha256: string; etag: string | null } | null> {
  const [datei] = await sql<{ sha256: string; http_etag: string | null }[]>`
    select f.sha256, f.http_etag
    from raw.source_file f join ops.load_run l using (run_id)
    where f.source_id = 'SRC_SOLL_XML' and f.jahr = ${jahr} and l.status = 'succeeded'
    order by f.fetched_at desc
    limit 1`;
  return datei ? { sha256: datei.sha256, etag: datei.http_etag } : null;
}

export async function speichereQuellDatei(sql: Sql, d: QuellDatei): Promise<void> {
  await sql`
    insert into raw.source_file
      (run_id, source_id, jahr, source_url, http_etag, last_modified, fetched_at, sha256, byte_size, ablage_uri)
    values
      (${d.runId}, ${d.sourceId}, ${d.jahr}, ${d.url}, ${d.etag}, ${d.lastModified}, ${d.abgerufenAm},
       ${d.sha256}, ${d.byteSize}, ${d.ablageUri})`;
}

export async function speichereSollZeilen(
  sql: Sql,
  runId: string,
  zeilen: readonly SollZeile[],
): Promise<{ titel: number; kapitel: number }> {
  const kapitel = zeilen
    .filter((z): z is SollKapitel => z.art === 'kapitel')
    .map((k) => ({
      run_id: runId,
      jahr: k.jahr,
      einzelplan_nr: k.einzelplanNr,
      einzelplan_text: k.einzelplanText,
      kapitel_nr: k.kapitelNr,
      kapitel_text: k.kapitelText,
      anlage_zu_kapitel_nr: k.anlageZuKapitelNr,
      anzahl_titel: k.anzahlTitel,
      entfallen: k.entfallen,
      xml_pfad: k.xmlPfad,
    }));
  const titel = zeilen
    .filter((z): z is SollTitel => z.art === 'titel')
    .map((t) => ({
      run_id: runId,
      jahr: t.jahr,
      einzelplan_nr: t.einzelplanNr,
      einzelplan_text: t.einzelplanText,
      kapitel_nr: t.kapitelNr,
      kapitel_text: t.kapitelText,
      anlage_zu_kapitel_nr: t.anlageZuKapitelNr,
      konto: t.konto,
      konto_block: t.kontoBlock,
      ausgabeart_text: t.ausgabeartText,
      titelgruppe_nr: t.titelgruppeNr,
      titelgruppe_text: t.titelgruppeText,
      titel_nr: t.titelNr,
      titel_text: t.titelText,
      flexibilisiert: t.flexibilisiert,
      fkt: t.fkt,
      seite: t.seite,
      soll_tsd_eur: t.sollTsdEur,
      xml_pfad: t.xmlPfad,
      zeilen_hash: t.zeilenHash,
    }));

  for (const stueck of stuecke(kapitel, STUECKGROESSE)) await sql`insert into raw.soll_kapitel ${sql(stueck)}`;
  for (const stueck of stuecke(titel, STUECKGROESSE)) await sql`insert into raw.soll_titel ${sql(stueck)}`;
  return { titel: titel.length, kapitel: kapitel.length };
}
```

- [ ] **Step 4: Tests ausführen**

Run: `pnpm --filter @hb/ingest test:int && pnpm typecheck`
Expected: 4 neue Integrationstests PASS, Schematests weiterhin PASS, Typecheck ohne Fehler

- [ ] **Step 5: Commit**

```bash
git add packages/ingest/src/db/lade-soll.ts packages/ingest/src/db/lade-soll.int.test.ts
git commit -m "feat(ingest): Ladeläufe und Soll-Rohdaten in raw speichern"
```

---

### Task 7: Ingest-Ablauf je Jahr, Jahresangabe, Bericht und CLI

**Files:**
- Create: `packages/ingest/src/jahre.ts`, `packages/ingest/src/bericht.ts`, `packages/ingest/src/soll-ingest.ts`, `packages/ingest/src/cli.ts`, `packages/ingest/src/bin.ts`
- Test: `packages/ingest/src/jahre.test.ts`, `packages/ingest/src/bericht.test.ts`, `packages/ingest/src/soll-ingest.int.test.ts`, `packages/ingest/src/cli.int.test.ts`

**Interfaces:**
- Consumes: alles aus Task 2 bis 6
- Produces:
  - `ERSTES_JAHR = 2012`, `parseJahre(angabe: string, heute?: Date): number[]`
  - `type SollIngestOptionen = { trigger: Trigger; gitSha: string; pipelineVersion: string; userAgent: string; ablageVerzeichnis: string; lokaleDatei?: string; abruf?: typeof holeSollXml }`
  - `type JahresErgebnis = { jahr: number; runId: string; status: LaufStatus; zusammenfassung?: SollZusammenfassung; hinweis?: string }`
  - `ladeSollJahr(sql: Sql, jahr: number, opt: SollIngestOptionen): Promise<JahresErgebnis>`
  - `formatiereBericht(ergebnisse: readonly JahresErgebnis[]): string` (Markdown-Tabelle, auch für `$GITHUB_STEP_SUMMARY`)
  - `type CliAbhaengigkeiten = { sql?: Sql; heute?: Date; ablageVerzeichnis?: string; abruf?: typeof holeSollXml; log?: (text: string) => void; pauseMs?: number }`
  - `main(argv: readonly string[], abh?: CliAbhaengigkeiten): Promise<number>` (Exit-Code 0 oder 1)

- [ ] **Step 1: Failing Unit-Tests für Jahresangabe und Bericht schreiben**

`packages/ingest/src/jahre.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseJahre } from './jahre';

const HEUTE = new Date('2026-10-08T12:00:00Z');

describe('parseJahre', () => {
  it('liefert für "alle" 2012 bis zum Folgejahr', () => {
    const jahre = parseJahre('alle', HEUTE);
    expect(jahre[0]).toBe(2012);
    expect(jahre.at(-1)).toBe(2027);
    expect(jahre).toHaveLength(16);
  });

  it('liest Bereiche und einzelne Jahre', () => {
    expect(parseJahre('2024-2026', HEUTE)).toEqual([2024, 2025, 2026]);
    expect(parseJahre('2025', HEUTE)).toEqual([2025]);
  });

  it.each(['2026-2024', '2011', '2028', 'abc', '2024-'])('lehnt "%s" ab', (angabe) => {
    expect(() => parseJahre(angabe, HEUTE)).toThrow(/Jahr/);
  });
});
```

`packages/ingest/src/bericht.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatiereBericht } from './bericht';

describe('formatiereBericht', () => {
  it('zeigt je Jahr Status, Titel, Summen in Mrd. € und Hinweise', () => {
    const bericht = formatiereBericht([
      {
        jahr: 2026,
        runId: 'r1',
        status: 'succeeded',
        zusammenfassung: {
          jahr: 2026,
          anzahlTitel: 6995,
          anzahlKapitel: 234,
          entfalleneKapitel: [],
          haushaltTsdEur: { einnahmen: 524540138, ausgaben: 524540138 },
          anlagenTsdEur: { einnahmen: 34803623, ausgaben: 34803623 },
          ausgeglichen: true,
        },
      },
      { jahr: 2027, runId: 'r2', status: 'skipped', hinweis: 'Datei noch nicht veröffentlicht' },
    ]);
    expect(bericht.split('\n')).toEqual([
      '| Jahr | Status | Titel | Ausgaben Soll (Mrd. €) | Anlagen Ausgaben (Mrd. €) | Ausgeglichen | Hinweis |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| 2026 | succeeded | 6995 | 524,5 | 34,8 | ja |  |',
      '| 2027 | skipped |  |  |  |  | Datei noch nicht veröffentlicht |',
    ]);
  });
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test`
Expected: FAIL mit „Cannot find module ./jahre“ und „./bericht“

- [ ] **Step 3: Jahresangabe und Bericht implementieren**

`packages/ingest/src/jahre.ts`:
```ts
export const ERSTES_JAHR = 2012;

/** "alle" = 2012 bis Folgejahr, "2024-2026" = Bereich, "2025" = einzelnes Jahr. */
export function parseJahre(angabe: string, heute: Date = new Date()): number[] {
  const letztes = heute.getFullYear() + 1;
  let von: number;
  let bis: number;
  if (angabe === 'alle') {
    von = ERSTES_JAHR;
    bis = letztes;
  } else {
    const treffer = /^(\d{4})(?:-(\d{4}))?$/.exec(angabe);
    if (!treffer) throw new Error(`Ungültige Jahresangabe: ${angabe}`);
    von = Number(treffer[1]);
    bis = Number(treffer[2] ?? treffer[1]);
  }
  if (von > bis || von < ERSTES_JAHR || bis > letztes) {
    throw new Error(`Jahre außerhalb von ${ERSTES_JAHR} bis ${letztes}: ${angabe}`);
  }
  return Array.from({ length: bis - von + 1 }, (_, i) => von + i);
}
```

`packages/ingest/src/bericht.ts`:
```ts
import type { JahresErgebnis } from './soll-ingest';

const mrd = (tsdEur: number) =>
  (tsdEur / 1_000_000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatiereBericht(ergebnisse: readonly JahresErgebnis[]): string {
  const zeile = (zellen: readonly string[]) => `| ${zellen.join(' | ')} |`;
  const kopf = ['Jahr', 'Status', 'Titel', 'Ausgaben Soll (Mrd. €)', 'Anlagen Ausgaben (Mrd. €)', 'Ausgeglichen', 'Hinweis'];
  const zeilen = [zeile(kopf), zeile(kopf.map(() => '---'))];
  for (const e of ergebnisse) {
    const z = e.zusammenfassung;
    zeilen.push(
      zeile([
        String(e.jahr),
        e.status,
        z ? String(z.anzahlTitel) : '',
        z ? mrd(z.haushaltTsdEur.ausgaben) : '',
        z ? mrd(z.anlagenTsdEur.ausgaben) : '',
        z ? (z.ausgeglichen ? 'ja' : 'nein') : '',
        e.hinweis ?? '',
      ]),
    );
  }
  return zeilen.join('\n');
}
```

`packages/ingest/src/soll-ingest.ts` (zunächst nur Typen, damit `bericht.ts` kompiliert):
```ts
import type { holeSollXml } from './abruf/soll-xml';
import type { LaufStatus, Trigger } from './db/lade-soll';
import type { SollZusammenfassung } from './xml/zusammenfassung';

export type SollIngestOptionen = {
  trigger: Trigger;
  gitSha: string;
  pipelineVersion: string;
  userAgent: string;
  ablageVerzeichnis: string;
  lokaleDatei?: string;
  abruf?: typeof holeSollXml;
};

export type JahresErgebnis = {
  jahr: number;
  runId: string;
  status: LaufStatus;
  zusammenfassung?: SollZusammenfassung;
  hinweis?: string;
};
```

- [ ] **Step 4: Unit-Tests ausführen**

Run: `pnpm --filter @hb/ingest test`
Expected: 8 neue Tests PASS (jahre 7, bericht 1), alle bisherigen PASS

- [ ] **Step 5: Failing Integrationstests für den Ablauf schreiben**

`packages/ingest/src/soll-ingest.int.test.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { sha256Hex, sollXmlUrl, type AbrufErgebnis, type AbrufOptionen } from './abruf/soll-xml';
import type { Sql } from './db/client';
import { imRollback } from './db/test-hilfen';
import { ladeSollJahr, type SollIngestOptionen } from './soll-ingest';
import { FIXTURE_2026 } from './xml/test-hilfen';

const ablage = mkdtempSync(join(tmpdir(), 'hb-ablage-'));

/** Fixture mit eindeutigem Kommentar: anderer SHA-256, damit frühere lokale Läufe nicht stören. */
const einmaligerInhalt = () => `${readFileSync(FIXTURE_2026, 'utf8')}\n<!-- ${randomUUID()} -->\n`;

function einmaligeDatei(): string {
  const pfad = join(ablage, `fixture-${randomUUID()}.xml`);
  writeFileSync(pfad, einmaligerInhalt());
  return pfad;
}

const neu = (inhalt: string, etag: string | null = null): AbrufErgebnis => ({
  status: 'neu', url: sollXmlUrl(2026), inhalt: Buffer.from(inhalt), sha256: sha256Hex(inhalt),
  etag, lastModified: null, abgerufenAm: new Date(),
});

const optionen = (extra: Partial<SollIngestOptionen> = {}): SollIngestOptionen => ({
  trigger: 'ci', gitSha: 'test', pipelineVersion: '0.0.0-test', userAgent: 'Haushaltsblick-Test/0.1',
  ablageVerzeichnis: ablage, ...extra,
});

const laufStatus = async (tx: Sql, runId: string) =>
  (await tx`select status, rows_loaded, error from ops.load_run where run_id = ${runId}`)[0];

describe('ladeSollJahr', () => {
  it('lädt eine neue Datei, legt sie ab und protokolliert den Lauf', () =>
    imRollback(async (tx) => {
      const e = await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: einmaligeDatei() }));
      expect(e.status).toBe('succeeded');
      expect(e.zusammenfassung?.haushaltTsdEur).toEqual({ einnahmen: 145016, ausgaben: 1457 });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'succeeded', rows_loaded: 8, error: null });
      const [datei] = await tx<{ sha256: string }[]>`select sha256 from raw.source_file where run_id = ${e.runId}`;
      expect(readdirSync(join(ablage, 'soll', '2026'))).toContain(`${datei!.sha256}.xml`);
    }));

  it('überspringt eine unveränderte Datei ohne doppelte Zeilen', () =>
    imRollback(async (tx) => {
      const pfad = einmaligeDatei();
      await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: pfad }));
      const zweiter = await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: pfad }));
      expect(zweiter).toMatchObject({ status: 'skipped', hinweis: 'unverändert' });
      const [n] = await tx`select count(*)::int as n from raw.soll_titel where run_id = ${zweiter.runId}`;
      expect(n).toEqual({ n: 0 });
    }));

  it('reicht den ETag des letzten erfolgreichen Laufs an den Abruf weiter', () =>
    imRollback(async (tx) => {
      const etag = `"e-${randomUUID()}"`;
      const abruf = vi.fn(async (_jahr: number, _opt: AbrufOptionen): Promise<AbrufErgebnis> => neu(einmaligerInhalt(), etag));
      await ladeSollJahr(tx, 2026, optionen({ abruf }));
      abruf.mockResolvedValueOnce({ status: 'unveraendert', url: sollXmlUrl(2026) });
      const zweiter = await ladeSollJahr(tx, 2026, optionen({ abruf }));
      expect(abruf.mock.calls[1]![1]).toMatchObject({ etag });
      expect(zweiter).toMatchObject({ status: 'skipped', hinweis: 'unverändert' });
    }));

  it('überspringt nicht veröffentlichte Jahre', () =>
    imRollback(async (tx) => {
      const abruf = async (): Promise<AbrufErgebnis> => ({ status: 'nicht_vorhanden', url: sollXmlUrl(2027) });
      const e = await ladeSollJahr(tx, 2027, optionen({ abruf }));
      expect(e).toMatchObject({ status: 'skipped', hinweis: 'Datei noch nicht veröffentlicht' });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'skipped', rows_loaded: null, error: null });
    }));

  it('stellt Dateien mit Vertragsverletzung unter Quarantäne und speichert nichts', () =>
    imRollback(async (tx) => {
      const abruf = async (): Promise<AbrufErgebnis> => neu(`<haushalt jahr="2026"><verpflichtung/></haushalt><!-- ${randomUUID()} -->`);
      const e = await ladeSollJahr(tx, 2026, optionen({ abruf }));
      expect(e.status).toBe('quarantined');
      expect(e.hinweis).toMatch(/Unbekanntes Element <verpflichtung>/);
      expect(await laufStatus(tx, e.runId)).toMatchObject({ status: 'quarantined', error: expect.stringMatching(/verpflichtung/) });
      const [n] = await tx`select count(*)::int as n from raw.source_file where run_id = ${e.runId}`;
      expect(n).toEqual({ n: 0 });
    }));

  it('stellt eine Datei mit falschem Jahr unter Quarantäne', () =>
    imRollback(async (tx) => {
      const e = await ladeSollJahr(tx, 2025, optionen({ lokaleDatei: einmaligeDatei() }));
      expect(e.status).toBe('quarantined');
      expect(e.hinweis).toMatch(/enthält Jahr 2026 statt 2025/);
    }));

  it('markiert Abruffehler als failed', () =>
    imRollback(async (tx) => {
      const abruf = async (): Promise<AbrufErgebnis> => {
        throw new Error('Abruf nach 4 Versuchen fehlgeschlagen');
      };
      const e = await ladeSollJahr(tx, 2026, optionen({ abruf }));
      expect(e).toMatchObject({ status: 'failed', hinweis: 'Abruf nach 4 Versuchen fehlgeschlagen' });
      expect(await laufStatus(tx, e.runId)).toMatchObject({ status: 'failed', error: 'Abruf nach 4 Versuchen fehlgeschlagen' });
    }));
});
```

- [ ] **Step 6: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test:int`
Expected: FAIL mit „ladeSollJahr is not a function“ oder „does not provide an export named 'ladeSollJahr'“

- [ ] **Step 7: `ladeSollJahr` implementieren**

`packages/ingest/src/soll-ingest.ts` (vollständig ersetzen):
```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { holeSollXml, sha256Hex, type AbrufErgebnis } from './abruf/soll-xml';
import { inTransaktion, type Sql } from './db/client';
import {
  beendeLauf, letzteSollDatei, speichereQuellDatei, speichereSollZeilen, starteLauf,
  type LaufStatus, type Trigger,
} from './db/lade-soll';
import { parseSollXml } from './xml/parse-soll';
import { XmlVertragsFehler, type SollZeile } from './xml/typen';
import { fasseSollZusammen, type SollZusammenfassung } from './xml/zusammenfassung';

export type SollIngestOptionen = {
  trigger: Trigger;
  gitSha: string;
  pipelineVersion: string;
  userAgent: string;
  ablageVerzeichnis: string;
  lokaleDatei?: string;
  abruf?: typeof holeSollXml;
};

export type JahresErgebnis = {
  jahr: number;
  runId: string;
  status: LaufStatus;
  zusammenfassung?: SollZusammenfassung;
  hinweis?: string;
};

type NeueDatei = Extract<AbrufErgebnis, { status: 'neu' }>;

async function leseLokaleDatei(pfad: string): Promise<NeueDatei> {
  const inhalt = await readFile(pfad);
  return {
    status: 'neu',
    url: pathToFileURL(resolve(pfad)).href,
    inhalt,
    sha256: sha256Hex(inhalt),
    etag: null,
    lastModified: null,
    abgerufenAm: new Date(),
  };
}

async function legeAb(verzeichnis: string, jahr: number, datei: NeueDatei): Promise<string> {
  const ordner = join(verzeichnis, 'soll', String(jahr));
  await mkdir(ordner, { recursive: true });
  const pfad = join(ordner, `${datei.sha256}.xml`);
  await writeFile(pfad, datei.inhalt);
  return pathToFileURL(pfad).href;
}

/** Ein Ladelauf für ein Haushaltsjahr: abrufen, ablegen, parsen, prüfen, atomar speichern, protokollieren. */
export async function ladeSollJahr(sql: Sql, jahr: number, opt: SollIngestOptionen): Promise<JahresErgebnis> {
  const runId = await starteLauf(sql, {
    sourceId: 'SRC_SOLL_XML',
    trigger: opt.trigger,
    gitSha: opt.gitSha,
    pipelineVersion: opt.pipelineVersion,
    params: { jahr, datei: opt.lokaleDatei ?? null },
  });

  const ende = async (
    status: LaufStatus,
    extra: { hinweis?: string; zusammenfassung?: SollZusammenfassung; rowsLoaded?: number } = {},
  ): Promise<JahresErgebnis> => {
    const fehler = status === 'failed' || status === 'quarantined' ? extra.hinweis : undefined;
    await beendeLauf(sql, runId, { status, rowsLoaded: extra.rowsLoaded, fehler });
    return { jahr, runId, status, zusammenfassung: extra.zusammenfassung, hinweis: extra.hinweis };
  };

  try {
    const vorher = await letzteSollDatei(sql, jahr);
    const abruf = opt.lokaleDatei
      ? await leseLokaleDatei(opt.lokaleDatei)
      : await (opt.abruf ?? holeSollXml)(jahr, { userAgent: opt.userAgent, etag: vorher?.etag ?? null });

    if (abruf.status === 'nicht_vorhanden') return await ende('skipped', { hinweis: 'Datei noch nicht veröffentlicht' });
    if (abruf.status === 'unveraendert' || abruf.sha256 === vorher?.sha256) {
      return await ende('skipped', { hinweis: 'unverändert' });
    }

    const ablageUri = await legeAb(opt.ablageVerzeichnis, jahr, abruf);
    const zeilen: SollZeile[] = [];
    for await (const zeile of parseSollXml([abruf.inhalt.toString('utf8')])) zeilen.push(zeile);
    const zusammenfassung = fasseSollZusammen(zeilen);
    if (zusammenfassung.jahr !== jahr) {
      throw new XmlVertragsFehler(`Datei enthält Jahr ${zusammenfassung.jahr} statt ${jahr}`, '/haushalt');
    }

    const anzahl = await inTransaktion(sql, async (tx) => {
      await speichereQuellDatei(tx, {
        runId,
        sourceId: 'SRC_SOLL_XML',
        jahr,
        url: abruf.url,
        etag: abruf.etag,
        lastModified: abruf.lastModified,
        abgerufenAm: abruf.abgerufenAm,
        sha256: abruf.sha256,
        byteSize: abruf.inhalt.byteLength,
        ablageUri,
      });
      return speichereSollZeilen(tx, runId, zeilen);
    });
    return await ende('succeeded', { rowsLoaded: anzahl.titel, zusammenfassung });
  } catch (e) {
    const status: LaufStatus = e instanceof XmlVertragsFehler ? 'quarantined' : 'failed';
    return await ende(status, { hinweis: e instanceof Error ? e.message : String(e) });
  }
}
```

- [ ] **Step 8: Integrationstests ausführen**

Run: `pnpm --filter @hb/ingest test:int`
Expected: 7 neue Tests PASS, alle bisherigen PASS

- [ ] **Step 9: Failing Integrationstests für die CLI schreiben**

`packages/ingest/src/cli.int.test.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sollXmlUrl, type AbrufErgebnis } from './abruf/soll-xml';
import { main } from './cli';
import { imRollback } from './db/test-hilfen';
import { FIXTURE_2026 } from './xml/test-hilfen';

const ablage = mkdtempSync(join(tmpdir(), 'hb-cli-'));
const HEUTE = new Date('2026-10-08T12:00:00Z');

function einmaligeDatei(): string {
  const pfad = join(ablage, `fixture-${randomUUID()}.xml`);
  writeFileSync(pfad, `${readFileSync(FIXTURE_2026, 'utf8')}\n<!-- ${randomUUID()} -->\n`);
  return pfad;
}

describe('CLI', () => {
  it('lädt eine lokale Datei, druckt den Bericht und endet mit 0', () =>
    imRollback(async (tx) => {
      const ausgaben: string[] = [];
      const code = await main(['--', '--jahre', '2026', '--datei', einmaligeDatei()], {
        sql: tx, heute: HEUTE, ablageVerzeichnis: ablage, log: (t) => ausgaben.push(t),
      });
      expect(code).toBe(0);
      expect(ausgaben.join('\n')).toContain('| 2026 | succeeded | 8 | 0,0 | 6,5 | nein |  |');
    }));

  it('endet mit 0, wenn das Folgejahr noch nicht veröffentlicht ist', () =>
    imRollback(async (tx) => {
      process.env.INGEST_USER_AGENT = 'Haushaltsblick-Test/0.1';
      const abruf = async (): Promise<AbrufErgebnis> => ({ status: 'nicht_vorhanden', url: sollXmlUrl(2027) });
      const ausgaben: string[] = [];
      const code = await main(['--jahre', '2027'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage, abruf, log: (t) => ausgaben.push(t) });
      expect(code).toBe(0);
      expect(ausgaben.join('\n')).toContain('| 2027 | skipped |');
    }));

  it('endet mit 1 bei Quarantäne', () =>
    imRollback(async (tx) => {
      process.env.INGEST_USER_AGENT = 'Haushaltsblick-Test/0.1';
      const abruf = async (): Promise<AbrufErgebnis> => {
        const inhalt = Buffer.from(`<haushalt jahr="2026"><verpflichtung/></haushalt><!-- ${randomUUID()} -->`);
        return { status: 'neu', url: sollXmlUrl(2026), inhalt, sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'), etag: null, lastModified: null, abgerufenAm: new Date() };
      };
      const code = await main(['--jahre', '2026'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage, abruf, log: () => {} });
      expect(code).toBe(1);
    }));

  it('erlaubt --datei nur mit genau einem Jahr', async () => {
    await expect(main(['--jahre', '2025-2026', '--datei', 'x.xml'], { heute: HEUTE })).rejects.toThrow(
      '--datei ist nur mit genau einem Jahr erlaubt',
    );
  });

  it('verlangt einen User-Agent für Abrufe aus dem Netz', async () => {
    delete process.env.INGEST_USER_AGENT;
    await expect(main(['--jahre', '2026'], { heute: HEUTE })).rejects.toThrow(/INGEST_USER_AGENT fehlt/);
  });
});
```

- [ ] **Step 10: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test:int`
Expected: FAIL mit „Cannot find module ./cli“

- [ ] **Step 11: CLI und Einstiegspunkt implementieren**

`packages/ingest/src/cli.ts`:
```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatiereBericht } from './bericht';
import { verbinde, type Sql } from './db/client';
import type { Trigger } from './db/lade-soll';
import { parseJahre } from './jahre';
import { ladeSollJahr, type JahresErgebnis, type SollIngestOptionen } from './soll-ingest';

const TRIGGER: readonly Trigger[] = ['schedule', 'manual', 'ci'];
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type CliAbhaengigkeiten = {
  sql?: Sql;
  heute?: Date;
  ablageVerzeichnis?: string;
  abruf?: SollIngestOptionen['abruf'];
  log?: (text: string) => void;
  pauseMs?: number;
};

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unbekannt';
  }
}

function pipelineVersion(): string {
  const paket = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return paket.version;
}

export async function main(argv: readonly string[], abh: CliAbhaengigkeiten = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv.filter((a) => a !== '--'),
    options: { jahre: { type: 'string', default: 'alle' }, datei: { type: 'string' } },
  });
  const jahre = parseJahre(values.jahre ?? 'alle', abh.heute);
  if (values.datei !== undefined && jahre.length !== 1) throw new Error('--datei ist nur mit genau einem Jahr erlaubt');

  const userAgent = process.env.INGEST_USER_AGENT ?? '';
  if (values.datei === undefined && userAgent === '') {
    throw new Error('INGEST_USER_AGENT fehlt, z. B. "Haushaltsblick/0.1 (+mailto:kontakt@example.org)"');
  }
  const trigger = (process.env.HB_TRIGGER ?? 'manual') as Trigger;
  if (!TRIGGER.includes(trigger)) throw new Error(`Unbekannter HB_TRIGGER: ${trigger}`);

  const opt: SollIngestOptionen = {
    trigger,
    gitSha: gitSha(),
    pipelineVersion: pipelineVersion(),
    userAgent,
    ablageVerzeichnis: abh.ablageVerzeichnis ?? fileURLToPath(new URL('../../../data/raw', import.meta.url)),
    lokaleDatei: values.datei,
    abruf: abh.abruf,
  };

  const sql = abh.sql ?? verbinde();
  const log = abh.log ?? ((text: string) => console.log(text));
  const ergebnisse: JahresErgebnis[] = [];
  try {
    for (const [i, jahr] of jahre.entries()) {
      if (i > 0) await pause(abh.pauseMs ?? 500);
      ergebnisse.push(await ladeSollJahr(sql, jahr, opt));
    }
  } finally {
    if (!abh.sql) await sql.end();
  }

  log(formatiereBericht(ergebnisse));
  return ergebnisse.some((e) => e.status === 'failed' || e.status === 'quarantined') ? 1 : 0;
}
```

`packages/ingest/src/bin.ts`:
```ts
import { main } from './cli';

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  },
);
```

- [ ] **Step 12: Alle Tests ausführen und einen Lauf mit der Fixture prüfen**

Run: `pnpm test && pnpm test:int && pnpm typecheck`
Expected: alle Unit- und Integrationstests PASS, Typecheck ohne Fehler

Run: `pnpm --filter @hb/ingest start --jahre 2026 --datei fixtures/soll_2026_auszug.xml`
Expected: Tabelle mit der Zeile `| 2026 | succeeded | 8 | 0,0 | 6,5 | nein |  |`, Exit-Code 0. Ein zweiter Aufruf zeigt `skipped` mit `unverändert`.

- [ ] **Step 13: Commit**

```bash
git add packages/ingest/src
git commit -m "feat(ingest): Ablauf je Jahr, CLI und Bericht für den Soll-Ingest"
```

---

### Task 8: CI, echter Lauf 2012 bis 2027 und Befundbericht

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docs/befunde/2026-10-soll-ingest.md`
- Modify: `docs/KONZEPT.md` (Abschnitte 3, 4 und 7 laut Roadmap E1, E8, E12)

**Interfaces:**
- Consumes: CLI aus Task 7, Abnahmetest aus Task 3 (`HB_ECHTE_XML`)
- Produces: grüne CI auf `main`, geladene Soll-Daten 2012 bis 2026 in der lokalen Datenbank, Befundbericht als Grundlage für Plan 2 und 3

- [ ] **Step 1: CI-Workflow anlegen**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - uses: supabase/setup-cli@v1
        with: { version: 2.120.0 }
      - run: supabase db start
      - run: supabase migration up --local
      - run: pnpm test:int
```

- [ ] **Step 2: Kontaktadresse für den User-Agent erfragen**

Alexander nach der Kontaktadresse fragen, die im `User-Agent` stehen soll (Konzept Abschnitt 4, ADR-005). Nicht raten, keine Adresse aus anderen Quellen übernehmen.

- [ ] **Step 3: Echten Lauf ausführen** (Datenbank läuft, Git Bash)

```bash
pnpm db:reset
mkdir -p data/raw
INGEST_USER_AGENT="Haushaltsblick/0.1 (+mailto:<Adresse aus Step 2>)" pnpm --filter @hb/ingest start --jahre alle | tee data/raw/bericht-alle.md
```
Expected: 2012 bis 2026 `succeeded`, 2027 `skipped` mit „Datei noch nicht veröffentlicht“, 2026 mit 6995 Titeln und `524,5`. Dauer unter 2 Minuten.
Steht ein Jahr auf `quarantined` oder `failed`: **anhalten**, den Hinweis aus dem Bericht an Alexander melden und für die neue Struktur einen Folgetask vorschlagen (Fixture-Ausschnitt plus roter Parser-Test). Den Parser nicht ohne Test aufweichen.

- [ ] **Step 4: Abnahmetest gegen die echte Datei 2026 ausführen**

```bash
HB_ECHTE_XML="$(pwd)/$(ls -S data/raw/soll/2026/*.xml | head -1)" pnpm --filter @hb/ingest exec vitest run --project unit zusammenfassung
```
Expected: der Test „stimmt für die echte Datei 2026 mit dem amtlichen Gesamtvolumen überein“ PASS (nicht übersprungen).
Schlägt er fehl, weil das BMF die Datei nach dem 08.10.2026 aktualisiert hat: Werte im Bericht prüfen, mit dem Wurzelwert der internalapi vergleichen (`https://www.bundeshaushalt.de/internalapi/budgetData?year=2026&account=expenses&quota=target&unit=single`, Feld `detail.value` in Euro) und Kontrollwerte in Test und Datenvertrag gemeinsam aktualisieren.

- [ ] **Step 5: Kennzahlen für den Befundbericht abfragen**

```bash
pnpm dlx supabase@2.120.0 db query --local "
select t.jahr, t.konto, count(*) as titel,
       sum(t.soll_tsd_eur) filter (where t.anlage_zu_kapitel_nr is null) as haushalt_tsd,
       sum(t.soll_tsd_eur) filter (where t.anlage_zu_kapitel_nr is not null) as anlagen_tsd,
       count(*) filter (where t.soll_tsd_eur < 0) as negative
from raw.soll_titel t join ops.load_run l using (run_id)
where l.status = 'succeeded'
group by 1, 2 order by 1, 2;"

pnpm dlx supabase@2.120.0 db query --local "
select k.jahr, k.kapitel_nr, k.anlage_zu_kapitel_nr, k.kapitel_text, k.anzahl_titel
from raw.soll_kapitel k join ops.load_run l using (run_id)
where l.status = 'succeeded' and k.anlage_zu_kapitel_nr is not null order by 1, 2;"

pnpm dlx supabase@2.120.0 db query --local "
select t.jahr, count(*) as doppelte from (
  select t.jahr, t.titel_key from raw.soll_titel t join ops.load_run l using (run_id)
  where l.status = 'succeeded' group by 1, 2 having count(*) > 1) t group by 1 order by 1;"

pnpm dlx supabase@2.120.0 db query --local "select pg_size_pretty(pg_total_relation_size('raw.soll_titel')) as groesse;"
```
Falls `supabase db query` in Version 2.120.0 nicht existiert: dieselben Abfragen mit `docker exec -i $(docker ps -qf name=supabase_db) psql -U postgres -c "<abfrage>"` ausführen.

- [ ] **Step 6: Befundbericht schreiben**

`docs/befunde/2026-10-soll-ingest.md` mit genau diesen Abschnitten anlegen und mit den Ausgaben aus Step 3 und 5 füllen:

```markdown
# Befund Soll-Ingest 2012 bis 2027

Lauf vom <Datum>, Git-SHA <sha>, Pipeline-Version 0.1.0.

## Bericht der CLI
<Tabelle aus data/raw/bericht-alle.md>

## Titel und Summen je Jahr und Konto
<Ergebnis der ersten Abfrage>

## Anlagen je Jahr
<Ergebnis der zweiten Abfrage>

## Auffälligkeiten
- Doppelte Titelschlüssel je Jahr: <Ergebnis der dritten Abfrage oder „keine“>
- Jahre ohne Haushaltsausgleich (ohne Anlagen): <aus der Spalte Ausgeglichen>
- Größe raw.soll_titel für alle Jahre: <Ergebnis der vierten Abfrage>

## Folgerungen für Plan 2 und 3
- <je Auffälligkeit eine Zeile: Konsequenz für DQ-Prüfung, Datenmodell oder Speicherbudget>
```

- [ ] **Step 7: Konzept an die Befunde anpassen**

In `docs/KONZEPT.md`:
- Abschnitt 3, Tabelle „Fachliche Besonderheiten“: Zeile „Leere Elemente“ von `0213` auf `0618` korrigieren. Neue Zeile ergänzen: „Anlagen | `<anlage>` mit Kapitel `6092` (KTF) in Kapitel `6002` | Getrennt summieren, nie im Gesamthaushalt (Roadmap E1)“.
- Abschnitt 4, Tabelle der Quellen: beim `SRC_PORTAL_API` die URL auf `https://www.bundeshaushalt.de/internalapi/budgetData` (mit `www`) ändern. Beim `SRC_SOLL_XML` die Verlässlichkeit auf „2012 bis 2026 bestätigt (08.10.2026)“ setzen. Den YAML-Block durch den Inhalt von `contracts/src_soll_xml.yaml` ersetzen.
- Abschnitt 7: Im SQL-Block `raw.source_file` die Spalte `storage_path` durch `ablage_uri` ersetzen und den Kommentar zu Supabase Storage entfernen. Unter `raw.soll_titel` die Spalten `anlage_zu_kapitel_nr`, `konto_block`, `titel_key` und `soll_eur` ergänzen, wie in `supabase/migrations/20261008120100_ops_raw.sql`.

- [ ] **Step 8: Gesamtprüfung und Commit**

Run: `pnpm typecheck && pnpm test && pnpm test:int`
Expected: alles PASS

```bash
git add .github docs
git commit -m "ci: Typecheck, Unit- und Integrationstests; Befund Soll-Ingest und Konzept-Korrekturen"
```

- [ ] **Step 9: GitHub-Repository verbinden (nur nach Zustimmung)**

Alexander fragen, ob das öffentliche Repository `haushaltsblick` unter seinem Konto jetzt angelegt und gepusht werden soll. Erst nach ausdrücklicher Zustimmung und mit der von ihm genannten Remote-URL:
```bash
git remote add origin <URL von Alexander>
git push -u origin main
```
Expected: Workflow `ci` läuft auf GitHub grün durch.
