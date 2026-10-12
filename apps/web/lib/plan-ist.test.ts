import { describe, expect, it } from 'vitest';
import type { Datenstand } from './daten/schemas';
import { groessteAbweichungen, lesePlanIstParameter } from './plan-ist';

describe('groessteAbweichungen', () => {
  it('vereint oben und unten, sortiert nach Betrag und nimmt die größten', () => {
    const oben = [{ einzelplan_nr: '06', abweichung: 0.6 }, { einzelplan_nr: '32', abweichung: 0.5 }];
    const unten = [{ einzelplan_nr: '60', abweichung: -3.5 }, { einzelplan_nr: '14', abweichung: -2.8 }, { einzelplan_nr: '06', abweichung: 0.6 }];
    const r = groessteAbweichungen([...oben, ...unten], 'einzelplan_nr', 'abweichung', 3);
    expect(r.map((z) => z.einzelplan_nr)).toEqual(['60', '14', '06']);
  });

  it('liefert bei einseitiger Verteilung genau die größten', () => {
    const unten = Array.from({ length: 12 }, (_, i) => ({ k: `n${i}`, abweichung: -(i + 1) }));
    const oben = [{ k: 'p1', abweichung: 0.3 }, { k: 'p2', abweichung: 0.2 }, { k: 'p3', abweichung: 0.1 }];
    const r = groessteAbweichungen([...oben, ...unten], 'k', 'abweichung', 12);
    expect(r.map((z) => z.k).sort()).toEqual(unten.map((z) => z.k).sort());
  });

  it('lässt Zeilen ohne Wert weg', () => {
    const r = groessteAbweichungen([{ k: 'a', abweichung: null }, { k: 'b', abweichung: 1 }], 'k', 'abweichung', 5);
    expect(r.map((z) => z.k)).toEqual(['b']);
  });
});

describe('lesePlanIstParameter', () => {
  const stand = {
    version: 2, veroeffentlicht_am: '2026-10-12T05:33:07Z', ist_aktuell: true, semantik_version: 1, ampel: 'yellow', score: 87, zeilen: 1, pruefungen: [],
    jahre: [2024, 2025, 2026].flatMap((jahr) => (['ausgaben', 'einnahmen'] as const).map((konto) => ({
      jahr, konto, haushaltsstand: 'Gesetz', soll_quelle: 'api', ist_verfuegbar: jahr < 2026, titel: 1,
    }))),
  } satisfies Datenstand;
  const jahre = { laufend: 2026, letztesMitIst: 2025, entwurf: null, alle: [2024, 2025, 2026] };

  it('nimmt standardmäßig das letzte Jahr mit Ist', () => {
    expect(lesePlanIstParameter({}, stand, jahre)).toEqual({ jahr: 2025, konto: 'ausgaben', ebene: 'einzelplan', sortierung: 'abweichung', hinweise: [] });
  });

  it('wechselt bei einem Jahr ohne Ist mit Hinweis', () => {
    const r = lesePlanIstParameter({ jahr: '2026' }, stand, jahre);
    expect(r.jahr).toBe(2025);
    expect(r.hinweise).toEqual(['Für 2026 liegt noch kein Ist vor. Gezeigt wird 2025, das letzte abgeschlossene Jahr.']);
  });

  it('liest Ebene, Konto und Sortierung', () => {
    expect(lesePlanIstParameter({ jahr: '2024', konto: 'einnahmen', ebene: 'titel', sortierung: 'relativ' }, stand, jahre))
      .toMatchObject({ jahr: 2024, konto: 'einnahmen', ebene: 'titel', sortierung: 'abweichung_rel' });
  });

  it('weist ein unbekanntes Jahr mit eigenem Hinweis ab', () => {
    for (const wert of ['1999', 'abc', '2025.5']) {
      const r = lesePlanIstParameter({ jahr: wert }, stand, jahre);
      expect(r.jahr).toBe(2025);
      expect(r.hinweise).toEqual([`Das Jahr „${wert}“ ist nicht verfügbar. Gezeigt wird 2025.`]);
    }
  });

  it('weist darauf hin, wenn es noch kein Jahr mit Ist gibt', () => {
    const r = lesePlanIstParameter({}, stand, { ...jahre, letztesMitIst: null });
    expect(r.jahr).toBe(2026);
    expect(r.hinweise).toEqual(['Noch kein abgeschlossenes Jahr mit Ist verfügbar.']);
  });
});
