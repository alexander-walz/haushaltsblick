import { betragMitEinheit, euro } from './ibcs/format';

/** Faktische Kernaussage der Startseite (E13, E23); Zahlen stammen aus query_metric. */
export function kernaussageStart(jahr: number, soll: number | null, proKopf: number | null, proTag: number | null, entwurf: boolean): { titel: string; untertitel: string | null } {
  if (soll === null) return { titel: `Für ${jahr} liegen noch keine Zahlen vor.`, untertitel: null };
  const titel = entwurf
    ? `Der Regierungsentwurf sieht für ${jahr} Ausgaben von ${betragMitEinheit(soll)} vor.`
    : `Der Bund plant ${jahr} Ausgaben von ${betragMitEinheit(soll)}.`;
  const untertitel = proKopf !== null && proTag !== null
    ? `Das sind ${euro(proKopf)} je Einwohnerin und Einwohner oder ${betragMitEinheit(proTag)} an jedem Tag des Jahres.`
    : null;
  return { titel, untertitel };
}

export function kernaussagePlanIst(jahr: number, konto: 'ausgaben' | 'einnahmen', abweichung: number | null): string {
  if (abweichung === null) return `Für ${jahr} liegt noch kein Ist vor.`;
  if (abweichung === 0) return `${jahr} entsprach das Ist genau dem Soll.`;
  const richtung = abweichung < 0 ? 'weniger' : 'mehr';
  const verb = konto === 'ausgaben' ? 'ausgegeben' : 'eingenommen';
  return `${jahr} wurden ${betragMitEinheit(Math.abs(abweichung))} ${richtung} ${verb} als geplant.`;
}
