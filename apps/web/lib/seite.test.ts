import { describe, expect, it } from 'vitest';
import { einzeln, kuerze } from './seite';

describe('Suchparameter', () => {
  it('nimmt den ersten Wert', () => {
    expect(einzeln({ a: ['1', '2'] }, 'a')).toBe('1');
    expect(einzeln({ a: '3' }, 'a')).toBe('3');
    expect(einzeln({}, 'a')).toBeUndefined();
  });

  it('kürzt Eingaben auf 40 Zeichen mit Auslassungszeichen', () => {
    expect(kuerze('2025')).toBe('2025');
    expect(kuerze('x'.repeat(40))).toBe('x'.repeat(40));
    expect(kuerze('x'.repeat(41))).toBe(`${'x'.repeat(39)}…`);
  });
});
