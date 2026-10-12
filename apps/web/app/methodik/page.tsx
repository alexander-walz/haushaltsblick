import type { Metadata } from 'next';
import { ladeDatenstand, ladeGlossar, ladeKennzahlen } from '@/lib/daten/abfragen';
import { NOTATION, type Szenario } from '@/lib/ibcs/notation';

export const metadata: Metadata = { title: 'Methodik' };

const SZENARIEN: readonly Szenario[] = ['ist', 'soll', 'entwurf', 'haushaltsplan', 'ist_vorjahr', 'soll_vorjahr'];
const RICHTUNG: Record<string, string> = { anstieg_positiv: 'Anstieg grün', anstieg_negativ: 'Anstieg rot', neutral: 'immer grau' };
const KONTO: Record<string, string> = { ausgaben: 'Ausgaben', einnahmen: 'Einnahmen' };
const TYP: Record<string, string> = { funktion: 'Funktion', obergruppe: 'Obergruppe' };

/** Bereich einer Wirkungsregel; die Regel für ein ganzes Konto gilt nur für das, was keine spezifischere Regel erfasst. */
function bereich(w: { konto: string; typ: string; schluessel: string | null }): string {
  if (!w.schluessel) return `übrige ${KONTO[w.konto] ?? w.konto}`;
  return `${KONTO[w.konto] ?? w.konto}, ${TYP[w.typ] ?? w.typ} ${w.schluessel}`;
}

export default async function Methodik() {
  const stand = await ladeDatenstand();
  const [k, g] = await Promise.all([ladeKennzahlen(stand.version), ladeGlossar(stand.version)]);
  return (
    <article className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Methodik</h1>
      <section>
        <h2 className="text-lg font-semibold">Woher die Zahlen kommen</h2>
        <p className="mt-1">
          Alle Zahlen stammen vom Bundesministerium der Finanzen (bundeshaushalt.de). Das Soll ist der maßgebliche Stand einschließlich Nachtragshaushalten,
          das Ist der tatsächlich gebuchte Betrag abgeschlossener Jahre. Für die Struktur nutzen wir zusätzlich die XML-Dateien des Haushaltsplans.
          Die Daten werden wöchentlich geladen, geprüft und erst dann veröffentlicht.
        </p>
      </section>
      <section id="quellen">
        <h2 className="text-lg font-semibold">Quellen und Lizenz</h2>
        <p className="mt-1">
          Quelle: Bundesministerium der Finanzen, <a href="https://www.bundeshaushalt.de" rel="noopener noreferrer">bundeshaushalt.de</a>.
          Für die Nutzung der Daten gelten die Nutzungsbedingungen der Quelle.
          Rechtlich verbindlich ist ausschließlich der veröffentlichte Haushaltsplan.
        </p>
      </section>
      <section id="datenstand">
        <h2 className="text-lg font-semibold">Datenstand und Ampel</h2>
        <p className="mt-1">
          Jede Seite nennt unten den Datenstand: eine Versionsnummer und das Datum der Veröffentlichung. Alle Zahlen einer Seite stammen aus derselben Version.
          Vor jeder Veröffentlichung laufen automatische Prüfungen, etwa ob Summen aufgehen und Bezeichnungen vollständig sind.
        </p>
        <ul className="mt-1 list-disc pl-5">
          <li>Grün: Alle Prüfungen sind bestanden.</li>
          <li>Gelb: Die Zahlen stimmen, einzelne Prüfungen melden Hinweise, etwa fehlende Bezeichnungen.</li>
          <li>Rot: Eine Prüfung ist gescheitert. Ein solcher Stand wird nie veröffentlicht, es bleibt beim letzten geprüften Stand.</li>
        </ul>
        <p className="mt-1"><a href="/datenqualitaet">Prüfungen und Hinweise des aktuellen Stands</a></p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Wie wir darstellen</h2>
        <p className="mt-1">Alle Berichte folgen den International Business Communication Standards (IBCS): gleiche Dinge sehen gleich aus.</p>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="border-b-2 border-[var(--hb-ink)] text-left"><th scope="col" className="py-1 pr-2">Darstellung</th><th scope="col" className="pr-2">Bedeutung</th><th scope="col">IBCS</th></tr></thead>
          <tbody>
            {SZENARIEN.map((s) => (
              <tr key={s} className="border-b border-[var(--hb-linie)]">
                <td className="py-1 pr-2"><svg viewBox="0 0 30 10" className="h-3 w-8" aria-hidden="true"><rect x="1" y="1" width="28" height="8" className={NOTATION[s].klasse} /></svg></td>
                <th scope="row" className="pr-2 text-left font-normal">{NOTATION[s].beschriftung}</th>
                <td>{NOTATION[s].ibcs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section id="farben">
        <h2 className="text-lg font-semibold">Wann wir Abweichungen färben</h2>
        <p className="mt-1">
          Abweichungen sind grundsätzlich grau. Ob mehr oder weniger Ausgaben gut sind, ist eine politische Frage, die wir nicht beantworten.
          Farbe gibt es nur, wo die Wirkung haushaltsrechtlich eindeutig ist, immer zusammen mit einem Vorzeichen. Vergleiche mit dem Vorjahr sind immer grau.
          Gilt für einen Titel mehr als eine Regel, gewinnt die spezifischere. Enthält eine Gruppe Titel mit verschiedenen Regeln, bleibt sie grau.
        </p>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="border-b-2 border-[var(--hb-ink)] text-left"><th scope="col" className="py-1 pr-2">Bereich</th><th scope="col" className="pr-2">Farbe</th><th scope="col">Begründung</th></tr></thead>
          <tbody>
            {k.wirkungsrichtung.map((w) => (
              <tr key={w.regel_id} className="border-b border-[var(--hb-linie)]">
                <th scope="row" className="py-1 pr-2 text-left font-normal">{bereich(w)}</th>
                <td className="pr-2">{RICHTUNG[w.richtung]}</td>
                <td>{w.begruendung}</td>
              </tr>
            ))}
            <tr><th scope="row" className="py-1 pr-2 text-left font-normal">alle übrigen</th><td className="pr-2">grau</td><td>Mehr oder weniger Ausgaben sind eine politische Frage.</td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Kennzahlen</h2>
        <dl className="mt-2 space-y-2 text-sm">
          {k.kennzahlen.map((x) => (
            <div key={x.kennzahl_id}><dt className="font-semibold">{x.name}</dt><dd>{x.definition} <span className="text-[var(--hb-gedaempft)]">Formel: {x.formel}</span></dd></div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Was die Daten nicht sagen</h2>
        <ul className="mt-1 list-disc pl-5">
          <li>Sie sagen nichts über Wirkung oder Erfolg einer Ausgabe.</li>
          <li>Alle Beträge sind nominal, also nicht um Preissteigerungen bereinigt.</li>
          <li>Soll-Werte verschiedener Haushaltsstände (Entwurf, Gesetz, Nachtrag) sind nur eingeschränkt vergleichbar.</li>
          <li>Ressortwechsel verschieben Titel zwischen Einzelplänen; Zeitreihen verbinden sie nur bei eindeutiger Zuordnung.</li>
          <li>Wer tiefer prüfen will: Haushaltsrechnung des Bundes und Bemerkungen des Bundesrechnungshofs.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Glossar</h2>
        <dl className="mt-2 space-y-2 text-sm">
          {g.eintraege.map((x) => <div key={x.begriff}><dt className="font-semibold">{x.begriff}</dt><dd>{x.erklaerung}</dd></div>)}
        </dl>
      </section>
    </article>
  );
}
