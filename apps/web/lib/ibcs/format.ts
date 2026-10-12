export type Einheit = { faktor: number; kurz: string; nachkomma: number };

export const EINHEITEN = {
  mrd: { faktor: 1e9, kurz: 'Mrd. €', nachkomma: 1 },
  mio: { faktor: 1e6, kurz: 'Mio. €', nachkomma: 1 },
  tsd: { faktor: 1e3, kurz: 'Tsd. €', nachkomma: 0 },
  eur: { faktor: 1, kurz: '€', nachkomma: 0 },
} as const satisfies Record<string, Einheit>;

export const MINUS = '−';
export const NICHT_VERFUEGBAR = 'n. v.';

type Wert = number | null | undefined;

/** Einheit nach dem betragsgrößten Wert; eine Darstellung verwendet genau eine Einheit (IBCS). */
export function einheitFuer(werte: readonly Wert[]): Einheit {
  const max = werte.reduce<number>((m, w) => (w === null || w === undefined || !Number.isFinite(w) ? m : Math.max(m, Math.abs(w))), 0);
  if (max >= 1e9) return EINHEITEN.mrd;
  if (max >= 1e6) return EINHEITEN.mio;
  if (max >= 1e3) return EINHEITEN.tsd;
  return EINHEITEN.eur;
}

function zahl(wert: number, nachkomma: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma }).format(Math.abs(wert));
}

/**
 * Vorzeichen nach dem gerundeten Wert. Mit `immer` (Abweichungen) gilt bei einer gerundeten Null das Vorzeichen
 * des ungerundeten Werts: „+0,0“ oder „−0,0“, damit ein gefärbter Balken nie neben einer Zahl ohne Vorzeichen steht (E21).
 */
function mitVorzeichen(text: string, gerundet: number, immer: boolean, roh: number = gerundet): string {
  const richtung = immer && gerundet === 0 ? roh : gerundet;
  if (richtung < 0) return MINUS + text;
  if (immer && richtung > 0) return `+${text}`;
  return text;
}

export function betrag(wert: Wert, einheit: Einheit, opt: { vorzeichen?: boolean } = {}): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return NICHT_VERFUEGBAR;
  const gerundet = Number((wert / einheit.faktor).toFixed(einheit.nachkomma));
  return mitVorzeichen(zahl(gerundet, einheit.nachkomma), gerundet, opt.vorzeichen ?? false, wert);
}

export function betragMitEinheit(wert: Wert, opt: { vorzeichen?: boolean } = {}): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return NICHT_VERFUEGBAR;
  const einheit = einheitFuer([wert]);
  return `${betrag(wert, einheit, opt)} ${einheit.kurz}`;
}

export function euro(wert: Wert): string {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return NICHT_VERFUEGBAR;
  return `${betrag(wert, EINHEITEN.eur)} €`;
}

/** Anteil als Bruch von 1 (0,376 → 37,6 %). */
export function prozent(anteil: Wert, opt: { vorzeichen?: boolean } = {}): string {
  if (anteil === null || anteil === undefined || !Number.isFinite(anteil)) return NICHT_VERFUEGBAR;
  const gerundet = Number((anteil * 100).toFixed(1));
  return `${mitVorzeichen(zahl(gerundet, 1), gerundet, opt.vorzeichen ?? false, anteil)} %`;
}

export function ganzzahl(n: number): string {
  if (!Number.isFinite(n)) return NICHT_VERFUEGBAR;
  const gerundet = Number(n.toFixed(0));
  return mitVorzeichen(zahl(gerundet, 0), gerundet, false);
}

/** Kennwerte wie der DQ-Score: eine Nachkommastelle. */
export function dezimal(n: number): string {
  if (!Number.isFinite(n)) return NICHT_VERFUEGBAR;
  const gerundet = Number(n.toFixed(1));
  return mitVorzeichen(zahl(gerundet, 1), gerundet, false);
}
