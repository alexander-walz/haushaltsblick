import type { Zeitpunkt } from '@/components/ibcs/ZeitreiheSaeulen';
import type { TitelDetail } from './daten/schemas';
import { NICHT_VERFUEGBAR } from './ibcs/format';
import { sollSzenario } from './ibcs/notation';

export function zeitpunkte(d: TitelDetail, mitHaushaltsplan: boolean): Zeitpunkt[] {
  return d.zeitreihe.map((z, i) => {
    const vorher = i > 0 ? d.zeitreihe[i - 1] : undefined;
    return {
      jahr: z.jahr,
      soll: z.soll_eur,
      ist: z.ist_verfuegbar ? z.ist_eur : null,
      sollSzenario: sollSzenario(z.haushaltsstand),
      haushaltsplan: mitHaushaltsplan ? z.soll_xml_eur : undefined,
      abweichung: z.abweichung_eur,
      markierung: vorher && vorher.titel_key !== z.titel_key ? `ab ${z.jahr}: Kapitel ${z.kapitel_nr ?? z.titel_key.slice(0, 4)}` : undefined,
    };
  });
}

export function flexibilisiertText(w: boolean | null): string {
  if (w === null) return 'nicht anwendbar';
  return w ? 'ja' : 'nein';
}

/** Quelle des Solls; `kurz` für Tabellen. Fehlt die Angabe, steht „n. v.“ statt einer Vermutung. */
export function sollQuelleText(quelle: string | null, kurz = false): string {
  if (quelle === 'api') return kurz ? 'bundeshaushalt.de' : 'bundeshaushalt.de, maßgeblicher Stand';
  if (quelle === 'xml') return 'Haushaltsplan (XML)';
  return NICHT_VERFUEGBAR;
}

export function luecke(d: TitelDetail, erstesJahr: number): string | null {
  const erstes = d.zeitreihe[0]?.jahr;
  if (erstes === undefined || erstes <= erstesJahr) return null;
  return `Für Jahre vor ${erstes} gibt es keine eindeutige Zuordnung, oder der Titel bestand noch nicht.`;
}

/** Verlinkt wird nur eine https-Adresse auf www.bundeshaushalt.de, alles andere bleibt ohne Link. */
export function sichereFundstelle(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'www.bundeshaushalt.de' ? u.href : null;
  } catch {
    return null;
  }
}
