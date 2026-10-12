/** Anker der Farbregeln auf der Methodikseite. */
export const FARBREGEL_HREF = '/methodik#farben';

/** Fußnote mit Verweis auf die Farbregel (E21); erscheint nur, wenn eine Darstellung grün oder rot färbt. */
export function FarbregelHinweis() {
  return (
    <li>
      Grün und Rot gibt es nur nach festen Regeln für Einnahmen, Kreditaufnahme und Zinsen, sonst bleibt eine Abweichung grau. <a href={FARBREGEL_HREF}>Regeln ansehen</a>
    </li>
  );
}
