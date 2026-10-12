import type { Metadata } from 'next';
import { DatenstandHinweis } from '@/components/ibcs/Datenstand';
import { ladeDatenstand } from '@/lib/daten/abfragen';
import { ganzzahl } from '@/lib/ibcs/format';

export const metadata: Metadata = { title: 'Datenqualität' };

const STATUS: Record<string, string> = { warn: 'Warnung', fail: 'nicht bestanden', pass: 'bestanden' };

export default async function Datenqualitaet() {
  const stand = await ladeDatenstand();
  const jahre = [...stand.jahre].sort((a, b) => b.jahr - a.jahr || a.konto.localeCompare(b.konto));
  return (
    <>
      <h1 className="text-2xl font-bold">Datenqualität</h1>
      <p className="mt-2 max-w-2xl">
        Jede Veröffentlichung durchläuft 19 automatische Prüfungen. Rot wird nie veröffentlicht. Gelb heißt: Die Zahlen stimmen, aber einzelne Prüfungen melden Hinweise, etwa fehlende Bezeichnungen.
      </p>
      <div className="mt-3"><DatenstandHinweis stand={stand} /></div>
      <p className="mt-1 text-sm">Score {stand.score.toLocaleString('de-DE')} von 100 · {ganzzahl(stand.zeilen)} Titelzeilen</p>
      <h2 className="mt-6 text-lg font-semibold">Hinweise der Prüfungen</h2>
      {stand.pruefungen.length === 0 ? <p className="mt-1 text-sm">Alle Prüfungen bestanden.</p> : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="border-b-2 border-[var(--hb-ink)] text-left"><th scope="col" className="py-1 pr-2">Prüfung</th><th scope="col" className="pr-2">Beschreibung</th><th scope="col" className="pr-2">Status</th><th scope="col" className="text-right">Fälle</th></tr></thead>
          <tbody>
            {stand.pruefungen.map((p) => (
              <tr key={p.check_id} className="border-b border-[var(--hb-linie)]">
                <th scope="row" className="py-1 pr-2 text-left font-normal">{p.check_id}</th>
                <td className="pr-2">{p.beschreibung}</td>
                <td className="pr-2">{STATUS[p.status] ?? p.status}</td>
                <td className="text-right">{ganzzahl(p.failures)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 id="jahre-haushaltsstand" className="mt-6 text-lg font-semibold">Jahre und Haushaltsstand</h2>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-labelledby="jahre-haushaltsstand">
        <table className="mt-2 w-full text-sm">
          <thead><tr className="border-b-2 border-[var(--hb-ink)] text-left"><th scope="col" className="py-1 pr-2">Jahr</th><th scope="col" className="pr-2">Konto</th><th scope="col" className="pr-2">Haushaltsstand</th><th scope="col" className="pr-2">Soll aus</th><th scope="col" className="pr-2">Ist</th><th scope="col" className="text-right">Titel</th></tr></thead>
          <tbody>
            {jahre.map((j) => (
              <tr key={`${j.jahr}-${j.konto}`} className="border-b border-[var(--hb-linie)]">
                <th scope="row" className="py-1 pr-2 text-left font-normal">{j.jahr}</th>
                <td className="pr-2">{j.konto === 'ausgaben' ? 'Ausgaben' : 'Einnahmen'}</td>
                <td className="pr-2">{j.haushaltsstand}</td>
                <td className="pr-2">{j.soll_quelle === 'api' ? 'bundeshaushalt.de' : 'Haushaltsplan (XML)'}</td>
                <td className="pr-2">{j.ist_verfuegbar ? 'verfügbar' : 'noch nicht'}</td>
                <td className="text-right">{ganzzahl(j.titel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
