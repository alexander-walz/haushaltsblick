import { verbinde, type Sql } from './client';

const ROLLBACK = new Error('rollback');

/** Führt fn in einer Transaktion aus, die immer zurückgerollt wird. Lokale Daten bleiben unberührt. */
export async function imRollback(fn: (tx: Sql) => Promise<void>): Promise<void> {
  const sql = verbinde();
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
