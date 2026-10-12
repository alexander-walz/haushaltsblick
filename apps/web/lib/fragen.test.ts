import { describe, expect, it } from 'vitest';
import { FRAGEN, fragenFuer } from './fragen';

const JAHRE = { laufend: 2026, letztesMitIst: 2025, entwurf: 2027, alle: [2025, 2026, 2027] };

describe('Fragen auf der Startseite', () => {
  it('wechseln täglich deterministisch', () => {
    const a = fragenFuer(new Date('2026-10-12T12:00:00Z'));
    const b = fragenFuer(new Date('2026-10-12T20:00:00Z'));
    const c = fragenFuer(new Date('2026-10-13T12:00:00Z'));
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
    expect(a.map((f) => f.id)).not.toEqual(c.map((f) => f.id));
    expect(a).toHaveLength(2);
    expect(new Set(a.map((f) => f.id)).size).toBe(2);
  });

  it('haben vollständige, gültige Abfragen', () => {
    for (const f of FRAGEN) {
      expect(f.frage(JAHRE)).toMatch(/\?$/);
      const a = f.abfrage(JAHRE);
      expect(a).not.toBeNull();
      expect(a!.filter?.konto).toBe('ausgaben');
      expect(f.link(JAHRE)).toMatch(/^\/(explorer|plan-und-ist)\?/);
    }
  });

  it('verzichtet auf die Frage zur Plantreue ohne Jahr mit Ist', () => {
    const plan = FRAGEN.find((f) => f.id === 'plantreue')!;
    expect(plan.abfrage({ ...JAHRE, letztesMitIst: null })).toBeNull();
  });
});
