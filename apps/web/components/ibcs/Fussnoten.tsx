export function Fussnoten({ hinweise, nominal = false }: { hinweise: readonly string[]; nominal?: boolean }) {
  const zeilen = [...hinweise, ...(nominal ? ['Beträge nominal, ohne Bereinigung um Preissteigerungen.'] : [])];
  if (zeilen.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-[var(--hb-gedaempft)]">
      {zeilen.map((h) => <li key={h}>{h}</li>)}
    </ul>
  );
}
