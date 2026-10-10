import { describe, expect, it } from 'vitest';
import { imRollback } from './test-hilfen';
import { speichereDqLauf, veroeffentlicheVersion } from './veroeffentlichung';

describe('Semantik-Versionen', () => {
  it('legt den Inhalt der Seeds einmal ab und verwendet ihn bei gleichem Inhalt wieder', () =>
    imRollback(async (tx) => {
      const [a] = await tx`select ops.sichere_semantik() as id`;
      const [b] = await tx`select ops.sichere_semantik() as id`;
      expect(b!.id).toBe(a!.id);
      const [n] = await tx`
        select
          (select count(*)::int from semantic.kennzahl where semantik_version_id = ${a!.id}) as kennzahlen,
          (select count(*)::int from core.semantik_kennzahlen) as seed_kennzahlen,
          (select count(*)::int from semantic.synonym where semantik_version_id = ${a!.id}) as synonyme,
          (select count(*)::int from core.semantik_synonyme) as seed_synonyme,
          (select count(*)::int from semantic.glossar where semantik_version_id = ${a!.id}) as glossar,
          (select count(*)::int from core.semantik_glossar) as seed_glossar,
          (select count(*)::int from semantic.einwohner where semantik_version_id = ${a!.id}) as einwohner,
          (select count(*)::int from core.semantik_einwohner) as seed_einwohner`;
      expect(n!.kennzahlen).toBe(17);
      expect(n!.kennzahlen).toBe(n!.seed_kennzahlen);
      expect(n!.synonyme).toBe(n!.seed_synonyme);
      expect(n!.glossar).toBe(n!.seed_glossar);
      expect(n!.einwohner).toBe(n!.seed_einwohner);
    }));

  it('legt bei geändertem Inhalt eine neue Semantik-Version an und lässt die alte unverändert', () =>
    imRollback(async (tx) => {
      const [a] = await tx`select ops.sichere_semantik() as id`;
      const [vorher] = await tx`select count(*)::int as n from semantic.glossar where semantik_version_id = ${a!.id}`;
      await tx`insert into core.semantik_glossar (begriff, erklaerung, beispiel) values ('Testbegriff', 'Nur im Test.', null)`;
      const [b] = await tx`select ops.sichere_semantik() as id`;
      expect(b!.id).not.toBe(a!.id);
      const [alt] = await tx`select count(*)::int as n from semantic.glossar where semantik_version_id = ${a!.id}`;
      const [neu] = await tx`select count(*)::int as n from semantic.glossar where semantik_version_id = ${b!.id}`;
      expect(alt!.n).toBe(vorher!.n);
      expect(neu!.n).toBe(vorher!.n + 1);
    }));

  it('verknüpft jede neue Datenversion mit der Semantik-Version', () =>
    imRollback(async (tx) => {
      await tx`delete from mart.fct_titel_jahr_hist`;
      await tx`update ops.dataset_version set is_current = false`;
      await tx`delete from mart.fct_titel_jahr`;
      const dq = await speichereDqLauf(tx, { gitSha: 'test', manifestSha: 'test', ampel: 'green', score: 100 }, []);
      const v = await veroeffentlicheVersion(tx, dq);
      const [z] = await tx`select semantik_version_id, ops.sichere_semantik() as erwartet from ops.dataset_version where version_id = ${v.versionId}`;
      expect(z!.semantik_version_id).not.toBeNull();
      expect(z!.semantik_version_id).toBe(z!.erwartet);
    }));

  it('meldet fehlende Seeds verständlich', () =>
    imRollback(async (tx) => {
      await tx`alter table core.semantik_glossar rename to semantik_glossar_weg`;
      await expect(tx`select ops.sichere_semantik()`).rejects.toThrow(/Semantik-Seeds fehlen/);
    }));
});
