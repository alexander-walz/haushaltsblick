import { DatenstandHinweis } from '@/components/ibcs/Datenstand';
import { ladeDatenstand } from '@/lib/daten/abfragen';

export async function Fuss() {
  const stand = await ladeDatenstand().catch(() => null);
  return (
    <footer className="mt-10 border-t border-[var(--hb-linie)]">
      <div className="mx-auto max-w-5xl space-y-1 px-4 py-4 text-xs text-[var(--hb-gedaempft)]">
        {stand ? <DatenstandHinweis stand={stand} /> : <p>Der Datenstand ist gerade nicht abrufbar.</p>}
        <p>Quelle: Bundesministerium der Finanzen, bundeshaushalt.de. Rechtlich verbindlich ist ausschließlich der veröffentlichte Haushaltsplan.</p>
        <p><a href="/methodik">Methodik</a> · <a href="/datenqualitaet">Datenqualität</a> · <a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a></p>
      </div>
    </footer>
  );
}
