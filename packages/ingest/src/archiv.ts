import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { sha256Hex } from './abruf/http';

export type ArchivOptionen = { verzeichnis: string; basisUrl?: string };
export type ArchivEintrag = { dateiname: string; pfad: string; uri: string; sha256: string; bytes: number };

export const STANDARD_ARCHIV_VERZEICHNIS = fileURLToPath(new URL('../../../data/raw/archiv', import.meta.url));

const NAME = /^[a-z0-9][a-z0-9._-]*$/;

/** Legt Rohdaten gzip-komprimiert ab. Der Hash bezieht sich auf den unkomprimierten Inhalt. */
export async function archiviere(opt: ArchivOptionen, name: string, inhalt: Buffer): Promise<ArchivEintrag> {
  if (!NAME.test(name) || name.includes('..')) throw new Error(`Ungültiger Archivname: ${name}`);
  const dateiname = `${name}.gz`;
  await mkdir(opt.verzeichnis, { recursive: true });
  const pfad = join(opt.verzeichnis, dateiname);
  const komprimiert = gzipSync(inhalt, { level: 9 });
  await writeFile(pfad, komprimiert);
  const uri = opt.basisUrl ? `${opt.basisUrl.replace(/\/+$/, '')}/${dateiname}` : `data/raw/archiv/${dateiname}`;
  return { dateiname, pfad, uri, sha256: sha256Hex(inhalt), bytes: komprimiert.byteLength };
}
