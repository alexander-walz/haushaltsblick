# Plan 2: Ist-Ingest und Betrieb – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die tatsächlichen Ausgaben und Einnahmen (Ist) je Titel 2012 bis 2025 sowie den Soll-Entwurf des Folgejahres aus der internalapi geprüft laden, alle Rohantworten archivieren und Soll wie Ist jede Woche automatisch per GitHub Actions in eine Supabase-Datenbank in Frankfurt aktualisieren.

**Architecture:** Eine gemeinsame, höfliche Abrufschicht (User-Agent mit Projekt-URL, Drossel auf 2 Anfragen pro Sekunde, Timeout, Backoff, Retry-After) bedient den bestehenden XML-Abruf und einen neuen API-Crawler. Der Crawler läuft je Jahr, Konto und Quote von der Wurzel über Einzelpläne bis zu den Kapiteln (die Titel stehen als Kinder im Kapitel) und prüft jede Ebene centgenau gegen die Summe ihrer Kinder. Rohdaten werden komprimiert in ein Archiv geschrieben, das der Workflow als Assets eines GitHub-Releases `rohdaten` veröffentlicht. Die Datenbank speichert flache Zeilen (`raw.api_titel`, `raw.api_knoten`) und je Lauf die Metadaten (`raw.api_abruf`).

**Tech Stack:** wie Plan 1 (Node 24, pnpm 11, TypeScript 7, Vitest 5, postgres 3, Supabase CLI 2.120.0) plus zod 4.6.5, GitHub Actions, GitHub Releases, Supabase Free (eu-central-1).

**Spec:** `docs/KONZEPT.md` (Abschnitte 4, 6a, 8, 16) zusammen mit `docs/superpowers/plans/2026-10-08-00-roadmap.md` (E7, E8, E9 und „Übertrag aus Plan 1“ gelten vor dem Konzept).

## Global Constraints

- Alles aus Plan 1 gilt weiter (Versionen, TypeScript-Einstellungen, Fachbegriffe deutsch, Migrationen nur additiv, nie still verwerfen, Anlagen nie im Gesamthaushalt, nur kostenfreie Dienste).
- User-Agent ohne E-Mail-Adresse: Standard `Haushaltsblick/<pipeline_version> (+https://github.com/alexander-walz/haushaltsblick)`. `INGEST_USER_AGENT` darf ihn überschreiben.
- Höchstens 2 Anfragen pro Sekunde: alle Abrufe einer CLI-Ausführung laufen nacheinander über eine gemeinsame Drossel mit 500 ms Mindestabstand. Keine parallelen Anfragen.
- Timeout 30 s je Versuch, Backoff 1 s, 4 s, 16 s, `Retry-After` wird beachtet (höchstens 60 s).
- API-Basis: `https://www.bundeshaushalt.de/internalapi/budgetData` (mit `www`), Parameter `year`, `account` (`expenses`/`income`), `quota` (`target`/`actual`), `unit=single`, optional `id`.
- Beträge der API in Euro als Zahl mit Cent. Speicherung als `numeric(18,2)`, Umrechnung immer über ganze Cent (`Math.round(wert * 100)`).
- Jede Ebene der API muss centgenau der Summe ihrer Kinder entsprechen. Abweichung ist ein Vertragsfehler und führt zu `quarantined`.
- Die API lässt Titel mit Wert 0 weg. Ein fehlender Titel bedeutet 0, nicht „unbekannt“.
- `pipeline_version` ist die Version in `packages/ingest/package.json`. Sie wird bei jeder Änderung an Parser, Crawler oder Datenmodell erhöht (dieser Plan: `0.2.0`).
- Workflows laufen nur, wenn die Repository-Variable `HB_INGEST_AKTIV` den Wert `true` hat. Ohne sie bleiben geplante Läufe still.
- Keine Geheimnisse im Repository. Die Datenbank-URL steht ausschließlich im GitHub-Secret `SUPABASE_DB_URL`.

## Review Focus

1. **Die API ändert ihre Struktur** (neues Feld, fehlendes Pflichtfeld, anderer Typ). Erwartet: Neue Felder ergeben Warnungen im Lauf, fehlende oder falsch typisierte Pflichtfelder ergeben `quarantined` ohne gespeicherte Zeilen. Tests: Task 4 und Task 7.
2. **Ist des laufenden Jahres oder ein Jahr vor 2012** (API liefert 404). Erwartet: `skipped` mit „nicht verfügbar“, genau eine Anfrage, Exit-Code 0. Test: Task 7.
3. **Summen passen nicht zusammen** (ein Kind fehlt, Wert geändert). Erwartet: `quarantined` mit Pfad und beiden Beträgen, nichts gespeichert. Tests: Task 5 und Task 7.
4. **Server drosselt oder hängt** (429 mit `Retry-After`, Timeout). Erwartet: Wartezeit laut Header, gedeckelt auf 60 s, danach Wiederholung. Test: Task 1.
5. **Wiederholter Lauf ohne Änderung an der Quelle.** Erwartet: genau eine Anfrage je Jahr und Konto, Status `skipped`, keine neuen Zeilen. Mit `--neu-laden` wird trotzdem vollständig geladen. Test: Task 7.

## Dateistruktur

```text
packages/ingest/
  fixtures/api/                          # echte Antworten (Task 4)
  src/abruf/http.ts                      # holeMitWiederholung, retryAfterMs, Drossel, standardUserAgent, sha256Hex
  src/abruf/soll-xml.ts                  # nutzt http.ts (Verhalten unverändert)
  src/archiv.ts                          # archiviere: gzip, Name, URI
  src/lauf-kontext.ts                    # Trigger, Git-SHA, pipeline_version, User-Agent aus der Umgebung
  src/api/schema.ts                      # zod-Schema, pruefeApiAntwort, ApiVertragsFehler
  src/api/crawler.ts                     # apiUrl, holeWurzel, crawle, zuCent, centZuDezimal, netzAbruf
  src/api/test-baum.ts                   # Testhilfe: konsistente Antwortbäume, fakeAbruf
  src/db/lade-api.ts                     # letzterApiStand, speichereApiCrawl
  src/api-ingest.ts                      # ladeApiJahr
  src/api-bericht.ts                     # formatiereApiBericht
  src/cli-api.ts, src/bin-api.ts         # CLI "api"
supabase/migrations/20261009120000_api_raw.sql
contracts/src_portal_api.yaml
.github/workflows/ingest.yml, .github/workflows/keepalive.yml
docs/betrieb.md                          # Inbetriebnahme und Runbook
docs/befunde/2026-10-ist-ingest.md       # Ergebnis des ersten Live-Laufs
```

---

### Task 1: Gemeinsame Abrufschicht mit Drossel und Retry-After

**Files:**
- Create: `packages/ingest/src/abruf/http.ts`
- Modify: `packages/ingest/src/abruf/soll-xml.ts` (nutzt `holeMitWiederholung`, Verhalten und Exporte unverändert, `sha256Hex` wird aus `http.ts` re-exportiert)
- Test: `packages/ingest/src/abruf/http.test.ts`; `packages/ingest/src/abruf/soll-xml.test.ts` bleibt unverändert grün

**Interfaces:**
- Produces:
  - `PROJEKT_URL = 'https://github.com/alexander-walz/haushaltsblick'`
  - `standardUserAgent(version: string): string`
  - `sha256Hex(daten: Buffer | string): string`
  - `type HttpOptionen = { userAgent: string; zusatzHeader?: Record<string, string>; fetchImpl?: typeof fetch; wartezeitenMs?: readonly number[]; timeoutMs?: number; maxRetryAfterMs?: number; warte?: (ms: number) => Promise<void>; jetzt?: () => number }`
  - `type HttpAntwort = { status: number; inhalt: Buffer; headers: Headers }`
  - `retryAfterMs(wert: string | null, jetzt: number): number | null`
  - `holeMitWiederholung(url: string, opt: HttpOptionen): Promise<HttpAntwort>` (liefert 2xx, 304, 404; wiederholt 5xx, 429, Netzwerkfehler, Timeout; wirft bei anderen 4xx `Abruf <url> fehlgeschlagen: HTTP <n>` und nach dem letzten Versuch `Abruf <url> nach <n> Versuchen fehlgeschlagen: <ursache>`)
  - `class Drossel { constructor(abstandMs: number, uhr?: { jetzt: () => number; warte: (ms: number) => Promise<void> }); warteAufSlot(): Promise<void> }`

- [ ] **Step 1: Branch prüfen**

Der Branch `feat/plan-2-ist-ingest` (abgezweigt von `feat/plan-1-soll-ingest`, enthält diesen Plan) existiert bereits.
```bash
git checkout feat/plan-2-ist-ingest
git log --oneline -1
```

- [ ] **Step 2: Failing Tests schreiben**

`packages/ingest/src/abruf/http.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { Drossel, holeMitWiederholung, retryAfterMs, standardUserAgent } from './http';

const UA = 'Haushaltsblick-Test/0.1';
const URL_X = 'https://www.bundeshaushalt.de/x';

function fakeFetch(...antworten: Array<Response | Error>) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const naechste = antworten.shift();
    if (!naechste) throw new Error('keine weitere Antwort vorbereitet');
    if (naechste instanceof Error) throw naechste;
    return naechste;
  });
}

function fakeWarte() {
  const gewartet: number[] = [];
  return { gewartet, warte: async (ms: number) => { gewartet.push(ms); } };
}

describe('standardUserAgent', () => {
  it('nennt Version und Projekt-URL, aber keine E-Mail-Adresse', () => {
    expect(standardUserAgent('0.2.0')).toBe('Haushaltsblick/0.2.0 (+https://github.com/alexander-walz/haushaltsblick)');
    expect(standardUserAgent('0.2.0')).not.toContain('@');
  });
});

describe('retryAfterMs', () => {
  it('liest Sekunden', () => expect(retryAfterMs('7', 0)).toBe(7000));
  it('liest ein HTTP-Datum relativ zu jetzt', () => {
    const jetzt = Date.parse('Fri, 09 Oct 2026 10:00:00 GMT');
    expect(retryAfterMs('Fri, 09 Oct 2026 10:00:30 GMT', jetzt)).toBe(30_000);
  });
  it('liefert null für fehlende oder unlesbare Werte', () => {
    expect(retryAfterMs(null, 0)).toBeNull();
    expect(retryAfterMs('bald', 0)).toBeNull();
  });
});

describe('holeMitWiederholung', () => {
  it('liefert 200 mit Inhalt und sendet User-Agent und Zusatz-Header', async () => {
    const f = fakeFetch(new Response('hallo', { status: 200, headers: { etag: '"e"' } }));
    const a = await holeMitWiederholung(URL_X, { userAgent: UA, zusatzHeader: { 'If-None-Match': '"e"' }, fetchImpl: f as unknown as typeof fetch });
    expect(a.status).toBe(200);
    expect(a.inhalt.toString('utf8')).toBe('hallo');
    expect(a.headers.get('etag')).toBe('"e"');
    expect(f).toHaveBeenCalledWith(URL_X, expect.objectContaining({ headers: { 'User-Agent': UA, 'If-None-Match': '"e"' } }));
  });

  it.each([304, 404])('liefert Status %i ohne Wiederholung', async (status) => {
    const f = fakeFetch(new Response(null, { status }));
    expect((await holeMitWiederholung(URL_X, { userAgent: UA, fetchImpl: f as unknown as typeof fetch })).status).toBe(status);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('wartet bei 429 so lange, wie Retry-After verlangt', async () => {
    const { gewartet, warte } = fakeWarte();
    const f = fakeFetch(new Response('', { status: 429, headers: { 'retry-after': '9' } }), new Response('ok', { status: 200 }));
    await holeMitWiederholung(URL_X, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, warte });
    expect(gewartet).toEqual([9000]);
  });

  it('nimmt den Backoff, wenn Retry-After kürzer ist, und deckelt lange Wünsche auf 60 s', async () => {
    const { gewartet, warte } = fakeWarte();
    const f = fakeFetch(
      new Response('', { status: 503, headers: { 'retry-after': '0' } }),
      new Response('', { status: 503, headers: { 'retry-after': '3600' } }),
      new Response('ok', { status: 200 }),
    );
    await holeMitWiederholung(URL_X, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, warte });
    expect(gewartet).toEqual([1000, 60_000]);
  });

  it('wiederholt nach einem Timeout', async () => {
    const { gewartet, warte } = fakeWarte();
    const f = fakeFetch(new DOMException('Zeit abgelaufen', 'TimeoutError'), new Response('ok', { status: 200 }));
    const a = await holeMitWiederholung(URL_X, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, warte });
    expect(a.status).toBe(200);
    expect(gewartet).toEqual([1000]);
  });

  it('gibt nach vier Versuchen auf und nennt die Ursache', async () => {
    const { warte } = fakeWarte();
    const f = fakeFetch(...Array.from({ length: 4 }, () => new Response('', { status: 503 })));
    await expect(holeMitWiederholung(URL_X, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, warte }))
      .rejects.toThrow(`Abruf ${URL_X} nach 4 Versuchen fehlgeschlagen: Error: HTTP 503`);
  });

  it('wiederholt keine Client-Fehler', async () => {
    const f = fakeFetch(new Response('', { status: 403 }));
    await expect(holeMitWiederholung(URL_X, { userAgent: UA, fetchImpl: f as unknown as typeof fetch })).rejects.toThrow(`Abruf ${URL_X} fehlgeschlagen: HTTP 403`);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('Drossel', () => {
  it('hält zwischen zwei Anfragen mindestens den Abstand ein', async () => {
    let t = 0;
    const gewartet: number[] = [];
    const drossel = new Drossel(500, { jetzt: () => t, warte: async (ms) => { gewartet.push(ms); t += ms; } });
    await drossel.warteAufSlot();
    await drossel.warteAufSlot();
    await drossel.warteAufSlot();
    expect(gewartet).toEqual([500, 500]);
    t += 5000;
    await drossel.warteAufSlot();
    expect(gewartet).toEqual([500, 500]);
  });
});
```

- [ ] **Step 3: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test`
Expected: FAIL mit „Cannot find module ./http“

- [ ] **Step 4: Implementierung**

`packages/ingest/src/abruf/http.ts`:
```ts
import { createHash } from 'node:crypto';

