import type { SollZeile } from './typen';

export type Summen = { einnahmen: number; ausgaben: number };

export type SollZusammenfassung = {
  jahr: number;
  anzahlTitel: number;
  anzahlKapitel: number;
  entfalleneKapitel: string[];
  /** Gesamthaushalt ohne Anlagen, in Tausend Euro. */
  haushaltTsdEur: Summen;
  /** Wirtschaftspläne in Anlagen, in Tausend Euro (Roadmap E1). */
  anlagenTsdEur: Summen;
  ausgeglichen: boolean;
};

export function fasseSollZusammen(zeilen: readonly SollZeile[]): SollZusammenfassung {
  const erste = zeilen[0];
  if (!erste) throw new Error('Keine Zeilen zum Zusammenfassen');
  if (zeilen.some((z) => z.jahr !== erste.jahr)) throw new Error('Zeilen aus mehreren Haushaltsjahren');

  const haushalt: Summen = { einnahmen: 0, ausgaben: 0 };
  const anlagen: Summen = { einnahmen: 0, ausgaben: 0 };
  const entfallen: string[] = [];
  let anzahlTitel = 0;
  let anzahlKapitel = 0;

  for (const z of zeilen) {
    if (z.art === 'kapitel') {
      anzahlKapitel += 1;
      if (z.entfallen) entfallen.push(z.kapitelNr);
      continue;
    }
    anzahlTitel += 1;
    (z.anlageZuKapitelNr === null ? haushalt : anlagen)[z.konto] += z.sollTsdEur;
  }

  return {
    jahr: erste.jahr,
    anzahlTitel,
    anzahlKapitel,
    entfalleneKapitel: entfallen.sort(),
    haushaltTsdEur: haushalt,
    anlagenTsdEur: anlagen,
    ausgeglichen: haushalt.einnahmen === haushalt.ausgaben,
  };
}
