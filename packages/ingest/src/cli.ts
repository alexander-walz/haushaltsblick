import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatiereBericht } from './bericht';
import { verbinde, type Sql } from './db/client';
import type { Trigger } from './db/lade-soll';
import { parseJahre } from './jahre';
import { ladeSollJahr, type JahresErgebnis, type SollIngestOptionen } from './soll-ingest';

const TRIGGER: readonly Trigger[] = ['schedule', 'manual', 'ci'];
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type CliAbhaengigkeiten = {
  sql?: Sql;
  heute?: Date;
  ablageVerzeichnis?: string;
  abruf?: SollIngestOptionen['abruf'];
  log?: (text: string) => void;
  pauseMs?: number;
};

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unbekannt';
  }
}

function pipelineVersion(): string {
  const paket = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return paket.version;
}

export async function main(argv: readonly string[], abh: CliAbhaengigkeiten = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv.filter((a) => a !== '--'),
    options: { jahre: { type: 'string', default: 'alle' }, datei: { type: 'string' } },
  });
  const jahre = parseJahre(values.jahre ?? 'alle', abh.heute);
  if (values.datei !== undefined && jahre.length !== 1) throw new Error('--datei ist nur mit genau einem Jahr erlaubt');

  const userAgent = process.env.INGEST_USER_AGENT ?? '';
  if (values.datei === undefined && userAgent === '') {
    throw new Error('INGEST_USER_AGENT fehlt, z. B. "Haushaltsblick/0.1 (+mailto:kontakt@example.org)"');
  }
  const trigger = (process.env.HB_TRIGGER ?? 'manual') as Trigger;
  if (!TRIGGER.includes(trigger)) throw new Error(`Unbekannter HB_TRIGGER: ${trigger}`);

  const opt: SollIngestOptionen = {
    trigger,
    gitSha: gitSha(),
    pipelineVersion: pipelineVersion(),
    userAgent,
    ablageVerzeichnis: abh.ablageVerzeichnis ?? fileURLToPath(new URL('../../../data/raw', import.meta.url)),
    lokaleDatei: values.datei,
    abruf: abh.abruf,
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
