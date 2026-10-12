import type { Abfrage } from './daten/abfragen';
import type { Standardjahre } from './daten/jahre';

export type FrageDef = {
  id: string;
  frage: (j: Standardjahre) => string;
  abfrage: (j: Standardjahre) => Abfrage | null;
  darstellung: 'struktur' | 'abweichung' | 'zeitreihe';
  wer: string;
  jahr: (j: Standardjahre) => number;
  szenarien: readonly string[];
  link: (j: Standardjahre) => string;
};

/** Fragen, die die Daten sicher beantworten; jede Antwort ist eine feste Abfrage (Spec 6.1). */
export const FRAGEN: readonly FrageDef[] = [
  {
    id: 'verteidigung-hochschulen',
    frage: (j) => `Wofür gibt der Bund ${j.laufend} mehr aus: Verteidigung oder Hochschulen?`,
    abfrage: (j) => ({ kennzahlen: ['soll'], gruppierung: ['oberfunktion'], filter: { konto: 'ausgaben', jahr: j.laufend, oberfunktion: ['03', '13'] }, sortierung: 'soll' }),
    darstellung: 'struktur',
    wer: 'Bund, Ausgaben nach Aufgaben',
    jahr: (j) => j.laufend,
    szenarien: ['Soll'],
    link: (j) => `/explorer?jahr=${j.laufend}&konto=ausgaben&sicht=aufgabe`,
  },
  {
    id: 'plantreue',
    frage: (j) => `Wie genau wurde der Plan ${j.letztesMitIst ?? ''} eingehalten?`,
    abfrage: (j) => (j.letztesMitIst === null ? null
      : { kennzahlen: ['abweichung'], gruppierung: ['einzelplan_nr'], filter: { konto: 'ausgaben', jahr: j.letztesMitIst }, limit: 500 }),
    darstellung: 'abweichung',
    wer: 'Bund, Ausgaben nach Einzelplänen',
    jahr: (j) => j.letztesMitIst ?? j.laufend,
    szenarien: ['ΔPL'],
    link: (j) => `/plan-und-ist?jahr=${j.letztesMitIst ?? ''}&konto=ausgaben`,
  },
  {
    id: 'zinsen',
    frage: (j) => `Wie haben sich die Zinsausgaben seit ${j.laufend - 5} entwickelt?`,
    abfrage: (j) => ({ kennzahlen: ['soll', 'ist'], gruppierung: ['jahr'], filter: { konto: 'ausgaben', fkt: '830', jahr_von: j.laufend - 5, jahr_bis: j.laufend } }),
    darstellung: 'zeitreihe',
    wer: 'Bund, Zinsausgaben (Funktion 830)',
    jahr: (j) => j.laufend,
    szenarien: ['Soll', 'Ist'],
    link: (j) => `/explorer?jahr=${j.laufend}&konto=ausgaben&sicht=aufgabe&hauptfunktion=8&oberfunktion=83&funktion=830`,
  },
  {
    id: 'familie',
    frage: (j) => `Was kostet das Elterngeld ${j.laufend} im Vergleich zum Kindergeld?`,
    abfrage: (j) => ({ kennzahlen: ['soll'], gruppierung: ['fkt'], filter: { konto: 'ausgaben', jahr: j.laufend, fkt: ['231', '232'] }, sortierung: 'soll' }),
    darstellung: 'struktur',
    wer: 'Bund, Familienleistungen nach Funktionen',
    jahr: (j) => j.laufend,
    szenarien: ['Soll'],
    link: (j) => `/explorer?jahr=${j.laufend}&konto=ausgaben&sicht=aufgabe&hauptfunktion=2&oberfunktion=23`,
  },
];

export function fragenFuer(datum: Date, anzahl = 2): FrageDef[] {
  const tag = Math.floor(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()) / 86_400_000);
  const n = Math.min(anzahl, FRAGEN.length);
  return Array.from({ length: n }, (_, i) => FRAGEN[(tag + i) % FRAGEN.length]!);
}
