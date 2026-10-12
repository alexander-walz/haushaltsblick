import { abweichungsfarbe, hatWirkungsfarbe, type Vergleich } from '@/lib/ibcs/farbe';
import { prozent } from '@/lib/ibcs/format';
import { kappe, masstab as berechneMasstab } from '@/lib/ibcs/skala';
import type { Titel } from '@/lib/ibcs/titel';
import type { AbweichungsZeile } from './Abweichungsbalken';
import { Nadel } from './Balken';
import { Fussnoten } from './Fussnoten';
import { Titelblock } from './Titelblock';

/** Relative Abweichungen als Nadeln (IBCS-Pins); Werte über ±100 % werden gekappt und erklärt. */
export function Nadeln({ id, titel, zeilen, vergleich, hinweise = [] }: {
  id: string; titel: Titel; zeilen: readonly AbweichungsZeile[]; vergleich: Vergleich; hinweise?: readonly string[];
}) {
  const m = berechneMasstab(zeilen.map((z) => (z.wert === null ? null : kappe(z.wert).wert)));
  const gekappt = zeilen.some((z) => z.wert !== null && kappe(z.wert).gekappt);
  const alleHinweise = gekappt ? [...hinweise, 'Abweichungen über 100 % sind abgeschnitten (hohler Kopf).'] : hinweise;
  return (
    <figure aria-labelledby={`${id}-titel`} className="my-4">
      <figcaption><Titelblock id={`${id}-titel`} {...titel} /></figcaption>
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead className="sr-only"><tr><th scope="col">Bezeichnung</th><th scope="col">Nadel</th><th scope="col">Abweichung in Prozent</th></tr></thead>
        <tbody>
          {zeilen.length === 0 && <tr><td colSpan={3} className="py-2 text-[var(--hb-gedaempft)]">Keine Daten für diese Auswahl.</td></tr>}
          {zeilen.map((z) => (
            <tr key={z.schluessel}>
              <th scope="row" className="w-2/5 py-0.5 pr-2 text-left font-normal">{z.href ? <a href={z.href}>{z.bezeichnung}</a> : z.bezeichnung}</th>
              <td className="w-2/5"><Nadel wert={z.wert} masstab={m} farbe={abweichungsfarbe(z.wert, z.wirkung, vergleich)} /></td>
              <td className="pl-2 text-right">{prozent(z.wert, { vorzeichen: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Fussnoten hinweise={alleHinweise} farbregel={hatWirkungsfarbe(zeilen, vergleich)} />
    </figure>
  );
}
