import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mainSystematik } from './cli-systematik';
import { fakeAbruf } from './api/test-baum';
import { baueSystematikBaum, type SystematikPlan } from './api/test-systematik';
import { imRollback } from './db/test-hilfen';

const HEUTE = new Date('2026-10-09T12:00:00Z');
const ablage = () => mkdtempSync(join(tmpdir(), 'hb-cli-sys-'));

describe('CLI systematik', () => {
  it('lädt je Jahr beide Konten und beide Sichten nacheinander und endet mit 0', () =>
    imRollback(async (tx) => {
      const plan: SystematikPlan = { '3': { '31': [['312', 'Krankenhäuser', 10]] } };
      let ts = 8000;
      const baum = new Map<string, unknown>();
      for (const konto of ['ausgaben', 'einnahmen'] as const)
        for (const sicht of ['funktion', 'gruppierung'] as const)
          for (const [k, v] of baueSystematikBaum({ jahr: 2013, konto, sicht }, plan, ts++)) baum.set(k, v);
      const abruf = fakeAbruf(baum);
      const ausgaben: string[] = [];
      const code = await mainSystematik(['--', '--jahre', '2013', '--neu-laden'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage(), abruf, log: (t) => ausgaben.push(t) });
      expect(code).toBe(0);
      const bericht = ausgaben.join('\n');
      const stellen = ['ausgaben | funktion', 'ausgaben | gruppierung', 'einnahmen | funktion', 'einnahmen | gruppierung']
        .map((s) => bericht.indexOf(`| 2013 | ${s} | succeeded | 3 |`));
      expect(stellen.every((i) => i >= 0)).toBe(true);
      expect([...stellen].sort((a, b) => a - b)).toEqual(stellen);
      expect(abruf.aufrufe[0]).toContain('account=expenses');
      expect(abruf.aufrufe[0]).toContain('unit=function');
      expect(abruf.aufrufe.at(-1)).toContain('account=income');
      expect(abruf.aufrufe.at(-1)).toContain('unit=group');
    }));

  it.each([
    [['--sichten', 'alle'], 'Unbekannte Sichten: alle'],
    [['--konten', 'alle'], 'Unbekannte Konten: alle'],
  ])('lehnt ungültige Optionen ab: %j', async (argv, meldung) => {
    await expect(mainSystematik(argv, { heute: HEUTE })).rejects.toThrow(meldung);
  });
});
