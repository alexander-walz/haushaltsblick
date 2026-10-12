export type Masstab = { min: number; max: number };

/** Maßstab über alle Werte einer Darstellung; die Null liegt immer im Bereich (Balken beginnen an der Nulllinie). */
export function masstab(werte: readonly (number | null | undefined)[]): Masstab {
  let min = 0;
  let max = 0;
  for (const w of werte) {
    if (w === null || w === undefined || !Number.isFinite(w)) continue;
    if (w < min) min = w;
    if (w > max) max = w;
  }
  if (min === 0 && max === 0) max = 1;
  return { min, max };
}

/** Gemeinsamer Maßstab mehrerer Darstellungen gleicher Einheit (IBCS: gleiche Skalierung). */
export function vereinige(...m: readonly Masstab[]): Masstab {
  return { min: Math.min(0, ...m.map((x) => x.min)), max: Math.max(0, ...m.map((x) => x.max)) };
}

export function position(wert: number, m: Masstab, breite: number): number {
  return ((wert - m.min) / (m.max - m.min)) * breite;
}

export function balken(wert: number, m: Masstab, breite: number): { x: number; breite: number } {
  const nulllinie = position(0, m, breite);
  const ende = position(wert, m, breite);
  return { x: Math.min(nulllinie, ende), breite: Math.abs(ende - nulllinie) };
}

/** Relative Abweichungen über ±100 % werden abgeschnitten und als gekappt markiert. */
export const KAPPUNG_RELATIV = 1;

export function kappe(wert: number, grenze: number = KAPPUNG_RELATIV): { wert: number; gekappt: boolean } {
  if (wert > grenze) return { wert: grenze, gekappt: true };
  if (wert < -grenze) return { wert: -grenze, gekappt: true };
  return { wert, gekappt: false };
}
