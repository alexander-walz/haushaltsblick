import { describe, expect, it } from 'vitest';
import { leseXmlDatei } from '../xml/parse-soll';
import { FIXTURE_2026, sammle } from '../xml/test-hilfen';
import type { SollZeile } from '../xml/typen';
import { inTransaktion, type Sql } from './client';
import {
  beendeLauf, letzteSollDatei, speichereQuellDatei, speichereSollZeilen, starteLauf,
  type LaufStart, type QuellDatei,
} from './lade-soll';
import { imRollback } from './test-hilfen';

const LAUF: LaufStart = { sourceId: 'SRC_SOLL_XML', trigger: 'ci', gitSha: 'test', pipelineVersion: '0.0.0-test', params: { jahr: 2026 } };

const datei = (runId: string, jahr: number, sha256: string, abgerufenAm: Date, etag: string | null = null): QuellDatei => ({
  runId, sourceId: 'SRC_SOLL_XML', jahr, url: `https://example.org/${jahr}/${sha256}.xml`, etag, lastModified: null,
  abgerufenAm, sha256, byteSize: 1, ablageUri: 'file:///tmp/x.xml',
});

async function laufMitDatei(
  tx: Sql,
  status: 'succeeded' | 'failed',
  d: Omit<QuellDatei, 'runId'>,
  lokaleDatei: string | null = null,
): Promise<void> {
  const runId = await starteLauf(tx, { ...LAUF, params: { jahr: d.jahr, datei: lokaleDatei } });
  await speichereQuellDatei(tx, { ...d, runId });
  await beendeLauf(tx, runId, { status });
}

describe('Laden der Soll-Rohdaten', () => {
  it('legt einen Lauf an und schließt ihn ab', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, LAUF);
      const [vorher] = await tx`select status, finished_at, params from ops.load_run where run_id = ${runId}`;
      expect(vorher).toEqual({ status: 'running', finished_at: null, params: { jahr: 2026 } });
      await beendeLauf(tx, runId, { status: 'quarantined', fehler: 'Unbekanntes Element' });
      const [nachher] = await tx`select status, error, finished_at is not null as beendet from ops.load_run where run_id = ${runId}`;
      expect(nachher).toEqual({ status: 'quarantined', error: 'Unbekanntes Element', beendet: true });
    }));

  it('speichert Titel und Kapitel des Auszugs mit Euro-Beträgen und Titelschlüssel', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, LAUF);
      const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
      expect(await speichereSollZeilen(tx, runId, zeilen)).toEqual({ titel: 8, kapitel: 6 });

      const [gma] = await tx`
        select titel_key, soll_tsd_eur::text as tsd, soll_eur::text as eur, konto_block, anlage_zu_kapitel_nr
        from raw.soll_titel where run_id = ${runId} and titel_key = '041197201'`;
      expect(gma).toEqual({ titel_key: '041197201', tsd: '-168', eur: '-168000.00', konto_block: 1, anlage_zu_kapitel_nr: null });

      const [ktf] = await tx`select anlage_zu_kapitel_nr from raw.soll_titel where run_id = ${runId} and titel_key = '609213203'`;
      expect(ktf).toEqual({ anlage_zu_kapitel_nr: '6002' });

      const [entfallen] = await tx`select entfallen, anzahl_titel from raw.soll_kapitel where run_id = ${runId} and kapitel_nr = '0618'`;
      expect(entfallen).toEqual({ entfallen: true, anzahl_titel: 0 });
    }));

  it('findet die zuletzt erfolgreich geladene Datei eines Jahres', () =>
    imRollback(async (tx) => {
      // Jahr 1999 kommt in echten Daten nicht vor, damit lokale Ladeläufe den Test nicht beeinflussen.
      await laufMitDatei(tx, 'succeeded', { ...datei('', 1999, 'c'.repeat(64), new Date('2025-12-01'), '"alt"') });
      await laufMitDatei(tx, 'succeeded', { ...datei('', 1999, 'a'.repeat(64), new Date('2026-01-01'), '"neu"') });
      await laufMitDatei(tx, 'failed', { ...datei('', 1999, 'b'.repeat(64), new Date('2026-02-01'), '"kaputt"') });
      expect(await letzteSollDatei(tx, 1999, { lokal: false })).toEqual({ sha256: 'a'.repeat(64), etag: '"neu"' });
      expect(await letzteSollDatei(tx, 1998, { lokal: false })).toBeNull();
    }));

  it('trennt Läufe aus lokalen Dateien von Netzläufen', () =>
    imRollback(async (tx) => {
      await laufMitDatei(tx, 'succeeded', datei('', 1999, 'e'.repeat(64), new Date('2026-03-01'), '"lokal"'), 'x.xml');
      expect(await letzteSollDatei(tx, 1999, { lokal: false })).toBeNull();
      expect(await letzteSollDatei(tx, 1999, { lokal: true })).toEqual({ sha256: 'e'.repeat(64), etag: '"lokal"' });
    }));

  it('hinterlässt keine Teildaten, wenn das Speichern scheitert', () =>
    imRollback(async (tx) => {
      const runId = await starteLauf(tx, LAUF);
      const zeilen = await sammle(leseXmlDatei(FIXTURE_2026));
      const kaputt: SollZeile[] = zeilen.map((z) =>
        z.art === 'titel' && z.titelNr === '68309' ? { ...z, konto: 'sonstiges' as never } : z,
      );
      await expect(
        inTransaktion(tx, async (t) => {
          await speichereQuellDatei(t, datei(runId, 2026, 'd'.repeat(64), new Date()));
          await speichereSollZeilen(t, runId, kaputt);
        }),
      ).rejects.toThrow(/soll_titel_konto_check/);
      const [anzahl] = await tx`
        select (select count(*)::int from raw.soll_titel where run_id = ${runId}) as titel,
               (select count(*)::int from raw.soll_kapitel where run_id = ${runId}) as kapitel,
               (select count(*)::int from raw.source_file where run_id = ${runId}) as dateien`;
      expect(anzahl).toEqual({ titel: 0, kapitel: 0, dateien: 0 });
    }));
});
