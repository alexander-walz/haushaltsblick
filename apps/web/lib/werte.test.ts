import { describe, expect, it } from 'vitest';
import { text, zahl } from './werte';

describe('Werte aus query_metric-Zeilen', () => {
  const z = { soll: 1.5, einzelplan_nr: '14', jahr: 2025, leer: null, flag: true };
  it('liest Zahlen', () => {
    expect(zahl(z, 'soll')).toBe(1.5);
    expect(zahl(z, 'leer')).toBeNull();
    expect(zahl(z, 'einzelplan_nr')).toBeNull();
    expect(zahl(undefined, 'soll')).toBeNull();
  });
  it('liest Texte, Jahre als Text', () => {
    expect(text(z, 'einzelplan_nr')).toBe('14');
    expect(text(z, 'jahr')).toBe('2025');
    expect(text(z, 'flag')).toBeNull();
    expect(text(z, 'fehlt')).toBeNull();
  });
});
