export type Szenario = 'ist' | 'soll' | 'entwurf' | 'haushaltsplan' | 'ist_vorjahr' | 'soll_vorjahr';
export type Notation = { ibcs: 'AC' | 'PL' | 'PY'; klasse: string; beschriftung: string };

/** IBCS-Szenario-Notation (Spec Abschnitt 5.1); die Formen setzen die CSS-Klassen in app/globals.css um. */
export const NOTATION: Record<Szenario, Notation> = {
  ist: { ibcs: 'AC', klasse: 'ibcs-ist', beschriftung: 'Ist' },
  soll: { ibcs: 'PL', klasse: 'ibcs-soll', beschriftung: 'Soll' },
  entwurf: { ibcs: 'PL', klasse: 'ibcs-entwurf', beschriftung: 'Entwurf' },
  haushaltsplan: { ibcs: 'PL', klasse: 'ibcs-haushaltsplan', beschriftung: 'Haushaltsplan' },
  ist_vorjahr: { ibcs: 'PY', klasse: 'ibcs-ist-vorjahr', beschriftung: 'Ist Vorjahr' },
  soll_vorjahr: { ibcs: 'PL', klasse: 'ibcs-soll-vorjahr', beschriftung: 'Soll Vorjahr' },
};

export function sollSzenario(haushaltsstand: string | null | undefined): 'soll' | 'entwurf' {
  return haushaltsstand === 'Regierungsentwurf' ? 'entwurf' : 'soll';
}
