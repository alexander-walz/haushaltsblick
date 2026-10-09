import { describe, expect, it } from 'vitest';
import { bewerteDq, leseDbtAufruf, leseDbtTests, type DbtTest, type KatalogEintrag } from './dq';

const katalog: KatalogEintrag[] = [
  { checkId: 'DQ-01', schwere: 'error' },
  { checkId: 'DQ-02', schwere: 'error' },
  { checkId: 'DQ-04', schwere: 'warn' },
];
const test = (dqId: string, status: string, extra: Partial<DbtTest> = {}): DbtTest => ({
  name: `t_${dqId}`, dqId, schwere: dqId === 'DQ-04' ? 'warn' : 'error', status, failures: 0, nachricht: null, ...extra,
});
const alle = () => [test('DQ-01', 'pass'), test('DQ-02', 'pass'), test('DQ-04', 'pass')];

describe('leseDbtTests', () => {
  it('liest Tests mit dq_id und ignoriert Unit-Tests', () => {
    const runResults = {
      results: [
        { unique_id: 'test.p.a', status: 'pass', failures: 0, message: null },
        { unique_id: 'test.p.b', status: 'warn', failures: 2, message: 'Got 2 results, configured to warn if != 0' },
        { unique_id: 'test.p.c', status: 'fail', failures: 5, message: null },
        { unique_id: 'unit_test.p.u', status: 'pass', failures: null, message: null },
        { unique_id: 'test.p.ohne', status: 'pass', failures: 0, message: null },
        { unique_id: 'model.p.m', status: 'success', failures: null, message: null },
      ],
    };
    const manifest = {
      nodes: {
        'test.p.a': { resource_type: 'test', name: 'a', config: { severity: 'ERROR', meta: { dq_id: 'DQ-01' } } },
        'test.p.b': { resource_type: 'test', name: 'b', config: { severity: 'WARN', meta: { dq_id: 'DQ-04' } } },
        'test.p.c': { resource_type: 'test', name: 'c', config: { severity: 'ERROR', meta: { dq_id: 'DQ-02' } } },
        'unit_test.p.u': { resource_type: 'unit_test', name: 'u', config: { meta: { dq_id: 'DQ-01' } } },
        'test.p.ohne': { resource_type: 'test', name: 'ohne', config: { severity: 'ERROR', meta: {} } },
        'model.p.m': { resource_type: 'model', name: 'm', config: {} },
      },
    };
    expect(leseDbtTests(runResults, manifest)).toEqual([
      { name: 'a', dqId: 'DQ-01', schwere: 'error', status: 'pass', failures: 0, nachricht: null },
      { name: 'b', dqId: 'DQ-04', schwere: 'warn', status: 'warn', failures: 2, nachricht: 'Got 2 results, configured to warn if != 0' },
      { name: 'c', dqId: 'DQ-02', schwere: 'error', status: 'fail', failures: 5, nachricht: null },
    ]);
  });
});

describe('leseDbtAufruf', () => {
  it('liest vars, select, exclude, which und invocation_id', () => {
    const runResults = {
      metadata: { dbt_version: '1.12.5', invocation_id: '7e2305e7-b935-45df-852c-6f57d5a0dda9' },
      args: { which: 'test', select: ['dq13_ist_vollstaendig'], exclude: [], vars: { dq13_ab_jahr: 2023 }, log_level: 'info' },
      results: [],
    };
    expect(leseDbtAufruf(runResults)).toEqual({
      invocation_id: '7e2305e7-b935-45df-852c-6f57d5a0dda9',
      which: 'test',
      select: ['dq13_ist_vollstaendig'],
      exclude: [],
      vars: { dq13_ab_jahr: 2023 },
    });
  });

  it('liefert leere Werte, wenn args und metadata fehlen', () => {
    expect(leseDbtAufruf({ results: [] })).toEqual({ invocation_id: null, which: null, select: [], exclude: [], vars: {} });
  });
});

