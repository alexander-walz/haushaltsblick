import type { Ampel, DqErgebnis, KatalogEintrag, Schwere } from '../veroeffentlichung/dq';
import type { Sql } from './client';

export async function ladeDqKatalog(sql: Sql): Promise<KatalogEintrag[]> {
  const zeilen = await sql`select check_id, schwere from ops.dq_check order by check_id`;
  return zeilen.map((z) => ({ checkId: String(z.check_id), schwere: z.schwere as Schwere }));
}

export async function speichereDqLauf(
  sql: Sql,
  lauf: { gitSha: string; manifestSha: string; ampel: Ampel; score: number },
  ergebnisse: DqErgebnis[],
): Promise<number> {
  const [kopf] = await sql`
    insert into ops.dq_lauf (git_sha, dbt_manifest_sha, ampel, score)
    values (${lauf.gitSha}, ${lauf.manifestSha}, ${lauf.ampel}, ${lauf.score})
    returning dq_lauf_id`;
  const id = Number(kopf!.dq_lauf_id);
  for (const e of ergebnisse) {
    await sql`
      insert into ops.dq_ergebnis (dq_lauf_id, check_id, status, failures, details)
      values (${id}, ${e.checkId}, ${e.status}, ${e.failures}, ${sql.json(e.details)})`;
  }
  return id;
}

export async function veroeffentlicheVersion(
  sql: Sql,
  dqLaufId: number,
): Promise<{ versionId: number; zeilenNeu: number; zeilenGeschlossen: number; zeilenGesamt: number }> {
  const [z] = await sql`select * from ops.veroeffentliche_version(${dqLaufId})`;
  if (!z) throw new Error(`Veröffentlichung von DQ-Lauf ${dqLaufId} lieferte keine Version`);
  return {
    versionId: Number(z.version_id),
    zeilenNeu: Number(z.zeilen_neu),
    zeilenGeschlossen: Number(z.zeilen_geschlossen),
    zeilenGesamt: Number(z.zeilen_gesamt),
  };
}

export async function raeumeRawAuf(sql: Sql): Promise<{ tabelle: string; geloescht: number }[]> {
  const zeilen = await sql`select tabelle, geloescht from ops.raeume_raw_auf()`;
  return zeilen.map((z) => ({ tabelle: String(z.tabelle), geloescht: Number(z.geloescht) }));
}
