import type { Sql } from '../db/client';
import { speichereDqLauf, veroeffentlicheVersion } from '../db/veroeffentlichung';

/** Eine Titelzeile für Tests der Abfragefunktionen; Einzelplan, Kapitel und Titelnummer folgen aus titelKey. */
export type TestTitel = {
  jahr: number;
  titelKey: string;
  soll: number;
  konto?: 'ausgaben' | 'einnahmen';
  /** Fehlt ist, gilt das Jahr als ohne Ist (ist_verfuegbar = false). */
  ist?: number;
  sollXml?: number;
  sollQuelle?: 'api' | 'xml';
  titelText?: string;
  einzelplanText?: string;
  kapitelText?: string;
  fkt?: string;
  funktionText?: string;
  haushaltsstand?: string;
  seite?: number;
};

/** Leert Mart und Historie in der laufenden Test-Transaktion; keine Version ist mehr aktuell. */
export async function leereMart(tx: Sql): Promise<void> {
  await tx`delete from mart.fct_titel_jahr_hist`;
  await tx`update ops.dataset_version set is_current = false`;
  await tx`delete from mart.fct_titel_jahr`;
}

/** Ersetzt mart.fct_titel_jahr durch die Titel und veröffentlicht sie als neue Datenversion (Ampel grün). */
export async function veroeffentlicheTitel(tx: Sql, titel: readonly TestTitel[]): Promise<number> {
  await tx`delete from mart.fct_titel_jahr`;
  for (const t of titel) {
    const quelle = t.sollQuelle ?? 'api';
    const istVerfuegbar = t.ist !== undefined;
    const titelNr = t.titelKey.slice(4);
    const fkt = t.fkt ?? '011';
    const abweichung = quelle === 'api' && t.ist !== undefined ? t.ist - t.soll : null;
    const istQuote = quelle === 'api' && t.ist !== undefined && t.soll !== 0 ? Math.round((t.ist / t.soll) * 1e6) / 1e6 : null;
    await tx`
      insert into mart.fct_titel_jahr (
        jahr, konto, titel_key, einzelplan_nr, einzelplan_text, kapitel_nr, kapitel_text, titel_nr, titel_text,
        fkt, funktion_text, oberfunktion, hauptfunktion, gruppierung_nr, obergruppe, hauptgruppe,
        soll_eur, soll_quelle, soll_xml_eur, ist_eur, ist_verfuegbar, abweichung_eur, ist_quote,
        haushaltsstand, seite, im_haushaltsplan_xml, zeilen_hash)
      values (
        ${t.jahr}, ${t.konto ?? 'ausgaben'}, ${t.titelKey},
        ${t.titelKey.slice(0, 2)}, ${t.einzelplanText ?? `Einzelplan ${t.titelKey.slice(0, 2)}`},
        ${t.titelKey.slice(0, 4)}, ${t.kapitelText ?? `Kapitel ${t.titelKey.slice(0, 4)}`},
        ${titelNr}, ${t.titelText ?? `Titel ${t.titelKey}`},
        ${fkt}, ${t.funktionText ?? null}, ${fkt.slice(0, 2)}, ${fkt.slice(0, 1)},
        ${titelNr.slice(0, 3)}, ${titelNr.slice(0, 2)}, ${titelNr.slice(0, 1)},
        ${t.soll}, ${quelle}, ${t.sollXml ?? (quelle === 'xml' ? t.soll : null)},
        ${t.ist ?? null}, ${istVerfuegbar}, ${abweichung}, ${istQuote},
        ${t.haushaltsstand ?? 'Gesetz'}, ${t.seite ?? null}, true, ${JSON.stringify(t)})`;
  }
  const dqLaufId = await speichereDqLauf(tx, { gitSha: 'test', manifestSha: 'test', ampel: 'green', score: 100 }, []);
  return (await veroeffentlicheVersion(tx, dqLaufId)).versionId;
}
