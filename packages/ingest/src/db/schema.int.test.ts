import { describe, expect, it } from 'vitest';
import { inTransaktion } from './client';
import { imRollback } from './test-hilfen';

describe('Datenbankschema', () => {
  it('legt alle sieben Schemas an', () =>
    imRollback(async (tx) => {
      const rows = await tx<{ schema_name: string }[]>`
        select schema_name from information_schema.schemata
        where schema_name in ('raw', 'core', 'mart', 'semantic', 'ops', 'audit', 'api') order by 1`;
      expect(rows.map((r) => r.schema_name)).toEqual(['api', 'audit', 'core', 'mart', 'ops', 'raw', 'semantic']);
    }));

  it('registriert beide Quellen mit Offiziell-Kennzeichen', () =>
    imRollback(async (tx) => {
      const rows = await tx`select source_id, offiziell, vertrag_pfad from ops.source_registry order by 1`;
      expect(rows).toEqual([
        { source_id: 'SRC_PORTAL_API', offiziell: false, vertrag_pfad: 'contracts/src_portal_api.yaml' },
        { source_id: 'SRC_SOLL_XML', offiziell: true, vertrag_pfad: 'contracts/src_soll_xml.yaml' },
      ]);
    }));

  it('speichert API-Titel mit Titelschlüssel und Cent-Beträgen', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_PORTAL_API', 'ci', 'test', '0') returning run_id`;
      const [t] = await tx`
        insert into raw.api_titel (run_id, jahr, konto, quote, einzelplan_nr, kapitel_nr, titel_nr, fkt, label, betrag_eur)
        values (${lauf!.run_id}, 2024, 'ausgaben', 'ist', '04', '0411', '43257', '018', 'Versorgungsbezüge', 61346498.79)
        returning titel_key, betrag_eur::text as betrag`;
      expect(t).toEqual({ titel_key: '041143257', betrag: '61346498.79' });
    }));

  it('lehnt unbekannte Quoten ab', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_PORTAL_API', 'ci', 'test', '0') returning run_id`;
      await expect(inTransaktion(tx, (t) => t`
        insert into raw.api_titel (run_id, jahr, konto, quote, einzelplan_nr, kapitel_nr, titel_nr, fkt, label, betrag_eur)
        values (${lauf!.run_id}, 2024, 'ausgaben', 'plan', '04', '0411', '43257', '018', 'x', 1)`)).rejects.toThrow(/api_titel_quote_check/);
    }));

  it('aktiviert RLS auf allen Tabellen in raw und ops', () =>
    imRollback(async (tx) => {
      const ohneRls = await tx`
        select n.nspname || '.' || c.relname as tabelle
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('raw', 'ops') and c.relkind = 'r' and not c.relrowsecurity`;
      expect(ohneRls).toEqual([]);
    }));

  it.each(['anon', 'authenticated'])('verweigert der Rolle %s den Zugriff auf Rohdaten', (rolle) =>
    imRollback(async (tx) => {
      await expect(
        inTransaktion(tx, async (t) => {
          await t.unsafe(`set local role ${rolle}`);
          await t`select 1 from raw.soll_titel limit 1`;
        }),
      ).rejects.toThrow(/permission denied/);
    }));

  it('rechnet Tausend Euro in Euro um und bildet den Titelschlüssel', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_SOLL_XML', 'ci', 'test', '0') returning run_id`;
      const [titel] = await tx`
        insert into raw.soll_titel (run_id, jahr, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text,
          konto, konto_block, titel_nr, titel_text, flexibilisiert, fkt, soll_tsd_eur, xml_pfad, zeilen_hash)
        values (${lauf!.run_id}, 2026, '04', 'EP', '0411', 'K', 'ausgaben', 1, '97201', 'GMA', false, '880', -168, '/x', 'h')
        returning titel_key, soll_eur::text as soll_eur`;
      expect(titel).toEqual({ titel_key: '041197201', soll_eur: '-168000.00' });
    }));

  it('lehnt unbekannte Konten ab', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_SOLL_XML', 'ci', 'test', '0') returning run_id`;
      await expect(
        inTransaktion(tx, (t) => t`
          insert into raw.soll_titel (run_id, jahr, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text,
            konto, konto_block, titel_nr, titel_text, flexibilisiert, fkt, soll_tsd_eur, xml_pfad, zeilen_hash)
          values (${lauf!.run_id}, 2026, '04', 'EP', '0411', 'K', 'sonstiges', 1, '97201', 'GMA', false, '880', 1, '/x', 'h')`),
      ).rejects.toThrow(/soll_titel_konto_check/);
    }));

  it('nimmt flexibilisiert = null an (Einnahmetitel 2012 bis 2024)', () =>
    imRollback(async (tx) => {
      const [lauf] = await tx<{ run_id: string }[]>`
        insert into ops.load_run (source_id, trigger, git_sha, pipeline_version)
        values ('SRC_SOLL_XML', 'ci', 'test', '0') returning run_id`;
      const [titel] = await tx`
        insert into raw.soll_titel (run_id, jahr, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text,
          konto, konto_block, titel_nr, titel_text, flexibilisiert, fkt, soll_tsd_eur, xml_pfad, zeilen_hash)
        values (${lauf!.run_id}, 2016, '01', 'EP', '0101', 'K', 'einnahmen', 1, '11101', 'T', null, '011', 1, '/x', 'h')
        returning flexibilisiert`;
      expect(titel).toEqual({ flexibilisiert: null });
    }));

  it('legt den DQ-Katalog mit 16 Prüfungen an', () =>
    imRollback(async (tx) => {
      const rows = await tx<{ check_id: string; schwere: string }[]>`select check_id, schwere from ops.dq_check order by check_id`;
      expect(rows.map((r) => r.check_id)).toEqual(Array.from({ length: 16 }, (_, i) => `DQ-${String(i + 1).padStart(2, '0')}`));
      expect(rows.filter((r) => r.schwere === 'error').map((r) => r.check_id)).toEqual([
        'DQ-01', 'DQ-02', 'DQ-03', 'DQ-07', 'DQ-08', 'DQ-09', 'DQ-13', 'DQ-15', 'DQ-16',
      ]);
    }));

  it('verweigert anon den Zugriff auf mart und core', () =>
    imRollback(async (tx) => {
      await expect(inTransaktion(tx, async (t) => {
        await t.unsafe('set local role anon');
        await t`select 1 from mart.fct_titel_jahr_hist limit 1`;
      })).rejects.toThrow(/permission denied/);
    }));

  it('räumt Rohdaten nicht maßgeblicher Läufe auf', () =>
    imRollback(async (tx) => {
      const lauf = async (beginn: string) => {
        const [l] = await tx<{ run_id: string }[]>`
          insert into ops.load_run (source_id, trigger, git_sha, pipeline_version, status, started_at)
          values ('SRC_SOLL_XML', 'ci', 'test', '0.3.0', 'succeeded', ${beginn}) returning run_id`;
        await tx`insert into raw.source_file (run_id, source_id, jahr, source_url, fetched_at, sha256, byte_size, ablage_uri)
                 values (${l!.run_id}, 'SRC_SOLL_XML', 1999, ${'x' + beginn}, ${beginn}, ${'a'.repeat(64)}, 1, 'x')`;
        await tx`insert into raw.soll_kapitel (run_id, jahr, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text, anzahl_titel, entfallen, xml_pfad)
                 values (${l!.run_id}, 1999, '01', 'EP', '0101', 'K', 0, true, '/x')`;
        return l!.run_id;
      };
      const alt = await lauf('2026-01-01T00:00:00Z');
      const neu = await lauf('2026-02-01T00:00:00Z');
      const ergebnis = await tx<{ tabelle: string; geloescht: string }[]>`select * from ops.raeume_raw_auf()`;
      expect(ergebnis.map((r) => r.tabelle)).toEqual([
        'raw.soll_titel', 'raw.soll_kapitel', 'raw.api_titel', 'raw.api_knoten', 'raw.api_systematik',
      ]);
      const reste = await tx<{ run_id: string }[]>`select run_id from raw.soll_kapitel where jahr = 1999`;
      expect(reste.map((r) => r.run_id)).toEqual([neu]);
      expect(reste.map((r) => r.run_id)).not.toContain(alt);
    }));
});