export const PROJEKT_URL = 'https://github.com/alexander-walz/haushaltsblick';

export const standardUserAgent = (version: string): string => `Haushaltsblick/${version} (+${PROJEKT_URL})`;

export const sha256Hex = (daten: Buffer | string): string => createHash('sha256').update(daten).digest('hex');

export type HttpOptionen = {
  userAgent: string;
  zusatzHeader?: Record<string, string>;
  fetchImpl?: typeof fetch;
  wartezeitenMs?: readonly number[];
  /** Zeitlimit je Versuch, Standard 30 000 ms. Ein Timeout wird wie ein Netzwerkfehler wiederholt. */
  timeoutMs?: number;
  /** Obergrenze für eine per Retry-After verlangte Wartezeit, Standard 60 000 ms. */
  maxRetryAfterMs?: number;
  warte?: (ms: number) => Promise<void>;
  jetzt?: () => number;
};

export type HttpAntwort = { status: number; inhalt: Buffer; headers: Headers };

const STANDARD_TIMEOUT_MS = 30_000;
const STANDARD_WARTEZEITEN_MS = [1_000, 4_000, 16_000] as const;
const STANDARD_MAX_RETRY_AFTER_MS = 60_000;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry-After in Millisekunden, aus Sekunden oder HTTP-Datum; null, wenn nicht vorhanden oder unlesbar. */
export function retryAfterMs(wert: string | null, jetzt: number): number | null {
  if (wert === null) return null;
  const roh = wert.trim();
  if (/^\d+$/.test(roh)) return Number(roh) * 1000;
  const zeitpunkt = Date.parse(roh);
  return Number.isNaN(zeitpunkt) ? null : Math.max(0, zeitpunkt - jetzt);
}

class ClientFehler extends Error {}

/** GET mit User-Agent, Timeout, Backoff und Retry-After. Liefert 2xx, 304 und 404 zurück, wiederholt 5xx, 429 und Netzwerkfehler. */
export async function holeMitWiederholung(url: string, opt: HttpOptionen): Promise<HttpAntwort> {
  const holen = opt.fetchImpl ?? fetch;
  const wartezeiten = opt.wartezeitenMs ?? STANDARD_WARTEZEITEN_MS;
  const warte = opt.warte ?? pause;
  const jetzt = opt.jetzt ?? Date.now;
  const maxRetryAfter = opt.maxRetryAfterMs ?? STANDARD_MAX_RETRY_AFTER_MS;
  const headers: Record<string, string> = { 'User-Agent': opt.userAgent, ...opt.zusatzHeader };

  for (let versuch = 0; ; versuch++) {
    let ursache: unknown;
    let serverWunschMs: number | null = null;
    try {
      const antwort = await holen(url, { headers, signal: AbortSignal.timeout(opt.timeoutMs ?? STANDARD_TIMEOUT_MS) });
      if (antwort.ok || antwort.status === 304 || antwort.status === 404) {
        return { status: antwort.status, inhalt: Buffer.from(await antwort.arrayBuffer()), headers: antwort.headers };
      }
      if (antwort.status < 500 && antwort.status !== 429) {
        throw new ClientFehler(`Abruf ${url} fehlgeschlagen: HTTP ${antwort.status}`);
      }
      serverWunschMs = retryAfterMs(antwort.headers.get('retry-after'), jetzt());
      ursache = new Error(`HTTP ${antwort.status}`);
    } catch (e) {
      if (e instanceof ClientFehler) throw e;
      ursache = e;
    }
    const backoff = wartezeiten[versuch];
    if (backoff === undefined) {
      throw new Error(`Abruf ${url} nach ${versuch + 1} Versuchen fehlgeschlagen: ${String(ursache)}`, { cause: ursache });
    }
    await warte(serverWunschMs === null ? backoff : Math.min(Math.max(backoff, serverWunschMs), maxRetryAfter));
  }
}

/** Sorgt für einen Mindestabstand zwischen aufeinanderfolgenden Anfragen (500 ms = höchstens 2 pro Sekunde). */
export class Drossel {
  private naechsterSlot = 0;
  private readonly abstandMs: number;
  private readonly uhr: { jetzt: () => number; warte: (ms: number) => Promise<void> };

  constructor(abstandMs: number, uhr: { jetzt: () => number; warte: (ms: number) => Promise<void> } = { jetzt: Date.now, warte: pause }) {
    this.abstandMs = abstandMs;
    this.uhr = uhr;
  }

  async warteAufSlot(): Promise<void> {
    const jetzt = this.uhr.jetzt();
    const warten = Math.max(0, this.naechsterSlot - jetzt);
    this.naechsterSlot = Math.max(jetzt, this.naechsterSlot) + this.abstandMs;
    if (warten > 0) await this.uhr.warte(warten);
  }
}
```

`packages/ingest/src/abruf/soll-xml.ts` vollständig ersetzen:
```ts
import { holeMitWiederholung, sha256Hex, type HttpOptionen } from './http';

export { sha256Hex };

export type AbrufOptionen = Omit<HttpOptionen, 'zusatzHeader'> & { etag?: string | null };

export type AbrufErgebnis =
  | { status: 'neu'; url: string; inhalt: Buffer; sha256: string; etag: string | null; lastModified: string | null; abgerufenAm: Date }
  | { status: 'unveraendert'; url: string }
  | { status: 'nicht_vorhanden'; url: string };

export const sollXmlUrl = (jahr: number): string =>
  `https://www.bundeshaushalt.de/static/daten/${jahr}/soll/haushalt_${jahr}.xml`;

export async function holeSollXml(jahr: number, opt: AbrufOptionen): Promise<AbrufErgebnis> {
  const url = sollXmlUrl(jahr);
  const { etag, ...http } = opt;
  const antwort = await holeMitWiederholung(url, { ...http, zusatzHeader: etag ? { 'If-None-Match': etag } : undefined });
  if (antwort.status === 304) return { status: 'unveraendert', url };
  if (antwort.status === 404) return { status: 'nicht_vorhanden', url };
  return {
    status: 'neu',
    url,
    inhalt: antwort.inhalt,
    sha256: sha256Hex(antwort.inhalt),
    etag: antwort.headers.get('etag'),
    lastModified: antwort.headers.get('last-modified'),
    abgerufenAm: new Date(),
  };
}
```

- [ ] **Step 5: Tests ausführen**

Run: `pnpm --filter @hb/ingest test && pnpm typecheck`
Expected: neue Tests in `http.test.ts` PASS, `soll-xml.test.ts` unverändert PASS (falls ein Header-Vergleich dort ein exaktes Objekt erwartet und an `zusatzHeader: undefined` scheitert, nur die Erwartung auf `expect.objectContaining` umstellen und im Report begründen)

- [ ] **Step 6: Commit**

```bash
git add packages/ingest/src/abruf
git commit -m "feat(ingest): gemeinsame Abrufschicht mit Drossel und Retry-After"
```

---

### Task 2: Laufkontext, Projekt-User-Agent, Neu-Laden und Archiv für den Soll-Ingest

**Files:**
- Create: `packages/ingest/src/lauf-kontext.ts`, `packages/ingest/src/archiv.ts`
- Modify: `packages/ingest/src/cli.ts`, `packages/ingest/src/soll-ingest.ts`, `packages/ingest/package.json` (Version `0.2.0`)
- Test: `packages/ingest/src/lauf-kontext.test.ts`, `packages/ingest/src/archiv.test.ts`; anpassen: `packages/ingest/src/cli.int.test.ts`, `packages/ingest/src/soll-ingest.int.test.ts`

**Interfaces:**
- Consumes: `standardUserAgent`, `sha256Hex` (Task 1)
- Produces:
  - `type LaufKontext = { trigger: Trigger; gitSha: string; pipelineVersion: string; userAgent: string }`
  - `laufKontext(env?: NodeJS.ProcessEnv): LaufKontext` (wirft `Unbekannter HB_TRIGGER: <wert>`)
  - `type ArchivOptionen = { verzeichnis: string; basisUrl?: string }`
  - `type ArchivEintrag = { dateiname: string; pfad: string; uri: string; sha256: string; bytes: number }`
  - `archiviere(opt: ArchivOptionen, name: string, inhalt: Buffer): Promise<ArchivEintrag>` (schreibt `<name>.gz`, `sha256` über den unkomprimierten Inhalt, `uri` = `<basisUrl>/<name>.gz` oder repo-relativ `data/raw/archiv/<name>.gz`)
  - `STANDARD_ARCHIV_VERZEICHNIS` (absoluter Pfad zu `<repo>/data/raw/archiv`)
  - `SollIngestOptionen` erweitert um `archivBasisUrl?: string` und `neuLaden?: boolean`
  - Soll-CLI: Option `--neu-laden`, User-Agent aus `laufKontext`

- [ ] **Step 1: Failing Tests schreiben**

`packages/ingest/src/lauf-kontext.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { laufKontext } from './lauf-kontext';

describe('laufKontext', () => {
  it('nutzt ohne Umgebungsvariablen den Projekt-User-Agent und den Trigger manual', () => {
    const k = laufKontext({});
    expect(k.trigger).toBe('manual');
    expect(k.pipelineVersion).toBe('0.2.0');
    expect(k.userAgent).toBe('Haushaltsblick/0.2.0 (+https://github.com/alexander-walz/haushaltsblick)');
  });

  it('übernimmt INGEST_USER_AGENT, HB_TRIGGER und GITHUB_SHA', () => {
    expect(laufKontext({ INGEST_USER_AGENT: 'X/1', HB_TRIGGER: 'schedule', GITHUB_SHA: 'abc123' })).toMatchObject({
      userAgent: 'X/1', trigger: 'schedule', gitSha: 'abc123',
    });
  });

  it('lehnt unbekannte Trigger ab', () => {
    expect(() => laufKontext({ HB_TRIGGER: 'cron' })).toThrow('Unbekannter HB_TRIGGER: cron');
  });
});
```

`packages/ingest/src/archiv.test.ts`:
```ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './abruf/http';
import { archiviere } from './archiv';

const verzeichnis = () => mkdtempSync(join(tmpdir(), 'hb-archiv-'));

describe('archiviere', () => {
  it('schreibt komprimiert und liefert Hash des Originals und eine repo-relative URI', async () => {
    const v = verzeichnis();
    const e = await archiviere({ verzeichnis: v }, 'soll_2026_abc.xml', Buffer.from('<haushalt/>'));
    expect(e.dateiname).toBe('soll_2026_abc.xml.gz');
    expect(e.uri).toBe('data/raw/archiv/soll_2026_abc.xml.gz');
    expect(e.sha256).toBe(sha256Hex('<haushalt/>'));
    expect(gunzipSync(readFileSync(e.pfad)).toString('utf8')).toBe('<haushalt/>');
    expect(e.bytes).toBe(readFileSync(e.pfad).byteLength);
  });

  it('bildet mit Basis-URL die Download-Adresse des Releases', async () => {
    const e = await archiviere(
      { verzeichnis: verzeichnis(), basisUrl: 'https://github.com/alexander-walz/haushaltsblick/releases/download/rohdaten/' },
      'api_ist_2024_ausgaben_1752216181000.ndjson',
      Buffer.from('{}\n'),
    );
    expect(e.uri).toBe('https://github.com/alexander-walz/haushaltsblick/releases/download/rohdaten/api_ist_2024_ausgaben_1752216181000.ndjson.gz');
  });

  it.each(['../x', 'Soll.xml', '', 'a/b'])('lehnt den Namen "%s" ab', async (name) => {
    await expect(archiviere({ verzeichnis: verzeichnis() }, name, Buffer.from('x'))).rejects.toThrow('Ungültiger Archivname');
  });
});
```

Zusätzlich in `cli.int.test.ts` den Test „verlangt einen User-Agent für Abrufe aus dem Netz“ ersetzen durch:
```ts
  it('nutzt ohne INGEST_USER_AGENT den Projekt-User-Agent', () =>
    imRollback(async (tx) => {
      vi.stubEnv('INGEST_USER_AGENT', '');
      const gesehen: string[] = [];
      const abruf = async (_jahr: number, opt: { userAgent: string }): Promise<AbrufErgebnis> => {
        gesehen.push(opt.userAgent);
        return { status: 'nicht_vorhanden', url: sollXmlUrl(2027) };
      };
      await main(['--jahre', '2027'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage, abruf, log: () => {} });
      expect(gesehen).toEqual(['Haushaltsblick/0.2.0 (+https://github.com/alexander-walz/haushaltsblick)']);
    }));
```
und in `soll-ingest.int.test.ts` zwei Tests ergänzen:
```ts
  it('legt die Datei komprimiert im Archiv ab und speichert deren URI', () =>
    imRollback(async (tx) => {
      const e = await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: einmaligeDatei(), archivBasisUrl: 'https://example.org/rohdaten' }));
      const [datei] = await tx<{ sha256: string; ablage_uri: string }[]>`select sha256, ablage_uri from raw.source_file where run_id = ${e.runId}`;
      const name = `soll_2026_${datei!.sha256.slice(0, 16)}.xml.gz`;
      expect(datei!.ablage_uri).toBe(`https://example.org/rohdaten/${name}`);
      expect(readdirSync(ablage)).toContain(name);
    }));

  it('lädt mit neuLaden auch eine unveränderte Datei erneut', () =>
    imRollback(async (tx) => {
      const pfad = einmaligeDatei();
      await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: pfad }));
      const zweiter = await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: pfad, neuLaden: true }));
      expect(zweiter.status).toBe('succeeded');
    }));
```
Den bestehenden Test, der `readdirSync(join(ablage, 'soll', '2026'))` prüft, auf die neue flache Ablage umstellen (Dateiname `soll_2026_<sha16>.xml.gz` direkt in `ablage`).

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test; pnpm --filter @hb/ingest test:int`
Expected: FAIL (fehlende Module `lauf-kontext`, `archiv`; Integrationstests scheitern an Ablagepfad, `neuLaden`, User-Agent)

- [ ] **Step 3: Implementierung**

`packages/ingest/package.json`: `"version": "0.2.0"`.

