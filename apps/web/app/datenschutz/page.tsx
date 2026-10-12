import type { Metadata } from 'next';
import { impressum } from '@/lib/impressum';

export const metadata: Metadata = { title: 'Datenschutz' };

export default function Datenschutz() {
  const i = impressum();
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Datenschutz</h1>
      <section>
        <h2 className="text-lg font-semibold">Verantwortlich</h2>
        <p>{i ? `${i.name}, ${i.anschrift.join(', ')}, ${i.kontakt}` : 'Die Angaben werden vor dem Start ergänzt.'}</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Was beim Besuch passiert</h2>
        <p>
          Haushaltsblick setzt keine Cookies, nutzt keine Analyse- oder Werbewerkzeuge und bindet keine Inhalte von Dritten ein. Schriften werden von dieser Seite selbst ausgeliefert.
          Die Seite wird bei Vercel betrieben. Beim Aufruf verarbeitet Vercel technisch notwendige Daten wie die IP-Adresse, um die Seite auszuliefern und vor Missbrauch zu schützen.
          Die Haushaltsdaten liegen in einer Datenbank bei Supabase in Frankfurt; dein Browser spricht nicht direkt mit dieser Datenbank.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Suche</h2>
        <p>Suchbegriffe werden nur verarbeitet, um Treffer zu liefern. Wir speichern sie nicht in einem eigenen Protokoll.</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Deine Rechte</h2>
        <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung sowie ein Beschwerderecht bei einer Datenschutzaufsichtsbehörde.</p>
      </section>
    </article>
  );
}
