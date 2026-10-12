import { istVerfuegbar, type Standardjahre } from './daten/jahre';
import type { Datenstand, Zeile } from './daten/schemas';
import { einzeln, type SuchParameter } from './seite';

export type PlanIstEbene = 'einzelplan' | 'kapitel' | 'titel';
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

export function lesePlanIstParameter(sp: SuchParameter, stand: Datenstand, jahre: Standardjahre): {
  jahr: number; konto: 'ausgaben' | 'einnahmen'; ebene: PlanIstEbene; sortierung: 'abweichung' | 'abweichung_rel'; hinweise: string[];
} {
  const hinweise: string[] = [];
  const konto = einzeln(sp, 'konto') === 'einnahmen' ? 'einnahmen' as const : 'ausgaben' as const;
  const standard = jahre.letztesMitIst ?? jahre.laufend;
  let jahr = standard;
  const jahrText = einzeln(sp, 'jahr');
  if (jahrText !== undefined) {
    const j = Number(jahrText);
    if (Number.isInteger(j) && istVerfuegbar(stand, j, konto)) jahr = j;
    else hinweise.push(`Für ${jahrText} liegt noch kein Ist vor. Gezeigt wird ${standard}, das letzte abgeschlossene Jahr.`);
  }
  const e = einzeln(sp, 'ebene');
  const ebene: PlanIstEbene = e === 'kapitel' || e === 'titel' ? e : 'einzelplan';
  const sortierung = einzeln(sp, 'sortierung') === 'relativ' ? 'abweichung_rel' as const : 'abweichung' as const;
  return { jahr, konto, ebene, sortierung, hinweise };
}
