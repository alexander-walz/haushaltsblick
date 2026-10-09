import { apiUrl, centZuDezimal, zuCent, type ApiAbruf, type ApiParameter } from './crawler';

export type BaumPlan = Record<string, Record<string, Array<[titelNr: string, fkt: string, label: string, wert: number]>>>;

const ACCOUNT = { ausgaben: 'expenses', einnahmen: 'income' } as const;
const QUOTA = { ist: 'actual', soll: 'target' } as const;

/** Baut für einen Plan Einzelplan → Kapitel → Titel alle Antworten (Wurzel, Einzelpläne, Kapitel) mit centgenauen Summen. */
export function baueBaum(p: ApiParameter, plan: BaumPlan, timestamp = 1752216181000): Map<string, unknown> {
  const baum = new Map<string, unknown>();
  const meta = (levelCur: number, entity: string) => ({
    year: p.jahr, unit: 'single', quota: QUOTA[p.quote], account: ACCOUNT[p.konto], timestamp,
    modifyDate: '11.07.2025', entity, levelCur, levelMax: 3,
  });
  const wert = (cent: number) => Number(centZuDezimal(cent));
  const kind = (id: string, budgetNumber: string, label: string, cent: number) => ({
    id, budgetNumber, label, value: wert(cent), relativeToParentValue: 0, relativeValue: 0,
  });

  const epKinder = [];
  let gesamtCent = 0;
  for (const [ep, kapitel] of Object.entries(plan)) {
    const kapKinder = [];
    let epCent = 0;
    for (const [kap, titel] of Object.entries(kapitel)) {
      const titelKinder = titel.map(([nr, fkt, label, w]) =>
        kind(`${kap}${nr}`, `${kap} ${nr.slice(0, 3)} ${nr.slice(3)} - ${fkt}`, `${kap} ${nr.slice(0, 3)} ${nr.slice(3)} ${label}`, zuCent(w)));
      const kapCent = titel.reduce((s, [, , , w]) => s + zuCent(w), 0);
      baum.set(apiUrl(p, kap), {
        meta: meta(2, 'Chapter'),
        detail: { id: kap, budgetNumber: `${kap} ___ __ - ___`, label: `${kap} Kapitel`, value: wert(kapCent), relativeToParentValue: 0, relativeValue: 0 },
        children: titelKinder,
      });
      kapKinder.push(kind(kap, `${kap} ___ __ - ___`, `${kap} Kapitel`, kapCent));
      epCent += kapCent;
    }
    baum.set(apiUrl(p, ep), {
      meta: meta(1, 'Section'),
      detail: { id: ep, budgetNumber: `${ep}__ ___ __ - ___`, label: `${ep} Einzelplan`, value: wert(epCent), relativeToParentValue: 0, relativeValue: 0 },
      children: kapKinder,
    });
    epKinder.push(kind(ep, `${ep}__ ___ __ - ___`, `${ep} Einzelplan`, epCent));
    gesamtCent += epCent;
  }
  baum.set(apiUrl(p), {
    meta: meta(0, 'Budget'),
    detail: { label: `Haushaltsjahr ${p.jahr}`, value: wert(gesamtCent), relativeToParentValue: 100, relativeValue: 100 },
    children: epKinder,
  });
  return baum;
}

/** Liefert Antworten aus dem Baum, 404 für unbekannte URLs, und merkt sich jeden Aufruf. */
export function fakeAbruf(baum: Map<string, unknown>): ApiAbruf & { aufrufe: string[] } {
  const aufrufe: string[] = [];
  const abruf = async (url: string) => {
    aufrufe.push(url);
    const json = baum.get(url);
    if (json === undefined) return { status: 404 as const };
    return { status: 200 as const, json: structuredClone(json), roh: Buffer.from(JSON.stringify(json)) };
  };
  return Object.assign(abruf, { aufrufe });
}
