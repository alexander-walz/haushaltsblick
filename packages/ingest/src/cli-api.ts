import { parseArgs } from 'node:util';
import type { Konto } from '@hb/shared';
import { Drossel } from './abruf/http';
import { formatiereApiBericht } from './api-bericht';
import { ladeApiJahr, type ApiErgebnis } from './api-ingest';
import { netzAbruf, type ApiAbruf, type Quote } from './api/crawler';
import { STANDARD_ARCHIV_VERZEICHNIS } from './archiv';
import { verbinde, type Sql } from './db/client';
import { parseJahre } from './jahre';
import { laufKontext } from './lauf-kontext';

export type ApiCliAbhaengigkeiten = { sql?: Sql; heute?: Date; ablageVerzeichnis?: string; abruf?: ApiAbruf; log?: (text: string) => void };

const KONTEN: Record<string, readonly Konto[]> = { beide: ['ausgaben', 'einnahmen'], ausgaben: ['ausgaben'], einnahmen: ['einnahmen'] };
const QUOTEN: readonly Quote[] = ['ist', 'soll'];

export async function mainApi(argv: readonly string[], abh: ApiCliAbhaengigkeiten = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv.filter((a) => a !== '--'),
    options: {
      jahre: { type: 'string', default: 'alle' },
      konten: { type: 'string', default: 'beide' },
      quote: { type: 'string', default: 'ist' },
      'neu-laden': { type: 'boolean', default: false },
    },
  });
  const jahre = parseJahre(values.jahre ?? 'alle', abh.heute);
  const konten = KONTEN[values.konten ?? 'beide'];
  if (!konten) throw new Error(`Unbekannte Konten: ${values.konten}`);
  const quote = values.quote as Quote;
  if (!QUOTEN.includes(quote)) throw new Error(`Unbekannte Quote: ${values.quote}`);

  const kontext = laufKontext();
  const abruf = abh.abruf ?? netzAbruf({ userAgent: kontext.userAgent, drossel: new Drossel(500) });
  const sql = abh.sql ?? verbinde();
  const log = abh.log ?? ((text: string) => console.log(text));
  const ergebnisse: ApiErgebnis[] = [];
  try {
    for (const jahr of jahre) {
      for (const konto of konten) {
        ergebnisse.push(await ladeApiJahr(sql, { jahr, konto, quote }, {
          trigger: kontext.trigger,
          gitSha: kontext.gitSha,
          pipelineVersion: kontext.pipelineVersion,
          archiv: { verzeichnis: abh.ablageVerzeichnis ?? STANDARD_ARCHIV_VERZEICHNIS, basisUrl: process.env.HB_ARCHIV_BASIS_URL || undefined },
          abruf,
          neuLaden: values['neu-laden'],
        }));
      }
    }
  } finally {
    if (!abh.sql) await sql.end();
  }
  log(formatiereApiBericht(ergebnisse));
  return ergebnisse.some((e) => e.status === 'failed' || e.status === 'quarantined') ? 1 : 0;
}
