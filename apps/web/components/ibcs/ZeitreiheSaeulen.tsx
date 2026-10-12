import { abweichungsfarbe, FARBKLASSE, hatWirkungsfarbe, type Wirkung } from '@/lib/ibcs/farbe';
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
const OBEN = 30;
const HOEHE = 120;
const UNTEN = 28;
const ABW = 36;
const ABWTEXT = 12;
const RAND = 24;
const runde = (n: number) => Math.round(n * 100) / 100;

/** Zeitreihe als Säulen (Zeit horizontal): Soll als Kontur, Ist gefüllt, Entwurf gekennzeichnet, darunter ΔPL je Jahr. */
export function ZeitreiheSaeulen({ id, titel, punkte, wirkung = 'neutral', hinweise = [], einheit, eigenerMasstab = false }: {
  id: string; titel: Titel; punkte: readonly Zeitpunkt[]; wirkung?: Wirkung; hinweise?: readonly string[]; einheit?: Einheit; eigenerMasstab?: boolean;
}) {
  const werte = punkte.flatMap((p) => [p.soll, p.ist, p.haushaltsplan ?? null]);
  const m = masstab(werte);
  const e = einheit ?? einheitFuer(werte);
  const abw = punkte.map((p) => p.abweichung ?? null);
  const zeigePlan = punkte.some((p) => p.haushaltsplan !== undefined && p.haushaltsplan !== null);
  const zeigeAbw = abw.some((w) => w !== null);
  const ma = masstab(abw);
  const breite = Math.max(punkte.length, 1) * SPALTE;
  const hoehe = OBEN + HOEHE + UNTEN + (zeigeAbw ? ABW + ABWTEXT : 0);
  const y = (w: number) => OBEN + HOEHE - position(w, m, HOEHE);
  const y0 = y(0);
  const basisAbw = OBEN + HOEHE + UNTEN;
  const ya = (w: number) => basisAbw + ABW - 4 - position(w, ma, ABW - 8);
  const ya0 = ya(0);
  return (
    <figure className="my-4">
      <figcaption><Titelblock id={`${id}-titel`} {...titel} eigenerMasstab={eigenerMasstab} /></figcaption>
      <svg viewBox={`${zeigeAbw ? -RAND : 0} 0 ${breite + (zeigeAbw ? RAND : 0)} ${hoehe}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-titel`}>
        {punkte.map((p, i) => {
          const x = i * SPALTE + 8;
          const w = SPALTE - 16;
          const anzeige = p.ist ?? p.soll;
          const gezeichnet = [p.soll, p.ist, p.haushaltsplan ?? null].filter((v): v is number => v !== null).map(y);
          const rechts = i >= punkte.length / 2;
          return (
            <g key={p.jahr}>
              {p.markierung && (
                <>
                  <line x1={i * SPALTE} x2={i * SPALTE} y1={12} y2={OBEN + HOEHE} className="ibcs-trenner" />
                  <text x={rechts ? i * SPALTE - 2 : i * SPALTE + 2} y={9} textAnchor={rechts ? 'end' : 'start'} className="ibcs-text-gedaempft">{p.markierung}</text>
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
                <text x={x + w / 2} y={runde(anzeige >= 0 ? Math.min(...gezeichnet, y0) - 3 : Math.max(...gezeichnet, y0) + 9)} textAnchor="middle" className="ibcs-text">
                  {betrag(anzeige, e)}
                </text>
              )}
              <text x={x + w / 2} y={OBEN + HOEHE + UNTEN - 4} textAnchor="middle" className="ibcs-text">
                {p.sollSzenario === 'entwurf' ? `${p.jahr} E` : p.jahr}
              </text>
              {zeigeAbw && p.abweichung !== undefined && p.abweichung !== null && (
                <>
                  <rect x={x + 4} y={runde(Math.min(ya(p.abweichung), ya0))} width={w - 8} height={runde(Math.abs(ya(p.abweichung) - ya0))}
                    className={FARBKLASSE[abweichungsfarbe(p.abweichung, wirkung, 'plan')]} />
                  <text x={x + w / 2} y={basisAbw + ABW + 9} textAnchor="middle" className="ibcs-text-gedaempft">{betrag(p.abweichung, e, { vorzeichen: true })}</text>
                </>
              )}
            </g>
          );
        })}
        <line x1={0} x2={breite} y1={runde(y0)} y2={runde(y0)} className="ibcs-achse" />
        {zeigeAbw && <line x1={0} x2={breite} y1={runde(ya0)} y2={runde(ya0)} className="ibcs-achse" />}
        {zeigeAbw && <text x={-RAND + 2} y={runde(ya0) + 3} className="ibcs-text-gedaempft">ΔPL</text>}
      </svg>
      <table className="sr-only">
        <caption>{titel.wer}: Werte je Jahr in {e.kurz}</caption>
        <thead><tr><th scope="col">Jahr</th><th scope="col">Soll</th><th scope="col">Ist</th>{zeigePlan && <th scope="col">Haushaltsplan (XML)</th>}<th scope="col">Abweichung</th></tr></thead>
        <tbody>
          {punkte.map((p) => (
            <tr key={p.jahr}>
              <th scope="row">{[p.sollSzenario === 'entwurf' ? `${p.jahr} (Entwurf)` : String(p.jahr), p.markierung ? `(${p.markierung})` : ''].filter(Boolean).join(' ')}</th>
              <td>{betrag(p.soll, e)}</td>
              <td>{betrag(p.ist, e)}</td>
              {zeigePlan && <td>{betrag(p.haushaltsplan ?? null, e)}</td>}
              <td>{betrag(p.abweichung ?? null, e, { vorzeichen: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Fussnoten hinweise={hinweise} nominal farbregel={hatWirkungsfarbe(abw.map((wert) => ({ wert, wirkung })), 'plan')} />
    </figure>
  );
}
