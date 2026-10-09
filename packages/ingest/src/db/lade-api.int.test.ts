import { describe, expect, it } from 'vitest';
import { crawle, holeWurzel, type ApiParameter, type CrawlErgebnis } from '../api/crawler';
import { baueBaum, fakeAbruf } from '../api/test-baum';
import { beendeLauf, starteLauf, type LaufStatus } from './lade-soll';
import { letzterApiStand, speichereApiCrawl } from './lade-api';
import type { Sql } from './client';
import { imRollback } from './test-hilfen';

// Jahr 1999 kommt in echten Daten nicht vor, damit lokale Läufe die Tests nicht beeinflussen.
const P: ApiParameter = { jahr: 1999, konto: 'ausgaben', quote: 'ist' };
const ABLAGE = { uri: 'data/raw/archiv/x.ndjson.gz', sha256: 'a'.repeat(64), anfragen: 4 };

async function testCrawl(timestamp = 1752216181000): Promise<CrawlErgebnis> {
  const abruf = fakeAbruf(baueBaum(P, { '04': { '0411': [['43257', '018', 'Versorgungsbezüge', 61346498.79], ['97201', '880', 'GMA', -168000]] } }, timestamp));
  const wurzel = await holeWurzel(P, abruf);
  if (wurzel.status !== 'ok') throw new Error('Wurzel fehlt');
  return crawle(P, abruf, wurzel);
}

async function lauf(tx: Sql, status: LaufStatus, timestamp: number): Promise<string> {
  const runId = await starteLauf(tx, { sourceId: 'SRC_PORTAL_API', trigger: 'ci', gitSha: 'test', pipelineVersion: '0.2.0', params: { jahr: P.jahr, konto: P.konto, quote: P.quote } });
  await speichereApiCrawl(tx, runId, P, await testCrawl(timestamp), ABLAGE);
  await beendeLauf(tx, runId, { status });
  return runId;
}

describe('Laden der API-Crawls', () => {
  it('speichert Abruf, Knoten und Titel mit Cent-Beträgen', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, { sourceId: 'SRC_PORTAL_API', trigger: 'ci', gitSha: 'test', pipelineVersion: '0.2.0', params: {} });
      expect(await speichereApiCrawl(tx, runId, P, await testCrawl(), ABLAGE)).toEqual({ titel: 2, knoten: 3 });

      const [abruf] = await tx`select quelle_timestamp::text as ts, modify_date, anfragen, ablage_uri, warnungen from raw.api_abruf where run_id = ${runId}`;
      expect(abruf).toEqual({ ts: '1752216181000', modify_date: '11.07.2025', anfragen: 4, ablage_uri: ABLAGE.uri, warnungen: [] });

      const titel = await tx`select titel_key, fkt, label, betrag_eur::text as betrag from raw.api_titel where run_id = ${runId} order by titel_key`;
      expect(titel).toEqual([
        { titel_key: '041143257', fkt: '018', label: 'Versorgungsbezüge', betrag: '61346498.79' },
        { titel_key: '041197201', fkt: '880', label: 'GMA', betrag: '-168000.00' },
      ]);

      const [gesamt] = await tx`select betrag_eur::text as betrag from raw.api_knoten where run_id = ${runId} and ebene = 'gesamt'`;
      expect(gesamt).toEqual({ betrag: '61178498.79' });
    }));

  it('findet den Stand der Quelle des letzten erfolgreichen Laufs', () =>
    imRollback(async (tx) => {
      await lauf(tx, 'succeeded', 1000);
      await lauf(tx, 'succeeded', 2000);
      await lauf(tx, 'quarantined', 3000);
      expect(await letzterApiStand(tx, P)).toEqual({ quelleTimestamp: 2000 });
      expect(await letzterApiStand(tx, { ...P, konto: 'einnahmen' })).toBeNull();
      expect(await letzterApiStand(tx, { ...P, quote: 'soll' })).toBeNull();
    }));
});
