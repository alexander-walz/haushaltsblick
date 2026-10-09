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
