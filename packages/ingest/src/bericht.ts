import type { JahresErgebnis } from './soll-ingest';

const mrd = (tsdEur: number) =>
  (tsdEur / 1_000_000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatiereBericht(ergebnisse: readonly JahresErgebnis[]): string {
  const zeile = (zellen: readonly string[]) => `| ${zellen.join(' | ')} |`;
  const kopf = ['Jahr', 'Status', 'Titel', 'Ausgaben Soll (Mrd. €)', 'Anlagen Ausgaben (Mrd. €)', 'Ausgeglichen', 'Hinweis'];
  const zeilen = [zeile(kopf), zeile(kopf.map(() => '---'))];
  for (const e of ergebnisse) {
    const z = e.zusammenfassung;
    zeilen.push(
      zeile([
        String(e.jahr),
        e.status,
        z ? String(z.anzahlTitel) : '',
        z ? mrd(z.haushaltTsdEur.ausgaben) : '',
        z ? mrd(z.anlagenTsdEur.ausgaben) : '',
        z ? (z.ausgeglichen ? 'ja' : 'nein') : '',
        [e.hinweis, e.lokal ? 'lokale Datei' : undefined].filter(Boolean).join('; '),
      ]),
    );
  }
  return zeilen.join('\n');
}
