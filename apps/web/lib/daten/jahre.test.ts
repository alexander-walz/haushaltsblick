import { describe, expect, it } from 'vitest';
import type { Datenstand } from './schemas';
import { istVerfuegbar, standardjahre } from './jahre';

function stand(jahre: { jahr: number; stand: string; ist: boolean }[]): Datenstand {
  return {
    version: 2, veroeffentlicht_am: '2026-10-12T05:33:07Z', ist_aktuell: true, semantik_version: 1,
    ampel: 'yellow', score: 87.18, zeilen: 1, pruefungen: [],
    jahre: jahre.flatMap((j) => (['ausgaben', 'einnahmen'] as const).map((konto) => ({
      jahr: j.jahr, konto, haushaltsstand: j.stand, soll_quelle: 'api', ist_verfuegbar: j.ist, titel: 1,
    }))),
  };
}

const STAND = stand([
  { jahr: 2024, stand: 'Gesetz', ist: true },
  { jahr: 2025, stand: 'Gesetz', ist: true },
  { jahr: 2026, stand: 'Gesetz', ist: false },
  { jahr: 2027, stand: 'Regierungsentwurf', ist: false },
]);

describe('Standardjahre', () => {
  it('nimmt das laufende Kalenderjahr, wenn beschlossen', () => {
    expect(standardjahre(STAND, new Date('2026-10-12'))).toEqual({ laufend: 2026, letztesMitIst: 2025, entwurf: 2027, alle: [2024, 2025, 2026, 2027] });
  });

  it('nimmt sonst das jüngste beschlossene Jahr', () => {
    expect(standardjahre(STAND, new Date('2030-01-05')).laufend).toBe(2026);
  });

  it('kommt ohne Ist aus', () => {
    const s = stand([{ jahr: 2026, stand: 'Gesetz', ist: false }]);
    expect(standardjahre(s, new Date('2026-10-12'))).toMatchObject({ laufend: 2026, letztesMitIst: null, entwurf: null });
  });

  it('meldet einen Datenstand ohne Jahre', () => {
    expect(() => standardjahre(stand([]), new Date('2026-10-12'))).toThrow(/keine Jahre/);
  });

  it('kennt die Verfügbarkeit des Ist je Jahr und Konto', () => {
    expect(istVerfuegbar(STAND, 2025, 'ausgaben')).toBe(true);
    expect(istVerfuegbar(STAND, 2026, 'einnahmen')).toBe(false);
    expect(istVerfuegbar(STAND, 1999, 'ausgaben')).toBe(false);
  });
});
