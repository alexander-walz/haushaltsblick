import { abweichungsfarbe, FARBKLASSE, type Wirkung } from '@/lib/ibcs/farbe';
import { betrag, einheitFuer, type Einheit } from '@/lib/ibcs/format';
import { NOTATION } from '@/lib/ibcs/notation';
import { masstab, position } from '@/lib/ibcs/skala';
import type { Titel } from '@/lib/ibcs/titel';
import { Fussnoten } from './Fussnoten';
import { Titelblock } from './Titelblock';

export type Zeitpunkt = {
  jahr: number;
  soll: number | null;
  ist: number | null;
  sollSzenario: 'soll' | 'entwurf';
  haushaltsplan?: number | null;
  abweichung?: number | null;
  markierung?: string;
};

const SPALTE = 44;
const OBEN = 18;
const HOEHE = 120;
const UNTEN = 16;
const ABW = 36;
const runde = (n: number) => Math.round(n * 100) / 100;

/** Zeitreihe als Säulen (Zeit horizontal): Soll als Kontur, Ist gefüllt, Entwurf gekennzeichnet, darunter ΔPL je Jahr. */
export function ZeitreiheSaeulen({ id, titel, punkte, wirkung = 'neutral', hinweise = [], einheit }: {
  id: string; titel: Titel; punkte: readonly Zeitpunkt[]; wirkung?: Wirkung; hinweise?: readonly string[]; einheit?: Einheit;
}) {
  const werte = punkte.flatMap((p) => [p.soll, p.ist, p.haushaltsplan ?? null]);
  const m = masstab(werte);
  const e = einheit ?? einheitFuer(werte);
  const abw = punkte.map((p) => p.abweichung ?? null);
  const zeigeAbw = abw.some((w) => w !== null);
  const ma = masstab(abw);
  const breite = Math.max(punkte.length, 1) * SPALTE;
  const hoehe = OBEN + HOEHE + UNTEN + (zeigeAbw ? ABW : 0);
  const y = (w: number) => OBEN + HOEHE - position(w, m, HOEHE);
  const y0 = y(0);
  const basisAbw = OBEN + HOEHE + UNTEN;
  const ya = (w: number) => basisAbw + ABW - 4 - position(w, ma, ABW - 8);
  const ya0 = ya(0);
  return (
    <figure className="my-4">
      <figcaption><Titelblock id={`${id}-titel`} {...titel} /></figcaption>
      <svg viewBox={`0 0 ${breite} ${hoehe}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-titel`}>
        {punkte.map((p, i) => {
          const x = i * SPALTE + 8;
          const w = SPALTE - 16;
          const anzeige = p.ist ?? p.soll;
          return (
            <g key={p.jahr}>
              {p.markierung && (
                <>
                  <line x1={i * SPALTE} x2={i * SPALTE} y1={4} y2={OBEN + HOEHE} className="ibcs-trenner" />
                  <text x={i * SPALTE + 2} y={10} className="ibcs-text-gedaempft">{p.markierung}</text>
                </>
              )}
              {p.soll !== null && (
                <rect x={x} y={runde(Math.min(y(p.soll), y0))} width={w} height={runde(Math.abs(y(p.soll) - y0))}
                  className={NOTATION[p.sollSzenario].klasse} />
              )}
              {p.ist !== null && (
                <rect x={x + 4} y={runde(Math.min(y(p.ist), y0))} width={w - 8} height={runde(Math.abs(y(p.ist) - y0))} className="ibcs-ist" />
              )}
              {p.haushaltsplan !== undefined && p.haushaltsplan !== null && (
                <rect x={x - 2} y={runde(Math.min(y(p.haushaltsplan), y0))} width={w + 4} height={runde(Math.abs(y(p.haushaltsplan) - y0))}
                  className={NOTATION.haushaltsplan.klasse} />
              )}
              {anzeige !== null && (
                <text x={x + w / 2} y={runde(anzeige >= 0 ? Math.min(y(anzeige), y0) - 3 : Math.max(y(anzeige), y0) + 9)} textAnchor="middle" className="ibcs-text">
                  {betrag(anzeige, e)}
                </text>
              )}
              <text x={x + w / 2} y={OBEN + HOEHE + 11} textAnchor="middle" className="ibcs-text">
                {p.sollSzenario === 'entwurf' ? `${p.jahr} E` : p.jahr}
              </text>
              {zeigeAbw && p.abweichung !== undefined && p.abweichung !== null && (
                <>
                  <rect x={x + 4} y={runde(Math.min(ya(p.abweichung), ya0))} width={w - 8} height={runde(Math.abs(ya(p.abweichung) - ya0))}
                    className={FARBKLASSE[abweichungsfarbe(p.abweichung, wirkung, 'plan')]} />
                  <text x={x + w / 2} y={basisAbw + 6} textAnchor="middle" className="ibcs-text-gedaempft">{betrag(p.abweichung, e, { vorzeichen: true })}</text>
                </>
              )}
            </g>
          );
        })}
        <line x1={0} x2={breite} y1={runde(y0)} y2={runde(y0)} className="ibcs-achse" />
        {zeigeAbw && <line x1={0} x2={breite} y1={runde(ya0)} y2={runde(ya0)} className="ibcs-achse" />}
      </svg>
      <table className="sr-only">
        <caption>{titel.wer}: Werte je Jahr in {e.kurz}</caption>
        <thead><tr><th scope="col">Jahr</th><th scope="col">Soll</th><th scope="col">Ist</th><th scope="col">Abweichung</th></tr></thead>
        <tbody>
          {punkte.map((p) => (
            <tr key={p.jahr}>
              <th scope="row">{p.sollSzenario === 'entwurf' ? `${p.jahr} (Entwurf)` : p.jahr}</th>
              <td>{betrag(p.soll, e)}</td>
              <td>{betrag(p.ist, e)}</td>
              <td>{betrag(p.abweichung ?? null, e, { vorzeichen: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Fussnoten hinweise={hinweise} nominal />
    </figure>
  );
}
