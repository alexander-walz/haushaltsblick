import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiFehler, rpc, rpcUrl } from './rpc';

const KONFIG = { url: 'https://api.test', key: 'k' };
const Schema = z.object({ ok: z.boolean() });

function antwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('rpcUrl', () => {
  it('baut GET-Parameter für Arrays, JSON und Zahlen in fester Reihenfolge', () => {
    const url = rpcUrl('https://api.test', 'query_metric', {
      p_metrics: ['soll', 'ist'],
      p_group_by: [],
      p_filters: { konto: 'ausgaben', jahr: 2025 },
      p_order_by: undefined,
      p_limit: 5,
      p_version: 2,
    });
    expect(url).toBe(
      'https://api.test/rest/v1/rpc/query_metric?p_metrics=%7B%22soll%22%2C%22ist%22%7D&p_group_by=%7B%7D'
        + '&p_filters=%7B%22konto%22%3A%22ausgaben%22%2C%22jahr%22%3A2025%7D&p_limit=5&p_version=2',
    );
  });

  it('maskiert Anführungszeichen in Array-Elementen', () => {
    const url = new URL(rpcUrl('https://api.test', 'f', { a: ['x"y'] }));
    expect(url.searchParams.get('a')).toBe('{"x\\"y"}');
  });

  it('lässt Parameter ohne Wert weg', () => {
    expect(rpcUrl('https://api.test', 'get_dataset_status', {})).toBe('https://api.test/rest/v1/rpc/get_dataset_status');
  });
});

describe('rpc', () => {
  it('sendet apikey und Accept-Profile und prüft die Antwort', async () => {
    let kopf: Headers | undefined;
    const daten = await rpc('f', {}, Schema, {
      konfig: KONFIG,
      abruf: async (_url, init) => {
        kopf = new Headers(init?.headers);
        return antwort(200, { ok: true });
      },
    });
    expect(daten).toEqual({ ok: true });
    expect(kopf?.get('apikey')).toBe('k');
    expect(kopf?.get('accept-profile')).toBe('api');
  });

  it('wiederholt einmal bei Zeitlimit 57014', async () => {
    const koepfe: Headers[] = [];
    const pausen: number[] = [];
    const daten = await rpc('f', {}, Schema, {
      konfig: KONFIG,
      warten: async (ms) => { pausen.push(ms); },
      abruf: async (_url, init) => {
        koepfe.push(new Headers(init?.headers));
        return koepfe.length === 1 ? antwort(500, { code: '57014', message: 'canceling statement due to statement timeout' }) : antwort(200, { ok: true });
      },
    });
    expect(daten).toEqual({ ok: true });
    expect(koepfe).toHaveLength(2);
    expect(koepfe[0]?.get('x-hb-versuch')).toBeNull();
    expect(koepfe[1]?.get('x-hb-versuch')).toBe('2');
    expect(pausen).toEqual([400]);
  });

  it('übergibt die Cache-Optionen von Next.js', async () => {
    let optionen: RequestInit | undefined;
    await rpc('f', {}, Schema, {
      konfig: KONFIG,
      abruf: async (_url, init) => { optionen = init; return antwort(200, { ok: true }); },
    });
    expect(optionen?.cache).toBe('force-cache');
    expect((optionen as { next?: unknown }).next).toEqual({ revalidate: 86400, tags: ['datenstand'] });
  });

  it('gibt nach dem zweiten Zeitlimit auf', async () => {
    const fehler = await rpc('f', {}, Schema, {
      konfig: KONFIG,
      warten: async () => {},
      abruf: async () => antwort(500, { code: '57014', message: 'timeout' }),
    }).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(ApiFehler);
    expect(fehler).toMatchObject({ status: 500, code: '57014' });
  });

  it('meldet Parameterfehler der API ohne Wiederholung', async () => {
    let aufrufe = 0;
    const fehler = await rpc('f', {}, Schema, {
      konfig: KONFIG,
      abruf: async () => { aufrufe++; return antwort(400, { code: '22023', message: 'Titel 1 im Jahr 2025 nicht gefunden' }); },
    }).catch((e: unknown) => e);
    expect(fehler).toMatchObject({ code: '22023', message: 'Titel 1 im Jahr 2025 nicht gefunden' });
    expect(aufrufe).toBe(1);
  });

  it('lehnt Antworten ab, die nicht dem Schema entsprechen', async () => {
    const fehler = await rpc('f', {}, Schema, { konfig: KONFIG, abruf: async () => antwort(200, { ok: 'ja' }) }).catch((e: unknown) => e);
    expect(fehler).toMatchObject({ code: 'SCHEMA' });
  });

  it('lehnt Antworten ab, die kein JSON sind', async () => {
    const fehler = await rpc('f', {}, Schema, { konfig: KONFIG, abruf: async () => new Response('<html>', { status: 502 }) }).catch((e: unknown) => e);
    expect(fehler).toMatchObject({ status: 502, code: null });
  });

  it('verzichtet auf Wunsch auf den Datencache (no-store, ohne Tag)', async () => {
    let optionen: RequestInit | undefined;
    await rpc('f', {}, Schema, {
      konfig: KONFIG,
      cache: 'no-store',
      abruf: async (_url, init) => { optionen = init; return antwort(200, { ok: true }); },
    });
    expect(optionen?.cache).toBe('no-store');
    expect((optionen as { next?: unknown }).next).toBeUndefined();
  });

  it('bricht einen hängenden Abruf nach dem Zeitlimit mit ApiFehler ab', async () => {
    let aufrufe = 0;
    const fehler = await rpc('f', {}, Schema, {
      konfig: KONFIG,
      zeitlimitMs: 20,
      abruf: () => { aufrufe++; return new Promise<Response>(() => {}); },
    }).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(ApiFehler);
    expect(fehler).toMatchObject({ status: 504, code: 'ZEITLIMIT' });
    expect(aufrufe).toBe(1);
  });

  it('begrenzt auch das Lesen der Antwort', async () => {
    const fehler = await rpc('f', {}, Schema, {
      konfig: KONFIG,
      zeitlimitMs: 20,
      abruf: async () => new Response(new ReadableStream({ start() {} }), { status: 200 }),
    }).catch((e: unknown) => e);
    expect(fehler).toMatchObject({ code: 'ZEITLIMIT' });
  });
});
