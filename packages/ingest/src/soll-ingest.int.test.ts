import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { sha256Hex, sollXmlUrl, type AbrufErgebnis, type AbrufOptionen } from './abruf/soll-xml';
import type { Sql } from './db/client';
import { imRollback } from './db/test-hilfen';
import { ladeSollJahr, type SollIngestOptionen } from './soll-ingest';
import { FIXTURE_2026 } from './xml/test-hilfen';

const ablage = mkdtempSync(join(tmpdir(), 'hb-ablage-'));

/** Fixture mit eindeutigem Kommentar: anderer SHA-256, damit frühere lokale Läufe nicht stören. */
const einmaligerInhalt = () => `${readFileSync(FIXTURE_2026, 'utf8')}\n<!-- ${randomUUID()} -->\n`;

function einmaligeDatei(): string {
  const pfad = join(ablage, `fixture-${randomUUID()}.xml`);
  writeFileSync(pfad, einmaligerInhalt());
  return pfad;
}

const neu = (inhalt: string, etag: string | null = null): AbrufErgebnis => ({
  status: 'neu', url: sollXmlUrl(2026), inhalt: Buffer.from(inhalt), sha256: sha256Hex(inhalt),
  etag, lastModified: null, abgerufenAm: new Date(),
});

const optionen = (extra: Partial<SollIngestOptionen> = {}): SollIngestOptionen => ({
  trigger: 'ci', gitSha: 'test', pipelineVersion: '0.0.0-test', userAgent: 'Haushaltsblick-Test/0.1',
  ablageVerzeichnis: ablage, ...extra,
});

const laufStatus = async (tx: Sql, runId: string) =>
  (await tx`select status, rows_loaded, error from ops.load_run where run_id = ${runId}`)[0];

describe('ladeSollJahr', () => {
  it('lädt eine neue Datei, legt sie ab und protokolliert den Lauf', () =>
    imRollback(async (tx) => {
      const e = await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: einmaligeDatei() }));
      expect(e.status).toBe('succeeded');
      expect(e.zusammenfassung?.haushaltTsdEur).toEqual({ einnahmen: 145016, ausgaben: 1457 });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'succeeded', rows_loaded: 8, error: null });
      const [datei] = await tx<{ sha256: string }[]>`select sha256 from raw.source_file where run_id = ${e.runId}`;
      expect(readdirSync(join(ablage, 'soll', '2026'))).toContain(`${datei!.sha256}.xml`);
    }));

  it('überspringt eine unveränderte Datei ohne doppelte Zeilen', () =>
    imRollback(async (tx) => {
      const pfad = einmaligeDatei();
      await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: pfad }));
      const zweiter = await ladeSollJahr(tx, 2026, optionen({ lokaleDatei: pfad }));
      expect(zweiter).toMatchObject({ status: 'skipped', hinweis: 'unverändert' });
      const [n] = await tx`select count(*)::int as n from raw.soll_titel where run_id = ${zweiter.runId}`;
      expect(n).toEqual({ n: 0 });
    }));

  it('reicht den ETag des letzten erfolgreichen Laufs an den Abruf weiter', () =>
    imRollback(async (tx) => {
      const etag = `"e-${randomUUID()}"`;
      const abruf = vi.fn(async (_jahr: number, _opt: AbrufOptionen): Promise<AbrufErgebnis> => neu(einmaligerInhalt(), etag));
      await ladeSollJahr(tx, 2026, optionen({ abruf }));
      abruf.mockResolvedValueOnce({ status: 'unveraendert', url: sollXmlUrl(2026) });
      const zweiter = await ladeSollJahr(tx, 2026, optionen({ abruf }));
      expect(abruf.mock.calls[1]![1]).toMatchObject({ etag });
      expect(zweiter).toMatchObject({ status: 'skipped', hinweis: 'unverändert' });
    }));

  it('überspringt nicht veröffentlichte Jahre', () =>
    imRollback(async (tx) => {
      const abruf = async (): Promise<AbrufErgebnis> => ({ status: 'nicht_vorhanden', url: sollXmlUrl(2027) });
      const e = await ladeSollJahr(tx, 2027, optionen({ abruf }));
      expect(e).toMatchObject({ status: 'skipped', hinweis: 'Datei noch nicht veröffentlicht' });
      expect(await laufStatus(tx, e.runId)).toEqual({ status: 'skipped', rows_loaded: null, error: null });
    }));

  it('stellt Dateien mit Vertragsverletzung unter Quarantäne und speichert nichts', () =>
    imRollback(async (tx) => {
      const abruf = async (): Promise<AbrufErgebnis> => neu(`<haushalt jahr="2026"><verpflichtung/></haushalt><!-- ${randomUUID()} -->`);
      const e = await ladeSollJahr(tx, 2026, optionen({ abruf }));
      expect(e.status).toBe('quarantined');
      expect(e.hinweis).toMatch(/Unbekanntes Element <verpflichtung>/);
      expect(await laufStatus(tx, e.runId)).toMatchObject({ status: 'quarantined', error: expect.stringMatching(/verpflichtung/) });
      const [n] = await tx`select count(*)::int as n from raw.source_file where run_id = ${e.runId}`;
      expect(n).toEqual({ n: 0 });
    }));

  it('stellt eine Datei mit falschem Jahr unter Quarantäne', () =>
    imRollback(async (tx) => {
      const e = await ladeSollJahr(tx, 2025, optionen({ lokaleDatei: einmaligeDatei() }));
      expect(e.status).toBe('quarantined');
      expect(e.hinweis).toMatch(/enthält Jahr 2026 statt 2025/);
    }));

  it('markiert Abruffehler als failed', () =>
    imRollback(async (tx) => {
      const abruf = async (): Promise<AbrufErgebnis> => {
        throw new Error('Abruf nach 4 Versuchen fehlgeschlagen');
      };
      const e = await ladeSollJahr(tx, 2026, optionen({ abruf }));
      expect(e).toMatchObject({ status: 'failed', hinweis: 'Abruf nach 4 Versuchen fehlgeschlagen' });
      expect(await laufStatus(tx, e.runId)).toMatchObject({ status: 'failed', error: 'Abruf nach 4 Versuchen fehlgeschlagen' });
    }));
});
