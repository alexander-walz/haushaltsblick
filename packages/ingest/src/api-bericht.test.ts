import { describe, expect, it } from 'vitest';
import { formatiereApiBericht } from './api-bericht';

describe('formatiereApiBericht', () => {
  it('zeigt je Jahr und Konto Status, Titel, Summe in Mrd. €, Anfragen und Hinweis', () => {
    expect(formatiereApiBericht([
      { parameter: { jahr: 2024, konto: 'ausgaben', quote: 'ist' }, runId: 'r1', status: 'succeeded', anfragen: 261, titel: 4321, summeCent: 47475372760958 },
      { parameter: { jahr: 2026, konto: 'ausgaben', quote: 'ist' }, runId: 'r2', status: 'skipped', anfragen: 1, hinweis: 'nicht verfügbar' },
    ]).split('\n')).toEqual([
      '| Jahr | Konto | Quote | Status | Titel | Summe (Mrd. €) | Anfragen | Hinweis |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 2024 | ausgaben | ist | succeeded | 4321 | 474,8 | 261 |  |',
      '| 2026 | ausgaben | ist | skipped |  |  | 1 | nicht verfügbar |',
    ]);
  });

  it('macht Hinweise tabellensicher', () => {
    const zeile = formatiereApiBericht([
      { parameter: { jahr: 2024, konto: 'ausgaben', quote: 'ist' }, runId: 'r', status: 'quarantined', anfragen: 3, hinweis: 'a | b\nc' },
    ]).split('\n')[2];
    expect(zeile).toBe('| 2024 | ausgaben | ist | quarantined |  |  | 3 | a / b c |');
  });
});
