import { describe, expect, it } from 'vitest';
import { balken, kappe, masstab, position, vereinige } from './skala';

describe('Maßstab', () => {
  it('schließt immer die Null ein', () => {
    expect(masstab([10, 30])).toEqual({ min: 0, max: 30 });
    expect(masstab([-5, 20, null])).toEqual({ min: -5, max: 20 });
    expect(masstab([-8, -2])).toEqual({ min: -8, max: 0 });
  });

  it('liefert für leere Reihen einen gültigen Maßstab', () => {
    expect(masstab([])).toEqual({ min: 0, max: 1 });
    expect(masstab([null, undefined, Number.NaN])).toEqual({ min: 0, max: 1 });
  });

  it('vereinigt Maßstäbe für gleiche Skalierung über Diagramme', () => {
    expect(vereinige({ min: 0, max: 30 }, { min: -5, max: 10 })).toEqual({ min: -5, max: 30 });
  });

  it('bildet Werte linear ab', () => {
    const m = { min: -50, max: 150 };
    expect(position(0, m, 100)).toBe(25);
    expect(position(150, m, 100)).toBe(100);
    expect(position(-50, m, 100)).toBe(0);
  });

  it('zeichnet Balken von der Nulllinie aus, auch negative', () => {
    const m = { min: -50, max: 150 };
    expect(balken(100, m, 100)).toEqual({ x: 25, breite: 50 });
    expect(balken(-50, m, 100)).toEqual({ x: 0, breite: 25 });
    expect(balken(0, m, 100)).toEqual({ x: 25, breite: 0 });
  });

  it('kappt relative Ausreißer bei 100 %', () => {
    expect(kappe(0.4)).toEqual({ wert: 0.4, gekappt: false });
    expect(kappe(3.2)).toEqual({ wert: 1, gekappt: true });
    expect(kappe(-1.5)).toEqual({ wert: -1, gekappt: true });
  });
});
