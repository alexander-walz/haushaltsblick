import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ladeSystematikJahr, type SystematikIngestOptionen } from './systematik-ingest';
import type { ApiAbruf } from './api/crawler';
import { systematikUrl, type SystematikParameter } from './api/systematik';
import { fakeAbruf } from './api/test-baum';
import { baueSystematikBaum, type SystematikPlan } from './api/test-systematik';
import type { Sql } from './db/client';
import { imRollback } from './db/test-hilfen';

const P: SystematikParameter = { jahr: 1999, konto: 'ausgaben', sicht: 'funktion' };
const PLAN: SystematikPlan = { '3': { '31': [['312', 'Krankenhäuser', 10]], '32': [['322', 'Sport', 5.5], ['325', 'Erholung', 0.5]] } };

const optionen = (abruf: ApiAbruf, extra: Partial<SystematikIngestOptionen> = {}): SystematikIngestOptionen => ({
  trigger: 'ci', gitSha: 'test', pipelineVersion: '0.3.0',
  archiv: { verzeichnis: mkdtempSync(join(tmpdir(), 'hb-sys-')) }, abruf, ...extra,
});

const laufStatus = async (tx: Sql, runId: string) =>
  (await tx`select status, rows_loaded, error from ops.load_run where run_id = ${runId}`)[0];
const zeilen = async (tx: Sql, runId: string) =>
  (await tx`select (select count(*)::int from raw.api_systematik where run_id = ${runId}) as eintraege,
                   (select count(*)::int from raw.api_systematik_abruf where run_id = ${runId}) as abrufe`)[0];

describe('ladeSystematikJahr', () => {
  it('lädt einen vollständigen Baum, archiviert alle Antworten und protokolliert den Lauf', () =>
    imRollback(async (tx) => {
      const abruf = fakeAbruf(baueSystematikBaum(P, PLAN, 111));
      const opt = optionen(abruf);
      const e = await ladeSystematikJahr(tx, P, opt);
      expect(e).toMatchObject({ status: 'succeeded', anfragen: 4, eintraege: 6 });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'succeeded', rows_loaded: 6, error: null });
      expect(await zeilen(tx, e.runId)).toEqual({ eintraege: 6, abrufe: 1 });
      const [archiv] = readdirSync(opt.archiv.verzeichnis);
      expect(archiv).toMatch(/^systematik_funktion_1999_ausgaben_111_[0-9a-f]{16}\.ndjson\.gz$/);
      const [abrufZeile] = await tx<{ sha256: string }[]>`select sha256 from raw.api_systematik_abruf where run_id = ${e.runId}`;
      expect(archiv).toBe(`systematik_funktion_1999_ausgaben_111_${abrufZeile!.sha256.slice(0, 16)}.ndjson.gz`);
      const ndjson = gunzipSync(readFileSync(join(opt.archiv.verzeichnis, archiv!))).toString('utf8').trim().split('\n');
      expect(ndjson.map((z) => (JSON.parse(z) as { url: string }).url)).toEqual(abruf.aufrufe);
    }));

  it('überspringt einen unveränderten Stand mit genau einer Anfrage', () =>
    imRollback(async (tx) => {
      const baum = baueSystematikBaum(P, PLAN, 222);
      await ladeSystematikJahr(tx, P, optionen(fakeAbruf(baum)));
      const zweiter = fakeAbruf(baum);
      const e = await ladeSystematikJahr(tx, P, optionen(zweiter));
      expect(e).toMatchObject({ status: 'skipped', hinweis: 'unverändert', anfragen: 1 });
      expect(zweiter.aufrufe).toEqual([systematikUrl(P)]);
      expect(await zeilen(tx, e.runId)).toEqual({ eintraege: 0, abrufe: 0 });
    }));

  it('lädt bei geänderter pipeline_version trotz unverändertem Stand vollständig', () =>
    imRollback(async (tx) => {
      const baum = baueSystematikBaum(P, PLAN, 777);
      await ladeSystematikJahr(tx, P, optionen(fakeAbruf(baum), { pipelineVersion: '0.2.0' }));
      const e = await ladeSystematikJahr(tx, P, optionen(fakeAbruf(baum), { pipelineVersion: '0.3.0' }));
      expect(e).toMatchObject({ status: 'succeeded', anfragen: 4 });
      await tx`update ops.load_run set started_at = started_at + interval '1 second' where run_id = ${e.runId}`;
      const dritter = await ladeSystematikJahr(tx, P, optionen(fakeAbruf(baum), { pipelineVersion: '0.3.0' }));
      expect(dritter).toMatchObject({ status: 'skipped', hinweis: 'unverändert' });
    }));

  it('lädt mit neuLaden trotz unverändertem Stand vollständig', () =>
    imRollback(async (tx) => {
      const baum = baueSystematikBaum(P, PLAN, 333);
      await ladeSystematikJahr(tx, P, optionen(fakeAbruf(baum)));
      const e = await ladeSystematikJahr(tx, P, optionen(fakeAbruf(baum), { neuLaden: true }));
      expect(e).toMatchObject({ status: 'succeeded', anfragen: 4 });
    }));

  it('überspringt nicht verfügbare Jahre', () =>
    imRollback(async (tx) => {
      const e = await ladeSystematikJahr(tx, P, optionen(fakeAbruf(new Map())));
      expect(e).toMatchObject({ status: 'skipped', hinweis: 'nicht verfügbar', anfragen: 1 });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'skipped', rows_loaded: null, error: null });
    }));

  it('stellt inkonsistente Summen unter Quarantäne und speichert nichts', () =>
    imRollback(async (tx) => {
      const baum = baueSystematikBaum(P, PLAN, 444);
      (baum.get(systematikUrl(P, 'F-32')) as { children: { value: number }[] }).children[0]!.value = 999;
      const e = await ladeSystematikJahr(tx, P, optionen(fakeAbruf(baum)));
      expect(e.status).toBe('quarantined');
      expect(e.hinweis).toMatch(/Summe der Kinder/);
      expect(await zeilen(tx, e.runId)).toEqual({ eintraege: 0, abrufe: 0 });
    }));

  it('markiert Netzwerkfehler als failed', () =>
    imRollback(async (tx) => {
      const abruf: ApiAbruf = async () => { throw new Error('Abruf nach 4 Versuchen fehlgeschlagen'); };
      const e = await ladeSystematikJahr(tx, P, optionen(abruf));
      expect(e).toMatchObject({ status: 'failed', hinweis: 'Abruf nach 4 Versuchen fehlgeschlagen' });
    }));

  it('liefert failed mit Hinweis, wenn der Lauf nicht abgeschlossen werden kann, und wirft nicht', () =>
    imRollback(async (tx) => {
      const beende = async () => { throw new Error('Verbindung verloren'); };
      const e = await ladeSystematikJahr(tx, P, optionen(fakeAbruf(baueSystematikBaum(P, PLAN, 888)), { beende }));
      expect(e.status).toBe('failed');
      expect(e.hinweis).toMatch(/Lauf konnte nicht abgeschlossen werden: Verbindung verloren/);
    }));
});
