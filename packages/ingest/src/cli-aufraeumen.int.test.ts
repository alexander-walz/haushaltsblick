import { describe, expect, it } from 'vitest';
import { mainAufraeumen } from './cli-aufraeumen';
import { imRollback, veralteteRohzeile } from './db/test-hilfen';

describe('CLI raeume-auf', () => {
  it('räumt raw auf, gibt die Tabelle der gelöschten Zeilen aus und endet mit 0', () =>
    imRollback(async (tx) => {
      const runId = await veralteteRohzeile(tx);
      const ausgabe: string[] = [];
      const code = await mainAufraeumen([], { sql: tx, log: (t) => ausgabe.push(t) });
      const text = ausgabe.join('\n');
      expect(code).toBe(0);
      expect(text).toContain('| Rohtabelle | Gelöschte Zeilen |');
      expect(text).toMatch(/\| raw\.api_knoten \| [1-9]\d* \|/);
      expect((await tx`select count(*)::int as n from raw.api_knoten where run_id = ${runId}`)[0]!.n).toBe(0);
      for (const tabelle of ['raw.soll_titel', 'raw.soll_kapitel', 'raw.api_titel', 'raw.api_knoten', 'raw.api_systematik']) {
        expect(text).toContain(`| ${tabelle} | `);
      }
    }));
});
