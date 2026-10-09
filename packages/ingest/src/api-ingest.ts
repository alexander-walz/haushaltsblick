import { archiviere, type ArchivOptionen } from './archiv';
import { crawle, holeWurzel, type ApiAbruf, type ApiParameter } from './api/crawler';
import { ApiVertragsFehler } from './api/schema';
import { inTransaktion, type Sql } from './db/client';
import { letzterApiStand, speichereApiCrawl } from './db/lade-api';
import { beendeLauf, starteLauf, type LaufStatus, type Trigger } from './db/lade-soll';

export type ApiIngestOptionen = {
  trigger: Trigger;
  gitSha: string;
  pipelineVersion: string;
  archiv: ArchivOptionen;
  abruf: ApiAbruf;
  neuLaden?: boolean;
};

export type ApiErgebnis = {
  parameter: ApiParameter;
  runId: string;
  status: LaufStatus;
  anfragen: number;
  titel?: number;
  summeCent?: number;
  hinweis?: string;
};

const warnHinweis = (warnungen: readonly string[]) =>
  warnungen.length === 0 ? undefined : `${warnungen.length} ${warnungen.length === 1 ? 'Warnung' : 'Warnungen'}: ${warnungen.join('; ')}`;

/** Ein Ladelauf für Jahr, Konto und Quote: Wurzel prüfen, bei neuem Stand vollständig crawlen, archivieren, atomar speichern. */
export async function ladeApiJahr(sql: Sql, p: ApiParameter, opt: ApiIngestOptionen): Promise<ApiErgebnis> {
  const runId = await starteLauf(sql, {
    sourceId: 'SRC_PORTAL_API',
    trigger: opt.trigger,
    gitSha: opt.gitSha,
    pipelineVersion: opt.pipelineVersion,
    params: { jahr: p.jahr, konto: p.konto, quote: p.quote, neu_laden: opt.neuLaden ? 'ja' : null },
  });
  let anfragen = 0;
  const abruf: ApiAbruf = (url) => {
    anfragen += 1;
    return opt.abruf(url);
  };

  const ende = async (status: LaufStatus, extra: { hinweis?: string; titel?: number; summeCent?: number } = {}): Promise<ApiErgebnis> => {
    const fehler = status === 'failed' || status === 'quarantined' ? extra.hinweis : undefined;
    await beendeLauf(sql, runId, { status, rowsLoaded: extra.titel, fehler });
    return { parameter: p, runId, status, anfragen, ...extra };
  };

  try {
    const wurzel = await holeWurzel(p, abruf);
    if (wurzel.status === 'nicht_verfuegbar') return await ende('skipped', { hinweis: 'nicht verfügbar' });
    const vorher = opt.neuLaden ? null : await letzterApiStand(sql, p);
    if (vorher?.quelleTimestamp === wurzel.antwort.meta.timestamp) return await ende('skipped', { hinweis: 'unverändert' });

    const crawl = await crawle(p, abruf, wurzel);
    const ndjson = Buffer.from(
      crawl.antworten.map((a) => JSON.stringify({ url: a.url, body: JSON.parse(a.roh.toString('utf8')) as unknown })).join('\n') + '\n',
    );
    const ablage = await archiviere(opt.archiv, `api_${p.quote}_${p.jahr}_${p.konto}_${crawl.quelleTimestamp}.ndjson`, ndjson);
    const anzahl = await inTransaktion(sql, (tx) =>
      speichereApiCrawl(tx, runId, p, crawl, { uri: ablage.uri, sha256: ablage.sha256, anfragen }),
    );
    return await ende('succeeded', { titel: anzahl.titel, summeCent: crawl.knoten[0]!.betragCent, hinweis: warnHinweis(crawl.warnungen) });
  } catch (e) {
    const status: LaufStatus = e instanceof ApiVertragsFehler ? 'quarantined' : 'failed';
    return await ende(status, { hinweis: e instanceof Error ? e.message : String(e) });
  }
}
