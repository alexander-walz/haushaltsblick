import { parseArgs } from 'node:util';
import { formatiereAufraeumen } from './cli-veroeffentlichung';
import { verbinde, type Sql } from './db/client';
import { raeumeRawAuf } from './db/veroeffentlichung';

export type AufraeumenAbhaengigkeiten = { sql?: Sql; log?: (text: string) => void };

/** Räumt raw auf (nur maßgebliche Läufe bleiben); erst nach erfolgreichem Archiv-Upload aufrufen. */
export async function mainAufraeumen(argv: readonly string[], abh: AufraeumenAbhaengigkeiten = {}): Promise<number> {
  parseArgs({ args: argv.filter((a) => a !== '--'), options: {} });
  const sql = abh.sql ?? verbinde();
  const log = abh.log ?? ((text: string) => console.log(text));
  try {
    const geloescht = await raeumeRawAuf(sql);
    log(formatiereAufraeumen(geloescht));
    return 0;
  } finally {
    if (!abh.sql) await sql.end();
  }
}
