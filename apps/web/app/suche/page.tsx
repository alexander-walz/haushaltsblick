import type { Metadata } from 'next';
import { ladeDatenstand, suche } from '@/lib/daten/abfragen';
import { standardjahre } from '@/lib/daten/jahre';
import { TYP_BEZEICHNUNG, trefferZiel } from '@/lib/explorer';
import { einzeln, type SuchParameter } from '@/lib/seite';
import { heute } from '@/lib/zeit';

export const metadata: Metadata = { title: 'Suche' };

export default async function Suchseite({ searchParams }: { searchParams: Promise<SuchParameter> }) {
  const q = (einzeln(await searchParams, 'q') ?? '').trim();
  if (q.length < 2 || q.length > 200) {
    return <><h1 className="text-2xl font-bold">Suche</h1><p className="mt-2">Bitte mindestens zwei und höchstens 200 Zeichen eingeben.</p></>;
  }
  const stand = await ladeDatenstand();
  const jahre = standardjahre(stand, heute());
  const s = await suche(q, { jahr: jahre.laufend, limit: 20, version: stand.version });
  return (
    <>
      <h1 className="text-2xl font-bold">Suche nach „{q}“</h1>
      <p className="mt-1 text-sm text-[var(--hb-gedaempft)]">Haushaltsjahr {s.jahr}</p>
      {s.treffer.length === 0
        ? <p className="mt-4">Keine Treffer. Versuche einen allgemeineren Begriff.</p>
        : (
          <ul className="mt-4 space-y-2">
            {s.treffer.map((t) => (
              <li key={`${t.typ}-${t.schluessel}`}>
                <a href={trefferZiel(t, s.jahr)}>{t.bezeichnung ?? t.schluessel}</a>
                <span className="text-sm text-[var(--hb-gedaempft)]"> · {TYP_BEZEICHNUNG[t.typ]} {t.schluessel}{t.treffer === 'synonym' ? ' · Synonym' : ''}</span>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