`packages/ingest/src/lauf-kontext.ts`:
```ts
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { standardUserAgent } from './abruf/http';
import type { Trigger } from './db/lade-soll';

const TRIGGER: readonly Trigger[] = ['schedule', 'manual', 'ci'];

export type LaufKontext = { trigger: Trigger; gitSha: string; pipelineVersion: string; userAgent: string };

function gitSha(env: NodeJS.ProcessEnv): string {
  if (env.GITHUB_SHA) return env.GITHUB_SHA;
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

/** Trigger, Git-SHA, pipeline_version und User-Agent eines CLI-Laufs aus der Umgebung. */
export function laufKontext(env: NodeJS.ProcessEnv = process.env): LaufKontext {
  const trigger = (env.HB_TRIGGER || 'manual') as Trigger;
  if (!TRIGGER.includes(trigger)) throw new Error(`Unbekannter HB_TRIGGER: ${trigger}`);
  const version = pipelineVersion();
  return { trigger, gitSha: gitSha(env), pipelineVersion: version, userAgent: env.INGEST_USER_AGENT || standardUserAgent(version) };
}
```

`packages/ingest/src/archiv.ts`:
```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { sha256Hex } from './abruf/http';

export type ArchivOptionen = { verzeichnis: string; basisUrl?: string };
export type ArchivEintrag = { dateiname: string; pfad: string; uri: string; sha256: string; bytes: number };

export const STANDARD_ARCHIV_VERZEICHNIS = fileURLToPath(new URL('../../../data/raw/archiv', import.meta.url));

const NAME = /^[a-z0-9][a-z0-9._-]*$/;

/** Legt Rohdaten gzip-komprimiert ab. Der Hash bezieht sich auf den unkomprimierten Inhalt. */
export async function archiviere(opt: ArchivOptionen, name: string, inhalt: Buffer): Promise<ArchivEintrag> {
  if (!NAME.test(name) || name.includes('..')) throw new Error(`Ungültiger Archivname: ${name}`);
  const dateiname = `${name}.gz`;
  await mkdir(opt.verzeichnis, { recursive: true });
  const pfad = join(opt.verzeichnis, dateiname);
  const komprimiert = gzipSync(inhalt, { level: 9 });
  await writeFile(pfad, komprimiert);
  const uri = opt.basisUrl ? `${opt.basisUrl.replace(/\/+$/, '')}/${dateiname}` : `data/raw/archiv/${dateiname}`;
  return { dateiname, pfad, uri, sha256: sha256Hex(inhalt), bytes: komprimiert.byteLength };
}
```

`packages/ingest/src/soll-ingest.ts`:
- `SollIngestOptionen` um `archivBasisUrl?: string;` und `neuLaden?: boolean;` erweitern.
- Funktion `legeAb` und die Imports `mkdir`, `writeFile`, `join` entfernen; stattdessen `import { archiviere } from './archiv';`.
- In `starteLauf` die `params` auf `{ jahr, datei: opt.lokaleDatei ?? null, neu_laden: opt.neuLaden ? 'ja' : null }` setzen.
- `const vorher = opt.neuLaden ? null : await letzteSollDatei(sql, jahr, { lokal: opt.lokaleDatei !== undefined });`
- Ablage ersetzen durch:
```ts
    const ablage = await archiviere(
      { verzeichnis: opt.ablageVerzeichnis, basisUrl: opt.archivBasisUrl },
      `soll_${jahr}_${abruf.sha256.slice(0, 16)}.xml`,
      abruf.inhalt,
    );
```
  und beim Speichern `ablageUri: ablage.uri` verwenden.

`packages/ingest/src/cli.ts`:
- Funktionen `gitSha`, `pipelineVersion`, die Konstante `TRIGGER` und die User-Agent-Prüfung entfernen; stattdessen `const kontext = laufKontext();`.
- `parseArgs`-Optionen um `'neu-laden': { type: 'boolean', default: false }` erweitern.
- `opt` bilden aus `{ ...kontext, ablageVerzeichnis: abh.ablageVerzeichnis ?? STANDARD_ARCHIV_VERZEICHNIS, archivBasisUrl: process.env.HB_ARCHIV_BASIS_URL || undefined, lokaleDatei: values.datei, abruf: abh.abruf, neuLaden: values['neu-laden'] }`.

- [ ] **Step 4: Tests ausführen**

Run: `pnpm typecheck && pnpm test && pnpm test:int`
Expected: alle Tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ingest
git commit -m "feat(ingest): Projekt-User-Agent, Neu-Laden und komprimiertes Rohdatenarchiv"
```

---

### Task 3: Migration und Datenvertrag für die internalapi

**Files:**
- Create: `supabase/migrations/20261009120000_api_raw.sql`, `contracts/src_portal_api.yaml`
- Modify: `packages/ingest/src/db/schema.int.test.ts`

**Interfaces:**
- Produces: Quelle `SRC_PORTAL_API` in `ops.source_registry`; Tabellen `raw.api_abruf`, `raw.api_knoten`, `raw.api_titel` (Spalten siehe Migration)

- [ ] **Step 1: Failing Tests schreiben**

In `schema.int.test.ts` den Test „registriert die Soll-Quelle als offiziell“ ersetzen durch:
```ts
  it('registriert beide Quellen mit Offiziell-Kennzeichen', () =>
    imRollback(async (tx) => {
      const rows = await tx`select source_id, offiziell, vertrag_pfad from ops.source_registry order by 1`;
      expect(rows).toEqual([
        { source_id: 'SRC_PORTAL_API', offiziell: false, vertrag_pfad: 'contracts/src_portal_api.yaml' },
        { source_id: 'SRC_SOLL_XML', offiziell: true, vertrag_pfad: 'contracts/src_soll_xml.yaml' },
      ]);
    }));
```
und ergänzen:
```ts
  it('speichert API-Titel mit Titelschlüssel und Cent-Beträgen', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_PORTAL_API', 'ci', 'test', '0') returning run_id`;
      const [t] = await tx`
        insert into raw.api_titel (run_id, jahr, konto, quote, einzelplan_nr, kapitel_nr, titel_nr, fkt, label, betrag_eur)
        values (${lauf!.run_id}, 2024, 'ausgaben', 'ist', '04', '0411', '43257', '018', 'Versorgungsbezüge', 61346498.79)
        returning titel_key, betrag_eur::text as betrag`;
      expect(t).toEqual({ titel_key: '041143257', betrag: '61346498.79' });
    }));

  it('lehnt unbekannte Quoten ab', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_PORTAL_API', 'ci', 'test', '0') returning run_id`;
      await expect(inTransaktion(tx, (t) => t`
        insert into raw.api_titel (run_id, jahr, konto, quote, einzelplan_nr, kapitel_nr, titel_nr, fkt, label, betrag_eur)
        values (${lauf!.run_id}, 2024, 'ausgaben', 'plan', '04', '0411', '43257', '018', 'x', 1)`)).rejects.toThrow(/api_titel_quote_check/);
    }));
```
Der bestehende Test „aktiviert RLS auf allen Tabellen in raw und ops“ deckt die neuen Tabellen automatisch ab.

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test:int`
Expected: FAIL („relation raw.api_titel does not exist“, Quelle fehlt)

- [ ] **Step 3: Migration und Datenvertrag**

`supabase/migrations/20261009120000_api_raw.sql`:
```sql
-- internalapi von bundeshaushalt.de: Soll und Ist je Titel (Roadmap E7)
insert into ops.source_registry values (
  'SRC_PORTAL_API',
  'Bundeshaushalt digital, internalapi budgetData (Soll und Ist je Titel)',
  'https://www.bundeshaushalt.de/internalapi/budgetData?year={jahr}&account={account}&quota={quota}&unit=single&id={id}',
  false,
  'Amtliches Werk, Quellenvermerk "Bundesministerium der Finanzen, bundeshaushalt.de"',
  'contracts/src_portal_api.yaml'
);

-- Ein Crawl je Lauf: Jahr, Konto, Quote, Stand der Quelle und Archiv der Rohantworten
create table raw.api_abruf (
  run_id           uuid primary key references ops.load_run on delete cascade,
  jahr             integer not null,
  konto            text not null check (konto in ('einnahmen', 'ausgaben')),
  quote            text not null check (quote in ('soll', 'ist')),
  quelle_timestamp bigint not null,
  modify_date      text not null,
  anfragen         integer not null check (anfragen > 0),
  ablage_uri       text not null,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  warnungen        jsonb not null default '[]'
);
create index on raw.api_abruf (jahr, konto, quote);

-- Summen je Ebene (gesamt, Einzelplan, Kapitel) für Abgleiche
create table raw.api_knoten (
  run_id     uuid not null references ops.load_run on delete cascade,
  jahr       integer not null,
  konto      text not null check (konto in ('einnahmen', 'ausgaben')),
  quote      text not null check (quote in ('soll', 'ist')),
  ebene      text not null check (ebene in ('gesamt', 'einzelplan', 'kapitel')),
  knoten_id  text not null,
  label      text not null,
  betrag_eur numeric(18,2) not null,
  primary key (run_id, ebene, knoten_id)
);

-- Titel mit Betrag ungleich 0 (die API lässt Titel mit Wert 0 weg)
create table raw.api_titel (
  run_id        uuid not null references ops.load_run on delete cascade,
  jahr          integer not null,
  konto         text not null check (konto in ('einnahmen', 'ausgaben')),
  quote         text not null check (quote in ('soll', 'ist')),
  einzelplan_nr text not null,
  kapitel_nr    text not null,
  titel_nr      text not null,
  titel_key     text generated always as (kapitel_nr || titel_nr) stored,
  fkt           text not null,
  label         text not null,
  betrag_eur    numeric(18,2) not null,
  primary key (run_id, kapitel_nr, titel_nr)
);

alter table raw.api_abruf enable row level security;
alter table raw.api_knoten enable row level security;
alter table raw.api_titel enable row level security;
revoke all on all tables in schema raw, ops from anon, authenticated;
```

`contracts/src_portal_api.yaml`:
```yaml
id: SRC_PORTAL_API
owner: haushaltsblick-data
beschreibung: Bundeshaushalt digital, internalapi budgetData, Soll und Ist hierarchisch bis zum Titel
url_muster: https://www.bundeshaushalt.de/internalapi/budgetData?year={jahr}&account={expenses|income}&quota={target|actual}&unit=single&id={id}
lizenz: Amtliches Werk, Quellenvermerk "Bundesministerium der Finanzen, bundeshaushalt.de"
offiziell: false (undokumentierte Schnittstelle, kann sich ohne Ankündigung ändern)
aktualisierung: wöchentliche Prüfung über meta.timestamp der Wurzel je Jahr, Konto und Quote
verfuegbarkeit: Ist 2012 bis Vorjahr; Soll 2012 bis Folgejahr (Folgejahr als Entwurf); sonst HTTP 404 (Stand 09.10.2026)
einheit_betrag: eur (Zahl mit Cent)
schema:
  ebenen: [Budget (levelCur 0), Section = Einzelplan (1), Chapter = Kapitel (2), Title (3)]
  abruf_bis: Kapitel; Titel stehen als children im Kapitel
  pflichtfelder:
    meta: [year, unit, quota, account, timestamp, modifyDate, entity, levelCur, levelMax]
    detail: [label, value, relativeToParentValue, relativeValue]
    children: [id, budgetNumber, label, value, relativeToParentValue, relativeValue]
  ids: Einzelplan 2 Ziffern, Kapitel 4 Ziffern (beginnt mit Einzelplan), Titel 9 Ziffern (Kapitel + Titel)
  budget_number_titel: "KKKK GGG NN - FFF" (Kapitel, Titel in zwei Teilen, Funktionskennziffer)
erwartungen:
  - meta.year, meta.account und meta.quota entsprechen der Anfrage
  - meta.levelCur entspricht der Ebene der Anfrage
  - Betrag jedes Knotens ist centgenau die Summe seiner Kinder
  - Titelschlüssel je Jahr, Konto und Quote eindeutig
besonderheiten:
  - Titel mit Wert 0 fehlen; fehlend bedeutet 0
  - Anlagen (Wirtschaftspläne von Sondervermögen, z. B. KTF 6092) sind nicht enthalten
  - unbekannte Felder sind erlaubt und werden als Warnung protokolliert
kontrollwerte:
  ist_2024_ausgaben_gesamt_eur: 474753727609.58
  soll_2026_ausgaben_gesamt_eur: 524540138000.00 (gleich XML ohne Anlagen)
bei_verletzung: lauf_in_quarantaene
```

- [ ] **Step 4: Datenbank migrieren und Tests ausführen**

