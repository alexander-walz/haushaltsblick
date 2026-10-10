import { describe, expect, it } from 'vitest';
import { imRollback } from './test-hilfen';
import type { Sql } from './client';
import { ladeDqKatalog, raeumeRawAuf, speichereDqLauf, veroeffentlicheVersion } from './veroeffentlichung';

async function leeren(tx: Sql) {
  await tx`delete from mart.fct_titel_jahr_hist`;
  await tx`update ops.dataset_version set is_current = false`;
  await tx`delete from mart.fct_titel_jahr`;
}

async function zeile(tx: Sql, titelKey: string, hash: string) {
  await tx`
    insert into mart.fct_titel_jahr (jahr, konto, titel_key, einzelplan_nr, kapitel_nr, titel_nr, soll_eur, soll_quelle, ist_verfuegbar, zeilen_hash)
    values (2099, 'ausgaben', ${titelKey}, '01', '0101', '11901', 100, 'xml', false, ${hash})`;
}

const lauf = (ampel: 'green' | 'yellow' | 'red') => ({ gitSha: 'abc', manifestSha: 'def', ampel, score: 100 });

describe('Veröffentlichung in der Datenbank', () => {
  it('lädt den Katalog mit 19 Prüfungen', () =>
    imRollback(async (tx) => {
      const katalog = await ladeDqKatalog(tx);
      expect(katalog).toHaveLength(19);
      expect(katalog.find((k) => k.checkId === 'DQ-04')).toEqual({ checkId: 'DQ-04', schwere: 'warn' });
    }));

  it('veröffentlicht eine erste und eine zweite Version mit Historie', () =>
    imRollback(async (tx) => {
      await leeren(tx);
      await zeile(tx, 'A', 'h1');
      await zeile(tx, 'B', 'h1');
      const id1 = await speichereDqLauf(tx, lauf('green'), [{ checkId: 'DQ-01', status: 'pass', failures: 0, details: [] }]);
      const v1 = await veroeffentlicheVersion(tx, id1);
      expect(v1).toMatchObject({ zeilenNeu: 2, zeilenGeschlossen: 0, zeilenGesamt: 2 });
      const is_current = (await tx`select is_current from ops.dataset_version where version_id = ${v1.versionId}`)[0]!.is_current;
      expect(is_current).toBe(true);

      await tx`delete from mart.fct_titel_jahr where titel_key = 'B'`;
      await tx`update mart.fct_titel_jahr set zeilen_hash = 'h2' where titel_key = 'A'`;
      await zeile(tx, 'C', 'h1');
      const id2 = await speichereDqLauf(tx, lauf('yellow'), []);
      const v2 = await veroeffentlicheVersion(tx, id2);
      expect(v2).toMatchObject({ zeilenNeu: 2, zeilenGeschlossen: 2, zeilenGesamt: 2 });
      expect(v2.versionId).toBeGreaterThan(v1.versionId);

      const stand = await tx`
        select titel_key, zeilen_hash from mart.fct_titel_jahr_hist
        where gueltig_ab_version <= ${v1.versionId} and (gueltig_bis_version is null or gueltig_bis_version > ${v1.versionId})
        order by titel_key`;
      expect(stand.map((r) => [r.titel_key, r.zeilen_hash])).toEqual([['A', 'h1'], ['B', 'h1']]);
      const aktuell = await tx`select version_id from ops.dataset_version where is_current`;
      expect(aktuell.map((r) => Number(r.version_id))).toEqual([v2.versionId]);
    }));

  it('veröffentlicht bei roter Ampel nicht', () =>
    imRollback(async (tx) => {
      await leeren(tx);
      const id = await speichereDqLauf(tx, lauf('red'), []);
      await expect(veroeffentlicheVersion(tx, id)).rejects.toThrow(/roter Ampel/);
    }));

  it('räumt raw auf und meldet Tabellen', () =>
    imRollback(async (tx) => {
      const r = await raeumeRawAuf(tx);
      expect(r.map((x) => x.tabelle)).toContain('raw.soll_titel');
      expect(r.every((x) => typeof x.geloescht === 'number')).toBe(true);
    }));

  it('mart.fct_titel_jahr hat die Spalten der Historie ohne gueltig_*', () =>
    imRollback(async (tx) => {
      const spalten = (tabelle: string) => tx`
        select column_name from information_schema.columns where table_schema = 'mart' and table_name = ${tabelle} order by ordinal_position`;
      const mart = (await spalten('fct_titel_jahr')).map((r) => r.column_name);
      const hist = (await spalten('fct_titel_jahr_hist')).map((r) => r.column_name).filter((n) => !n.startsWith('gueltig_'));
      expect(mart).toEqual(hist);
    }));
});
