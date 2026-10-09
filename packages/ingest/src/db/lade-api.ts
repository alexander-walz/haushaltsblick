import { centZuDezimal, type ApiParameter, type CrawlErgebnis } from '../api/crawler';
import type { Sql } from './client';

export type ApiAblage = { uri: string; sha256: string; anfragen: number };

const STUECKGROESSE = 1000;

function* stuecke<T>(werte: readonly T[], groesse: number): Generator<T[]> {
  for (let i = 0; i < werte.length; i += groesse) yield werte.slice(i, i + groesse);
}

/** Stand der Quelle (meta.timestamp der Wurzel) des letzten erfolgreichen Laufs für Jahr, Konto und Quote. */
export async function letzterApiStand(sql: Sql, p: ApiParameter): Promise<{ quelleTimestamp: number } | null> {
  const [zeile] = await sql<{ quelle_timestamp: string }[]>`
    select a.quelle_timestamp
    from raw.api_abruf a join ops.load_run l using (run_id)
    where a.jahr = ${p.jahr} and a.konto = ${p.konto} and a.quote = ${p.quote} and l.status = 'succeeded'
    order by l.started_at desc, a.quelle_timestamp desc
    limit 1`;
  return zeile ? { quelleTimestamp: Number(zeile.quelle_timestamp) } : null;
}

export async function speichereApiCrawl(
  sql: Sql,
  runId: string,
  p: ApiParameter,
  crawl: CrawlErgebnis,
  ablage: ApiAblage,
): Promise<{ titel: number; knoten: number }> {
  await sql`
    insert into raw.api_abruf (run_id, jahr, konto, quote, quelle_timestamp, modify_date, anfragen, ablage_uri, sha256, warnungen)
    values (${runId}, ${p.jahr}, ${p.konto}, ${p.quote}, ${crawl.quelleTimestamp}, ${crawl.modifyDate}, ${ablage.anfragen},
            ${ablage.uri}, ${ablage.sha256}, ${sql.json(crawl.warnungen)})`;

  const basis = { run_id: runId, jahr: p.jahr, konto: p.konto, quote: p.quote };
  const knoten = crawl.knoten.map((k) => ({ ...basis, ebene: k.ebene, knoten_id: k.knotenId, label: k.label, betrag_eur: centZuDezimal(k.betragCent) }));
  const titel = crawl.titel.map((t) => ({
    ...basis,
    einzelplan_nr: t.einzelplanNr,
    kapitel_nr: t.kapitelNr,
    titel_nr: t.titelNr,
    fkt: t.fkt,
    label: t.label,
    betrag_eur: centZuDezimal(t.betragCent),
  }));
  for (const stueck of stuecke(knoten, STUECKGROESSE)) await sql`insert into raw.api_knoten ${sql(stueck)}`;
  for (const stueck of stuecke(titel, STUECKGROESSE)) await sql`insert into raw.api_titel ${sql(stueck)}`;
  return { titel: titel.length, knoten: knoten.length };
}
