import { betrag, einheitFuer, type Einheit } from '@/lib/ibcs/format';
import { masstab as berechneMasstab, type Masstab } from '@/lib/ibcs/skala';
import type { Titel } from '@/lib/ibcs/titel';
import { SzenarioBalken } from './Balken';
import { Fussnoten } from './Fussnoten';
import { Titelblock } from './Titelblock';

export type StrukturZeile = {
  schluessel: string;
  bezeichnung: string;
  href?: string;
  soll: number | null;
  ist?: number | null;
  delta?: number | null;
  sollSzenario?: 'soll' | 'entwurf';
};

/** Sortierte horizontale Balken (IBCS Strukturanalyse), zugleich als zugängliche Tabelle. */
export function Strukturbalken({ id, titel, zeilen, masstab, einheit, deltaBeschriftung, hinweise = [], nominal = false, weitere, eigenerMasstab = false }: {
  id: string;
  titel: Titel;
  zeilen: readonly StrukturZeile[];
  masstab?: Masstab;
  einheit?: Einheit;
  deltaBeschriftung?: string;
  hinweise?: readonly string[];
  nominal?: boolean;
  weitere?: { anzahl: number; href: string };
  eigenerMasstab?: boolean;
}) {
  const werte = zeilen.flatMap((z) => [z.soll, z.ist ?? null]);
  const m = masstab ?? berechneMasstab(werte);
  const e = einheit ?? einheitFuer(werte);
  const zeigeIst = zeilen.some((z) => z.ist !== undefined && z.ist !== null);
  const zeigeDelta = deltaBeschriftung !== undefined;
  const spalten = 3 + (zeigeIst ? 1 : 0) + (zeigeDelta ? 1 : 0);
  return (
    <figure aria-labelledby={`${id}-titel`} className="my-4">
      <figcaption><Titelblock id={`${id}-titel`} {...titel} eigenerMasstab={eigenerMasstab} /></figcaption>
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead className="sr-only">
          <tr>
            <th scope="col">Bezeichnung</th>
            <th scope="col">Balken</th>
            {zeigeIst && <th scope="col">Ist</th>}
            <th scope="col">Soll</th>
            {zeigeDelta && <th scope="col">{deltaBeschriftung}</th>}
          </tr>
        </thead>
        <tbody>
          {zeilen.length === 0 && <tr><td colSpan={spalten} className="py-2 text-[var(--hb-gedaempft)]">Keine Daten für diese Auswahl.</td></tr>}
          {zeilen.map((z) => (
            <tr key={z.schluessel} className="align-middle">
              <th scope="row" className="w-2/5 py-0.5 pr-2 text-left font-normal">
                {z.href ? <a href={z.href}>{z.bezeichnung}</a> : z.bezeichnung}
              </th>
              <td className="w-2/5"><SzenarioBalken soll={z.soll} ist={z.ist ?? null} masstab={m} sollSzenario={z.sollSzenario} /></td>
              {zeigeIst && <td className="pl-2 text-right">{betrag(z.ist, e)}</td>}
              <td className="pl-2 text-right">{betrag(z.soll, e)}</td>
              {zeigeDelta && <td className="pl-2 text-right text-[var(--hb-gedaempft)]">{betrag(z.delta ?? null, e, { vorzeichen: true })}</td>}
            </tr>
          ))}
          {weitere && weitere.anzahl > 0 && (
            <tr><td colSpan={spalten} className="pt-1 text-sm"><a href={weitere.href}>… {weitere.anzahl} weitere</a></td></tr>
          )}
        </tbody>
      </table>
      <Fussnoten hinweise={hinweise} nominal={nominal} />
    </figure>
  );
}
