import { abweichungsfarbe, type Wirkung } from '@/lib/ibcs/farbe';
import { betrag, einheitFuer, prozent, type Einheit } from '@/lib/ibcs/format';
import { masstab } from '@/lib/ibcs/skala';
import type { Titel } from '@/lib/ibcs/titel';
import { AbweichungsBalken, SzenarioBalken } from './Balken';
import { Fussnoten } from './Fussnoten';
import { Titelblock } from './Titelblock';

export type TabellenZeile = {
  schluessel: string;
  bezeichnung: string;
  href?: string;
  soll: number | null;
  ist?: number | null;
  abweichung?: number | null;
  abweichungRel?: number | null;
  deltaVj?: number | null;
  anteil?: number | null;
  wirkung?: Wirkung;
  sollSzenario?: 'soll' | 'entwurf';
};

const NEBEN = 'hidden sm:table-cell';
const ZAHL = 'px-2 py-1 text-right whitespace-nowrap';

/** IBCS-Tabelle mit eingebetteten Szenario- und Abweichungsbalken (Spec 5.5). */
export function IbcsTabelle({ id, titel, modus, zeilen, summe, einheit, hinweise = [], nominal = false }: {
  id: string; titel: Titel; modus: 'plan_ist' | 'soll'; zeilen: readonly TabellenZeile[]; summe?: TabellenZeile;
  einheit?: Einheit; hinweise?: readonly string[]; nominal?: boolean;
}) {
  const e = einheit ?? einheitFuer(zeilen.flatMap((z) => [z.soll, z.ist ?? null]));
  const mS = masstab(zeilen.flatMap((z) => [z.soll, z.ist ?? null]));
  const mA = masstab(zeilen.map((z) => z.abweichung ?? null));
  const planIst = modus === 'plan_ist';
  const spalten = planIst ? 7 : 5;

  const zellen = (z: TabellenZeile, summenzeile: boolean) => (
    <>
      <th scope="row" className="sticky left-0 bg-[var(--hb-bg)] py-1 pr-2 text-left font-normal">
        {z.href && !summenzeile ? <a href={z.href}>{z.bezeichnung}</a> : z.bezeichnung}
      </th>
      <td className={ZAHL}>{betrag(z.soll, e)}</td>
      {planIst && <td className={ZAHL}>{betrag(z.ist ?? null, e)}</td>}
      <td className="w-1/5 min-w-24 px-2">
        {!summenzeile && <SzenarioBalken soll={z.soll} ist={planIst ? z.ist ?? null : null} masstab={mS} sollSzenario={z.sollSzenario} />}
      </td>
      {planIst ? (
        <>
          <td className={`${NEBEN} w-1/6 min-w-20 px-2`}>
            {!summenzeile && <AbweichungsBalken wert={z.abweichung ?? null} masstab={mA} farbe={abweichungsfarbe(z.abweichung, z.wirkung, 'plan')} />}
          </td>
          <td className={ZAHL}>{betrag(z.abweichung ?? null, e, { vorzeichen: true })}</td>
          <td className={`${NEBEN} ${ZAHL}`}>{prozent(z.abweichungRel ?? null, { vorzeichen: true })}</td>
        </>
      ) : (
        <>
          <td className={`${ZAHL} text-[var(--hb-gedaempft)]`}>{betrag(z.deltaVj ?? null, e, { vorzeichen: true })}</td>
          <td className={`${NEBEN} ${ZAHL}`}>{prozent(z.anteil ?? null)}</td>
        </>
      )}
    </>
  );

  return (
    <figure aria-labelledby={`${id}-titel`} className="my-4">
      <figcaption><Titelblock id={`${id}-titel`} {...titel} /></figcaption>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="border-b-2 border-[var(--hb-ink)] text-xs">
              <th scope="col" className="sticky left-0 bg-[var(--hb-bg)] py-1 pr-2 text-left font-semibold">Bezeichnung</th>
              <th scope="col" className={ZAHL}>Soll</th>
              {planIst && <th scope="col" className={ZAHL}>Ist</th>}
              <th scope="col" className="px-2 text-left font-semibold">{planIst ? 'Ist / Soll' : 'Soll (Balken)'}</th>
              {planIst ? (
                <>
                  <th scope="col" className={`${NEBEN} px-2 text-left font-semibold`}>ΔPL (Balken)</th>
                  <th scope="col" className={ZAHL}>ΔPL</th>
                  <th scope="col" className={`${NEBEN} ${ZAHL}`}>ΔPL %</th>
                </>
              ) : (
                <>
                  <th scope="col" className={ZAHL}>Δ Soll Vorjahr</th>
                  <th scope="col" className={`${NEBEN} ${ZAHL}`}>Anteil</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && <tr><td colSpan={spalten} className="py-2 text-[var(--hb-gedaempft)]">Keine Daten für diese Auswahl.</td></tr>}
            {zeilen.map((z) => <tr key={z.schluessel} className="border-b border-[var(--hb-linie)]">{zellen(z, false)}</tr>)}
          </tbody>
          {summe && <tfoot><tr className="border-t-2 border-[var(--hb-ink)] font-semibold">{zellen(summe, true)}</tr></tfoot>}
        </table>
      </div>
      <Fussnoten hinweise={hinweise} nominal={nominal} />
    </figure>
  );
}
