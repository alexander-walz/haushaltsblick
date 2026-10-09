import type { ApiErgebnis } from './api-ingest';

const mrd = (cent: number) =>
  (cent / 100_000_000_000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const zelle = (text: string) => text.replaceAll('|', '/').replace(/\s*\n\s*/g, ' ');

export function formatiereApiBericht(ergebnisse: readonly ApiErgebnis[]): string {
  const zeile = (zellen: readonly string[]) => `| ${zellen.join(' | ')} |`;
  const kopf = ['Jahr', 'Konto', 'Quote', 'Status', 'Titel', 'Summe (Mrd. €)', 'Anfragen', 'Hinweis'];
  const zeilen = [zeile(kopf), zeile(kopf.map(() => '---'))];
  for (const e of ergebnisse) {
    zeilen.push(zeile([
      String(e.parameter.jahr),
      e.parameter.konto,
      e.parameter.quote,
      e.status,
      e.titel === undefined ? '' : String(e.titel),
      e.summeCent === undefined ? '' : mrd(e.summeCent),
      String(e.anfragen),
      zelle(e.hinweis ?? ''),
    ]));
  }
  return zeilen.join('\n');
}
