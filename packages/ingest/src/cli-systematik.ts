import { parseArgs } from 'node:util';
import type { Konto } from '@hb/shared';
import { Drossel } from './abruf/http';
import { zelle } from './api-bericht';
import { netzAbruf, type ApiAbruf } from './api/crawler';
import type { Sicht } from './api/systematik';
import { STANDARD_ARCHIV_VERZEICHNIS } from './archiv';
import { verbinde, type Sql } from './db/client';
import { parseJahre } from './jahre';
import { laufKontext } from './lauf-kontext';
import { ladeSystematikJahr, type SystematikErgebnisLauf } from './systematik-ingest';

export type SystematikCliAbhaengigkeiten = { sql?: Sql; heute?: Date; ablageVerzeichnis?: string; abruf?: ApiAbruf; log?: (text: string) => void };

const KONTEN: Record<string, readonly Konto[]> = { beide: ['ausgaben', 'einnahmen'], ausgaben: ['ausgaben'], einnahmen: ['einnahmen'] };
const SICHTEN: Record<string, readonly Sicht[]> = { beide: ['funktion', 'gruppierung'], funktion: ['funktion'], gruppierung: ['gruppierung'] };

export function formatiereSystematikBericht(ergebnisse: readonly SystematikErgebnisLauf[]): string {
  const zeile = (zellen: readonly string[]) => `| ${zellen.join(' | ')} |`;
  const kopf = ['Jahr', 'Konto', 'Sicht', 'Status', 'Codes', 'Anfragen', 'Hinweis'];
  const zeilen = [zeile(kopf), zeile(kopf.map(() => '---'))];
  for (const e of ergebnisse) {
    zeilen.push(zeile([
      String(e.parameter.jahr),
      e.parameter.konto,
      e.parameter.sicht,
      e.status,
      e.eintraege === undefined ? '' : String(e.eintraege),
      String(e.anfragen),
      zelle(e.hinweis ?? ''),
    ]));
  }
  return zeilen.join('\n');
}

export async function mainSystematik(argv: readonly string[], abh: SystematikCliAbhaengigkeiten = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv.filter((a) => a !== '--'),
    options: {
      jahre: { type: 'string', default: 'alle' },
      konten: { type: 'string', default: 'beide' },
      sichten: { type: 'string', default: 'beide' },
      'neu-laden': { type: 'boolean', default: false },
    },
  });
  const jahre = parseJahre(values.jahre ?? 'alle', abh.heute);
  const konten = KONTEN[values.konten ?? 'beide'];
  if (!konten) throw new Error(`Unbekannte Konten: ${values.konten}`);
  const sichten = SICHTEN[values.sichten ?? 'beide'];
  if (!sichten) throw new Error(`Unbekannte Sichten: ${values.sichten}`);

  const kontext = laufKontext();
  const abruf = abh.abruf ?? netzAbruf({ userAgent: kontext.userAgent, drossel: new Drossel(500) });
  const sql = abh.sql ?? verbinde();
  const log = abh.log ?? ((text: string) => console.log(text));
  const ergebnisse: SystematikErgebnisLauf[] = [];
  try {
    for (const jahr of jahre) {
      for (const konto of konten) {
        for (const sicht of sichten) {
          ergebnisse.push(await ladeSystematikJahr(sql, { jahr, konto, sicht }, {
            trigger: kontext.trigger,
            gitSha: kontext.gitSha,
            pipelineVersion: kontext.pipelineVersion,
            archiv: { verzeichnis: abh.ablageVerzeichnis ?? STANDARD_ARCHIV_VERZEICHNIS, basisUrl: process.env.HB_ARCHIV_BASIS_URL || undefined },
            abruf,
            neuLaden: values['neu-laden'],
          }));
        }
      }
    }
  } finally {
    if (!abh.sql) await sql.end();
  }
  log(formatiereSystematikBericht(ergebnisse));
  return ergebnisse.some((e) => e.status === 'failed' || e.status === 'quarantined') ? 1 : 0;
}
