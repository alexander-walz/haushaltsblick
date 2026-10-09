import { centZuDezimal } from '../api/crawler';
import type { SystematikErgebnis, SystematikParameter } from '../api/systematik';
import type { Sql } from './client';

export type SystematikAblage = { uri: string; sha256: string; anfragen: number };

const STUECKGROESSE = 1000;

function* stuecke<T>(werte: readonly T[], groesse: number): Generator<T[]> {
  for (let i = 0; i < werte.length; i += groesse) yield werte.slice(i, i + groesse);
}

/** Stand der Quelle (meta.timestamp der Wurzel) und Pipeline-Version des letzten erfolgreichen Laufs für Jahr, Konto und Sicht. */
export async function letzterSystematikStand(sql: Sql, p: SystematikParameter): Promise<{ quelleTimestamp: number; pipelineVersion: string } | null> {
  const [zeile] = await sql<{ quelle_timestamp: string; pipeline_version: string }[]>`
    select a.quelle_timestamp, l.pipeline_version
    from raw.api_systematik_abruf a join ops.load_run l using (run_id)
    where a.jahr = ${p.jahr} and a.konto = ${p.konto} and a.sicht = ${p.sicht} and l.status = 'succeeded'
    order by l.started_at desc, a.quelle_timestamp desc
    limit 1`;
  return zeile ? { quelleTimestamp: Number(zeile.quelle_timestamp), pipelineVersion: zeile.pipeline_version } : null;
}

/** Speichert Abruf und Einträge einer Systematik-Sicht; liefert die Anzahl der Einträge. */
export async function speichereSystematik(
  sql: Sql,
  runId: string,
  p: SystematikParameter,
  ergebnis: SystematikErgebnis,
  ablage: SystematikAblage,
): Promise<number> {
  await sql`
    insert into raw.api_systematik_abruf (run_id, jahr, konto, sicht, quelle_timestamp, anfragen, ablage_uri, sha256, warnungen)
    values (${runId}, ${p.jahr}, ${p.konto}, ${p.sicht}, ${ergebnis.quelleTimestamp}, ${ablage.anfragen},
            ${ablage.uri}, ${ablage.sha256}, ${sql.json(ergebnis.warnungen)})`;

  const eintraege = ergebnis.eintraege.map((e) => ({
    run_id: runId, jahr: p.jahr, konto: p.konto, sicht: p.sicht,
    code: e.code, ebene: e.ebene, label: e.label, betrag_eur: centZuDezimal(e.betragCent),
  }));
  for (const stueck of stuecke(eintraege, STUECKGROESSE)) await sql`insert into raw.api_systematik ${sql(stueck)}`;
  return eintraege.length;
}
