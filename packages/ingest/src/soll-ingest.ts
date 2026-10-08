import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { holeSollXml, sha256Hex, type AbrufErgebnis } from './abruf/soll-xml';
import { inTransaktion, type Sql } from './db/client';
import {
  beendeLauf, letzteSollDatei, speichereQuellDatei, speichereSollZeilen, starteLauf,
  type LaufStatus, type Trigger,
} from './db/lade-soll';
import { parseSollXml } from './xml/parse-soll';
import { XmlVertragsFehler, type SollZeile } from './xml/typen';
import { fasseSollZusammen, type SollZusammenfassung } from './xml/zusammenfassung';

export type SollIngestOptionen = {
  trigger: Trigger;
  gitSha: string;
  pipelineVersion: string;
  userAgent: string;
  ablageVerzeichnis: string;
  lokaleDatei?: string;
  abruf?: typeof holeSollXml;
};

export type JahresErgebnis = {
  jahr: number;
  runId: string;
  status: LaufStatus;
  zusammenfassung?: SollZusammenfassung;
  hinweis?: string;
};

type NeueDatei = Extract<AbrufErgebnis, { status: 'neu' }>;

async function leseLokaleDatei(pfad: string): Promise<NeueDatei> {
  const inhalt = await readFile(pfad);
  return {
    status: 'neu',
    url: pathToFileURL(resolve(pfad)).href,
    inhalt,
    sha256: sha256Hex(inhalt),
    etag: null,
    lastModified: null,
    abgerufenAm: new Date(),
  };
}

async function legeAb(verzeichnis: string, jahr: number, datei: NeueDatei): Promise<string> {
  const ordner = join(verzeichnis, 'soll', String(jahr));
  await mkdir(ordner, { recursive: true });
  const pfad = join(ordner, `${datei.sha256}.xml`);
  await writeFile(pfad, datei.inhalt);
  return pathToFileURL(pfad).href;
}

/** Ein Ladelauf für ein Haushaltsjahr: abrufen, ablegen, parsen, prüfen, atomar speichern, protokollieren. */
export async function ladeSollJahr(sql: Sql, jahr: number, opt: SollIngestOptionen): Promise<JahresErgebnis> {
  const runId = await starteLauf(sql, {
    sourceId: 'SRC_SOLL_XML',
    trigger: opt.trigger,
    gitSha: opt.gitSha,
    pipelineVersion: opt.pipelineVersion,
    params: { jahr, datei: opt.lokaleDatei ?? null },
  });

  const ende = async (
    status: LaufStatus,
    extra: { hinweis?: string; zusammenfassung?: SollZusammenfassung; rowsLoaded?: number } = {},
  ): Promise<JahresErgebnis> => {
    const fehler = status === 'failed' || status === 'quarantined' ? extra.hinweis : undefined;
    await beendeLauf(sql, runId, { status, rowsLoaded: extra.rowsLoaded, fehler });
    return { jahr, runId, status, zusammenfassung: extra.zusammenfassung, hinweis: extra.hinweis };
  };

  try {
    const vorher = await letzteSollDatei(sql, jahr);
    const abruf = opt.lokaleDatei
      ? await leseLokaleDatei(opt.lokaleDatei)
      : await (opt.abruf ?? holeSollXml)(jahr, { userAgent: opt.userAgent, etag: vorher?.etag ?? null });

    if (abruf.status === 'nicht_vorhanden') return await ende('skipped', { hinweis: 'Datei noch nicht veröffentlicht' });
    if (abruf.status === 'unveraendert' || abruf.sha256 === vorher?.sha256) {
      return await ende('skipped', { hinweis: 'unverändert' });
    }

    const ablageUri = await legeAb(opt.ablageVerzeichnis, jahr, abruf);
    const zeilen: SollZeile[] = [];
    for await (const zeile of parseSollXml([abruf.inhalt.toString('utf8')])) zeilen.push(zeile);
    const zusammenfassung = fasseSollZusammen(zeilen);
    if (zusammenfassung.jahr !== jahr) {
      throw new XmlVertragsFehler(`Datei enthält Jahr ${zusammenfassung.jahr} statt ${jahr}`, '/haushalt');
    }

    const anzahl = await inTransaktion(sql, async (tx) => {
      await speichereQuellDatei(tx, {
        runId,
        sourceId: 'SRC_SOLL_XML',
        jahr,
        url: abruf.url,
        etag: abruf.etag,
        lastModified: abruf.lastModified,
        abgerufenAm: abruf.abgerufenAm,
        sha256: abruf.sha256,
        byteSize: abruf.inhalt.byteLength,
        ablageUri,
      });
      return speichereSollZeilen(tx, runId, zeilen);
    });
    return await ende('succeeded', { rowsLoaded: anzahl.titel, zusammenfassung });
  } catch (e) {
    const status: LaufStatus = e instanceof XmlVertragsFehler ? 'quarantined' : 'failed';
    return await ende(status, { hinweis: e instanceof Error ? e.message : String(e) });
  }
}
