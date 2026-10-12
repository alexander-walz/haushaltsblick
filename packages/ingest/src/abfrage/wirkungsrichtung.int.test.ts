import { describe, expect, it } from 'vitest';
import type { Sql } from '../db/client';
import { imRollback } from '../db/test-hilfen';
import { leereMart, veroeffentlicheTitel, type TestTitel } from './testdaten';

const MRD = 1e9;

// Einnahmen: Steuer (Obergruppe 01), Kredit (32), Rücklagenentnahme (35) und Globale Mehreinnahmen (37);
// Ausgaben: Zinsen (Funktion 830) und Verteidigung. 35 und 37 ohne Abweichung, damit die Summen gleich bleiben.
const TITEL: TestTitel[] = [
  { jahr: 2024, titelKey: '600101101', konto: 'einnahmen', soll: 100 * MRD, ist: 103 * MRD, titelText: 'Lohnsteuer' },
  { jahr: 2024, titelKey: '320132501', konto: 'einnahmen', soll: 50 * MRD, ist: 46 * MRD, titelText: 'Kredite am Kreditmarkt' },
  { jahr: 2024, titelKey: '600135901', konto: 'einnahmen', soll: 5 * MRD, ist: 5 * MRD, titelText: 'Entnahme aus der Rücklage' },
  { jahr: 2024, titelKey: '600137101', konto: 'einnahmen', soll: 2 * MRD, ist: 2 * MRD, titelText: 'Globale Mehreinnahmen' },
  { jahr: 2024, titelKey: '320157501', soll: 30 * MRD, ist: 28 * MRD, fkt: '830', titelText: 'Zinsen' },
  { jahr: 2024, titelKey: '140155401', soll: 80 * MRD, ist: 79 * MRD, fkt: '032', titelText: 'Beschaffung' },
];

async function abfrage(tx: Sql, kennzahlen: string[], gruppierung: string[], filter: Record<string, unknown>) {
  const f = tx.json(filter as Parameters<Sql['json']>[0]);
  const [z] = await tx`select api.query_metric(${kennzahlen}::text[], ${gruppierung}::text[], ${f}::jsonb) as r`;
  return z!.r as { zeilen: Record<string, unknown>[] };
}

async function mitTestdaten(fn: (tx: Sql) => Promise<void>): Promise<void> {
  await imRollback(async (tx) => {
    await leereMart(tx);
    await veroeffentlicheTitel(tx, TITEL);
    await fn(tx);
  });
}

describe('Wirkungsrichtung (E21)', () => {
  it('färbt Steuern positiv, Kredite negativ und Rücklagen sowie Globale Mehreinnahmen neutral', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, ['abweichung'], ['titel_key'], { konto: 'einnahmen', jahr: 2024 });
      expect(r.zeilen).toEqual([
        { titel_key: '320132501', titel_text: 'Kredite am Kreditmarkt', abweichung: -4 * MRD, wirkungsrichtung: 'anstieg_negativ' },
        { titel_key: '600101101', titel_text: 'Lohnsteuer', abweichung: 3 * MRD, wirkungsrichtung: 'anstieg_positiv' },
        { titel_key: '600135901', titel_text: 'Entnahme aus der Rücklage', abweichung: 0, wirkungsrichtung: 'neutral' },
        { titel_key: '600137101', titel_text: 'Globale Mehreinnahmen', abweichung: 0, wirkungsrichtung: 'neutral' },
      ]);
    }));

  it('ist neutral, wenn eine Gruppe verschiedene Richtungen enthält', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, ['abweichung'], [], { konto: 'einnahmen', jahr: 2024 });
      expect(r.zeilen).toEqual([{ abweichung: -1 * MRD, wirkungsrichtung: 'neutral' }]);
    }));

  it('färbt Zinsen negativ und übrige Ausgaben neutral', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, ['abweichung', 'abweichung_rel'], ['einzelplan_nr'], { konto: 'ausgaben', jahr: 2024 });
      expect(r.zeilen.map((z) => [z.einzelplan_nr, z.wirkungsrichtung])).toEqual([
        ['14', 'neutral'],
        ['32', 'anstieg_negativ'],
      ]);
    }));

  it('liefert die Spalte nur bei Abweichungskennzahlen', () =>
    mitTestdaten(async (tx) => {
      const r = await abfrage(tx, ['soll'], ['einzelplan_nr'], { konto: 'ausgaben', jahr: 2024 });
      expect(r.zeilen.every((z) => !('wirkungsrichtung' in z))).toBe(true);
    }));

  it('listet die Regeln mit Begründung', () =>
    mitTestdaten(async (tx) => {
      const [z] = await tx`select api.list_kennzahlen() as k`;
      const regeln = (z!.k as { wirkungsrichtung: { regel_id: string; richtung: string; begruendung: string }[] }).wirkungsrichtung;
      expect(regeln.map((w) => [w.regel_id, w.richtung])).toEqual([
        ['einnahmen', 'anstieg_positiv'],
        ['globale_mehr_minder', 'neutral'],
        ['kreditaufnahme', 'anstieg_negativ'],
        ['ruecklagenentnahme', 'neutral'],
        ['zinsen', 'anstieg_negativ'],
      ]);
      expect(regeln.every((w) => w.begruendung.length > 20)).toBe(true);
    }));

  it('darf von anon ausgeführt werden', () =>
    mitTestdaten(async (tx) => {
      await tx`set local role anon`;
      const r = await abfrage(tx, ['abweichung'], ['titel_key'], { konto: 'einnahmen', jahr: 2024 });
      expect(r.zeilen).toHaveLength(4);
    }));
});
