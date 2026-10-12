import type { Standardjahre } from './daten/jahre';
import { einzeln, kuerze, type SuchParameter } from './seite';

export type Sicht = 'ressort' | 'aufgabe' | 'art';
export type Konto = 'ausgaben' | 'einnahmen';
export type ExplorerParameter = { jahr: number; konto: Konto; sicht: Sicht; pfad: Record<string, string> };
export type Ebene = { gruppierung: string; filter: Record<string, string>; tiefe: number; letzte: boolean };

export const EBENEN: Record<Sicht, readonly string[]> = {
  ressort: ['einzelplan_nr', 'kapitel_nr', 'titel_key'],
  aufgabe: ['hauptfunktion', 'oberfunktion', 'fkt', 'titel_key'],
  art: ['hauptgruppe', 'obergruppe', 'gruppierung_nr', 'titel_key'],
};

const URL_PARAM: Record<string, string> = {
  einzelplan_nr: 'einzelplan', kapitel_nr: 'kapitel', hauptfunktion: 'hauptfunktion', oberfunktion: 'oberfunktion',
  fkt: 'funktion', hauptgruppe: 'hauptgruppe', obergruppe: 'obergruppe', gruppierung_nr: 'gruppierung',
};

const MUSTER: Record<string, RegExp> = {
  einzelplan_nr: /^\d{2}$/, kapitel_nr: /^\d{4}$/, hauptfunktion: /^\d$/, oberfunktion: /^\d{2}$/,
  fkt: /^\d{3}$/, hauptgruppe: /^\d$/, obergruppe: /^\d{2}$/, gruppierung_nr: /^\d{3}$/,
};

/** Textspalte von query_metric je Gruppierung (Konzept Abschnitt 10). */
export const TEXTSPALTE: Record<string, string> = {
  einzelplan_nr: 'einzelplan_text', kapitel_nr: 'kapitel_text', titel_key: 'titel_text', hauptfunktion: 'hauptfunktion_text',
  oberfunktion: 'oberfunktion_text', fkt: 'funktion_text', hauptgruppe: 'hauptgruppe_text', obergruppe: 'obergruppe_text',
  gruppierung_nr: 'gruppierung_text',
};

export const EBENENNAME: Record<string, string> = {
  einzelplan_nr: 'Einzelplänen', kapitel_nr: 'Kapiteln', titel_key: 'Titeln', hauptfunktion: 'Hauptfunktionen',
  oberfunktion: 'Oberfunktionen', fkt: 'Funktionen', hauptgruppe: 'Hauptgruppen', obergruppe: 'Obergruppen', gruppierung_nr: 'Gruppierungen',
};

export const TYP_BEZEICHNUNG: Record<string, string> = {
  einzelplan: 'Einzelplan', kapitel: 'Kapitel', titel: 'Titel', funktion: 'Funktion', oberfunktion: 'Oberfunktion',
  hauptfunktion: 'Hauptfunktion', gruppierung: 'Gruppierung', obergruppe: 'Obergruppe', hauptgruppe: 'Hauptgruppe',
};

export function leseParameter(sp: SuchParameter, jahre: Standardjahre): { param: ExplorerParameter; hinweise: string[] } {
  const hinweise: string[] = [];
  const jahrText = einzeln(sp, 'jahr');
  let jahr = jahre.laufend;
  if (jahrText !== undefined) {
    const j = Number(jahrText);
    if (Number.isInteger(j) && jahre.alle.includes(j)) jahr = j;
    else hinweise.push(`Das Jahr „${kuerze(jahrText)}“ ist nicht verfügbar. Gezeigt wird ${jahre.laufend}.`);
  }
  const konto: Konto = einzeln(sp, 'konto') === 'einnahmen' ? 'einnahmen' : 'ausgaben';
  const sichtText = einzeln(sp, 'sicht');
  let sicht: Sicht = sichtText === 'aufgabe' || sichtText === 'art' ? sichtText : 'ressort';
  if (sicht === 'aufgabe' && konto === 'einnahmen') {
    sicht = 'ressort';
    hinweise.push('Die Sicht nach Aufgaben gibt es nur für Ausgaben.');
  }
  const pfad: Record<string, string> = {};
  let vorgaenger: string | null = null;
  for (const dim of EBENEN[sicht]) {
    if (dim === 'titel_key') break;
    const wert = einzeln(sp, URL_PARAM[dim]!);
    if (wert === undefined) break;
    if (!MUSTER[dim]!.test(wert)) {
      hinweise.push(`Die Auswahl „${kuerze(wert)}“ ist ungültig und wurde zurückgesetzt.`);
      break;
    }
    if (vorgaenger !== null && !wert.startsWith(vorgaenger)) {
      hinweise.push(`Die Auswahl „${kuerze(wert)}“ passt nicht zur übergeordneten Ebene und wurde zurückgesetzt.`);
      break;
    }
    pfad[dim] = wert;
    vorgaenger = wert;
  }
  return { param: { jahr, konto, sicht, pfad }, hinweise };
}

