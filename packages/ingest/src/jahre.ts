export const ERSTES_JAHR = 2012;

/** "alle" = 2012 bis Folgejahr, "2024-2026" = Bereich, "2025" = einzelnes Jahr. */
export function parseJahre(angabe: string, heute: Date = new Date()): number[] {
  const letztes = heute.getFullYear() + 1;
  let von: number;
  let bis: number;
  if (angabe === 'alle') {
    von = ERSTES_JAHR;
    bis = letztes;
  } else {
    const treffer = /^(\d{4})(?:-(\d{4}))?$/.exec(angabe);
    if (!treffer) throw new Error(`Ungültige Jahresangabe: ${angabe}`);
    von = Number(treffer[1]);
    bis = Number(treffer[2] ?? treffer[1]);
  }
  if (von > bis || von < ERSTES_JAHR || bis > letztes) {
    throw new Error(`Jahre außerhalb von ${ERSTES_JAHR} bis ${letztes}: ${angabe}`);
  }
  return Array.from({ length: bis - von + 1 }, (_, i) => von + i);
}
