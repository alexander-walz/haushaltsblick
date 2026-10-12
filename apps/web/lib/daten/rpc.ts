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

export type RpcOptionen = { abruf?: typeof fetch; konfig?: Konfiguration; warten?: (ms: number) => Promise<void> };

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
    const antwort = await abruf(url, {
      headers: kopf,
      cache: 'force-cache',
      next: { revalidate: 86_400, tags: [CACHE_TAG] },
    } as RequestInit);
    const text = await antwort.text();
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
