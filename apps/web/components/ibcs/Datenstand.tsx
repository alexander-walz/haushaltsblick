import type { Datenstand } from '@/lib/daten/schemas';

const AMPEL: Record<Datenstand['ampel'], string> = { green: 'grün', yellow: 'gelb', red: 'rot' };

export function DatenstandHinweis({ stand }: { stand: Pick<Datenstand, 'version' | 'veroeffentlicht_am' | 'ampel'> }) {
  const datum = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' }).format(new Date(stand.veroeffentlicht_am));
  return (
    <p className="text-xs text-[var(--hb-gedaempft)]">
      <span aria-hidden="true" className={`hb-ampel hb-ampel-${stand.ampel}`} />
      Datenstand Version {stand.version} vom {datum}, Ampel {AMPEL[stand.ampel]} · <a href="/datenqualitaet">Details</a>
    </p>
  );
}
