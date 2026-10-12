'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

type Vorschlag = { typ: string; typBezeichnung: string; bezeichnung: string; schluessel: string; treffer: string; href: string };

/** Suchfeld mit Vorschlägen (Combobox nach WAI-ARIA); ohne JavaScript sendet das Formular an /suche. */
export function Suche() {
  const router = useRouter();
  const listeId = useId();
  const [q, setQ] = useState('');
  const [vorschlaege, setVorschlaege] = useState<Vorschlag[]>([]);
  const [aktiv, setAktiv] = useState(-1);
  const [offen, setOffen] = useState(false);
  const abbruch = useRef<AbortController | null>(null);
  const blurZeit = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const begriff = q.trim();
    if (begriff.length < 2) {
      setVorschlaege([]);
      setOffen(false);
      setAktiv(-1);
      return;
    }
    const zeit = setTimeout(async () => {
      abbruch.current?.abort();
      const ctrl = new AbortController();
      abbruch.current = ctrl;
      try {
        const r = await fetch(`/api/suche?q=${encodeURIComponent(begriff)}`, { signal: ctrl.signal });
        const daten = (await r.json()) as { treffer: Vorschlag[] };
        if (ctrl.signal.aborted) return;
        setVorschlaege(daten.treffer);
        setAktiv(-1);
        setOffen(true);
      } catch {
        // abgebrochen oder offline: Vorschläge bleiben unverändert
      }
    }, 250);
    return () => {
      clearTimeout(zeit);
      abbruch.current?.abort();
    };
  }, [q]);

  function gehe(v: Vorschlag) {
    router.push(v.href);
    setOffen(false);
  }

  function taste(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOffen(true); setAktiv((a) => Math.min(a + 1, vorschlaege.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAktiv((a) => Math.max(a - 1, -1)); }
    else if (e.key === 'Escape') { setOffen(false); setAktiv(-1); }
    else if (e.key === 'Enter') {
      const v = offen && aktiv >= 0 ? vorschlaege[aktiv] : undefined;
      if (v) { e.preventDefault(); gehe(v); }
    }
  }

  return (
    <form action="/suche" method="get" role="search" className="relative w-full max-w-sm">
      <label htmlFor={`${listeId}-feld`} className="sr-only">Suche im Bundeshaushalt</label>
      <input id={`${listeId}-feld`} name="q" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={taste}
        onBlur={() => { blurZeit.current = setTimeout(() => { setOffen(false); setAktiv(-1); }, 150); }}
        onFocus={() => { if (blurZeit.current) clearTimeout(blurZeit.current); if (vorschlaege.length > 0) setOffen(true); }}
        role="combobox" aria-expanded={offen && vorschlaege.length > 0} aria-controls={listeId} aria-autocomplete="list"
        aria-activedescendant={offen && aktiv >= 0 ? `${listeId}-${aktiv}` : undefined} maxLength={200} autoComplete="off"
        placeholder="Suchen, z. B. „Bundeswehr“, „BAföG“"
        className="w-full rounded border border-[var(--hb-linie)] bg-[var(--hb-bg)] px-3 py-1.5 text-sm" />
      <ul id={listeId} hidden={!(offen && vorschlaege.length > 0)} role="listbox" aria-label="Vorschläge" className="absolute z-10 mt-1 w-full rounded border border-[var(--hb-linie)] bg-[var(--hb-bg)] py-1 text-sm shadow">
        {vorschlaege.map((v, i) => (
          <li key={`${v.typ}-${v.schluessel}`} id={`${listeId}-${i}`} role="option" aria-selected={i === aktiv}
            className={`cursor-pointer px-3 py-1 ${i === aktiv ? 'bg-[var(--hb-flaeche)]' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); gehe(v); }}>
            <span className="text-xs text-[var(--hb-gedaempft)]">{v.typBezeichnung} {v.schluessel}</span>
            <span className="block">{v.bezeichnung}{v.treffer === 'synonym' && <span className="text-[var(--hb-gedaempft)]"> · passend zu „{q.trim()}“</span>}</span>
          </li>
        ))}
      </ul>
    </form>
  );
}