Run: `pnpm dlx supabase@2.120.0 migration up --local && pnpm --filter @hb/ingest test:int && pnpm typecheck`
Expected: alle Integrationstests PASS (kein `db:reset`, die geladenen Soll-Daten bleiben erhalten)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261009120000_api_raw.sql contracts/src_portal_api.yaml packages/ingest/src/db/schema.int.test.ts
git commit -m "feat(db): Rohtabellen und Datenvertrag für die internalapi"
```

---

### Task 4: Schema der API-Antworten mit echten Fixtures

**Files:**
- Create: `packages/ingest/fixtures/api/wurzel_ist_2024_ausgaben.json`, `packages/ingest/fixtures/api/ep04_ist_2024_ausgaben.json`, `packages/ingest/fixtures/api/kap0411_ist_2024_ausgaben.json`, `packages/ingest/fixtures/api/kap0411_soll_2024_ausgaben.json`
- Create: `packages/ingest/src/api/schema.ts`
- Test: `packages/ingest/src/api/schema.test.ts`

**Interfaces:**
- Produces:
  - `class ApiVertragsFehler extends Error { readonly url: string }` (Meldung `<meldung> (bei <url>)`)
  - `type ApiKind = { id: string; budgetNumber: string; label: string; value: number; relativeToParentValue: number; relativeValue: number }`
  - `type ApiAntwort = { meta: { year: number; unit: 'single'; quota: 'target' | 'actual'; account: 'expenses' | 'income'; timestamp: number; modifyDate: string; entity: 'Budget' | 'Section' | 'Chapter' | 'Title'; levelCur: number; levelMax: 3 }; detail: { id?: string; label: string; value: number; ... }; children: ApiKind[] }`
  - `pruefeApiAntwort(json: unknown, url: string): { antwort: ApiAntwort; warnungen: string[] }`

- [ ] **Step 1: Echte Antworten als Fixtures speichern** (einmalig, vier Anfragen, Git Bash)

```bash
cd packages/ingest && mkdir -p fixtures/api
UA="Haushaltsblick/0.2.0 (+https://github.com/alexander-walz/haushaltsblick)"
B="https://www.bundeshaushalt.de/internalapi/budgetData"
curl -sS -A "$UA" "$B?year=2024&account=expenses&quota=actual&unit=single" > fixtures/api/wurzel_ist_2024_ausgaben.json; sleep 1
curl -sS -A "$UA" "$B?year=2024&account=expenses&quota=actual&unit=single&id=04" > fixtures/api/ep04_ist_2024_ausgaben.json; sleep 1
curl -sS -A "$UA" "$B?year=2024&account=expenses&quota=actual&unit=single&id=0411" > fixtures/api/kap0411_ist_2024_ausgaben.json; sleep 1
curl -sS -A "$UA" "$B?year=2024&account=expenses&quota=target&unit=single&id=0411" > fixtures/api/kap0411_soll_2024_ausgaben.json
cd ../..
```
Danach jede Datei mit `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <datei>` prüfen (gültiges JSON, nicht leer).

- [ ] **Step 2: Failing Tests schreiben**

`packages/ingest/src/api/schema.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiVertragsFehler, pruefeApiAntwort } from './schema';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/api/${name}.json`, import.meta.url)), 'utf8'));

const URL_X = 'https://www.bundeshaushalt.de/internalapi/budgetData?year=2024';

describe('pruefeApiAntwort mit echten Antworten', () => {
  it.each(['wurzel_ist_2024_ausgaben', 'ep04_ist_2024_ausgaben', 'kap0411_ist_2024_ausgaben', 'kap0411_soll_2024_ausgaben'])(
    'akzeptiert %s ohne Warnungen',
    (name) => {
      const { warnungen } = pruefeApiAntwort(fixture(name), URL_X);
      expect(warnungen).toEqual([]);
    },
  );

  it('liest Wurzel, Ebene und Kinder', () => {
    const { antwort } = pruefeApiAntwort(fixture('wurzel_ist_2024_ausgaben'), URL_X);
    expect(antwort.meta).toMatchObject({ year: 2024, quota: 'actual', account: 'expenses', levelCur: 0, levelMax: 3, entity: 'Budget' });
    expect(antwort.detail.value).toBe(474753727609.58);
    expect(antwort.children.length).toBeGreaterThan(20);
  });

  it('liefert für Kapitel die Titel als Kinder', () => {
    const { antwort } = pruefeApiAntwort(fixture('kap0411_ist_2024_ausgaben'), URL_X);
    expect(antwort.meta.levelCur).toBe(2);
    expect(antwort.children.every((k) => /^0411\d{5}$/.test(k.id))).toBe(true);
  });
});

describe('pruefeApiAntwort bei Abweichungen', () => {
  const basis = () => structuredClone(fixture('kap0411_ist_2024_ausgaben')) as Record<string, any>;

  it('meldet unbekannte Felder als Warnung', () => {
    const json = basis();
    json.meta.neuesFeld = 1;
    json.children[0].waehrung = 'EUR';
    json.extra = true;
    expect(pruefeApiAntwort(json, URL_X).warnungen).toEqual([
      'Unbekanntes Feld extra',
      'Unbekanntes Feld meta.neuesFeld',
      'Unbekanntes Feld children[].waehrung',
    ]);
  });

  it('wirft ApiVertragsFehler bei fehlendem Pflichtfeld', () => {
    const json = basis();
    delete json.meta.timestamp;
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(ApiVertragsFehler);
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(/meta\.timestamp/);
  });

  it('wirft ApiVertragsFehler bei falschem Typ und nennt die URL', () => {
    const json = basis();
    json.children[0].value = '61346498.79';
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(`(bei ${URL_X})`);
  });

  it('wirft ApiVertragsFehler bei ungültiger Kind-ID', () => {
    const json = basis();
    json.children[0].id = '0411-1';
    expect(() => pruefeApiAntwort(json, URL_X)).toThrow(ApiVertragsFehler);
  });

  it('wirft ApiVertragsFehler, wenn die Antwort kein Objekt ist', () => {
    expect(() => pruefeApiAntwort(null, URL_X)).toThrow(ApiVertragsFehler);
  });
});
```

- [ ] **Step 3: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest add zod@4.6.5 && pnpm --filter @hb/ingest test`
Expected: FAIL mit „Cannot find module ./schema“

- [ ] **Step 4: Implementierung**

`packages/ingest/src/api/schema.ts`:
```ts
import { z } from 'zod';

export class ApiVertragsFehler extends Error {
  readonly url: string;

  constructor(meldung: string, url: string) {
    super(`${meldung} (bei ${url})`);
    this.name = 'ApiVertragsFehler';
    this.url = url;
  }
}

const KIND = z.object({
  id: z.string().regex(/^(\d{2}|\d{4}|\d{9})$/),
  budgetNumber: z.string(),
  label: z.string(),
  value: z.number(),
  relativeToParentValue: z.number(),
  relativeValue: z.number(),
});

const META = z.object({
  year: z.number().int(),
  unit: z.literal('single'),
  quota: z.enum(['target', 'actual']),
  account: z.enum(['expenses', 'income']),
  timestamp: z.number().int(),
  modifyDate: z.string(),
  entity: z.enum(['Budget', 'Section', 'Chapter', 'Title']),
  levelCur: z.number().int().min(0).max(3),
  levelMax: z.literal(3),
});

const DETAIL = z.object({
  id: z.string().optional(),
  budgetNumber: z.string().optional(),
  label: z.string(),
  value: z.number(),
  relativeToParentValue: z.number(),
  relativeValue: z.number(),
  tableLabel: z.string().optional(),
  selectionLabel: z.string().optional(),
  pdf: z.array(z.string()).optional(),
});

const ANTWORT = z.object({
  meta: META,
  detail: DETAIL,
  children: z.array(KIND).default([]),
  parents: z.unknown().optional(),
  related: z.unknown().optional(),
});

export type ApiKind = z.infer<typeof KIND>;
export type ApiAntwort = z.infer<typeof ANTWORT>;

const BEKANNT = {
  antwort: new Set(Object.keys(ANTWORT.shape)),
  meta: new Set(Object.keys(META.shape)),
  detail: new Set(Object.keys(DETAIL.shape)),
  kind: new Set(Object.keys(KIND.shape)),
};

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function unbekannteFelder(json: Record<string, unknown>): string[] {
  const warnungen = new Set<string>();
  const pruefe = (obj: unknown, bekannt: Set<string>, praefix: string) => {
    if (!istObjekt(obj)) return;
    for (const schluessel of Object.keys(obj)) if (!bekannt.has(schluessel)) warnungen.add(`Unbekanntes Feld ${praefix}${schluessel}`);
  };
  pruefe(json, BEKANNT.antwort, '');
  pruefe(json.meta, BEKANNT.meta, 'meta.');
  pruefe(json.detail, BEKANNT.detail, 'detail.');
  if (Array.isArray(json.children)) for (const kind of json.children) pruefe(kind, BEKANNT.kind, 'children[].');
  return [...warnungen];
}

/** Prüft eine Antwort gegen den Datenvertrag. Pflichtverletzungen werfen, unbekannte Felder werden Warnungen. */
export function pruefeApiAntwort(json: unknown, url: string): { antwort: ApiAntwort; warnungen: string[] } {
  if (!istObjekt(json)) throw new ApiVertragsFehler('Antwort ist kein JSON-Objekt', url);
  const ergebnis = ANTWORT.safeParse(json);
  if (!ergebnis.success) {
    const fehler = ergebnis.error.issues.map((i) => `${i.path.join('.') || '(wurzel)'}: ${i.message}`).join('; ');
    throw new ApiVertragsFehler(`Antwort verletzt das Schema: ${fehler}`, url);
  }
  return { antwort: ergebnis.data, warnungen: unbekannteFelder(json) };
}
```

- [ ] **Step 5: Tests ausführen**

Run: `pnpm --filter @hb/ingest test && pnpm typecheck`
Expected: alle Tests PASS. Falls eine echte Fixture Warnungen erzeugt, ist das ein Befund: Feld im Schema als optional ergänzen (mit Kommentar „seit 2026 in der Antwort“) und im Report nennen.

- [ ] **Step 6: Commit**

```bash
git add packages/ingest/fixtures/api packages/ingest/src/api/schema.ts packages/ingest/src/api/schema.test.ts packages/ingest/package.json pnpm-lock.yaml
git commit -m "feat(ingest): Schema der internalapi mit echten Fixtures"
```

---

### Task 5: Crawler mit centgenauer Konsistenzprüfung

**Files:**
- Create: `packages/ingest/src/api/crawler.ts`, `packages/ingest/src/api/test-baum.ts`
- Test: `packages/ingest/src/api/crawler.test.ts`

**Interfaces:**
- Consumes: `pruefeApiAntwort`, `ApiVertragsFehler`, `ApiAntwort` (Task 4); `holeMitWiederholung`, `Drossel` (Task 1); `Konto` aus `@hb/shared`
- Produces:
  - `type Quote = 'soll' | 'ist'`, `type ApiParameter = { jahr: number; konto: Konto; quote: Quote }`
  - `apiUrl(p: ApiParameter, id?: string): string`
  - `type ApiRohAntwort = { status: 200; json: unknown; roh: Buffer } | { status: 404 }`, `type ApiAbruf = (url: string) => Promise<ApiRohAntwort>`
  - `zuCent(wert: number): number`, `centZuDezimal(cent: number): string`
  - `type ApiTitel = { einzelplanNr: string; kapitelNr: string; titelNr: string; fkt: string; label: string; betragCent: number }`
  - `type ApiKnoten = { ebene: 'gesamt' | 'einzelplan' | 'kapitel'; knotenId: string; label: string; betragCent: number }`
  - `type Wurzel = { status: 'nicht_verfuegbar'; url: string } | { status: 'ok'; url: string; antwort: ApiAntwort; roh: Buffer; warnungen: string[] }`
  - `holeWurzel(p: ApiParameter, abruf: ApiAbruf): Promise<Wurzel>`
  - `type CrawlErgebnis = { quelleTimestamp: number; modifyDate: string; knoten: ApiKnoten[]; titel: ApiTitel[]; antworten: { url: string; roh: Buffer }[]; warnungen: string[] }`
  - `crawle(p: ApiParameter, abruf: ApiAbruf, wurzel: Extract<Wurzel, { status: 'ok' }>): Promise<CrawlErgebnis>`
  - `netzAbruf(opt: { userAgent: string; drossel: Drossel; http?: Partial<HttpOptionen> }): ApiAbruf`
  - Testhilfe: `type BaumPlan = Record<string, Record<string, Array<[titelNr: string, fkt: string, label: string, wert: number]>>>`, `baueBaum(p: ApiParameter, plan: BaumPlan, timestamp?: number): Map<string, unknown>`, `fakeAbruf(baum: Map<string, unknown>): ApiAbruf & { aufrufe: string[] }`

- [ ] **Step 1: Testhilfe schreiben** (konsistente Antwortbäume im Format der echten API)

`packages/ingest/src/api/test-baum.ts`:
```ts
import { apiUrl, centZuDezimal, zuCent, type ApiAbruf, type ApiParameter } from './crawler';

export type BaumPlan = Record<string, Record<string, Array<[titelNr: string, fkt: string, label: string, wert: number]>>>;

const ACCOUNT = { ausgaben: 'expenses', einnahmen: 'income' } as const;
const QUOTA = { ist: 'actual', soll: 'target' } as const;

/** Baut für einen Plan Einzelplan → Kapitel → Titel alle Antworten (Wurzel, Einzelpläne, Kapitel) mit centgenauen Summen. */
export function baueBaum(p: ApiParameter, plan: BaumPlan, timestamp = 1752216181000): Map<string, unknown> {
  const baum = new Map<string, unknown>();
  const meta = (levelCur: number, entity: string) => ({
    year: p.jahr, unit: 'single', quota: QUOTA[p.quote], account: ACCOUNT[p.konto], timestamp,
    modifyDate: '11.07.2025', entity, levelCur, levelMax: 3,
  });
  const wert = (cent: number) => Number(centZuDezimal(cent));
  const kind = (id: string, budgetNumber: string, label: string, cent: number) => ({
    id, budgetNumber, label, value: wert(cent), relativeToParentValue: 0, relativeValue: 0,
  });

  const epKinder = [];
  let gesamtCent = 0;
  for (const [ep, kapitel] of Object.entries(plan)) {
    const kapKinder = [];
    let epCent = 0;
    for (const [kap, titel] of Object.entries(kapitel)) {
      const titelKinder = titel.map(([nr, fkt, label, w]) =>
        kind(`${kap}${nr}`, `${kap} ${nr.slice(0, 3)} ${nr.slice(3)} - ${fkt}`, `${kap} ${nr.slice(0, 3)} ${nr.slice(3)} ${label}`, zuCent(w)));
      const kapCent = titel.reduce((s, [, , , w]) => s + zuCent(w), 0);
      baum.set(apiUrl(p, kap), {
        meta: meta(2, 'Chapter'),
        detail: { id: kap, budgetNumber: `${kap} ___ __ - ___`, label: `${kap} Kapitel`, value: wert(kapCent), relativeToParentValue: 0, relativeValue: 0 },
        children: titelKinder,
      });
      kapKinder.push(kind(kap, `${kap} ___ __ - ___`, `${kap} Kapitel`, kapCent));
      epCent += kapCent;
    }
    baum.set(apiUrl(p, ep), {
      meta: meta(1, 'Section'),
      detail: { id: ep, budgetNumber: `${ep}__ ___ __ - ___`, label: `${ep} Einzelplan`, value: wert(epCent), relativeToParentValue: 0, relativeValue: 0 },
      children: kapKinder,
    });
    epKinder.push(kind(ep, `${ep}__ ___ __ - ___`, `${ep} Einzelplan`, epCent));
    gesamtCent += epCent;
  }
  baum.set(apiUrl(p), {
    meta: meta(0, 'Budget'),
    detail: { label: `Haushaltsjahr ${p.jahr}`, value: wert(gesamtCent), relativeToParentValue: 100, relativeValue: 100 },
    children: epKinder,
  });
  return baum;
}

