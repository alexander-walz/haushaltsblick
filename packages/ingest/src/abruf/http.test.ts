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
