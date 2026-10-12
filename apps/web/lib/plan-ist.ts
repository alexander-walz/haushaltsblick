import { istVerfuegbar, type Standardjahre } from './daten/jahre';
import type { Datenstand, Zeile } from './daten/schemas';
import { einzeln, kuerze, type SuchParameter } from './seite';

export type PlanIstEbene = 'einzelplan' | 'kapitel' | 'titel';
export const ANZAHL_ABWEICHUNGEN = 12;
export const EBENE_DIM: Record<PlanIstEbene, string> = { einzelplan: 'einzelplan_nr', kapitel: 'kapitel_nr', titel: 'titel_key' };

/** Auswahl der größten Abweichungen nach Betrag aus den Abfragen „absteigend“ und „aufsteigend“ (reine Darstellung). */
export function groessteAbweichungen(zeilen: readonly Zeile[], dim: string, kennzahl: 'abweichung' | 'abweichung_rel', n: number): Zeile[] {
  const gesehen = new Set<string>();
  const eindeutig: Zeile[] = [];
  for (const z of zeilen) {
    const k = String(z[dim]);
    const w = z[kennzahl];
    if (gesehen.has(k) || typeof w !== 'number') continue;
    gesehen.add(k);
    eindeutig.push(z);
  }
  return eindeutig.sort((a, b) => Math.abs(b[kennzahl] as number) - Math.abs(a[kennzahl] as number)).slice(0, n);
}

export const HINWEIS_BASIS_NULL = 'n. v.: Bei einem Soll von 0 ist keine relative Abweichung definiert.';

/**
 * Fußnoten der Seite aus den Hinweisen aller Abfragen, ohne Dubletten. Der Kürzungshinweis der API entfällt,
 * weil der Titel die Auswahl („die 12 größten Abweichungen“) selbst nennt.
 */
export function fussnotenPlanIst(listen: readonly (readonly string[])[]): string[] {
  return [...new Set(listen.flat())].filter((h) => !h.startsWith('Ergebnis auf'));
}

export function lesePlanIstParameter(sp: SuchParameter, stand: Datenstand, jahre: Standardjahre): {
  jahr: number; konto: 'ausgaben' | 'einnahmen'; ebene: PlanIstEbene; sortierung: 'abweichung' | 'abweichung_rel'; hinweise: string[];
} {
  const hinweise: string[] = [];
  const konto = einzeln(sp, 'konto') === 'einnahmen' ? 'einnahmen' as const : 'ausgaben' as const;
  const standard = jahre.letztesMitIst ?? jahre.laufend;
  if (jahre.letztesMitIst === null) hinweise.push('Noch kein abgeschlossenes Jahr mit Ist verfügbar.');
  let jahr = standard;
  const jahrText = einzeln(sp, 'jahr');
  if (jahrText !== undefined) {
    const j = Number(jahrText);
    if (!Number.isInteger(j) || !jahre.alle.includes(j)) hinweise.push(`Das Jahr „${kuerze(jahrText)}“ ist nicht verfügbar. Gezeigt wird ${standard}.`);
    else if (istVerfuegbar(stand, j, konto)) jahr = j;
    else hinweise.push(`Für ${jahrText} liegt noch kein Ist vor. Gezeigt wird ${standard}, das letzte abgeschlossene Jahr.`);
  }
  const e = einzeln(sp, 'ebene');
  const ebene: PlanIstEbene = e === 'kapitel' || e === 'titel' ? e : 'einzelplan';
  const sortierung = einzeln(sp, 'sortierung') === 'relativ' ? 'abweichung_rel' as const : 'abweichung' as const;
  return { jahr, konto, ebene, sortierung, hinweise };
}
