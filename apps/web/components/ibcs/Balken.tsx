import type { ReactNode } from 'react';
import { FARBKLASSE, type Abweichungsfarbe } from '@/lib/ibcs/farbe';
import { NOTATION } from '@/lib/ibcs/notation';
import { balken, kappe, position, type Masstab } from '@/lib/ibcs/skala';

const B = 100;
const H = 12;
const runde = (n: number) => Math.round(n * 1000) / 1000;

function Flaeche({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="block h-3 w-full overflow-visible" aria-hidden="true">
      {children}
    </svg>
  );
}

function Nulllinie({ masstab }: { masstab: Masstab }) {
  const x = runde(position(0, masstab, B));
  return <line x1={x} x2={x} y1={0} y2={H} className="ibcs-achse" vectorEffect="non-scaling-stroke" />;
}

/** Soll als Kontur (PL), Ist gefüllt davor (AC); beide beginnen an der Nulllinie. */
export function SzenarioBalken({ soll, ist = null, masstab, sollSzenario = 'soll' }: {
  soll: number | null; ist?: number | null; masstab: Masstab; sollSzenario?: 'soll' | 'entwurf';
}) {
  const s = soll === null ? null : balken(soll, masstab, B);
  const i = ist === null ? null : balken(ist, masstab, B);
  return (
    <Flaeche>
      {s && <rect x={runde(s.x)} y={0.75} width={runde(s.breite)} height={H - 1.5} className={NOTATION[sollSzenario].klasse} vectorEffect="non-scaling-stroke" />}
      {i && <rect x={runde(i.x)} y={3} width={runde(i.breite)} height={H - 6} className={NOTATION.ist.klasse} />}
      <Nulllinie masstab={masstab} />
    </Flaeche>
  );
}

export function AbweichungsBalken({ wert, masstab, farbe }: { wert: number | null; masstab: Masstab; farbe: Abweichungsfarbe }) {
  const a = wert === null ? null : balken(wert, masstab, B);
  return (
    <Flaeche>
      {a && <rect x={runde(a.x)} y={2} width={runde(a.breite)} height={H - 4} className={FARBKLASSE[farbe]} />}
      <Nulllinie masstab={masstab} />
    </Flaeche>
  );
}

/** Nadel für relative Abweichungen; Werte über ±100 % werden gekappt und mit hohlem Kopf markiert. */
export function Nadel({ wert, masstab, farbe }: { wert: number | null; masstab: Masstab; farbe: Abweichungsfarbe }) {
  if (wert === null) return <Flaeche><Nulllinie masstab={masstab} /></Flaeche>;
  const k = kappe(wert);
  const x0 = position(0, masstab, B);
  const x = position(k.wert, masstab, B);
  const kopf = 1.6;
  return (
    <Flaeche>
      <rect x={runde(Math.min(x0, x))} y={H / 2 - 0.6} width={runde(Math.abs(x - x0))} height={1.2} className={FARBKLASSE[farbe]} />
      <rect x={runde(x - kopf / 2)} y={H / 2 - 3} width={kopf} height={6} className={k.gekappt ? 'ibcs-gekappt' : FARBKLASSE[farbe]} vectorEffect="non-scaling-stroke" />
      <Nulllinie masstab={masstab} />
    </Flaeche>
  );
}
