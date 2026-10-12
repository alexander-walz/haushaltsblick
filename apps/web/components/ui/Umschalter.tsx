export function Umschalter({ beschriftung, optionen, aktiv }: {
  beschriftung: string; optionen: readonly { wert: string; text: string; href: string }[]; aktiv: string;
}) {
  return (
    <nav aria-label={beschriftung} className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-[var(--hb-gedaempft)]">{beschriftung}:</span>
      {optionen.map((o) => (
        <a key={o.wert} href={o.href} aria-current={o.wert === aktiv ? 'page' : undefined}
          className={`rounded border px-2 py-0.5 no-underline ${o.wert === aktiv ? 'border-[var(--hb-akzent)] text-[var(--hb-akzent)]' : 'border-[var(--hb-linie)]'}`}>
          {o.text}
        </a>
      ))}
    </nav>
  );
}
