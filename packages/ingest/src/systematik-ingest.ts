import { sha256Hex } from './abruf/http';
import { archiviere, type ArchivOptionen } from './archiv';
import type { ApiAbruf } from './api/crawler';
import { ApiVertragsFehler } from './api/schema';
import { crawleSystematik, holeSystematikWurzel, type SystematikParameter } from './api/systematik';
import { inTransaktion, type Sql } from './db/client';
import { beendeLauf, starteLauf, type LaufStatus, type Trigger } from './db/lade-soll';
import { letzterSystematikStand, speichereSystematik } from './db/lade-systematik';

export type SystematikIngestOptionen = {
  trigger: Trigger;
  gitSha: string;
  pipelineVersion: string;
  archiv: ArchivOptionen;
  abruf: ApiAbruf;
  neuLaden?: boolean;
  /** Test-Seam: ersetzt das Abschließen des Laufs. */
  beende?: typeof beendeLauf;
};

export type SystematikErgebnisLauf = {
  parameter: SystematikParameter;
  runId: string;
  status: LaufStatus;
  anfragen: number;
  eintraege?: number;
  hinweis?: string;
};

const warnHinweis = (warnungen: readonly string[]) =>
  warnungen.length === 0 ? undefined : `${warnungen.length} ${warnungen.length === 1 ? 'Warnung' : 'Warnungen'}: ${warnungen.join('; ')}`;

/** Ein Ladelauf für Jahr, Konto und Sicht: Wurzel prüfen, bei neuem Stand vollständig crawlen, archivieren, atomar speichern. */
export async function ladeSystematikJahr(sql: Sql, p: SystematikParameter, opt: SystematikIngestOptionen): Promise<SystematikErgebnisLauf> {
  const runId = await starteLauf(sql, {
    sourceId: 'SRC_PORTAL_API',
    trigger: opt.trigger,
    gitSha: opt.gitSha,
    pipelineVersion: opt.pipelineVersion,
    params: { jahr: p.jahr, konto: p.konto, sicht: p.sicht, neu_laden: opt.neuLaden ? 'ja' : null },
  });
  let anfragen = 0;
  const abruf: ApiAbruf = (url) => {
    anfragen += 1;
    return opt.abruf(url);
  };

  const ende = async (status: LaufStatus, extra: { hinweis?: string; eintraege?: number } = {}): Promise<SystematikErgebnisLauf> => {
    const fehler = status === 'failed' || status === 'quarantined' ? extra.hinweis : undefined;
    let endStatus = status;
    let endHinweis = extra.hinweis;
    try {
      await (opt.beende ?? beendeLauf)(sql, runId, { status, rowsLoaded: extra.eintraege, fehler });
    } catch (e) {
      endStatus = 'failed';
      endHinweis = [extra.hinweis, `Lauf konnte nicht abgeschlossen werden: ${e instanceof Error ? e.message : String(e)}`].filter(Boolean).join('; ');
    }
    return { parameter: p, runId, status: endStatus, anfragen, ...extra, hinweis: endHinweis };
  };

  try {
    const wurzel = await holeSystematikWurzel(p, abruf);
    if (wurzel.status === 'nicht_verfuegbar') return await ende('skipped', { hinweis: 'nicht verfügbar' });
    const vorher = opt.neuLaden ? null : await letzterSystematikStand(sql, p);
    if (vorher?.quelleTimestamp === wurzel.antwort.meta.timestamp && vorher.pipelineVersion === opt.pipelineVersion) return await ende('skipped', { hinweis: 'unverändert' });

    const ergebnis = await crawleSystematik(p, abruf, wurzel);
    const ndjson = Buffer.from(
      ergebnis.antworten.map((a) => JSON.stringify({ url: a.url, body: JSON.parse(a.roh.toString('utf8')) as unknown })).join('\n') + '\n',
    );
    const ablage = await archiviere(opt.archiv, `systematik_${p.sicht}_${p.jahr}_${p.konto}_${ergebnis.quelleTimestamp}_${sha256Hex(ndjson).slice(0, 16)}.ndjson`, ndjson);
    const anzahl = await inTransaktion(sql, (tx) =>
      speichereSystematik(tx, runId, p, ergebnis, { uri: ablage.uri, sha256: ablage.sha256, anfragen }),
    );
    return await ende('succeeded', { eintraege: anzahl, hinweis: warnHinweis(ergebnis.warnungen) });
  } catch (e) {
    const status: LaufStatus = e instanceof ApiVertragsFehler ? 'quarantined' : 'failed';
    return await ende(status, { hinweis: e instanceof Error ? e.message : String(e) });
  }
}