/** Liefert Antworten aus dem Baum, 404 für unbekannte URLs, und merkt sich jeden Aufruf. */
export function fakeAbruf(baum: Map<string, unknown>): ApiAbruf & { aufrufe: string[] } {
  const aufrufe: string[] = [];
  const abruf = async (url: string) => {
    aufrufe.push(url);
    const json = baum.get(url);
    if (json === undefined) return { status: 404 as const };
    return { status: 200 as const, json: structuredClone(json), roh: Buffer.from(JSON.stringify(json)) };
  };
  return Object.assign(abruf, { aufrufe });
}
```

- [ ] **Step 2: Failing Tests schreiben**

`packages/ingest/src/api/crawler.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ApiVertragsFehler } from './schema';
import { apiUrl, centZuDezimal, crawle, holeWurzel, zuCent, type ApiParameter } from './crawler';
import { baueBaum, fakeAbruf, type BaumPlan } from './test-baum';

const P: ApiParameter = { jahr: 2024, konto: 'ausgaben', quote: 'ist' };
const PLAN: BaumPlan = {
  '04': {
    '0411': [['43257', '018', 'Versorgungsbezüge', 61346498.79], ['97201', '880', 'Globale Minderausgabe', -168000]],
    '0416': [['68421', '322', 'Zentrale Maßnahmen Sport', 1234.5]],
  },
  '06': { '0601': [['53201', '011', 'Ausgaben', 0.01]] },
};

async function vollerCrawl(baum = baueBaum(P, PLAN)) {
  const abruf = fakeAbruf(baum);
  const wurzel = await holeWurzel(P, abruf);
  if (wurzel.status !== 'ok') throw new Error('Wurzel fehlt');
  return { ergebnis: await crawle(P, abruf, wurzel), abruf };
}

describe('Hilfsfunktionen', () => {
  it('baut die URL mit www, Konto, Quote und optionaler ID', () => {
    expect(apiUrl(P)).toBe('https://www.bundeshaushalt.de/internalapi/budgetData?year=2024&account=expenses&quota=actual&unit=single');
    expect(apiUrl({ jahr: 2027, konto: 'einnahmen', quote: 'soll' }, '0411'))
      .toBe('https://www.bundeshaushalt.de/internalapi/budgetData?year=2027&account=income&quota=target&unit=single&id=0411');
  });

  it('rechnet über ganze Cent', () => {
    expect(zuCent(474753727609.58)).toBe(47475372760958);
    expect(zuCent(0.1 + 0.2)).toBe(30);
    expect(centZuDezimal(47475372760958)).toBe('474753727609.58');
    expect(centZuDezimal(-16800000)).toBe('-168000.00');
    expect(centZuDezimal(-5)).toBe('-0.05');
    expect(centZuDezimal(0)).toBe('0.00');
  });
});

describe('holeWurzel', () => {
  it('meldet nicht verfügbare Jahre', async () => {
    const abruf = fakeAbruf(new Map());
    expect(await holeWurzel({ jahr: 2026, konto: 'ausgaben', quote: 'ist' }, abruf)).toEqual({
      status: 'nicht_verfuegbar',
      url: apiUrl({ jahr: 2026, konto: 'ausgaben', quote: 'ist' }),
    });
    expect(abruf.aufrufe).toHaveLength(1);
  });
});

describe('crawle', () => {
  it('liefert alle Titel mit Kapitel, Funktion, Label und Cent-Betrag', async () => {
    const { ergebnis } = await vollerCrawl();
    expect(ergebnis.titel).toContainEqual({
      einzelplanNr: '04', kapitelNr: '0411', titelNr: '43257', fkt: '018', label: 'Versorgungsbezüge', betragCent: 6134649879,
    });
    expect(ergebnis.titel).toHaveLength(4);
    expect(ergebnis.quelleTimestamp).toBe(1752216181000);
    expect(ergebnis.modifyDate).toBe('11.07.2025');
  });

  it('liefert Knoten je Ebene mit Summen', async () => {
    const { ergebnis } = await vollerCrawl();
    expect(ergebnis.knoten.map((k) => [k.ebene, k.knotenId])).toEqual([
      ['gesamt', ''], ['einzelplan', '04'], ['kapitel', '0411'], ['kapitel', '0416'], ['einzelplan', '06'], ['kapitel', '0601'],
    ]);
    expect(ergebnis.knoten[0]!.betragCent).toBe(6134649879 - 16800000 + 123450 + 1);
  });

  it('ruft nur Wurzel, Einzelpläne und Kapitel ab, nie einzelne Titel', async () => {
    const { ergebnis, abruf } = await vollerCrawl();
    expect(abruf.aufrufe).toEqual([apiUrl(P), apiUrl(P, '04'), apiUrl(P, '0411'), apiUrl(P, '0416'), apiUrl(P, '06'), apiUrl(P, '0601')]);
    expect(ergebnis.antworten.map((a) => a.url)).toEqual(abruf.aufrufe);
  });

  it('stellt eine Abweichung zwischen Knoten und Summe der Kinder fest', async () => {
    const baum = baueBaum(P, PLAN);
    const kap = baum.get(apiUrl(P, '0411')) as { children: { value: number }[] };
    kap.children[0]!.value += 0.01;
    await expect(vollerCrawl(baum)).rejects.toThrow(ApiVertragsFehler);
    await expect(vollerCrawl(baum)).rejects.toThrow(/Summe der Kinder 61178498\.80 weicht vom Knoten 61178498\.79 ab/);
  });

  it('stellt fest, wenn ein Einzelplan im Elternknoten anders bewertet ist als in seiner eigenen Antwort', async () => {
    const baum = baueBaum(P, PLAN);
    const ep = baum.get(apiUrl(P, '06')) as { detail: { value: number }; children: { value: number }[] };
    ep.detail.value = 0.02;
    ep.children[0]!.value = 0.02;
    await expect(vollerCrawl(baum)).rejects.toThrow(/Einzelplan 06: Wert 0\.02 weicht vom Elternknoten 0\.01 ab/);
  });

  it('meldet einen fehlenden Kapitelknoten als Vertragsfehler', async () => {
    const baum = baueBaum(P, PLAN);
    baum.delete(apiUrl(P, '0416'));
    await expect(vollerCrawl(baum)).rejects.toThrow(/Knoten nicht gefunden \(404\)/);
  });

  it('prüft, dass die Antwort zur Anfrage passt', async () => {
    const baum = baueBaum(P, PLAN);
    (baum.get(apiUrl(P, '04')) as { meta: { year: number } }).meta.year = 2023;
    await expect(vollerCrawl(baum)).rejects.toThrow(/Antwort passt nicht zur Anfrage/);
  });

  it('prüft das Format der budgetNumber und die Zugehörigkeit des Titels zum Kapitel', async () => {
    const baum = baueBaum(P, PLAN);
    const kap = baum.get(apiUrl(P, '0416')) as { children: { budgetNumber: string }[] };
    kap.children[0]!.budgetNumber = '0416 684 21';
    await expect(vollerCrawl(baum)).rejects.toThrow(/budgetNumber ungültig/);
  });

  it('erkennt doppelte Titel im selben Kapitel', async () => {
    const baum = baueBaum(P, { '04': { '0411': [['43257', '018', 'A', 1], ['43257', '018', 'B', 2]] } });
    await expect(vollerCrawl(baum)).rejects.toThrow(/Titel 041143257 mehrfach/);
  });

  it('sammelt Warnungen aus allen Antworten ohne Doppelungen', async () => {
    const baum = baueBaum(P, PLAN);
    for (const json of baum.values()) (json as Record<string, unknown>).neu = 1;
    const { ergebnis } = await vollerCrawl(baum);
    expect(ergebnis.warnungen).toEqual(['Unbekanntes Feld neu']);
  });
});
```

- [ ] **Step 3: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test`
Expected: FAIL mit „Cannot find module ./crawler“

- [ ] **Step 4: Implementierung**

`packages/ingest/src/api/crawler.ts`:
```ts
import type { Konto } from '@hb/shared';
import { holeMitWiederholung, type Drossel, type HttpOptionen } from '../abruf/http';
import { ApiVertragsFehler, pruefeApiAntwort, type ApiAntwort } from './schema';

export type Quote = 'soll' | 'ist';
export type ApiParameter = { jahr: number; konto: Konto; quote: Quote };
export type ApiRohAntwort = { status: 200; json: unknown; roh: Buffer } | { status: 404 };
export type ApiAbruf = (url: string) => Promise<ApiRohAntwort>;

export type ApiTitel = { einzelplanNr: string; kapitelNr: string; titelNr: string; fkt: string; label: string; betragCent: number };
export type ApiKnoten = { ebene: 'gesamt' | 'einzelplan' | 'kapitel'; knotenId: string; label: string; betragCent: number };
export type Wurzel =
  | { status: 'nicht_verfuegbar'; url: string }
  | { status: 'ok'; url: string; antwort: ApiAntwort; roh: Buffer; warnungen: string[] };
export type CrawlErgebnis = {
  quelleTimestamp: number;
  modifyDate: string;
  knoten: ApiKnoten[];
  titel: ApiTitel[];
  antworten: { url: string; roh: Buffer }[];
  warnungen: string[];
};

const API_BASIS = 'https://www.bundeshaushalt.de/internalapi/budgetData';
const ACCOUNT = { ausgaben: 'expenses', einnahmen: 'income' } as const;
const QUOTA = { ist: 'actual', soll: 'target' } as const;
const BUDGET_NUMBER_TITEL = /^(\d{4}) (\d{3}) (\d{2}) - (\d{3})$/;
const LABEL_PRAEFIX = /^\d{4} \d{3} \d{2} /;

export function apiUrl(p: ApiParameter, id?: string): string {
  const basis = `${API_BASIS}?year=${p.jahr}&account=${ACCOUNT[p.konto]}&quota=${QUOTA[p.quote]}&unit=single`;
  return id === undefined ? basis : `${basis}&id=${id}`;
}

export const zuCent = (wert: number): number => Math.round(wert * 100);

export function centZuDezimal(cent: number): string {
  const vorzeichen = cent < 0 ? '-' : '';
  const betrag = Math.abs(cent);
  return `${vorzeichen}${Math.trunc(betrag / 100)}.${String(betrag % 100).padStart(2, '0')}`;
}

async function holeGeprueft(url: string, abruf: ApiAbruf) {
  const roh = await abruf(url);
  if (roh.status === 404) return null;
  return { roh: roh.roh, ...pruefeApiAntwort(roh.json, url) };
}

export async function holeWurzel(p: ApiParameter, abruf: ApiAbruf): Promise<Wurzel> {
  const url = apiUrl(p);
  const g = await holeGeprueft(url, abruf);
  if (!g) return { status: 'nicht_verfuegbar', url };
  return { status: 'ok', url, antwort: g.antwort, roh: g.roh, warnungen: g.warnungen };
}

/** Läuft Wurzel → Einzelpläne → Kapitel ab und prüft jede Ebene centgenau gegen die Summe ihrer Kinder. */
export async function crawle(p: ApiParameter, abruf: ApiAbruf, wurzel: Extract<Wurzel, { status: 'ok' }>): Promise<CrawlErgebnis> {
  const knoten: ApiKnoten[] = [];
  const titel: ApiTitel[] = [];
  const antworten = [{ url: wurzel.url, roh: wurzel.roh }];
  const warnungen = new Set(wurzel.warnungen);
  const titelKeys = new Set<string>();

  const pruefeAntwort = (a: ApiAntwort, url: string, levelCur: number) => {
    if (a.meta.year !== p.jahr || a.meta.account !== ACCOUNT[p.konto] || a.meta.quota !== QUOTA[p.quote]) {
      throw new ApiVertragsFehler('Antwort passt nicht zur Anfrage', url);
    }
    if (a.meta.levelCur !== levelCur) throw new ApiVertragsFehler(`levelCur ${a.meta.levelCur} statt ${levelCur}`, url);
    const kinderCent = a.children.reduce((s, k) => s + zuCent(k.value), 0);
    const knotenCent = zuCent(a.detail.value);
    if (kinderCent !== knotenCent) {
      throw new ApiVertragsFehler(`Summe der Kinder ${centZuDezimal(kinderCent)} weicht vom Knoten ${centZuDezimal(knotenCent)} ab`, url);
    }
  };
  const pruefeElternwert = (ebene: string, id: string, eigenCent: number, elternCent: number, url: string) => {
    if (eigenCent !== elternCent) {
      throw new ApiVertragsFehler(`${ebene} ${id}: Wert ${centZuDezimal(eigenCent)} weicht vom Elternknoten ${centZuDezimal(elternCent)} ab`, url);
    }
  };
  const holeKnoten = async (id: string) => {
    const url = apiUrl(p, id);
    const g = await holeGeprueft(url, abruf);
    if (!g) throw new ApiVertragsFehler('Knoten nicht gefunden (404)', url);
    antworten.push({ url, roh: g.roh });
    for (const w of g.warnungen) warnungen.add(w);
    return { url, a: g.antwort };
  };

  const w = wurzel.antwort;
  pruefeAntwort(w, wurzel.url, 0);
  if (w.children.length === 0) throw new ApiVertragsFehler('Wurzel ohne Einzelpläne', wurzel.url);
  knoten.push({ ebene: 'gesamt', knotenId: '', label: w.detail.label, betragCent: zuCent(w.detail.value) });

  for (const ep of w.children) {
    if (!/^\d{2}$/.test(ep.id)) throw new ApiVertragsFehler(`Einzelplan-ID ungültig: ${ep.id}`, wurzel.url);
    const { url: epUrl, a: epA } = await holeKnoten(ep.id);
    pruefeAntwort(epA, epUrl, 1);
    pruefeElternwert('Einzelplan', ep.id, zuCent(epA.detail.value), zuCent(ep.value), epUrl);
    knoten.push({ ebene: 'einzelplan', knotenId: ep.id, label: ep.label, betragCent: zuCent(ep.value) });

    for (const kap of epA.children) {
      if (!/^\d{4}$/.test(kap.id) || !kap.id.startsWith(ep.id)) throw new ApiVertragsFehler(`Kapitel-ID ungültig: ${kap.id}`, epUrl);
      const { url: kapUrl, a: kapA } = await holeKnoten(kap.id);
      pruefeAntwort(kapA, kapUrl, 2);
      pruefeElternwert('Kapitel', kap.id, zuCent(kapA.detail.value), zuCent(kap.value), kapUrl);
      knoten.push({ ebene: 'kapitel', knotenId: kap.id, label: kap.label, betragCent: zuCent(kap.value) });

      for (const t of kapA.children) {
        if (!/^\d{9}$/.test(t.id) || !t.id.startsWith(kap.id)) throw new ApiVertragsFehler(`Titel-ID ungültig: ${t.id}`, kapUrl);
        const m = BUDGET_NUMBER_TITEL.exec(t.budgetNumber);
        if (!m || m[1] !== kap.id || `${m[2]}${m[3]}` !== t.id.slice(4)) {
          throw new ApiVertragsFehler(`budgetNumber ungültig für Titel ${t.id}: ${t.budgetNumber}`, kapUrl);
        }
        if (titelKeys.has(t.id)) throw new ApiVertragsFehler(`Titel ${t.id} mehrfach vorhanden`, kapUrl);
        titelKeys.add(t.id);
        titel.push({
          einzelplanNr: ep.id,
          kapitelNr: kap.id,
          titelNr: t.id.slice(4),
          fkt: m[4]!,
          label: t.label.replace(LABEL_PRAEFIX, ''),
          betragCent: zuCent(t.value),
        });
      }
    }
  }

  return { quelleTimestamp: w.meta.timestamp, modifyDate: w.meta.modifyDate, knoten, titel, antworten, warnungen: [...warnungen] };
}

/** Abruf über das Netz: jede Anfrage wartet auf die gemeinsame Drossel; 404 ist ein Ergebnis, kein Fehler. */
export function netzAbruf(opt: { userAgent: string; drossel: Drossel; http?: Partial<HttpOptionen> }): ApiAbruf {
  return async (url) => {
    await opt.drossel.warteAufSlot();
    const antwort = await holeMitWiederholung(url, { ...opt.http, userAgent: opt.userAgent });
    if (antwort.status === 404) return { status: 404 };
    if (antwort.status !== 200) throw new Error(`Unerwarteter Status ${antwort.status} für ${url}`);
    let json: unknown;
    try {
      json = JSON.parse(antwort.inhalt.toString('utf8'));
    } catch {
      throw new ApiVertragsFehler('Antwort ist kein gültiges JSON', url);
    }
    return { status: 200, json, roh: antwort.inhalt };
  };
}
```

