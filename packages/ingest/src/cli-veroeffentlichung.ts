import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sha256Hex } from './abruf/http';
import { zelle } from './api-bericht';
import { inTransaktion, verbinde, type Sql } from './db/client';
import { ladeDqKatalog, raeumeRawAuf, speichereDqLauf, veroeffentlicheVersion } from './db/veroeffentlichung';
import { laufKontext } from './lauf-kontext';
import { bewerteDq, leseDbtAufruf, leseDbtTests, type Ampel, type DqErgebnis } from './veroeffentlichung/dq';

export type VeroeffentlichungAbhaengigkeiten = { sql?: Sql; log?: (text: string) => void; targetVerzeichnis?: string };

export const STANDARD_TARGET_VERZEICHNIS = fileURLToPath(new URL('../../../dbt/target', import.meta.url));

const AMPEL_DEUTSCH: Record<Ampel, string> = { green: 'grün', yellow: 'gelb', red: 'rot' };

function lese(verzeichnis: string, datei: string): string {
  const pfad = join(verzeichnis, datei);
  if (!existsSync(pfad)) throw new Error(`${datei} nicht gefunden: ${pfad} (zuerst pnpm dbt test ausführen)`);
  return readFileSync(pfad, 'utf8');
}

export async function mainVeroeffentlichung(argv: readonly string[], abh: VeroeffentlichungAbhaengigkeiten = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv.filter((a) => a !== '--'),
    options: {
      target: { type: 'string' },
      // Veröffentlicht auch, wenn dbt mit --vars (gelockerten Prüfungen) lief.
      testlauf: { type: 'boolean', default: false },
      // Rohdaten erst nach erfolgreichem Archiv-Upload aufräumen (CLI raeume-auf).
      'ohne-aufraeumen': { type: 'boolean', default: false },
    },
  });
  const verzeichnis = values.target ?? abh.targetVerzeichnis ?? STANDARD_TARGET_VERZEICHNIS;
  const runResultsText = lese(verzeichnis, 'run_results.json');
  const manifestText = lese(verzeichnis, 'manifest.json');
  const manifestSha = sha256Hex(manifestText);
  const runResults: unknown = JSON.parse(runResultsText);
  const tests = leseDbtTests(runResults, JSON.parse(manifestText));
  const dbtAufruf = leseDbtAufruf(runResults);
  const varsGesetzt = Object.keys(dbtAufruf.vars).length > 0;
  const testlauf = varsGesetzt && values.testlauf === true;

  const kontext = laufKontext();
  const sql = abh.sql ?? verbinde();
  const log = abh.log ?? ((text: string) => console.log(text));
  try {
    const katalog = await ladeDqKatalog(sql);
    const { ergebnisse, ampel, score } = bewerteDq(tests, katalog);
    const veroeffentlicht = await inTransaktion(sql, async (tx) => {
      const dqLaufId = await speichereDqLauf(tx, { gitSha: kontext.gitSha, manifestSha, ampel, score, dbtAufruf }, ergebnisse);
      if (ampel === 'red' || (varsGesetzt && !testlauf)) return null;
      const version = await veroeffentlicheVersion(tx, dqLaufId);
      const geloescht = values['ohne-aufraeumen'] ? null : await raeumeRawAuf(tx);
      return { version, geloescht };
    });
    const grund = ampel === 'red' ? 'Rote Ampel: Datenstand nicht veröffentlicht.' : 'nicht veröffentlicht: dbt mit --vars ausgeführt (Testlauf)';
    const kopf = testlauf ? [`Testlauf (vars: ${JSON.stringify(dbtAufruf.vars)})`] : [];
    log(formatiereBericht(kopf, ampel, score, ergebnisse, veroeffentlicht, grund));
    return veroeffentlicht ? 0 : 1;
  } finally {
    if (!abh.sql) await sql.end();
  }
}

const zeile = (zellen: readonly string[]) => `| ${zellen.join(' | ')} |`;

/** Tabelle der beim Aufräumen von raw gelöschten Zeilen (auch für das CLI raeume-auf). */
export function formatiereAufraeumen(geloescht: readonly { tabelle: string; geloescht: number }[]): string {
  const zeilen = [zeile(['Rohtabelle', 'Gelöschte Zeilen']), zeile(['---', '---'])];
  for (const g of geloescht) zeilen.push(zeile([zelle(g.tabelle), String(g.geloescht)]));
  return zeilen.join('\n');
}

function formatiereBericht(
  kopf: readonly string[],
  ampel: Ampel,
  score: number,
  ergebnisse: readonly DqErgebnis[],
  veroeffentlicht: { version: { versionId: number; zeilenNeu: number; zeilenGeschlossen: number; zeilenGesamt: number }; geloescht: { tabelle: string; geloescht: number }[] | null } | null,
  grund: string,
): string {
  const zeilen = [...kopf, `Ampel: ${AMPEL_DEUTSCH[ampel]}`, `Score: ${score.toFixed(2)}`, ''];
  const offen = ergebnisse.filter((e) => e.status !== 'pass');
  if (offen.length > 0) {
    zeilen.push(zeile(['Prüfung', 'Status', 'Zeilen', 'Details']), zeile(['---', '---', '---', '---']));
    for (const e of offen) zeilen.push(zeile([e.checkId, e.status, String(e.failures), zelle(e.details.join('; '))]));
    zeilen.push('');
  }
  if (!veroeffentlicht) {
    zeilen.push(grund);
    return zeilen.join('\n');
  }
  const v = veroeffentlicht.version;
  zeilen.push(`Version ${v.versionId} veröffentlicht: ${v.zeilenNeu} neue, ${v.zeilenGeschlossen} geschlossene, ${v.zeilenGesamt} Zeilen gesamt.`, '');
  zeilen.push(veroeffentlicht.geloescht ? formatiereAufraeumen(veroeffentlicht.geloescht) : 'Rohdaten nicht aufgeräumt (--ohne-aufraeumen).');
  return zeilen.join('\n');
}
