import { parseArgs } from 'node:util';
import { STANDARD_ARCHIV_VERZEICHNIS } from './archiv';
import { formatiereBericht } from './bericht';
import { verbinde, type Sql } from './db/client';
import { parseJahre } from './jahre';
import { laufKontext } from './lauf-kontext';
import { ladeSollJahr, type JahresErgebnis, type SollIngestOptionen } from './soll-ingest';

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type CliAbhaengigkeiten = {
  sql?: Sql;
  heute?: Date;
  ablageVerzeichnis?: string;
  abruf?: SollIngestOptionen['abruf'];
  log?: (text: string) => void;
  pauseMs?: number;
};

export async function main(argv: readonly string[], abh: CliAbhaengigkeiten = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv.filter((a) => a !== '--'),
    options: { jahre: { type: 'string', default: 'alle' }, datei: { type: 'string' }, 'neu-laden': { type: 'boolean', default: false } },
  });
  const jahre = parseJahre(values.jahre ?? 'alle', abh.heute);
  if (values.datei !== undefined && jahre.length !== 1) throw new Error('--datei ist nur mit genau einem Jahr erlaubt');

  const kontext = laufKontext();
  const opt: SollIngestOptionen = {
    ...kontext,
    ablageVerzeichnis: abh.ablageVerzeichnis ?? STANDARD_ARCHIV_VERZEICHNIS,
    archivBasisUrl: process.env.HB_ARCHIV_BASIS_URL || undefined,
    lokaleDatei: values.datei,
    abruf: abh.abruf,
    neuLaden: values['neu-laden'],
  };

  const sql = abh.sql ?? verbinde();
  const log = abh.log ?? ((text: string) => console.log(text));
  const ergebnisse: JahresErgebnis[] = [];
  try {
    for (const [i, jahr] of jahre.entries()) {
      if (i > 0) await pause(abh.pauseMs ?? 500);
      ergebnisse.push(await ladeSollJahr(sql, jahr, opt));
    }
  } finally {
    if (!abh.sql) await sql.end();
  }

  log(formatiereBericht(ergebnisse));
  return ergebnisse.some((e) => e.status === 'failed' || e.status === 'quarantined') ? 1 : 0;
}