- [ ] **Step 5: Tests ausführen**

Run: `pnpm --filter @hb/ingest test && pnpm typecheck`
Expected: alle Tests PASS

- [ ] **Step 6: Konsistenz der echten Fixtures nachweisen**

In `crawler.test.ts` ergänzen und ausführen:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pruefeApiAntwort } from './schema';

describe('echte Antworten', () => {
  it.each(['wurzel_ist_2024_ausgaben', 'ep04_ist_2024_ausgaben', 'kap0411_ist_2024_ausgaben', 'kap0411_soll_2024_ausgaben'])(
    '%s: Knoten ist centgenau die Summe der Kinder',
    (name) => {
      const json = JSON.parse(readFileSync(fileURLToPath(new URL(`../../fixtures/api/${name}.json`, import.meta.url)), 'utf8'));
      const { antwort } = pruefeApiAntwort(json, name);
      expect(antwort.children.reduce((s, k) => s + zuCent(k.value), 0)).toBe(zuCent(antwort.detail.value));
    },
  );
});
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ingest/src/api
git commit -m "feat(ingest): Crawler der internalapi mit centgenauer Konsistenzprüfung"
```

---

### Task 6: Laden der API-Crawls in die Datenbank

**Files:**
- Create: `packages/ingest/src/db/lade-api.ts`
- Test: `packages/ingest/src/db/lade-api.int.test.ts`

**Interfaces:**
- Consumes: `ApiParameter`, `CrawlErgebnis`, `centZuDezimal` (Task 5); `starteLauf`, `beendeLauf` (Plan 1); `imRollback`, `inTransaktion` (Plan 1); `baueBaum`, `fakeAbruf`, `holeWurzel`, `crawle` für Testdaten
- Produces:
  - `letzterApiStand(sql: Sql, p: ApiParameter): Promise<{ quelleTimestamp: number } | null>` (letzter `succeeded`-Lauf)
  - `type ApiAblage = { uri: string; sha256: string; anfragen: number }`
  - `speichereApiCrawl(sql: Sql, runId: string, p: ApiParameter, crawl: CrawlErgebnis, ablage: ApiAblage): Promise<{ titel: number; knoten: number }>`

- [ ] **Step 1: Failing Tests schreiben**

`packages/ingest/src/db/lade-api.int.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { crawle, holeWurzel, type ApiParameter, type CrawlErgebnis } from '../api/crawler';
import { baueBaum, fakeAbruf } from '../api/test-baum';
import { beendeLauf, starteLauf, type LaufStatus } from './lade-soll';
import { letzterApiStand, speichereApiCrawl } from './lade-api';
import type { Sql } from './client';
import { imRollback } from './test-hilfen';

// Jahr 1999 kommt in echten Daten nicht vor, damit lokale Läufe die Tests nicht beeinflussen.
const P: ApiParameter = { jahr: 1999, konto: 'ausgaben', quote: 'ist' };
const ABLAGE = { uri: 'data/raw/archiv/x.ndjson.gz', sha256: 'a'.repeat(64), anfragen: 4 };

async function testCrawl(timestamp = 1752216181000): Promise<CrawlErgebnis> {
  const abruf = fakeAbruf(baueBaum(P, { '04': { '0411': [['43257', '018', 'Versorgungsbezüge', 61346498.79], ['97201', '880', 'GMA', -168000]] } }, timestamp));
  const wurzel = await holeWurzel(P, abruf);
  if (wurzel.status !== 'ok') throw new Error('Wurzel fehlt');
  return crawle(P, abruf, wurzel);
}

async function lauf(tx: Sql, status: LaufStatus, timestamp: number): Promise<string> {
  const runId = await starteLauf(tx, { sourceId: 'SRC_PORTAL_API', trigger: 'ci', gitSha: 'test', pipelineVersion: '0.2.0', params: { jahr: P.jahr, konto: P.konto, quote: P.quote } });
  await speichereApiCrawl(tx, runId, P, await testCrawl(timestamp), ABLAGE);
  await beendeLauf(tx, runId, { status });
  return runId;
}

describe('Laden der API-Crawls', () => {
  it('speichert Abruf, Knoten und Titel mit Cent-Beträgen', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, { sourceId: 'SRC_PORTAL_API', trigger: 'ci', gitSha: 'test', pipelineVersion: '0.2.0', params: {} });
      expect(await speichereApiCrawl(tx, runId, P, await testCrawl(), ABLAGE)).toEqual({ titel: 2, knoten: 3 });

      const [abruf] = await tx`select quelle_timestamp::text as ts, modify_date, anfragen, ablage_uri, warnungen from raw.api_abruf where run_id = ${runId}`;
      expect(abruf).toEqual({ ts: '1752216181000', modify_date: '11.07.2025', anfragen: 4, ablage_uri: ABLAGE.uri, warnungen: [] });

      const titel = await tx`select titel_key, fkt, label, betrag_eur::text as betrag from raw.api_titel where run_id = ${runId} order by titel_key`;
      expect(titel).toEqual([
        { titel_key: '041143257', fkt: '018', label: 'Versorgungsbezüge', betrag: '61346498.79' },
        { titel_key: '041197201', fkt: '880', label: 'GMA', betrag: '-168000.00' },
      ]);

      const [gesamt] = await tx`select betrag_eur::text as betrag from raw.api_knoten where run_id = ${runId} and ebene = 'gesamt'`;
      expect(gesamt).toEqual({ betrag: '61178498.79' });
    }));

  it('findet den Stand der Quelle des letzten erfolgreichen Laufs', () =>
    imRollback(async (tx) => {
      await lauf(tx, 'succeeded', 1000);
      await lauf(tx, 'succeeded', 2000);
      await lauf(tx, 'quarantined', 3000);
      expect(await letzterApiStand(tx, P)).toEqual({ quelleTimestamp: 2000 });
      expect(await letzterApiStand(tx, { ...P, konto: 'einnahmen' })).toBeNull();
      expect(await letzterApiStand(tx, { ...P, quote: 'soll' })).toBeNull();
    }));
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test:int`
Expected: FAIL mit „Cannot find module ./lade-api“

- [ ] **Step 3: Implementierung**

`packages/ingest/src/db/lade-api.ts`:
```ts
import { centZuDezimal, type ApiParameter, type CrawlErgebnis } from '../api/crawler';
import type { Sql } from './client';

export type ApiAblage = { uri: string; sha256: string; anfragen: number };

const STUECKGROESSE = 1000;

function* stuecke<T>(werte: readonly T[], groesse: number): Generator<T[]> {
  for (let i = 0; i < werte.length; i += groesse) yield werte.slice(i, i + groesse);
}

/** Stand der Quelle (meta.timestamp der Wurzel) des letzten erfolgreichen Laufs für Jahr, Konto und Quote. */
export async function letzterApiStand(sql: Sql, p: ApiParameter): Promise<{ quelleTimestamp: number } | null> {
  const [zeile] = await sql<{ quelle_timestamp: string }[]>`
    select a.quelle_timestamp
    from raw.api_abruf a join ops.load_run l using (run_id)
    where a.jahr = ${p.jahr} and a.konto = ${p.konto} and a.quote = ${p.quote} and l.status = 'succeeded'
    order by l.started_at desc
    limit 1`;
  return zeile ? { quelleTimestamp: Number(zeile.quelle_timestamp) } : null;
}

export async function speichereApiCrawl(
  sql: Sql,
  runId: string,
  p: ApiParameter,
  crawl: CrawlErgebnis,
  ablage: ApiAblage,
): Promise<{ titel: number; knoten: number }> {
  await sql`
    insert into raw.api_abruf (run_id, jahr, konto, quote, quelle_timestamp, modify_date, anfragen, ablage_uri, sha256, warnungen)
    values (${runId}, ${p.jahr}, ${p.konto}, ${p.quote}, ${crawl.quelleTimestamp}, ${crawl.modifyDate}, ${ablage.anfragen},
            ${ablage.uri}, ${ablage.sha256}, ${sql.json(crawl.warnungen)})`;

  const basis = { run_id: runId, jahr: p.jahr, konto: p.konto, quote: p.quote };
  const knoten = crawl.knoten.map((k) => ({ ...basis, ebene: k.ebene, knoten_id: k.knotenId, label: k.label, betrag_eur: centZuDezimal(k.betragCent) }));
  const titel = crawl.titel.map((t) => ({
    ...basis,
    einzelplan_nr: t.einzelplanNr,
    kapitel_nr: t.kapitelNr,
    titel_nr: t.titelNr,
    fkt: t.fkt,
    label: t.label,
    betrag_eur: centZuDezimal(t.betragCent),
  }));
  for (const stueck of stuecke(knoten, STUECKGROESSE)) await sql`insert into raw.api_knoten ${sql(stueck)}`;
  for (const stueck of stuecke(titel, STUECKGROESSE)) await sql`insert into raw.api_titel ${sql(stueck)}`;
  return { titel: titel.length, knoten: knoten.length };
}
```

- [ ] **Step 4: Tests ausführen**

Run: `pnpm --filter @hb/ingest test:int && pnpm typecheck`
Expected: alle Tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ingest/src/db/lade-api.ts packages/ingest/src/db/lade-api.int.test.ts
git commit -m "feat(ingest): API-Crawls in raw speichern"
```

---

### Task 7: Ablauf je Jahr und Konto, Bericht und CLI `api`

**Files:**
- Create: `packages/ingest/src/api-ingest.ts`, `packages/ingest/src/api-bericht.ts`, `packages/ingest/src/cli-api.ts`, `packages/ingest/src/bin-api.ts`
- Modify: `packages/ingest/package.json` (Script `"api": "tsx src/bin-api.ts"`), `CLAUDE.md`
- Test: `packages/ingest/src/api-bericht.test.ts`, `packages/ingest/src/api-ingest.int.test.ts`, `packages/ingest/src/cli-api.int.test.ts`

**Interfaces:**
- Consumes: alles aus Task 1 bis 6; `laufKontext`, `archiviere`, `STANDARD_ARCHIV_VERZEICHNIS` (Task 2); `parseJahre` (Plan 1)
- Produces:
  - `type ApiIngestOptionen = { trigger: Trigger; gitSha: string; pipelineVersion: string; archiv: ArchivOptionen; abruf: ApiAbruf; neuLaden?: boolean }`
  - `type ApiErgebnis = { parameter: ApiParameter; runId: string; status: LaufStatus; anfragen: number; titel?: number; summeCent?: number; hinweis?: string }`
  - `ladeApiJahr(sql: Sql, p: ApiParameter, opt: ApiIngestOptionen): Promise<ApiErgebnis>`
  - `formatiereApiBericht(ergebnisse: readonly ApiErgebnis[]): string`
  - `type ApiCliAbhaengigkeiten = { sql?: Sql; heute?: Date; ablageVerzeichnis?: string; abruf?: ApiAbruf; log?: (text: string) => void }`
  - `mainApi(argv: readonly string[], abh?: ApiCliAbhaengigkeiten): Promise<number>` mit Optionen `--jahre` (Standard `alle`), `--konten` (`beide` | `ausgaben` | `einnahmen`, Standard `beide`), `--quote` (`ist` | `soll`, Standard `ist`), `--neu-laden`

- [ ] **Step 1: Failing Tests schreiben**

