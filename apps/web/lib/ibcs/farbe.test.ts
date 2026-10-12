import { describe, expect, it } from 'vitest';
import { FARBKLASSE, abweichungsfarbe, wirkungAus } from './farbe';

describe('Farbregel E21', () => {
  it('färbt nach Wirkungsrichtung', () => {
    expect(abweichungsfarbe(3, 'anstieg_positiv', 'plan')).toBe('positiv');
    expect(abweichungsfarbe(-3, 'anstieg_positiv', 'plan')).toBe('negativ');
    expect(abweichungsfarbe(3, 'anstieg_negativ', 'plan')).toBe('negativ');
    expect(abweichungsfarbe(-3, 'anstieg_negativ', 'plan')).toBe('positiv');
  });

  it('bleibt neutral ohne Richtung, bei null oder 0', () => {
    expect(abweichungsfarbe(3, 'neutral', 'plan')).toBe('neutral');
    expect(abweichungsfarbe(3, undefined, 'plan')).toBe('neutral');
    expect(abweichungsfarbe(null, 'anstieg_positiv', 'plan')).toBe('neutral');
    expect(abweichungsfarbe(0, 'anstieg_negativ', 'plan')).toBe('neutral');
  });

  it('färbt Vorjahresvergleiche nie', () => {
    expect(abweichungsfarbe(3, 'anstieg_positiv', 'vorjahr')).toBe('neutral');
  });

  it('liest die Richtung aus API-Werten', () => {
    expect(wirkungAus('anstieg_negativ')).toBe('anstieg_negativ');
    expect(wirkungAus('irgendwas')).toBe('neutral');
    expect(wirkungAus(null)).toBe('neutral');
    expect(FARBKLASSE).toEqual({ positiv: 'ibcs-pos', negativ: 'ibcs-neg', neutral: 'ibcs-neutral' });
  });
});