describe('bewerteDq', () => {
  it('alle bestanden: grün, 100', () => {
    const r = bewerteDq(alle(), katalog);
    expect(r.ampel).toBe('green');
    expect(r.score).toBe(100);
    expect(r.ergebnisse.map((e) => e.checkId)).toEqual(['DQ-01', 'DQ-02', 'DQ-04']);
  });

  it('Warnung: gelb, 85,71', () => {
    const r = bewerteDq([test('DQ-01', 'pass'), test('DQ-02', 'pass'), test('DQ-04', 'warn', { failures: 3 })], katalog);
    expect(r.ampel).toBe('yellow');
    expect(r.score).toBe(85.71);
    expect(r.ergebnisse[2]).toEqual({ checkId: 'DQ-04', status: 'warn', failures: 3, details: ['t_DQ-04: 3 Zeilen'] });
  });

  it('fail mit Schwere warn wird zur Warnung', () => {
    const r = bewerteDq([test('DQ-01', 'pass'), test('DQ-02', 'pass'), test('DQ-04', 'fail', { failures: 1 })], katalog);
    expect(r.ampel).toBe('yellow');
  });

  it('fail bei error: rot, 57,14', () => {
    const r = bewerteDq([test('DQ-01', 'pass'), test('DQ-02', 'fail', { failures: 4 }), test('DQ-04', 'pass')], katalog);
    expect(r.ampel).toBe('red');
    expect(r.score).toBe(57.14);
    expect(r.ergebnisse[1]).toMatchObject({ status: 'fail', failures: 4 });
  });

  it('nicht ausgeführt: rot mit Detail', () => {
    const r = bewerteDq([test('DQ-01', 'skipped'), test('DQ-02', 'pass'), test('DQ-04', 'pass')], katalog);
    expect(r.ampel).toBe('red');
    expect(r.ergebnisse[0]?.status).toBe('fail');
    expect(r.ergebnisse[0]?.details.join(' ')).toContain('nicht ausgeführt (skipped)');
  });

  it('fehlender Test: rot mit Detail', () => {
    const r = bewerteDq([test('DQ-01', 'pass'), test('DQ-04', 'pass')], katalog);
    expect(r.ampel).toBe('red');
    expect(r.ergebnisse[1]).toMatchObject({ checkId: 'DQ-02', status: 'fail', details: ['kein Test gefunden'] });
  });

  it('der schlechteste Test je Prüfung zählt', () => {
    const r = bewerteDq([...alle(), { ...test('DQ-01', 'fail', { failures: 1 }), name: 'zweiter' }], katalog);
    expect(r.ergebnisse[0]?.status).toBe('fail');
    expect(r.ergebnisse[0]?.failures).toBe(1);
  });

  it('Schwere aus dem Katalog zählt: abweichende dbt-Schwere ist fail', () => {
    const r = bewerteDq([test('DQ-01', 'pass'), test('DQ-02', 'pass'), test('DQ-04', 'pass', { schwere: 'error' })], katalog);
    expect(r.ampel).toBe('red');
    expect(r.ergebnisse[2]).toEqual({ checkId: 'DQ-04', status: 'fail', failures: 0, details: ['t_DQ-04: Schwere error weicht vom Katalog (warn) ab'] });
  });

  it('Test mit Schwere warn bei Katalog error wird nicht zur Warnung', () => {
    const r = bewerteDq([test('DQ-01', 'fail', { failures: 2, schwere: 'warn' }), test('DQ-02', 'pass'), test('DQ-04', 'pass')], katalog);
    expect(r.ampel).toBe('red');
    expect(r.ergebnisse[0]?.status).toBe('fail');
    expect(r.ergebnisse[0]?.details).toContain('t_DQ-01: Schwere warn weicht vom Katalog (error) ab');
  });

  it('unbekannte dq_id wirft', () => {
    expect(() => bewerteDq([...alle(), test('DQ-99', 'pass', { name: 'x' })], katalog)).toThrow('Test x verweist auf unbekannte Prüfung DQ-99');
  });
});
