export function JahrAuswahl({ jahre, aktiv, versteckt, ziel, entwurf }: {
  jahre: readonly number[]; aktiv: number; versteckt: Readonly<Record<string, string>>; ziel: string; entwurf?: number | null;
}) {
  return (
    <form method="get" action={ziel} className="flex items-center gap-2 text-sm">
      <label htmlFor="jahr" className="text-[var(--hb-gedaempft)]">Jahr:</label>
      <select id="jahr" name="jahr" defaultValue={String(aktiv)} className="rounded border border-[var(--hb-linie)] bg-[var(--hb-bg)] px-2 py-0.5">
        {[...jahre].reverse().map((j) => <option key={j} value={j}>{j === entwurf ? `${j} (Entwurf)` : j}</option>)}
      </select>
      {Object.entries(versteckt).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" className="rounded border border-[var(--hb-ink)] px-2 py-0.5">Anzeigen</button>
    </form>
  );
}
