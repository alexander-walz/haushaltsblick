import { Suche } from './Suche';

export function Kopf() {
  return (
    <header className="border-b border-[var(--hb-linie)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <a href="/" className="text-lg font-bold no-underline">Haushalts<span className="text-[var(--hb-akzent)]">blick</span></a>
        <nav aria-label="Hauptnavigation" className="flex gap-4 text-sm">
          <a href="/explorer">Explorer</a>
          <a href="/plan-und-ist">Plan und Wirklichkeit</a>
          <a href="/methodik">Methodik</a>
        </nav>
        <Suche />
      </div>
    </header>
  );
}
