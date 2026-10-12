import { FarbregelHinweis } from './FarbregelHinweis';

/** Fußnoten unter einer Darstellung; `farbregel` ergänzt den Verweis auf die Farbregel (E21). */
export function Fussnoten({ hinweise, nominal = false, farbregel = false }: { hinweise: readonly string[]; nominal?: boolean; farbregel?: boolean }) {
  const zeilen = [...hinweise, ...(nominal ? ['Beträge nominal, ohne Bereinigung um Preissteigerungen.'] : [])];
  if (zeilen.length === 0 && !farbregel) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-[var(--hb-gedaempft)]">
      {zeilen.map((h) => <li key={h}>{h}</li>)}
      {farbregel && <FarbregelHinweis />}
    </ul>
  );
}
