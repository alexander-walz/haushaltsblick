export type Wirkung = 'anstieg_positiv' | 'anstieg_negativ' | 'neutral';
export type Vergleich = 'plan' | 'vorjahr';
export type Abweichungsfarbe = 'positiv' | 'negativ' | 'neutral';

export const FARBKLASSE: Record<Abweichungsfarbe, string> = { positiv: 'ibcs-pos', negativ: 'ibcs-neg', neutral: 'ibcs-neutral' };

/**
 * Farbe einer Abweichung nach E21: nur Plan gegen Ist und nur mit Wirkungsrichtung aus der Datenbank.
 * Vorjahresvergleiche sind eine Entwicklung, keine Abweichung vom Plan, und bleiben immer neutral.
 */
export function abweichungsfarbe(wert: number | null | undefined, wirkung: Wirkung | null | undefined, vergleich: Vergleich): Abweichungsfarbe {
  if (vergleich === 'vorjahr' || wert === null || wert === undefined || !Number.isFinite(wert) || wert === 0 || !wirkung || wirkung === 'neutral') return 'neutral';
  return (wirkung === 'anstieg_positiv') === wert > 0 ? 'positiv' : 'negativ';
}

export function wirkungAus(wert: unknown): Wirkung {
  return wert === 'anstieg_positiv' || wert === 'anstieg_negativ' ? wert : 'neutral';
}
