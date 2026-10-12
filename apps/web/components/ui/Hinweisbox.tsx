export function Hinweisbox({ hinweise }: { hinweise: readonly string[] }) {
  if (hinweise.length === 0) return null;
  return (
    <div role="status" className="my-3 rounded border border-[var(--hb-linie)] bg-[var(--hb-flaeche)] px-3 py-2 text-sm">
      {hinweise.map((h) => <p key={h}>{h}</p>)}
    </div>
  );
}
