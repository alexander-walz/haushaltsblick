/** IBCS-Titel: WER (Einheit, Struktur), WAS (Kennzahl, Einheit), WANN (Periode, Szenarien, Abweichungen). */
export type Titel = { wer: string; was: string; wann: string };

export function wann(jahr: number, teile: readonly string[]): string {
  return teile.length === 0 ? String(jahr) : `${jahr} ${teile.join(', ')}`;
}