`packages/ingest/src/api-bericht.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatiereApiBericht } from './api-bericht';

describe('formatiereApiBericht', () => {
  it('zeigt je Jahr und Konto Status, Titel, Summe in Mrd. €, Anfragen und Hinweis', () => {
    expect(formatiereApiBericht([
      { parameter: { jahr: 2024, konto: 'ausgaben', quote: 'ist' }, runId: 'r1', status: 'succeeded', anfragen: 261, titel: 4321, summeCent: 47475372760958 },
      { parameter: { jahr: 2026, konto: 'ausgaben', quote: 'ist' }, runId: 'r2', status: 'skipped', anfragen: 1, hinweis: 'nicht verfügbar' },
    ]).split('\n')).toEqual([
      '| Jahr | Konto | Quote | Status | Titel | Summe (Mrd. €) | Anfragen | Hinweis |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 2024 | ausgaben | ist | succeeded | 4321 | 474,8 | 261 |  |',
      '| 2026 | ausgaben | ist | skipped |  |  | 1 | nicht verfügbar |',
    ]);
  });

  it('macht Hinweise tabellensicher', () => {
    const zeile = formatiereApiBericht([
      { parameter: { jahr: 2024, konto: 'ausgaben', quote: 'ist' }, runId: 'r', status: 'quarantined', anfragen: 3, hinweis: 'a | b\nc' },
    ]).split('\n')[2];
    expect(zeile).toBe('| 2024 | ausgaben | ist | quarantined |  |  | 3 | a / b c |');
  });
});
```

`packages/ingest/src/api-ingest.int.test.ts`:
```ts
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ladeApiJahr, type ApiIngestOptionen } from './api-ingest';
import { apiUrl, type ApiAbruf, type ApiParameter } from './api/crawler';
import { baueBaum, fakeAbruf, type BaumPlan } from './api/test-baum';
import type { Sql } from './db/client';
import { imRollback } from './db/test-hilfen';

const P: ApiParameter = { jahr: 1999, konto: 'ausgaben', quote: 'ist' };
const PLAN: BaumPlan = { '04': { '0411': [['43257', '018', 'Versorgungsbezüge', 61346498.79]], '0416': [['68421', '322', 'Sport', 1000]] } };

const optionen = (abruf: ApiAbruf, extra: Partial<ApiIngestOptionen> = {}): ApiIngestOptionen => ({
  trigger: 'ci', gitSha: 'test', pipelineVersion: '0.2.0',
  archiv: { verzeichnis: mkdtempSync(join(tmpdir(), 'hb-api-')) }, abruf, ...extra,
});

const laufStatus = async (tx: Sql, runId: string) =>
  (await tx`select status, rows_loaded, error from ops.load_run where run_id = ${runId}`)[0];
const zeilen = async (tx: Sql, runId: string) =>
  (await tx`select (select count(*)::int from raw.api_titel where run_id = ${runId}) as titel,
                   (select count(*)::int from raw.api_knoten where run_id = ${runId}) as knoten,
                   (select count(*)::int from raw.api_abruf where run_id = ${runId}) as abrufe`)[0];

describe('ladeApiJahr', () => {
  it('lädt einen vollständigen Baum, archiviert alle Antworten und protokolliert den Lauf', () =>
    imRollback(async (tx) => {
      const abruf = fakeAbruf(baueBaum(P, PLAN, 111));
      const opt = optionen(abruf);
      const e = await ladeApiJahr(tx, P, opt);
      expect(e).toMatchObject({ status: 'succeeded', anfragen: 4, titel: 2, summeCent: 6134749879 });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'succeeded', rows_loaded: 2, error: null });
      expect(await zeilen(tx, e.runId)).toEqual({ titel: 2, knoten: 4, abrufe: 1 });
      const [archiv] = readdirSync(opt.archiv.verzeichnis);
      expect(archiv).toBe('api_ist_1999_ausgaben_111.ndjson.gz');
      const ndjson = gunzipSync(readFileSync(join(opt.archiv.verzeichnis, archiv!))).toString('utf8').trim().split('\n');
      expect(ndjson.map((z) => (JSON.parse(z) as { url: string }).url)).toEqual(abruf.aufrufe);
    }));

  it('überspringt einen unveränderten Stand mit genau einer Anfrage', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 222);
      await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)));
      const zweiter = fakeAbruf(baum);
      const e = await ladeApiJahr(tx, P, optionen(zweiter));
      expect(e).toMatchObject({ status: 'skipped', hinweis: 'unverändert', anfragen: 1 });
      expect(zweiter.aufrufe).toEqual([apiUrl(P)]);
      expect(await zeilen(tx, e.runId)).toEqual({ titel: 0, knoten: 0, abrufe: 0 });
    }));

  it('lädt mit neuLaden trotz unverändertem Stand vollständig', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 333);
      await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)));
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baum), { neuLaden: true }));
      expect(e).toMatchObject({ status: 'succeeded', anfragen: 4 });
    }));

  it('überspringt nicht verfügbare Jahre', () =>
    imRollback(async (tx) => {
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(new Map())));
      expect(e).toMatchObject({ status: 'skipped', hinweis: 'nicht verfügbar', anfragen: 1 });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'skipped', rows_loaded: null, error: null });
    }));

  it('stellt inkonsistente Summen unter Quarantäne und speichert nichts', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 444);
      (baum.get(apiUrl(P, '0416')) as { children: { value: number }[] }).children[0]!.value = 999;
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)));
      expect(e.status).toBe('quarantined');
      expect(e.hinweis).toMatch(/Summe der Kinder 999\.00 weicht vom Knoten 1000\.00 ab/);
      expect(await zeilen(tx, e.runId)).toEqual({ titel: 0, knoten: 0, abrufe: 0 });
    }));

  it('stellt Schemaverletzungen unter Quarantäne', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 555);
      delete (baum.get(apiUrl(P, '04')) as { meta: Record<string, unknown> }).meta.timestamp;
      expect((await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)))).status).toBe('quarantined');
    }));

  it('protokolliert Warnungen bei neuen Feldern und lädt trotzdem', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 666);
      (baum.get(apiUrl(P)) as Record<string, unknown>).neu = true;
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)));
      expect(e).toMatchObject({ status: 'succeeded', hinweis: '1 Warnung: Unbekanntes Feld neu' });
      const [abruf] = await tx`select warnungen from raw.api_abruf where run_id = ${e.runId}`;
      expect(abruf).toEqual({ warnungen: ['Unbekanntes Feld neu'] });
    }));

  it('markiert Netzwerkfehler als failed', () =>
    imRollback(async (tx) => {
      const abruf: ApiAbruf = async () => { throw new Error('Abruf nach 4 Versuchen fehlgeschlagen'); };
      const e = await ladeApiJahr(tx, P, optionen(abruf));
      expect(e).toMatchObject({ status: 'failed', hinweis: 'Abruf nach 4 Versuchen fehlgeschlagen' });
    }));
});
```

`packages/ingest/src/cli-api.int.test.ts`:
```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mainApi } from './cli-api';
import { baueBaum, fakeAbruf } from './api/test-baum';
import { imRollback } from './db/test-hilfen';

const HEUTE = new Date('2026-10-09T12:00:00Z');
const ablage = () => mkdtempSync(join(tmpdir(), 'hb-cli-api-'));

describe('CLI api', () => {
  it('lädt je Jahr beide Konten nacheinander und endet mit 0', () =>
    imRollback(async (tx) => {
      const baum = new Map([
        ...baueBaum({ jahr: 2013, konto: 'ausgaben', quote: 'ist' }, { '04': { '0411': [['43257', '018', 'A', 1]] } }, 7001),
        ...baueBaum({ jahr: 2013, konto: 'einnahmen', quote: 'ist' }, { '04': { '0411': [['11957', '018', 'E', 1]] } }, 7002),
      ]);
      const abruf = fakeAbruf(baum);
      const ausgaben: string[] = [];
      const code = await mainApi(['--', '--jahre', '2013', '--neu-laden'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage(), abruf, log: (t) => ausgaben.push(t) });
      expect(code).toBe(0);
      expect(abruf.aufrufe[0]).toContain('account=expenses');
      expect(abruf.aufrufe.at(-1)).toContain('account=income');
      expect(ausgaben.join('\n')).toContain('| 2013 | ausgaben | ist | succeeded | 1 |');
      expect(ausgaben.join('\n')).toContain('| 2013 | einnahmen | ist | succeeded | 1 |');
    }));

  it('endet mit 0, wenn ein Jahr nicht verfügbar ist, und mit 1 bei Quarantäne', () =>
    imRollback(async (tx) => {
      expect(await mainApi(['--jahre', '2026', '--konten', 'ausgaben'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage(), abruf: fakeAbruf(new Map()), log: () => {} })).toBe(0);
      const kaputt = baueBaum({ jahr: 2013, konto: 'ausgaben', quote: 'ist' }, { '04': { '0411': [['43257', '018', 'A', 1]] } }, 7003);
      kaputt.delete([...kaputt.keys()].find((u) => u.endsWith('id=0411'))!);
      expect(await mainApi(['--jahre', '2013', '--konten', 'ausgaben', '--neu-laden'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage(), abruf: fakeAbruf(kaputt), log: () => {} })).toBe(1);
    }));

  it.each([
    [['--konten', 'alle'], 'Unbekannte Konten: alle'],
    [['--quote', 'plan'], 'Unbekannte Quote: plan'],
  ])('lehnt ungültige Optionen ab: %j', async (argv, meldung) => {
    await expect(mainApi(argv, { heute: HEUTE })).rejects.toThrow(meldung);
  });
});
```

- [ ] **Step 2: Tests ausführen und Fehlschlag prüfen**

Run: `pnpm --filter @hb/ingest test; pnpm --filter @hb/ingest test:int`
Expected: FAIL (fehlende Module `api-bericht`, `api-ingest`, `cli-api`)

- [ ] **Step 3: Implementierung**

`packages/ingest/src/api-ingest.ts`:
```ts
import { archiviere, type ArchivOptionen } from './archiv';
import { crawle, holeWurzel, type ApiAbruf, type ApiParameter } from './api/crawler';
import { ApiVertragsFehler } from './api/schema';
import { inTransaktion, type Sql } from './db/client';
import { letzterApiStand, speichereApiCrawl } from './db/lade-api';
import { beendeLauf, starteLauf, type LaufStatus, type Trigger } from './db/lade-soll';

export type ApiIngestOptionen = {
  trigger: Trigger;
  gitSha: string;
  pipelineVersion: string;
  archiv: ArchivOptionen;
  abruf: ApiAbruf;
  neuLaden?: boolean;
};

export type ApiErgebnis = {
  parameter: ApiParameter;
  runId: string;
  status: LaufStatus;
  anfragen: number;
  titel?: number;
  summeCent?: number;
  hinweis?: string;
};

const warnHinweis = (warnungen: readonly string[]) =>
  warnungen.length === 0 ? undefined : `${warnungen.length} ${warnungen.length === 1 ? 'Warnung' : 'Warnungen'}: ${warnungen.join('; ')}`;

/** Ein Ladelauf für Jahr, Konto und Quote: Wurzel prüfen, bei neuem Stand vollständig crawlen, archivieren, atomar speichern. */
export async function ladeApiJahr(sql: Sql, p: ApiParameter, opt: ApiIngestOptionen): Promise<ApiErgebnis> {
  const runId = await starteLauf(sql, {
    sourceId: 'SRC_PORTAL_API',
    trigger: opt.trigger,
    gitSha: opt.gitSha,
    pipelineVersion: opt.pipelineVersion,
    params: { jahr: p.jahr, konto: p.konto, quote: p.quote, neu_laden: opt.neuLaden ? 'ja' : null },
  });
  let anfragen = 0;
  const abruf: ApiAbruf = (url) => {
    anfragen += 1;
    return opt.abruf(url);
  };

  const ende = async (status: LaufStatus, extra: { hinweis?: string; titel?: number; summeCent?: number } = {}): Promise<ApiErgebnis> => {
    const fehler = status === 'failed' || status === 'quarantined' ? extra.hinweis : undefined;
    await beendeLauf(sql, runId, { status, rowsLoaded: extra.titel, fehler });
    return { parameter: p, runId, status, anfragen, ...extra };
  };

  try {
    const wurzel = await holeWurzel(p, abruf);
    if (wurzel.status === 'nicht_verfuegbar') return await ende('skipped', { hinweis: 'nicht verfügbar' });
    const vorher = opt.neuLaden ? null : await letzterApiStand(sql, p);
    if (vorher?.quelleTimestamp === wurzel.antwort.meta.timestamp) return await ende('skipped', { hinweis: 'unverändert' });

    const crawl = await crawle(p, abruf, wurzel);
    const ndjson = Buffer.from(
      crawl.antworten.map((a) => JSON.stringify({ url: a.url, body: JSON.parse(a.roh.toString('utf8')) as unknown })).join('\n') + '\n',
    );
    const ablage = await archiviere(opt.archiv, `api_${p.quote}_${p.jahr}_${p.konto}_${crawl.quelleTimestamp}.ndjson`, ndjson);
    const anzahl = await inTransaktion(sql, (tx) =>
      speichereApiCrawl(tx, runId, p, crawl, { uri: ablage.uri, sha256: ablage.sha256, anfragen }),
    );
    return await ende('succeeded', { titel: anzahl.titel, summeCent: crawl.knoten[0]!.betragCent, hinweis: warnHinweis(crawl.warnungen) });
  } catch (e) {
    const status: LaufStatus = e instanceof ApiVertragsFehler ? 'quarantined' : 'failed';
    return await ende(status, { hinweis: e instanceof Error ? e.message : String(e) });
  }
}
```

`packages/ingest/src/api-bericht.ts`:
```ts
import type { ApiErgebnis } from './api-ingest';

const mrd = (cent: number) =>
  (cent / 100_000_000_000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const zelle = (text: string) => text.replaceAll('|', '/').replace(/\s*\n\s*/g, ' ');

export function formatiereApiBericht(ergebnisse: readonly ApiErgebnis[]): string {
  const zeile = (zellen: readonly string[]) => `| ${zellen.join(' | ')} |`;
  const kopf = ['Jahr', 'Konto', 'Quote', 'Status', 'Titel', 'Summe (Mrd. €)', 'Anfragen', 'Hinweis'];
  const zeilen = [zeile(kopf), zeile(kopf.map(() => '---'))];
  for (const e of ergebnisse) {
    zeilen.push(zeile([
      String(e.parameter.jahr),
      e.parameter.konto,
      e.parameter.quote,
      e.status,
      e.titel === undefined ? '' : String(e.titel),
      e.summeCent === undefined ? '' : mrd(e.summeCent),
      String(e.anfragen),
      zelle(e.hinweis ?? ''),
    ]));
  }
  return zeilen.join('\n');
}
```

