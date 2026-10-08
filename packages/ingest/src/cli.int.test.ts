import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sollXmlUrl, type AbrufErgebnis } from './abruf/soll-xml';
import { main } from './cli';
import { imRollback } from './db/test-hilfen';
import { FIXTURE_2026 } from './xml/test-hilfen';

const ablage = mkdtempSync(join(tmpdir(), 'hb-cli-'));
const HEUTE = new Date('2026-10-08T12:00:00Z');

function einmaligeDatei(): string {
  const pfad = join(ablage, `fixture-${randomUUID()}.xml`);
  writeFileSync(pfad, `${readFileSync(FIXTURE_2026, 'utf8')}\n<!-- ${randomUUID()} -->\n`);
  return pfad;
}

describe('CLI', () => {
  it('lädt eine lokale Datei, druckt den Bericht und endet mit 0', () =>
    imRollback(async (tx) => {
      const ausgaben: string[] = [];
      const code = await main(['--', '--jahre', '2026', '--datei', einmaligeDatei()], {
        sql: tx, heute: HEUTE, ablageVerzeichnis: ablage, log: (t) => ausgaben.push(t),
      });
      expect(code).toBe(0);
      expect(ausgaben.join('\n')).toContain('| 2026 | succeeded | 8 | 0,0 | 6,5 | nein |  |');
    }));

  it('endet mit 0, wenn das Folgejahr noch nicht veröffentlicht ist', () =>
    imRollback(async (tx) => {
      process.env.INGEST_USER_AGENT = 'Haushaltsblick-Test/0.1';
      const abruf = async (): Promise<AbrufErgebnis> => ({ status: 'nicht_vorhanden', url: sollXmlUrl(2027) });
      const ausgaben: string[] = [];
      const code = await main(['--jahre', '2027'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage, abruf, log: (t) => ausgaben.push(t) });
      expect(code).toBe(0);
      expect(ausgaben.join('\n')).toContain('| 2027 | skipped |');
    }));

  it('endet mit 1 bei Quarantäne', () =>
    imRollback(async (tx) => {
      process.env.INGEST_USER_AGENT = 'Haushaltsblick-Test/0.1';
      const abruf = async (): Promise<AbrufErgebnis> => {
        const inhalt = Buffer.from(`<haushalt jahr="2026"><verpflichtung/></haushalt><!-- ${randomUUID()} -->`);
        return { status: 'neu', url: sollXmlUrl(2026), inhalt, sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'), etag: null, lastModified: null, abgerufenAm: new Date() };
      };
      const code = await main(['--jahre', '2026'], { sql: tx, heute: HEUTE, ablageVerzeichnis: ablage, abruf, log: () => {} });
      expect(code).toBe(1);
    }));

  it('erlaubt --datei nur mit genau einem Jahr', async () => {
    await expect(main(['--jahre', '2025-2026', '--datei', 'x.xml'], { heute: HEUTE })).rejects.toThrow(
      '--datei ist nur mit genau einem Jahr erlaubt',
    );
  });

  it('verlangt einen User-Agent für Abrufe aus dem Netz', async () => {
    delete process.env.INGEST_USER_AGENT;
    await expect(main(['--jahre', '2026'], { heute: HEUTE })).rejects.toThrow(/INGEST_USER_AGENT fehlt/);
  });
});
