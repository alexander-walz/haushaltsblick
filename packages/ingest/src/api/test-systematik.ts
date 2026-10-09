import { centZuDezimal, zuCent } from './crawler';
import { systematikUrl, type SystematikParameter } from './systematik';

export type SystematikPlan = Record<string, Record<string, Array<[code3: string, label: string, wert: number]>>>;

const ACCOUNT = { ausgaben: 'expenses', einnahmen: 'income' } as const;
const UNIT = { funktion: 'function', gruppierung: 'group' } as const;
const ENTITY = { funktion: 'Function', gruppierung: 'Group' } as const;
const PRAEFIX = { funktion: 'F-', gruppierung: 'G-' } as const;

/** Baut Wurzel, Ebene 1 und Ebene 2 einer Systematik-Sicht mit centgenauen Summen. Ebene 3 steht nur als Kinder in Ebene 2. */
export function baueSystematikBaum(p: SystematikParameter, plan: SystematikPlan, timestamp = 1711628039000): Map<string, unknown> {
  const baum = new Map<string, unknown>();
  const vor = PRAEFIX[p.sicht];
  const meta = (levelCur: number, entity: string) => ({
    year: p.jahr, unit: UNIT[p.sicht], quota: 'target', account: ACCOUNT[p.konto], timestamp,
    modifyDate: '28.03.2024', entity, levelCur, levelMax: 4,
  });
  const wert = (cent: number) => Number(centZuDezimal(cent));
  const kind = (code: string, label: string, cent: number) => ({
    id: `${vor}${code}`, budgetNumber: '____ ___ __ - ___', label: `${code} ${label}`, value: wert(cent), relativeToParentValue: 0, relativeValue: 0,
  });

  const hauptKinder = [];
  let gesamt = 0;
  for (const [h, ober] of Object.entries(plan)) {
    const oberKinder = [];
    let hCent = 0;
    for (const [o, codes] of Object.entries(ober)) {
      const oCent = codes.reduce((s, [, , w]) => s + zuCent(w), 0);
      baum.set(systematikUrl(p, `${vor}${o}`), {
        meta: meta(2, ENTITY[p.sicht]),
        detail: { id: `${vor}${o}`, label: `${o} Ober ${o}`, value: wert(oCent), relativeToParentValue: 0, relativeValue: 0 },
        children: codes.map(([c, label, w]) => kind(c, label, zuCent(w))),
      });
      oberKinder.push(kind(o, `Ober ${o}`, oCent));
      hCent += oCent;
    }
    baum.set(systematikUrl(p, `${vor}${h}`), {
      meta: meta(1, ENTITY[p.sicht]),
      detail: { id: `${vor}${h}`, label: `${h} Haupt ${h}`, value: wert(hCent), relativeToParentValue: 0, relativeValue: 0 },
      children: oberKinder,
    });
    hauptKinder.push(kind(h, `Haupt ${h}`, hCent));
    gesamt += hCent;
  }
  baum.set(systematikUrl(p), {
    meta: meta(0, 'Budget'),
    detail: { label: `Sollwerte des Haushaltsjahres ${p.jahr}`, value: wert(gesamt), relativeToParentValue: 100, relativeValue: 100 },
    children: hauptKinder,
  });
  return baum;
}
