export const KONTEN = ['einnahmen', 'ausgaben'] as const;
export type Konto = (typeof KONTEN)[number];

const KAPITEL_NR = /^\d{4}$/;
const TITEL_NR = /^\d{5}$/;

/** Neunstelliger Titelschlüssel der internalapi, z. B. 090168301 für Kapitel 0901, Titel 68301. */
export function titelKey(kapitelNr: string, titelNr: string): string {
  if (!KAPITEL_NR.test(kapitelNr)) throw new Error(`Ungültige Kapitelnummer: ${kapitelNr}`);
  if (!TITEL_NR.test(titelNr)) throw new Error(`Ungültige Titelnummer: ${titelNr}`);
  return kapitelNr + titelNr;
}

export function zerlegeTitelKey(key: string): { kapitelNr: string; titelNr: string } {
  if (!/^\d{9}$/.test(key)) throw new Error(`Ungültiger Titelschlüssel: ${key}`);
  return { kapitelNr: key.slice(0, 4), titelNr: key.slice(4) };
}
