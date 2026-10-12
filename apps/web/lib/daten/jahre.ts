import type { Datenstand } from './schemas';

export type Standardjahre = { laufend: number; letztesMitIst: number | null; entwurf: number | null; alle: number[] };

/**
 * Standardjahre nach Spec 5.2: laufendes Haushaltsjahr (beschlossen) für Start und Explorer,
 * letztes Jahr mit Ist für „Plan und Wirklichkeit“, Entwurf nur auf ausdrückliche Wahl.
 */
export function standardjahre(stand: Datenstand, heute: Date): Standardjahre {
  const ausgaben = stand.jahre.filter((j) => j.konto === 'ausgaben');
  const alle = [...new Set(ausgaben.map((j) => j.jahr))].sort((a, b) => a - b);
  if (alle.length === 0) throw new Error('Datenstand enthält keine Jahre');
  const beschlossen = ausgaben.filter((j) => j.haushaltsstand !== 'Regierungsentwurf').map((j) => j.jahr);
  const kalender = heute.getUTCFullYear();
  const laufend = beschlossen.includes(kalender) ? kalender : Math.max(...(beschlossen.length > 0 ? beschlossen : alle));
  const mitIst = ausgaben.filter((j) => j.ist_verfuegbar).map((j) => j.jahr);
  return {
    laufend,
    letztesMitIst: mitIst.length > 0 ? Math.max(...mitIst) : null,
    entwurf: ausgaben.find((j) => j.haushaltsstand === 'Regierungsentwurf')?.jahr ?? null,
    alle,
  };
}

export function istVerfuegbar(stand: Datenstand, jahr: number, konto: 'ausgaben' | 'einnahmen'): boolean {
  return stand.jahre.some((j) => j.jahr === jahr && j.konto === konto && j.ist_verfuegbar);
}
