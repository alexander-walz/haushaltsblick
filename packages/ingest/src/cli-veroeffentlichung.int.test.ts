import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mainVeroeffentlichung } from './cli-veroeffentlichung';
import { imRollback, veralteteRohzeile } from './db/test-hilfen';
import type { Sql } from './db/client';

const IDS = Array.from({ length: 18 }, (_, i) => `DQ-${String(i + 1).padStart(2, '0')}`);
// Schwere wie im Katalog ops.dq_check (abweichende Schwere ist seit F6 ein Fehler)
const WARN = new Set(['DQ-04', 'DQ-05', 'DQ-06', 'DQ-10', 'DQ-11', 'DQ-12', 'DQ-14', 'DQ-18']);

function ziel(status: (id: string) => string = () => 'pass', dateien = true, args: Record<string, unknown> = { which: 'test', select: [], exclude: [], vars: {} }): string {
  const dir = mkdtempSync(join(tmpdir(), 'hb-dq-'));
  if (!dateien) return dir;
  const results = IDS.map((id) => ({ unique_id: `test.p.${id}`, status: status(id), failures: status(id) === 'pass' ? 0 : 3, message: null }));
  const nodes = Object.fromEntries(IDS.map((id) => [`test.p.${id}`, { resource_type: 'test', name: `t_${id}`, config: { severity: WARN.has(id) ? 'warn' : 'error', meta: { dq_id: id } } }]));
  writeFileSync(join(dir, 'run_results.json'), JSON.stringify({ metadata: { invocation_id: 'inv-1' }, args, results }));
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
      expect(text).toContain('| Rohtabelle | Gelöschte Zeilen |');
      const [lauf] = await tx`select dbt_aufruf from ops.dq_lauf order by dq_lauf_id desc limit 1`;
      expect(lauf!.dbt_aufruf).toEqual({ invocation_id: 'inv-1', which: 'test', select: [], exclude: [], vars: {} });
    }));

  it('mit --vars ohne --testlauf: DQ-Lauf gespeichert, nicht veröffentlicht, Exit 1', () =>
    imRollback(async (tx) => {
      await leeren(tx);
      const vorher = (await tx`select count(*)::int as n from ops.dataset_version`)[0]!.n;
      const laeufe = (await tx`select count(*)::int as n from ops.dq_lauf`)[0]!.n;
      const ausgabe: string[] = [];
      const dir = ziel(() => 'pass', true, { which: 'test', select: [], exclude: [], vars: { dq13_ab_jahr: 2023 } });
      const code = await mainVeroeffentlichung(['--target', dir], { sql: tx, log: (t) => ausgabe.push(t) });
      expect(code).toBe(1);
      expect(ausgabe.join('\n')).toContain('nicht veröffentlicht: dbt mit --vars ausgeführt (Testlauf)');
      expect((await tx`select count(*)::int as n from ops.dataset_version`)[0]!.n).toBe(vorher);
      expect((await tx`select count(*)::int as n from ops.dq_lauf`)[0]!.n).toBe(laeufe + 1);
      const [lauf] = await tx`select ampel, dbt_aufruf from ops.dq_lauf order by dq_lauf_id desc limit 1`;
      expect(lauf!.ampel).toBe('green');
      expect(lauf!.dbt_aufruf).toMatchObject({ vars: { dq13_ab_jahr: 2023 } });
    }));

  it('mit --testlauf: veröffentlicht und protokolliert den Aufruf', () =>
    imRollback(async (tx) => {
      await leeren(tx);
      const ausgabe: string[] = [];
      const dir = ziel(() => 'pass', true, { which: 'test', select: ['dq13_ist_vollstaendig'], exclude: [], vars: { dq13_ab_jahr: 2023 } });
      const code = await mainVeroeffentlichung(['--target', dir, '--testlauf'], { sql: tx, log: (t) => ausgabe.push(t) });
      const text = ausgabe.join('\n');
      expect(code).toBe(0);
      expect(text).toContain('Testlauf (vars: {"dq13_ab_jahr":2023})');
      expect(text).toContain('Version');
      const [lauf] = await tx`
        select l.dbt_aufruf from ops.dq_lauf l join ops.dataset_version v on v.dq_lauf_id = l.dq_lauf_id where v.is_current`;
      expect(lauf!.dbt_aufruf).toEqual({ invocation_id: 'inv-1', which: 'test', select: ['dq13_ist_vollstaendig'], exclude: [], vars: { dq13_ab_jahr: 2023 } });
    }));

  it('mit --ohne-aufraeumen: veröffentlicht, räumt raw nicht auf', () =>
    imRollback(async (tx) => {
      await leeren(tx);
      const runId = await veralteteRohzeile(tx);
      const ausgabe: string[] = [];
      const code = await mainVeroeffentlichung(['--target', ziel(), '--ohne-aufraeumen'], { sql: tx, log: (t) => ausgabe.push(t) });
      const text = ausgabe.join('\n');
      expect(code).toBe(0);
      expect(text).toContain('Version');
      expect(text).toContain('Rohdaten nicht aufgeräumt (--ohne-aufraeumen).');
      expect(text).not.toContain('Gelöschte Zeilen');
      expect((await tx`select count(*)::int as n from raw.api_knoten where run_id = ${runId}`)[0]!.n).toBe(1);
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