export function ebene(p: ExplorerParameter): Ebene {
  const dims = EBENEN[p.sicht];
  const offen = dims.findIndex((d) => !(d in p.pfad));
  const tiefe = offen === -1 ? dims.length - 1 : offen;
  const filter: Record<string, string> = {};
  for (const d of dims.slice(0, tiefe)) filter[d] = p.pfad[d]!;
  return { gruppierung: dims[tiefe]!, filter, tiefe, letzte: dims[tiefe] === 'titel_key' };
}

export function explorerHref(p: ExplorerParameter): string {
  const q = new URLSearchParams({ jahr: String(p.jahr), konto: p.konto, sicht: p.sicht });
  for (const d of EBENEN[p.sicht]) {
    const w = p.pfad[d];
    if (w === undefined) break;
    q.set(URL_PARAM[d]!, w);
  }
  return `/explorer?${q.toString()}`;
}

export function kindHref(p: ExplorerParameter, schluessel: string): string {
  const e = ebene(p);
  if (e.letzte) return `/titel/${p.jahr}/${schluessel}`;
  return explorerHref({ ...p, pfad: { ...e.filter, [e.gruppierung]: schluessel } });
}

export function bezeichnung(dim: string, schluessel: string, text: string | null | undefined): string {
  const s = dim === 'titel_key' && /^\d{9}$/.test(schluessel)
    ? `${schluessel.slice(0, 4)} ${schluessel.slice(4, 7)} ${schluessel.slice(7)}`
    : schluessel;
  return text ? `${s} ${text}` : s;
}

export function brotkrumen(p: ExplorerParameter, texte: Readonly<Record<string, string | null>>): { bezeichnung: string; href: string }[] {
  const krumen = [{ bezeichnung: 'Bund', href: explorerHref({ ...p, pfad: {} }) }];
  const bisher: Record<string, string> = {};
  for (const d of EBENEN[p.sicht]) {
    const w = p.pfad[d];
    if (w === undefined) break;
    bisher[d] = w;
    krumen.push({ bezeichnung: bezeichnung(d, w, texte[TEXTSPALTE[d]!] ?? null), href: explorerHref({ ...p, pfad: { ...bisher } }) });
  }
  return krumen;
}

export function trefferZiel(t: { typ: string; konto: Konto; schluessel: string }, jahr: number): string {
  const s = t.schluessel;
  const basis = { jahr, konto: t.konto };
  switch (t.typ) {
    case 'titel': return `/titel/${jahr}/${s}`;
    case 'einzelplan': return explorerHref({ ...basis, sicht: 'ressort', pfad: { einzelplan_nr: s } });
    case 'kapitel': return explorerHref({ ...basis, sicht: 'ressort', pfad: { einzelplan_nr: s.slice(0, 2), kapitel_nr: s } });
    case 'hauptfunktion': return explorerHref({ ...basis, sicht: 'aufgabe', pfad: { hauptfunktion: s } });
    case 'oberfunktion': return explorerHref({ ...basis, sicht: 'aufgabe', pfad: { hauptfunktion: s.slice(0, 1), oberfunktion: s } });
    case 'funktion': return explorerHref({ ...basis, sicht: 'aufgabe', pfad: { hauptfunktion: s.slice(0, 1), oberfunktion: s.slice(0, 2), fkt: s } });
    case 'hauptgruppe': return explorerHref({ ...basis, sicht: 'art', pfad: { hauptgruppe: s } });
    case 'obergruppe': return explorerHref({ ...basis, sicht: 'art', pfad: { hauptgruppe: s.slice(0, 1), obergruppe: s } });
    case 'gruppierung': return explorerHref({ ...basis, sicht: 'art', pfad: { hauptgruppe: s.slice(0, 1), obergruppe: s.slice(0, 2), gruppierung_nr: s } });
    default: return explorerHref({ ...basis, sicht: 'ressort', pfad: {} });
  }
}
