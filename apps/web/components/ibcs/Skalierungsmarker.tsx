const ERKLAERUNG = 'Dieses Diagramm hat einen eigenen Maßstab. Balkenlängen sind nicht mit anderen Diagrammen der Seite vergleichbar.';

/** IBCS-Skalierungsmarker (Spec 5.3, 5.5): kennzeichnet Darstellungen, die bewusst nicht den Maßstab der Seite teilen. */
export function Skalierungsmarker() {
  return (
    <span title={ERKLAERUNG} className="ml-2 inline-flex items-center gap-1 rounded border border-[var(--hb-linie)] px-1 align-middle text-xs text-[var(--hb-gedaempft)]">
      <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
        <path d="M1 9 L9 1 M1 5 L5 1 M5 9 L9 5" className="ibcs-achse" />
      </svg>
      Eigener Maßstab<span className="sr-only">: {ERKLAERUNG}</span>
    </span>
  );
}
