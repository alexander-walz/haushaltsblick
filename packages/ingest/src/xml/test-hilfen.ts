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
