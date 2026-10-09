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
