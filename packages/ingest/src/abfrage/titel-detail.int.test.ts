import { describe, expect, it } from 'vitest';
import type { Sql } from '../db/client';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel, type TestTitel } from './testdaten';

const MRD = 1e9;
const SPORT = 'Zuschüsse für den Sport';
const BEITRAEGE = 'Beiträge an internationale Organisationen';

const TITEL: TestTitel[] = [
  // Ressortwechsel: Sport 2024 im Einzelplan 06, ab 2025 im Einzelplan 04
  { jahr: 2024, titelKey: '060168421', soll: 300_000_000, ist: 290_000_000, titelText: SPORT, seite: 19 },
  { jahr: 2025, titelKey: '041668421', soll: 310_000_000, ist: 300_000_000, titelText: SPORT, seite: 7 },
  { jahr: 2026, titelKey: '041668421', soll: 330_000_000, titelText: SPORT },
  // Mehrdeutig: zwei Kandidaten mit gleicher Nummer und gleichem Text
  { jahr: 2024, titelKey: '090153201', soll: 1 * MRD, titelText: BEITRAEGE },
  { jahr: 2024, titelKey: '090253201', soll: 2 * MRD, titelText: BEITRAEGE },
  { jahr: 2025, titelKey: '091053201', soll: 3 * MRD, titelText: BEITRAEGE },
  // Anderer Text: keine Verknüpfung
  { jahr: 2024, titelKey: '300168101', soll: 1 * MRD, titelText: 'Alte Bezeichnung' },
  { jahr: 2025, titelKey: '300268101', soll: 1 * MRD, titelText: 'Neue Bezeichnung' },
];

type Zeile = { jahr: number; titel_key: string; verknuepfung: string; soll_eur: number; ist_eur: number | null; fundstelle: Record<string, unknown> | null };
type Detail = { version: number; titel: Record<string, unknown>; fundstelle: Record<string, unknown> | null; zeitreihe: Zeile[]; hinweise: string[] };

async function detail(tx: Sql, titelKey: string, jahr: number | null = null): Promise<Detail> {
  const [z] = await tx`select api.get_titel_detail(${titelKey}, ${jahr}::integer, null::bigint) as r`;
  return z!.r as Detail;
}

async function mitTestdaten(fn: (tx: Sql) => Promise<void>): Promise<void> {
  await imRollback(async (tx) => {
    await leereMart(tx);
    await veroeffentlicheTitel(tx, TITEL);
    await fn(tx);
  });
}

describe('api.get_titel_detail', () => {
  it('führt die Zeitreihe über einen Ressortwechsel zurück', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '041668421');
      expect(r.titel.jahr).toBe(2026);
      expect(r.zeitreihe.map((z) => [z.jahr, z.titel_key, z.verknuepfung])).toEqual([
        [2024, '060168421', 'nachgefuehrt'],
        [2025, '041668421', 'gleich'],
        [2026, '041668421', 'ausgangspunkt'],
      ]);
      expect(r.zeitreihe.map((z) => z.ist_eur)).toEqual([290_000_000, 300_000_000, null]);
      expect(r.hinweise.some((h) => h.includes('Titelnummer und Bezeichnung'))).toBe(true);
    }));

  it('führt die Zeitreihe auch vorwärts', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '060168421', 2024);
      expect(r.zeitreihe.map((z) => [z.jahr, z.titel_key, z.verknuepfung])).toEqual([
        [2024, '060168421', 'ausgangspunkt'],
        [2025, '041668421', 'nachgefuehrt'],
        [2026, '041668421', 'gleich'],
      ]);
    }));

  it('verknüpft nicht bei mehreren Kandidaten', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '091053201');
      expect(r.zeitreihe.map((z) => z.jahr)).toEqual([2025]);
    }));

  it('verknüpft nicht bei anderem Text', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '300268101');
      expect(r.zeitreihe.map((z) => z.jahr)).toEqual([2025]);
    }));

  it('nennt die Fundstelle im Haushaltsplan', () =>
    mitTestdaten(async (tx) => {
      const r = await detail(tx, '060168421', 2024);
      expect(r.fundstelle).toEqual({
        url: 'https://www.bundeshaushalt.de/static/daten/2024/soll/epl06.pdf#page=19',
        seite: 19,
        dokument: 'Haushaltsplan 2024, Einzelplan 06',
      });
      expect(r.zeitreihe.find((z) => z.jahr === 2026)!.fundstelle).toBeNull();
      expect(r.titel).not.toHaveProperty('zeilen_hash');
      expect(r.titel).not.toHaveProperty('gueltig_ab_version');
    }));

  it('lehnt ungültige und unbekannte Schlüssel ab', () =>
    mitTestdaten(async (tx) => {
      await expect(detail(tx, '0601 68421')).rejects.toThrow(/neunstellig/);
    }));

  it('meldet einen unbekannten Titel', () =>
    mitTestdaten(async (tx) => {
      await expect(detail(tx, '999999999')).rejects.toThrow(/nicht gefunden/);
    }));

  it('darf von anon ausgeführt werden', () =>
    mitTestdaten(async (tx) => {
      await tx`set local role anon`;
      const r = await detail(tx, '041668421');
      expect(r.zeitreihe).toHaveLength(3);
    }));
});
