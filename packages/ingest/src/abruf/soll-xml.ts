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
