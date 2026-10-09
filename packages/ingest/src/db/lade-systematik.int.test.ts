import { describe, expect, it } from 'vitest';
import { holeSystematikWurzel, crawleSystematik, type SystematikErgebnis, type SystematikParameter } from '../api/systematik';
import { fakeAbruf } from '../api/test-baum';
import { baueSystematikBaum, type SystematikPlan } from '../api/test-systematik';
import { beendeLauf, starteLauf, type LaufStatus } from './lade-soll';
import { letzterSystematikStand, speichereSystematik } from './lade-systematik';
import type { Sql } from './client';
import { imRollback } from './test-hilfen';

// Jahr 1999 kommt in echten Daten nicht vor, damit lokale Läufe die Tests nicht beeinflussen.
const P: SystematikParameter = { jahr: 1999, konto: 'ausgaben', sicht: 'funktion' };
const PLAN: SystematikPlan = {
  '3': { '31': [['312', 'Krankenhäuser', 10]], '32': [['322', 'Sport', 5.5], ['325', 'Erholung', 0.5]] },
  '0': { '01': [['011', 'Politische Führung', 100]] },
};
const ABLAGE = { uri: 'data/raw/archiv/x.ndjson.gz', sha256: 'a'.repeat(64), anfragen: 6 };

async function testCrawl(timestamp = 1752216181000): Promise<SystematikErgebnis> {
  const abruf = fakeAbruf(baueSystematikBaum(P, PLAN, timestamp));
  const wurzel = await holeSystematikWurzel(P, abruf);
  if (wurzel.status !== 'ok') throw new Error('Wurzel fehlt');
  return crawleSystematik(P, abruf, wurzel);
}

async function lauf(tx: Sql, status: LaufStatus, timestamp: number): Promise<string> {
  const runId = await starteLauf(tx, { sourceId: 'SRC_PORTAL_API', trigger: 'ci', gitSha: 'test', pipelineVersion: '0.3.0', params: { jahr: P.jahr, konto: P.konto, sicht: P.sicht } });
  await speichereSystematik(tx, runId, P, await testCrawl(timestamp), ABLAGE);
  await beendeLauf(tx, runId, { status });
  return runId;
}

describe('Laden der Systematik-Crawls', () => {
  it('speichert Abruf und Einträge mit Cent-Beträgen', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, { sourceId: 'SRC_PORTAL_API', trigger: 'ci', gitSha: 'test', pipelineVersion: '0.3.0', params: {} });
      expect(await speichereSystematik(tx, runId, P, await testCrawl(), ABLAGE)).toBe(9);

      const [abruf] = await tx`select jahr, konto, sicht, quelle_timestamp::text as ts, anfragen, ablage_uri, warnungen from raw.api_systematik_abruf where run_id = ${runId}`;
      expect(abruf).toEqual({ jahr: 1999, konto: 'ausgaben', sicht: 'funktion', ts: '1752216181000', anfragen: 6, ablage_uri: ABLAGE.uri, warnungen: [] });

      const eintraege = await tx`select code, ebene, label, betrag_eur::text as betrag from raw.api_systematik where run_id = ${runId} order by code`;
      expect(eintraege).toEqual([
        { code: '0', ebene: 1, label: 'Haupt 0', betrag: '100.00' },
        { code: '01', ebene: 2, label: 'Ober 01', betrag: '100.00' },
        { code: '011', ebene: 3, label: 'Politische Führung', betrag: '100.00' },
        { code: '3', ebene: 1, label: 'Haupt 3', betrag: '16.00' },
        { code: '31', ebene: 2, label: 'Ober 31', betrag: '10.00' },
        { code: '312', ebene: 3, label: 'Krankenhäuser', betrag: '10.00' },
        { code: '32', ebene: 2, label: 'Ober 32', betrag: '6.00' },
        { code: '322', ebene: 3, label: 'Sport', betrag: '5.50' },
        { code: '325', ebene: 3, label: 'Erholung', betrag: '0.50' },
      ]);
    }));

  it('findet den Stand der Quelle des letzten erfolgreichen Laufs', () =>
    imRollback(async (tx) => {
      await lauf(tx, 'succeeded', 1000);
      await lauf(tx, 'succeeded', 2000);
      await lauf(tx, 'quarantined', 3000);
      expect(await letzterSystematikStand(tx, P)).toEqual({ quelleTimestamp: 2000, pipelineVersion: '0.3.0' });
      expect(await letzterSystematikStand(tx, { ...P, sicht: 'gruppierung' })).toBeNull();
    }));
});
