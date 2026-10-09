import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mainVeroeffentlichung } from './cli-veroeffentlichung';
import { imRollback } from './db/test-hilfen';
import type { Sql } from './db/client';

const IDS = Array.from({ length: 16 }, (_, i) => `DQ-${String(i + 1).padStart(2, '0')}`);

function ziel(status: (id: string) => string = () => 'pass', dateien = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'hb-dq-'));
  if (!dateien) return dir;
  const results = IDS.map((id) => ({ unique_id: `test.p.${id}`, status: status(id), failures: status(id) === 'pass' ? 0 : 3, message: null }));
  const nodes = Object.fromEntries(IDS.map((id) => [`test.p.${id}`, { resource_type: 'test', name: `t_${id}`, config: { severity: 'error', meta: { dq_id: id } } }]));
  writeFileSync(join(dir, 'run_results.json'), JSON.stringify({ results }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ nodes }));
  return dir;
}

async function leeren(tx: Sql) {
  await tx`delete from mart.fct_titel_jahr_hist`;
  await tx`update ops.dataset_version set is_current = false`;
  await tx`delete from mart.fct_titel_jahr`;
}

describe('CLI veroeffentliche', () => {
  it('veröffentlicht bei grüner Ampel und endet mit 0', () =>
    imRollback(async (tx) => {
      await leeren(tx);
      const ausgabe: string[] = [];
      const code = await mainVeroeffentlichung(['--target', ziel()], { sql: tx, log: (t) => ausgabe.push(t) });
      const text = ausgabe.join('\n');
      expect(code).toBe(0);
      expect(text).toContain('Ampel: grün');
      expect(text).toContain('Version');
      const n = (await tx`select count(*)::int as n from ops.dataset_version where is_current`)[0]!.n;
      expect(n).toBe(1);
    }));

  it('veröffentlicht bei roter Ampel nicht und endet mit 1', () =>
    imRollback(async (tx) => {
      await leeren(tx);
      const vorher = (await tx`select count(*)::int as vorher from ops.dataset_version`)[0]!.vorher;
      const laeufe = (await tx`select count(*)::int as laeufe from ops.dq_lauf`)[0]!.laeufe;
      const ausgabe: string[] = [];
      const code = await mainVeroeffentlichung([], { sql: tx, log: (t) => ausgabe.push(t), targetVerzeichnis: ziel((id) => (id === 'DQ-16' ? 'fail' : 'pass')) });
      const text = ausgabe.join('\n');
      expect(code).toBe(1);
      expect(text).toContain('Ampel: rot');
      expect(text).toContain('nicht veröffentlicht');
      expect(text).toContain('DQ-16');
      const nachher = (await tx`select count(*)::int as nachher from ops.dataset_version`)[0]!.nachher;
      const laeufe2 = (await tx`select count(*)::int as laeufe2 from ops.dq_lauf`)[0]!.laeufe2;
      expect(nachher).toBe(vorher);
      expect(laeufe2).toBe(laeufe + 1);
    }));

  it('meldet fehlende Dateien', async () => {
    await expect(mainVeroeffentlichung(['--target', ziel(() => 'pass', false)], { log: () => {} })).rejects.toThrow('run_results.json nicht gefunden');
  });
});
