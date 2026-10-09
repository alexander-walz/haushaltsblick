import { LOKALE_DB, verbinde, type Sql } from './client';

const ROLLBACK = new Error('rollback');

/** Wahr, wenn die Verbindungs-URL auf den eigenen Rechner (127.0.0.1 oder localhost) zeigt. */
export function istLokaleDb(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

/** Führt fn in einer Transaktion aus, die immer zurückgerollt wird. Lokale Daten bleiben unberührt. */
export async function imRollback(fn: (tx: Sql) => Promise<void>): Promise<void> {
  const url = process.env.DATABASE_URL ?? LOKALE_DB;
  if (!istLokaleDb(url)) {
    throw new Error('imRollback läuft nur gegen eine lokale Datenbank (127.0.0.1 oder localhost), nicht gegen die konfigurierte DATABASE_URL');
  }
  const sql = verbinde(url);
  try {
    await sql.begin(async (tx) => {
      await fn(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  } finally {
    await sql.end();
  }
}

/** Legt eine Rohzeile eines fehlgeschlagenen Laufs an, die ops.raeume_raw_auf löschen würde. */
export async function veralteteRohzeile(tx: Sql): Promise<string> {
  const [lauf] = await tx`
    insert into ops.load_run (source_id, trigger, git_sha, pipeline_version, status)
    values ('SRC_PORTAL_API', 'manual', 'test', '0.3.0', 'failed') returning run_id`;
  await tx`
    insert into raw.api_knoten (run_id, jahr, konto, quote, ebene, knoten_id, label, betrag_eur)
    values (${lauf!.run_id}, 2099, 'ausgaben', 'ist', 'gesamt', 'x', 'veraltet', 1)`;
  return String(lauf!.run_id);
}
