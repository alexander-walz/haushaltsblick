import type { Konto } from '@hb/shared';

export type SollTitel = {
  art: 'titel';
  jahr: number;
  einzelplanNr: string;
  einzelplanText: string;
  kapitelNr: string;
  kapitelText: string;
  /** Kapitel, unter dessen <anlage> der Titel steht; null für den Gesamthaushalt. */
  anlageZuKapitelNr: string | null;
  konto: Konto;
  /** Position des <einnahmen>- bzw. <ausgaben>-Blocks im Kapitel, ab 1. */
  kontoBlock: number;
  ausgabeartText: string | null;
  titelgruppeNr: string | null;
  titelgruppeText: string | null;
  titelNr: string;
  titelText: string;
  /** null: nicht anwendbar (Einnahmetitel ohne Attribut, 2012 bis 2024) */
  flexibilisiert: boolean | null;
  fkt: string;
  seite: number | null;
  sollTsdEur: number;
  xmlPfad: string;
  zeilenHash: string;
};

export type SollKapitel = {
  art: 'kapitel';
  jahr: number;
  einzelplanNr: string;
  einzelplanText: string;
  kapitelNr: string;
  kapitelText: string;
  anlageZuKapitelNr: string | null;
  anzahlTitel: number;
  entfallen: boolean;
  xmlPfad: string;
};

export type SollZeile = SollTitel | SollKapitel;

export class XmlVertragsFehler extends Error {
  readonly pfad: string;

  constructor(meldung: string, pfad: string) {
    super(`${meldung} (bei ${pfad})`);
    this.name = 'XmlVertragsFehler';
    this.pfad = pfad;
  }
}
