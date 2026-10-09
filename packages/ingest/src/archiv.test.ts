import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './abruf/http';
import { archiviere } from './archiv';

const verzeichnis = () => mkdtempSync(join(tmpdir(), 'hb-archiv-'));

describe('archiviere', () => {
  it('schreibt komprimiert und liefert Hash des Originals und eine repo-relative URI', async () => {
    const v = verzeichnis();
    const e = await archiviere({ verzeichnis: v }, 'soll_2026_abc.xml', Buffer.from('<haushalt/>'));
    expect(e.dateiname).toBe('soll_2026_abc.xml.gz');
    expect(e.uri).toBe('data/raw/archiv/soll_2026_abc.xml.gz');
    expect(e.sha256).toBe(sha256Hex('<haushalt/>'));
    expect(gunzipSync(readFileSync(e.pfad)).toString('utf8')).toBe('<haushalt/>');
    expect(e.bytes).toBe(readFileSync(e.pfad).byteLength);
  });

  it('bildet mit Basis-URL die Download-Adresse des Releases', async () => {
    const e = await archiviere(
      { verzeichnis: verzeichnis(), basisUrl: 'https://github.com/alexander-walz/haushaltsblick/releases/download/rohdaten/' },
      'api_ist_2024_ausgaben_1752216181000.ndjson',
      Buffer.from('{}\n'),
    );
    expect(e.uri).toBe('https://github.com/alexander-walz/haushaltsblick/releases/download/rohdaten/api_ist_2024_ausgaben_1752216181000.ndjson.gz');
  });

  it.each(['../x', 'Soll.xml', '', 'a/b'])('lehnt den Namen "%s" ab', async (name) => {
    await expect(archiviere({ verzeichnis: verzeichnis() }, name, Buffer.from('x'))).rejects.toThrow('Ungültiger Archivname');
  });
});
