'use client';

export default function Fehler({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold">Die Daten sind gerade nicht abrufbar</h1>
      <p className="mt-2">Wir zeigen lieber nichts als unvollständige Zahlen. Meist hilft es, es gleich noch einmal zu versuchen.</p>
      <p className="mt-4 flex gap-4">
        <button type="button" onClick={reset} className="rounded border border-[var(--hb-ink)] px-3 py-1">Erneut versuchen</button>
        <a href="/datenqualitaet">Zum Datenstand</a>
      </p>
    </div>
  );
}
