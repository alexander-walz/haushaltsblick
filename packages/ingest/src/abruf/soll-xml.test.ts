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
    expect(f).toHaveBeenCalledWith(sollXmlUrl(2026), expect.objectContaining({ headers: { 'User-Agent': UA } }));
  });

  it('sendet den ETag und erkennt eine unveränderte Datei', async () => {
    const f = fakeFetch(new Response(null, { status: 304 }));
    const ergebnis = await holeSollXml(2026, { userAgent: UA, etag: '"abc"', fetchImpl: f as unknown as typeof fetch });
    expect(ergebnis).toEqual({ status: 'unveraendert', url: sollXmlUrl(2026) });
    expect(f).toHaveBeenCalledWith(sollXmlUrl(2026), expect.objectContaining({ headers: { 'User-Agent': UA, 'If-None-Match': '"abc"' } }));
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

  it('übergibt ein Abbruchsignal und wiederholt nach Timeout', async () => {
    const f = fakeFetch(new DOMException('zu langsam', 'TimeoutError'), new Response('<haushalt/>', { status: 200 }));
    const ergebnis = await holeSollXml(2026, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, wartezeitenMs: KEINE_WARTEZEIT });
    expect(ergebnis.status).toBe('neu');
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('bricht einen hängenden Abruf nach timeoutMs ab und wiederholt', async () => {
    let aufrufe = 0;
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if (++aufrufe > 1) return new Response('<haushalt/>', { status: 200 });
      return new Promise<Response>((_ok, fehler) => {
        init!.signal!.addEventListener('abort', () => fehler(init!.signal!.reason));
      });
    });
    const ergebnis = await holeSollXml(2026, { userAgent: UA, fetchImpl: f as unknown as typeof fetch, wartezeitenMs: KEINE_WARTEZEIT, timeoutMs: 20 });
    expect(ergebnis.status).toBe('neu');
    expect(f).toHaveBeenCalledTimes(2);
  });
});