`packages/ingest/src/cli-api.ts`:
```ts
import { parseArgs } from 'node:util';
import type { Konto } from '@hb/shared';
import { Drossel } from './abruf/http';
import { formatiereApiBericht } from './api-bericht';
import { ladeApiJahr, type ApiErgebnis } from './api-ingest';
import { netzAbruf, type ApiAbruf, type Quote } from './api/crawler';
import { STANDARD_ARCHIV_VERZEICHNIS } from './archiv';
import { verbinde, type Sql } from './db/client';
import { parseJahre } from './jahre';
import { laufKontext } from './lauf-kontext';

export type ApiCliAbhaengigkeiten = { sql?: Sql; heute?: Date; ablageVerzeichnis?: string; abruf?: ApiAbruf; log?: (text: string) => void };

const KONTEN: Record<string, readonly Konto[]> = { beide: ['ausgaben', 'einnahmen'], ausgaben: ['ausgaben'], einnahmen: ['einnahmen'] };
const QUOTEN: readonly Quote[] = ['ist', 'soll'];

export async function mainApi(argv: readonly string[], abh: ApiCliAbhaengigkeiten = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv.filter((a) => a !== '--'),
    options: {
      jahre: { type: 'string', default: 'alle' },
      konten: { type: 'string', default: 'beide' },
      quote: { type: 'string', default: 'ist' },
      'neu-laden': { type: 'boolean', default: false },
    },
  });
  const jahre = parseJahre(values.jahre ?? 'alle', abh.heute);
  const konten = KONTEN[values.konten ?? 'beide'];
  if (!konten) throw new Error(`Unbekannte Konten: ${values.konten}`);
  const quote = values.quote as Quote;
  if (!QUOTEN.includes(quote)) throw new Error(`Unbekannte Quote: ${values.quote}`);

  const kontext = laufKontext();
  const abruf = abh.abruf ?? netzAbruf({ userAgent: kontext.userAgent, drossel: new Drossel(500) });
  const sql = abh.sql ?? verbinde();
  const log = abh.log ?? ((text: string) => console.log(text));
  const ergebnisse: ApiErgebnis[] = [];
  try {
    for (const jahr of jahre) {
      for (const konto of konten) {
        ergebnisse.push(await ladeApiJahr(sql, { jahr, konto, quote }, {
          trigger: kontext.trigger,
          gitSha: kontext.gitSha,
          pipelineVersion: kontext.pipelineVersion,
          archiv: { verzeichnis: abh.ablageVerzeichnis ?? STANDARD_ARCHIV_VERZEICHNIS, basisUrl: process.env.HB_ARCHIV_BASIS_URL || undefined },
          abruf,
          neuLaden: values['neu-laden'],
        }));
      }
    }
  } finally {
    if (!abh.sql) await sql.end();
  }
  log(formatiereApiBericht(ergebnisse));
  return ergebnisse.some((e) => e.status === 'failed' || e.status === 'quarantined') ? 1 : 0;
}
```

`packages/ingest/src/bin-api.ts`:
```ts
import { mainApi } from './cli-api';

mainApi(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  },
);
```

`packages/ingest/package.json`: Script `"api": "tsx src/bin-api.ts"` ergänzen.

- [ ] **Step 4: Tests ausführen**

Run: `pnpm typecheck && pnpm test && pnpm test:int`
Expected: alle Tests PASS

- [ ] **Step 5: Echter Lauf, einmal, ein Jahr und ein Konto** (etwa 260 Anfragen, gut 2 Minuten)

```bash
pnpm --filter @hb/ingest api --quote ist --jahre 2024 --konten ausgaben
pnpm --filter @hb/ingest api --quote ist --jahre 2024 --konten ausgaben
```
Expected: erster Aufruf `| 2024 | ausgaben | ist | succeeded | <Titel> | 474,8 | <Anfragen> |`, zweiter Aufruf `skipped`, `1` Anfrage, `unverändert`. Bei `quarantined`: anhalten, Hinweis vollständig melden, keine Logik ändern.

- [ ] **Step 6: CLAUDE.md ergänzen**

Unter „Befehle“:
```markdown
- pnpm --filter @hb/ingest api --quote ist --jahre 2012-2025   Ist aus der internalapi (beide Konten), --konten ausgaben|einnahmen, --neu-laden
- pnpm --filter @hb/ingest api --quote soll --jahre 2027       Soll-Entwurf des Folgejahres aus der internalapi
```
Unter „Arbeitsweise“:
```markdown
- User-Agent ohne E-Mail: Standard ist Haushaltsblick/<version> (+https://github.com/alexander-walz/haushaltsblick).
- Bei jeder Änderung an Parser, Crawler oder Datenmodell die Version in packages/ingest/package.json erhöhen (pipeline_version).
- Alle Abrufe laufen nacheinander über die Drossel (500 ms), nie parallel.
```

- [ ] **Step 7: Commit**

```bash
git add packages/ingest CLAUDE.md
git commit -m "feat(ingest): Ist-Ingest aus der internalapi mit CLI und Bericht"
```

---

### Task 8: Workflows für wöchentlichen Ingest und Keep-alive, Betriebsdokumentation

**Files:**
- Create: `.github/workflows/ingest.yml`, `.github/workflows/keepalive.yml`, `docs/betrieb.md`

**Interfaces:**
- Consumes: CLI `start` (Soll) und `api` (Ist, Soll-Entwurf); Secret `SUPABASE_DB_URL`; Repository-Variable `HB_INGEST_AKTIV`
- Produces: Release `rohdaten` mit den Archivdateien; Job-Zusammenfassung mit beiden Berichten

- [ ] **Step 1: Workflows anlegen**

`.github/workflows/ingest.yml`:
```yaml
name: ingest
on:
  schedule:
    - cron: '17 4 * * 1'
  workflow_dispatch:
    inputs:
      jahre:
        description: 'Jahre, z. B. 2024-2026 oder alle'
        required: false
        default: 'alle'
      neu_laden:
        description: 'Unveränderte Stände trotzdem neu laden'
        type: boolean
        default: false
permissions:
  contents: write
concurrency:
  group: ingest
  cancel-in-progress: false
defaults:
  run:
    shell: bash
jobs:
  ingest:
    if: vars.HB_INGEST_AKTIV == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 180
    env:
      DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}
      HB_TRIGGER: ${{ github.event_name == 'schedule' && 'schedule' || 'manual' }}
      HB_ARCHIV_BASIS_URL: https://github.com/${{ github.repository }}/releases/download/rohdaten
      JAHRE: ${{ inputs.jahre || 'alle' }}
      NEU_LADEN: ${{ inputs.neu_laden && '--neu-laden' || '' }}
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: supabase/setup-cli@v1
        with:
          version: 2.120.0
      - name: Migrationen anwenden
        run: supabase db push --db-url "$DATABASE_URL"
      - name: Soll aus der XML-Datei
        id: soll
        continue-on-error: true
        run: pnpm --silent --filter @hb/ingest start --jahre "$JAHRE" $NEU_LADEN | tee -a bericht.md
      - name: Ist aus der internalapi
        id: ist
        continue-on-error: true
        run: pnpm --silent --filter @hb/ingest api --quote ist --jahre "$JAHRE" $NEU_LADEN | tee -a bericht.md
      - name: Soll-Entwurf des Folgejahres aus der internalapi
        id: entwurf
        continue-on-error: true
        run: pnpm --silent --filter @hb/ingest api --quote soll --jahre "$(( $(date +%Y) + 1 ))" $NEU_LADEN | tee -a bericht.md
      - name: Rohdaten im Release ablegen
        if: always()
        run: |
          shopt -s nullglob
          dateien=(data/raw/archiv/*.gz)
          if [ ${#dateien[@]} -eq 0 ]; then echo "Keine neuen Rohdaten."; exit 0; fi
          gh release view rohdaten >/dev/null 2>&1 || gh release create rohdaten --title "Rohdaten" \
            --notes "Unveränderte Rohdaten der Quellen, gzip-komprimiert. Datenquelle: Bundesministerium der Finanzen, bundeshaushalt.de. Rechtlich verbindlich ist ausschließlich der veröffentlichte Haushaltsplan."
          gh release upload rohdaten "${dateien[@]}" --clobber
      - name: Bericht
        if: always()
        run: |
          if [ -f bericht.md ]; then { echo "## Ingest"; echo; cat bericht.md; } >> "$GITHUB_STEP_SUMMARY"; fi
      - name: Ergebnis
        if: steps.soll.outcome == 'failure' || steps.ist.outcome == 'failure' || steps.entwurf.outcome == 'failure'
        run: |
          echo "Mindestens ein Ingest-Schritt ist fehlgeschlagen oder in Quarantäne. Siehe Bericht und docs/betrieb.md."
          exit 1
```

`.github/workflows/keepalive.yml`:
```yaml
name: keepalive
on:
  schedule:
    - cron: '42 5 * * *'
  workflow_dispatch:
jobs:
  ping:
    if: vars.HB_INGEST_AKTIV == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Datenbank anfragen, damit Supabase Free nicht pausiert
        env:
          DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: psql "$DATABASE_URL" -tAc "select count(*) from ops.load_run"
```

- [ ] **Step 2: Workflows statisch prüfen**

```bash
for f in .github/workflows/*.yml; do npx -y yaml@2.8.1 valid < "$f" && echo "$f: YAML gültig"; done
docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/repo" --workdir /repo rhysd/actionlint:1.7.7 -color
```
Expected: alle Dateien gültig, actionlint ohne Befunde (falls shellcheck-Hinweise zu `$NEU_LADEN` ohne Anführungszeichen erscheinen: beabsichtigt, weil leer oder ein einzelnes Flag; mit `# shellcheck disable=SC2086` in der jeweiligen `run`-Zeile quittieren)

- [ ] **Step 3: Betriebsdokumentation**

`docs/betrieb.md`:
```markdown
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
2. Supabase → Connect → „Session pooler“ (IPv4): Verbindungs-URL kopieren, Passwort einsetzen, `?sslmode=require` anhängen.
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
| Warnungen „Unbekanntes Feld …“ | API liefert neue Felder | kein Handlungsbedarf, beim nächsten Schema-Update aufnehmen |

## Rohdaten

Alle Rohdaten liegen gzip-komprimiert im Release `rohdaten`. `raw.source_file.ablage_uri` und `raw.api_abruf.ablage_uri` verweisen auf die Download-URL.
Läufe vor Plan 2 verweisen noch auf lokale Pfade.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ingest.yml .github/workflows/keepalive.yml docs/betrieb.md
git commit -m "ci: wöchentlicher Ingest, Keep-alive und Betriebsdokumentation"
```

---

### Task 9: Inbetriebnahme und erster Live-Lauf (mit Alexander)

**Files:**
- Create: `docs/befunde/2026-10-ist-ingest.md`
- Modify: `docs/superpowers/plans/2026-10-08-00-roadmap.md` (Übertrag aus Plan 2)

Diese Aufgabe braucht Alexander. Der Ausführende hält vor jedem Schritt mit Außenwirkung an und fragt.

- [ ] **Step 1: Pull Requests vorlegen**

Pull Request für `feat/plan-2-ist-ingest` gegen `feat/plan-1-soll-ingest` öffnen (oder gegen `main`, falls PR #1 bereits gemergt ist) und die CI abwarten. Alexander bitten, PR #1 und danach diesen PR nach `main` zu mergen, denn geplante und manuelle Workflows laufen nur auf `main`.

- [ ] **Step 2: Inbetriebnahme durch Alexander**

Alexander führt `docs/betrieb.md` → „Inbetriebnahme“ Schritt 1 bis 3 aus. Der Ausführende sieht und speichert die Datenbank-URL nicht.

- [ ] **Step 3: Ersten Lauf starten und beobachten**

Nach Alexanders Okay `ingest` manuell auf `main` starten (Jahre `alle`). Fortschritt über die öffentliche API beobachten:
```bash
curl -s "https://api.github.com/repos/alexander-walz/haushaltsblick/actions/runs?event=workflow_dispatch&per_page=1"
```
Expected: Abschluss `success` nach etwa 70 Minuten; im Release `rohdaten` liegen 15 Soll-Dateien und je Jahr 2012 bis 2025 zwei Ist-Dateien sowie der Soll-Entwurf des Folgejahres.

- [ ] **Step 4: Befund schreiben**

`docs/befunde/2026-10-ist-ingest.md` mit: Laufdatum und Git-SHA, Bericht aus der Job-Zusammenfassung (Soll und API), Anzahl Anfragen und Dauer, Anzahl Assets im Release, Auffälligkeiten (Quarantäne, Warnungen), Abgleich Ist-Gesamtsumme je Jahr mit `raw.api_knoten` (Abfrage von Alexander im Supabase SQL Editor ausführen lassen):
```sql
select jahr, konto, quote, betrag_eur
from raw.api_knoten k join ops.load_run l using (run_id)
where l.status = 'succeeded' and k.ebene = 'gesamt'
order by quote, jahr, konto;
```
sowie Folgerungen für Plan 3.

- [ ] **Step 5: Zweiten Lauf prüfen**

Erneut manuell starten. Expected: alle Jahre `skipped`, je Jahr und Konto eine Anfrage, Laufzeit unter 5 Minuten, keine neuen Release-Assets.

- [ ] **Step 6: Roadmap und Commit**

In der Roadmap unter „Übertrag aus Plan 1“ die erledigten Punkte für Plan 2 abhaken und einen Abschnitt „Übertrag aus Plan 2“ mit offenen Punkten anlegen.
```bash
git add docs
git commit -m "docs: Befund erster Live-Lauf Ist-Ingest"
```
