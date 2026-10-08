import type { SollKapitel, SollTitel, SollZeile } from '../xml/typen';
import type { Sql } from './client';

export type Trigger = 'schedule' | 'manual' | 'ci';
export type LaufStatus = 'succeeded' | 'failed' | 'quarantined' | 'skipped';

export type LaufStart = {
  sourceId: string;
  trigger: Trigger;
  gitSha: string;
  pipelineVersion: string;
  params: Record<string, string | number | null>;
};

export type QuellDatei = {
  runId: string;
  sourceId: string;
  jahr: number;
  url: string;
  etag: string | null;
  lastModified: string | null;
  abgerufenAm: Date;
  sha256: string;
  byteSize: number;
  ablageUri: string;
};

const STUECKGROESSE = 1000;

function* stuecke<T>(werte: readonly T[], groesse: number): Generator<T[]> {
  for (let i = 0; i < werte.length; i += groesse) yield werte.slice(i, i + groesse);
}

export async function starteLauf(sql: Sql, l: LaufStart): Promise<string> {
  const [lauf] = await sql<{ run_id: string }[]>`
    insert into ops.load_run (source_id, trigger, git_sha, pipeline_version, params)
    values (${l.sourceId}, ${l.trigger}, ${l.gitSha}, ${l.pipelineVersion}, ${sql.json(l.params)})
    returning run_id`;
  return lauf!.run_id;
}

export async function beendeLauf(
  sql: Sql,
  runId: string,
  e: { status: LaufStatus; rowsLoaded?: number; fehler?: string },
): Promise<void> {
  await sql`
    update ops.load_run
    set status = ${e.status}, finished_at = now(), rows_loaded = ${e.rowsLoaded ?? null}, error = ${e.fehler ?? null}
    where run_id = ${runId}`;
}

export async function letzteSollDatei(sql: Sql, jahr: number): Promise<{ sha256: string; etag: string | null } | null> {
  const [datei] = await sql<{ sha256: string; http_etag: string | null }[]>`
    select f.sha256, f.http_etag
    from raw.source_file f join ops.load_run l using (run_id)
    where f.source_id = 'SRC_SOLL_XML' and f.jahr = ${jahr} and l.status = 'succeeded'
    order by f.fetched_at desc
    limit 1`;
  return datei ? { sha256: datei.sha256, etag: datei.http_etag } : null;
}

export async function speichereQuellDatei(sql: Sql, d: QuellDatei): Promise<void> {
  await sql`
    insert into raw.source_file
      (run_id, source_id, jahr, source_url, http_etag, last_modified, fetched_at, sha256, byte_size, ablage_uri)
    values
      (${d.runId}, ${d.sourceId}, ${d.jahr}, ${d.url}, ${d.etag}, ${d.lastModified}, ${d.abgerufenAm},
       ${d.sha256}, ${d.byteSize}, ${d.ablageUri})`;
}

export async function speichereSollZeilen(
  sql: Sql,
  runId: string,
  zeilen: readonly SollZeile[],
): Promise<{ titel: number; kapitel: number }> {
  const kapitel = zeilen
    .filter((z): z is SollKapitel => z.art === 'kapitel')
    .map((k) => ({
      run_id: runId,
      jahr: k.jahr,
      einzelplan_nr: k.einzelplanNr,
      einzelplan_text: k.einzelplanText,
      kapitel_nr: k.kapitelNr,
      kapitel_text: k.kapitelText,
      anlage_zu_kapitel_nr: k.anlageZuKapitelNr,
      anzahl_titel: k.anzahlTitel,
      entfallen: k.entfallen,
      xml_pfad: k.xmlPfad,
    }));
  const titel = zeilen
    .filter((z): z is SollTitel => z.art === 'titel')
    .map((t) => ({
      run_id: runId,
      jahr: t.jahr,
      einzelplan_nr: t.einzelplanNr,
      einzelplan_text: t.einzelplanText,
      kapitel_nr: t.kapitelNr,
      kapitel_text: t.kapitelText,
      anlage_zu_kapitel_nr: t.anlageZuKapitelNr,
      konto: t.konto,
      konto_block: t.kontoBlock,
      ausgabeart_text: t.ausgabeartText,
      titelgruppe_nr: t.titelgruppeNr,
      titelgruppe_text: t.titelgruppeText,
      titel_nr: t.titelNr,
      titel_text: t.titelText,
      flexibilisiert: t.flexibilisiert,
      fkt: t.fkt,
      seite: t.seite,
      soll_tsd_eur: t.sollTsdEur,
      xml_pfad: t.xmlPfad,
      zeilen_hash: t.zeilenHash,
    }));

  for (const stueck of stuecke(kapitel, STUECKGROESSE)) await sql`insert into raw.soll_kapitel ${sql(stueck)}`;
  for (const stueck of stuecke(titel, STUECKGROESSE)) await sql`insert into raw.soll_titel ${sql(stueck)}`;
  return { titel: titel.length, kapitel: kapitel.length };
}
