import { describe, expect, it } from 'vitest';
import { KONTEN, titelKey, zerlegeTitelKey } from './haushalt';

describe('Titelschlüssel', () => {
  it('bildet den neunstelligen Schlüssel der internalapi aus Kapitel und Titel', () => {
    expect(titelKey('0901', '68301')).toBe('090168301');
  });

  it('zerlegt den Schlüssel wieder in Kapitel und Titel', () => {
    expect(zerlegeTitelKey('041197201')).toEqual({ kapitelNr: '0411', titelNr: '97201' });
  });

  it.each([
    ['901', '68301'],
    ['0901', '6830'],
    ['0901', '68A01'],
  ])('lehnt ungültige Bestandteile ab: %s / %s', (kapitel, titel) => {
    expect(() => titelKey(kapitel, titel)).toThrow(/Ungültige/);
  });

  it('lehnt Schlüssel mit falscher Länge ab', () => {
    expect(() => zerlegeTitelKey('04119720')).toThrow('Ungültiger Titelschlüssel: 04119720');
  });

  it('kennt genau zwei Konten', () => {
    expect(KONTEN).toEqual(['einnahmen', 'ausgaben']);
  });
});
