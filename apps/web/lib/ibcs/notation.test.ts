import { describe, expect, it } from 'vitest';
import { NOTATION, sollSzenario } from './notation';

describe('Szenario-Notation', () => {
  it('folgt IBCS', () => {
    expect(NOTATION.ist).toEqual({ ibcs: 'AC', klasse: 'ibcs-ist', beschriftung: 'Ist' });
    expect(NOTATION.soll).toEqual({ ibcs: 'PL', klasse: 'ibcs-soll', beschriftung: 'Soll' });
    expect(NOTATION.ist_vorjahr.ibcs).toBe('PY');
    expect(NOTATION.soll_vorjahr).toEqual({ ibcs: 'PL', klasse: 'ibcs-soll-vorjahr', beschriftung: 'Soll Vorjahr' });
    expect(NOTATION.haushaltsplan.klasse).toBe('ibcs-haushaltsplan');
  });

  it('erkennt den Regierungsentwurf', () => {
    expect(sollSzenario('Regierungsentwurf')).toBe('entwurf');
    expect(sollSzenario('Gesetz')).toBe('soll');
    expect(sollSzenario(null)).toBe('soll');
  });
});
