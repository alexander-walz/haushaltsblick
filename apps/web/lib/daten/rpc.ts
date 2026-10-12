import 'server-only';
import type { z } from 'zod';
import { konfiguration, type Konfiguration } from './konfig';

export type RpcWert = string | number | boolean | null | undefined | readonly string[] | { readonly [k: string]: unknown };

export class ApiFehler extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null) {
    super(message);
    this.name = 'ApiFehler';
  }
}

/** Alle API-Antworten tragen diesen Cache-Tag; /api/revalidate verwirft ihn nach jeder Veröffentlichung. */
export const CACHE_TAG = 'datenstand';
const ZEITLIMIT = '57014';
/** Zeitlimit je Versuch; danach zeigt die Seite die eigene Fehlerseite statt Vercels 504 (Spec 6.9). */
export const ZEITLIMIT_MS = 15_000;

export type RpcOptionen = {
  abruf?: typeof fetch;
  konfig?: Konfiguration;
  warten?: (ms: number) => Promise<void>;
  /** `no-store` für Abrufe mit freier Eingabe (Suche): kein Eintrag im Datencache, kein Tag. */
  cache?: 'no-store';
  zeitlimitMs?: number;
};

function pgArray(werte: readonly string[]): string {
  return `{${werte.map((w) => `"${w.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

/** GET-Aufruf einer Funktion im Schema api; GET macht die Antwort für Next.js cachebar. */
export function rpcUrl(basis: string, funktion: string, args: Readonly<Record<string, RpcWert>>): string {
  const params = new URLSearchParams();
  for (const [name, wert] of Object.entries(args)) {
    if (wert === null || wert === undefined) continue;
    if (Array.isArray(wert)) params.set(name, pgArray(wert as readonly string[]));
    else if (typeof wert === 'object') params.set(name, JSON.stringify(wert));
    else params.set(name, String(wert));
  }
  const query = params.toString();
  return `${basis}/rest/v1/rpc/${funktion}${query ? `?${query}` : ''}`;
}

function feld(daten: unknown, name: string): string | null {
  if (typeof daten !== 'object' || daten === null) return null;
  const wert = (daten as Record<string, unknown>)[name];
  return typeof wert === 'string' ? wert : null;
}

/**
 * Begrenzt Abruf und Lesen der Antwort. Bewusst ohne AbortSignal: Next.js schaltet für Aufrufe mit `signal` die
 * Deduplizierung je Anfrage ab (next/dist/server/lib/dedupe-fetch.js), dann liefen etwa Fuß und Seite doppelt.
 * Der hängende Abruf läuft im Hintergrund aus, die Seite wartet nicht länger.
 */
function mitZeitlimit<T>(arbeit: Promise<T>, ms: number, funktion: string): Promise<T> {
  let uhr: ReturnType<typeof setTimeout> | undefined;
  const ablauf = new Promise<never>((_, abbruch) => {
    uhr = setTimeout(() => abbruch(new ApiFehler(`${funktion} hat nicht innerhalb von ${ms / 1000} s geantwortet`, 504, 'ZEITLIMIT')), ms);
  });
  return Promise.race([arbeit, ablauf]).finally(() => clearTimeout(uhr));
}

export async function rpc<T>(funktion: string, args: Readonly<Record<string, RpcWert>>, schema: z.ZodType<T>, opt: RpcOptionen = {}): Promise<T> {
  const konfig = opt.konfig ?? konfiguration();
  const abruf = opt.abruf ?? fetch;
  const warten = opt.warten ?? ((ms: number) => new Promise<void>((fertig) => setTimeout(fertig, ms)));
  const url = rpcUrl(konfig.url, funktion, args);
  for (let versuch = 1; ; versuch++) {
    // Next.js dedupliziert gleiche GET-Aufrufe je Anfrage, auch Fehlerantworten. Ab dem zweiten Versuch
    // macht die Kopfzeile den Aufruf unterscheidbar; der erste bleibt unverändert (stabiler Cache-Schlüssel).
    const kopf: Record<string, string> = { apikey: konfig.key, 'Accept-Profile': 'api', Accept: 'application/json' };
    if (versuch > 1) kopf['x-hb-versuch'] = String(versuch);
    const init = opt.cache === 'no-store'
      ? { headers: kopf, cache: 'no-store' }
      : { headers: kopf, cache: 'force-cache', next: { revalidate: 86_400, tags: [CACHE_TAG] } };
    const { antwort, text } = await mitZeitlimit((async () => {
      const a = await abruf(url, init as RequestInit);
      return { antwort: a, text: await a.text() };
    })(), opt.zeitlimitMs ?? ZEITLIMIT_MS, funktion);
    let daten: unknown;
    try {
      daten = JSON.parse(text);
    } catch {
      throw new ApiFehler(`Antwort von ${funktion} ist kein JSON (HTTP ${antwort.status})`, antwort.status, null);
    }
    if (!antwort.ok) {
      const code = feld(daten, 'code');
      // Kalter Datenbank-Cache auf Supabase Free: der zweite Versuch ist meist schnell (Messung 12.10.2026).
      if (code === ZEITLIMIT && versuch < 2) {
        await warten(400);
        continue;
      }
      throw new ApiFehler(feld(daten, 'message') ?? `HTTP ${antwort.status}`, antwort.status, code);
    }
    const geprueft = schema.safeParse(daten);
    if (!geprueft.success) throw new ApiFehler(`Antwort von ${funktion} entspricht nicht dem erwarteten Schema`, antwort.status, 'SCHEMA');
    return geprueft.data;
  }
}
