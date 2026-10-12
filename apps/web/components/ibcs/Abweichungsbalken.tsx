import { abweichungsfarbe, type Vergleich, type Wirkung } from '@/lib/ibcs/farbe';
import { betrag, einheitFuer, type Einheit } from '@/lib/ibcs/format';
import { masstab as berechneMasstab, type Masstab } from '@/lib/ibcs/skala';
import type { Titel } from '@/lib/ibcs/titel';
import { AbweichungsBalken } from './Balken';
import { Fussnoten } from './Fussnoten';
import { Titelblock } from './Titelblock';

export type AbweichungsZeile = { schluessel: string; bezeichnung: string; href?: string; wert: number | null; wirkung?: Wirkung };

/** Absolute Abweichungen um eine Nulllinie (IBCS); Farbe nach E21, immer mit Vorzeichen. */
export function Abweichungsbalken({ id, titel, zeilen, vergleich, masstab, einheit, hinweise = [] }: {
  id: string; titel: Titel; zeilen: readonly AbweichungsZeile[]; vergleich: Vergleich;
  masstab?: Masstab; einheit?: Einheit; hinweise?: readonly string[];
}) {
  const werte = zeilen.map((z) => z.wert);
  const m = masstab ?? berechneMasstab(werte);
  const e = einheit ?? einheitFuer(werte);
  return (
    <figure aria-labelledby={`${id}-titel`} className="my-4">
      <figcaption><Titelblock id={`${id}-titel`} {...titel} /></figcaption>
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead className="sr-only"><tr><th scope="col">Bezeichnung</th><th scope="col">Balken</th><th scope="col">Abweichung</th></tr></thead>
        <tbody>
          {zeilen.length === 0 && <tr><td colSpan={3} className="py-2 text-[var(--hb-gedaempft)]">Keine Daten für diese Auswahl.</td></tr>}
          {zeilen.map((z) => (
            <tr key={z.schluessel}>
              <th scope="row" className="w-2/5 py-0.5 pr-2 text-left font-normal">{z.href ? <a href={z.href}>{z.bezeichnung}</a> : z.bezeichnung}</th>
              <td className="w-2/5"><AbweichungsBalken wert={z.wert} masstab={m} farbe={abweichungsfarbe(z.wert, z.wirkung, vergleich)} /></td>
              <td className="pl-2 text-right">{betrag(z.wert, e, { vorzeichen: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Fussnoten hinweise={hinweise} />
    </figure>
  );
}
