import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ladeApiJahr, type ApiIngestOptionen } from './api-ingest';
import { apiUrl, type ApiAbruf, type ApiParameter } from './api/crawler';
import { baueBaum, fakeAbruf, type BaumPlan } from './api/test-baum';
import type { Sql } from './db/client';
import { imRollback } from './db/test-hilfen';

const P: ApiParameter = { jahr: 1999, konto: 'ausgaben', quote: 'ist' };
const PLAN: BaumPlan = { '04': { '0411': [['43257', '018', 'Versorgungsbezüge', 61346498.79]], '0416': [['68421', '322', 'Sport', 1000]] } };

const optionen = (abruf: ApiAbruf, extra: Partial<ApiIngestOptionen> = {}): ApiIngestOptionen => ({
  trigger: 'ci', gitSha: 'test', pipelineVersion: '0.2.0',
  archiv: { verzeichnis: mkdtempSync(join(tmpdir(), 'hb-api-')) }, abruf, ...extra,
});

const laufStatus = async (tx: Sql, runId: string) =>
  (await tx`select status, rows_loaded, error from ops.load_run where run_id = ${runId}`)[0];
const zeilen = async (tx: Sql, runId: string) =>
  (await tx`select (select count(*)::int from raw.api_titel where run_id = ${runId}) as titel,
                   (select count(*)::int from raw.api_knoten where run_id = ${runId}) as knoten,
                   (select count(*)::int from raw.api_abruf where run_id = ${runId}) as abrufe`)[0];

describe('ladeApiJahr', () => {
  it('lädt einen vollständigen Baum, archiviert alle Antworten und protokolliert den Lauf', () =>
    imRollback(async (tx) => {
      const abruf = fakeAbruf(baueBaum(P, PLAN, 111));
      const opt = optionen(abruf);
      const e = await ladeApiJahr(tx, P, opt);
      expect(e).toMatchObject({ status: 'succeeded', anfragen: 4, titel: 2, summeCent: 6134749879 });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'succeeded', rows_loaded: 2, error: null });
      expect(await zeilen(tx, e.runId)).toEqual({ titel: 2, knoten: 4, abrufe: 1 });
      const [archiv] = readdirSync(opt.archiv.verzeichnis);
      expect(archiv).toMatch(/^api_ist_1999_ausgaben_111_[0-9a-f]{16}\.ndjson\.gz$/);
      const [abrufZeile] = await tx<{ sha256: string }[]>`select sha256 from raw.api_abruf where run_id = ${e.runId}`;
      expect(archiv).toBe(`api_ist_1999_ausgaben_111_${abrufZeile!.sha256.slice(0, 16)}.ndjson.gz`);
      const ndjson = gunzipSync(readFileSync(join(opt.archiv.verzeichnis, archiv!))).toString('utf8').trim().split('\n');
      expect(ndjson.map((z) => (JSON.parse(z) as { url: string }).url)).toEqual(abruf.aufrufe);
    }));

  it('überspringt einen unveränderten Stand mit genau einer Anfrage', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 222);
      await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)));
      const zweiter = fakeAbruf(baum);
      const e = await ladeApiJahr(tx, P, optionen(zweiter));
      expect(e).toMatchObject({ status: 'skipped', hinweis: 'unverändert', anfragen: 1 });
      expect(zweiter.aufrufe).toEqual([apiUrl(P)]);
      expect(await zeilen(tx, e.runId)).toEqual({ titel: 0, knoten: 0, abrufe: 0 });
    }));

  it('lädt bei geänderter pipeline_version trotz unverändertem Stand vollständig', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 777);
      await ladeApiJahr(tx, P, optionen(fakeAbruf(baum), { pipelineVersion: '0.1.0' }));
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baum), { pipelineVersion: '0.2.0' }));
      expect(e).toMatchObject({ status: 'succeeded', anfragen: 4 });
      await tx`update ops.load_run set started_at = started_at + interval '1 second' where run_id = ${e.runId}`;
      const dritter = await ladeApiJahr(tx, P, optionen(fakeAbruf(baum), { pipelineVersion: '0.2.0' }));
      expect(dritter).toMatchObject({ status: 'skipped', hinweis: 'unverändert' });
    }));

  it('lädt mit neuLaden trotz unverändertem Stand vollständig', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 333);
      await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)));
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baum), { neuLaden: true }));
      expect(e).toMatchObject({ status: 'succeeded', anfragen: 4 });
    }));

  it('überspringt nicht verfügbare Jahre', () =>
    imRollback(async (tx) => {
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(new Map())));
      expect(e).toMatchObject({ status: 'skipped', hinweis: 'nicht verfügbar', anfragen: 1 });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'skipped', rows_loaded: null, error: null });
    }));

  it('stellt inkonsistente Summen unter Quarantäne und speichert nichts', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 444);
      (baum.get(apiUrl(P, '0416')) as { children: { value: number }[] }).children[0]!.value = 999;
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)));
      expect(e.status).toBe('quarantined');
      expect(e.hinweis).toMatch(/Summe der Kinder 999\.00 weicht vom Knoten 1000\.00 ab/);
      expect(await zeilen(tx, e.runId)).toEqual({ titel: 0, knoten: 0, abrufe: 0 });
    }));

  it('stellt Schemaverletzungen unter Quarantäne', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 555);
      delete (baum.get(apiUrl(P, '04')) as { meta: Record<string, unknown> }).meta.timestamp;
      expect((await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)))).status).toBe('quarantined');
    }));

  it('protokolliert Warnungen bei neuen Feldern und lädt trotzdem', () =>
    imRollback(async (tx) => {
      const baum = baueBaum(P, PLAN, 666);
      (baum.get(apiUrl(P)) as Record<string, unknown>).neu = true;
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baum)));
      expect(e).toMatchObject({ status: 'succeeded', hinweis: '1 Warnung: Unbekanntes Feld neu' });
      const [abruf] = await tx`select warnungen from raw.api_abruf where run_id = ${e.runId}`;
      expect(abruf).toEqual({ warnungen: ['Unbekanntes Feld neu'] });
    }));

  it('markiert Netzwerkfehler als failed', () =>
    imRollback(async (tx) => {
      const abruf: ApiAbruf = async () => { throw new Error('Abruf nach 4 Versuchen fehlgeschlagen'); };
      const e = await ladeApiJahr(tx, P, optionen(abruf));
      expect(e).toMatchObject({ status: 'failed', hinweis: 'Abruf nach 4 Versuchen fehlgeschlagen' });
    }));

  it('liefert failed mit Hinweis, wenn der Lauf nicht abgeschlossen werden kann, und wirft nicht', () =>
    imRollback(async (tx) => {
      const beende = async () => { throw new Error('Verbindung verloren'); };
      const e = await ladeApiJahr(tx, P, optionen(fakeAbruf(baueBaum(P, PLAN, 777)), { beende }));
      expect(e.status).toBe('failed');
      expect(e.hinweis).toMatch(/Lauf konnte nicht abgeschlossen werden: Verbindung verloren/);
    }));
});
