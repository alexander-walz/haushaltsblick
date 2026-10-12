import { describe, expect, it } from 'vitest';
import { EINHEITEN, betrag, betragMitEinheit, dezimal, einheitFuer, euro, ganzzahl, prozent } from './format';

describe('Formatierung', () => {
  it('wählt die Einheit nach dem größten Betrag', () => {
    expect(einheitFuer([524_540_138_000, 1])).toBe(EINHEITEN.mrd);
    expect(einheitFuer([999_000_000])).toBe(EINHEITEN.mio);
    expect(einheitFuer([-2_500])).toBe(EINHEITEN.tsd);
    expect(einheitFuer([12, null, undefined])).toBe(EINHEITEN.eur);
    expect(einheitFuer([])).toBe(EINHEITEN.eur);
  });

  it('formatiert Beträge deutsch mit echtem Minuszeichen', () => {
    expect(betrag(524_540_138_000, EINHEITEN.mrd)).toBe('524,5');
    expect(betrag(-2_800_000_000, EINHEITEN.mrd, { vorzeichen: true })).toBe('−2,8');
    expect(betrag(20_400_000_000, EINHEITEN.mrd, { vorzeichen: true })).toBe('+20,4');
    expect(betrag(1_234_567_000_000, EINHEITEN.mrd)).toBe('1.234,6');
  });

  it('zeigt Abweichungen, die auf null runden, mit dem Vorzeichen des ungerundeten Werts (E21)', () => {
    expect(betrag(-40_000_000, EINHEITEN.mrd, { vorzeichen: true })).toBe('−0,0');
    expect(betrag(40_000_000, EINHEITEN.mrd, { vorzeichen: true })).toBe('+0,0');
    expect(betrag(0, EINHEITEN.mrd, { vorzeichen: true })).toBe('0,0');
    expect(betrag(-40_000_000, EINHEITEN.mrd)).toBe('0,0');
    expect(prozent(0.0004, { vorzeichen: true })).toBe('+0,0 %');
    expect(prozent(-0.0004, { vorzeichen: true })).toBe('−0,0 %');
    expect(prozent(0, { vorzeichen: true })).toBe('0,0 %');
  });

  it('zeigt fehlende Werte als n. v.', () => {
    expect(betrag(null, EINHEITEN.mrd)).toBe('n. v.');
    expect(betrag(undefined, EINHEITEN.mrd)).toBe('n. v.');
  });

  it('hängt die passende Einheit an', () => {
    expect(betragMitEinheit(524_540_138_000)).toBe('524,5 Mrd. €');
    expect(betragMitEinheit(1_437_096_268)).toBe('1,4 Mrd. €');
    expect(betragMitEinheit(-7_000_000_000, { vorzeichen: true })).toBe('−7,0 Mrd. €');
    expect(betragMitEinheit(null)).toBe('n. v.');
  });

  it('formatiert Euro, Prozent und Ganzzahlen', () => {
    expect(euro(6276.1)).toBe('6.276 €');
    expect(euro(null)).toBe('n. v.');
    expect(prozent(0.376217)).toBe('37,6 %');
    expect(prozent(-0.045, { vorzeichen: true })).toBe('−4,5 %');
    expect(prozent(null)).toBe('n. v.');
    expect(ganzzahl(100726)).toBe('100.726');
    expect(ganzzahl(-5)).toBe('−5');
    expect(ganzzahl(Number.NaN)).toBe('n. v.');
    expect(ganzzahl(Number.POSITIVE_INFINITY)).toBe('n. v.');
  });

  it('formatiert Kennwerte mit einer Nachkommastelle', () => {
    expect(dezimal(87.18)).toBe('87,2');
    expect(dezimal(100)).toBe('100,0');
    expect(dezimal(Number.NaN)).toBe('n. v.');
  });
});
