import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mainApi } from './cli-api';
import { baueBaum, fakeAbruf } from './api/test-baum';
import { imRollback } from './db/test-hilfen';

const HEUTE = new Date('2026-10-09T12:00:00Z');
const ablage = () => mkdtempSync(join(tmpdir(), 'hb-cli-api-'));

describe('CLI api', () => {
  it('lädt je Jahr beide Konten nacheinander und endet mit 0', () =>
    imRollback(async (tx) => {
      const baum = new Map([
        ...baueBaum({ jahr: 2013, konto: 'ausgaben', quote: 'ist' }, { '04': { '0411': [['43257', '018', 'A', 1]] } }, 7001),
        ...baueBaum({ jahr: 2013, konto: 'einnahmen', quote: 'ist' }, { '04': { '0411': [['11957', '018', 'E', 1]] } }, 7002),
      ]);
      const abruf = fakeAbruf(baum);
      const ausgaben: string[] = [];
      const code = await mainApi(['--', '--jahre', '2013', '--neu-laden'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage(), abruf, log: (t) => ausgaben.push(t) });
      expect(code).toBe(0);
      expect(abruf.aufrufe[0]).toContain('account=expenses');
      expect(abruf.aufrufe.at(-1)).toContain('account=income');
      expect(ausgaben.join('\n')).toContain('| 2013 | ausgaben | ist | succeeded | 1 |');
      expect(ausgaben.join('\n')).toContain('| 2013 | einnahmen | ist | succeeded | 1 |');
    }));

  it('endet mit 0, wenn ein Jahr nicht verfügbar ist, und mit 1 bei Quarantäne', () =>
    imRollback(async (tx) => {
      expect(await mainApi(['--jahre', '2026', '--konten', 'ausgaben'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage(), abruf: fakeAbruf(new Map()), log: () => {} })).toBe(0);
      const kaputt = baueBaum({ jahr: 2013, konto: 'ausgaben', quote: 'ist' }, { '04': { '0411': [['43257', '018', 'A', 1]] } }, 7003);
      kaputt.delete([...kaputt.keys()].find((u) => u.endsWith('id=0411'))!);
      expect(await mainApi(['--jahre', '2013', '--konten', 'ausgaben', '--neu-laden'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage(), abruf: fakeAbruf(kaputt), log: () => {} })).toBe(1);
    }));

  it.each([
    [['--konten', 'alle'], 'Unbekannte Konten: alle'],
    [['--quote', 'plan'], 'Unbekannte Quote: plan'],
  ])('lehnt ungültige Optionen ab: %j', async (argv, meldung) => {
    await expect(mainApi(argv, { heute: HEUTE })).rejects.toThrow(meldung);
  });
});
