import type { Konto } from '@hb/shared';
import { ACCOUNT, API_BASIS, holeGeprueft, pruefeElternwert, pruefeKonsistenz, zuCent, type ApiAbruf } from './crawler';
import { ApiVertragsFehler, type ApiAntwort } from './schema';

export type Sicht = 'funktion' | 'gruppierung';
export type SystematikParameter = { jahr: number; konto: Konto; sicht: Sicht };
export type SystematikEintrag = { code: string; ebene: 1 | 2 | 3; label: string; betragCent: number };
export type SystematikWurzel =
  | { status: 'nicht_verfuegbar'; url: string }
  | { status: 'ok'; url: string; antwort: ApiAntwort; roh: Buffer; warnungen: string[] };
export type SystematikErgebnis = {
  quelleTimestamp: number;
  eintraege: SystematikEintrag[];
  antworten: { url: string; roh: Buffer }[];
  warnungen: string[];
};

const UNIT = { funktion: 'function', gruppierung: 'group' } as const;
const PRAEFIX = { funktion: 'F-', gruppierung: 'G-' } as const;
const CODE_PRAEFIX = /^\d+\s+/;

export function systematikUrl(p: SystematikParameter, id?: string): string {
  const basis = `${API_BASIS}?year=${p.jahr}&account=${ACCOUNT[p.konto]}&quota=target&unit=${UNIT[p.sicht]}`;
  return id === undefined ? basis : `${basis}&id=${id}`;
}

export async function holeSystematikWurzel(p: SystematikParameter, abruf: ApiAbruf): Promise<SystematikWurzel> {
  const url = systematikUrl(p);
  const g = await holeGeprueft(url, abruf);
  if (!g) return { status: 'nicht_verfuegbar', url };
  return { status: 'ok', url, antwort: g.antwort, roh: g.roh, warnungen: g.warnungen };
}

/** Läuft Wurzel → Ebene 1 → Ebene 2 ab; die Codes der Ebene 3 stehen als Kinder in Ebene 2. Jede Ebene wird centgenau geprüft. */
export async function crawleSystematik(
  p: SystematikParameter,
  abruf: ApiAbruf,
  wurzel: Extract<SystematikWurzel, { status: 'ok' }>,
): Promise<SystematikErgebnis> {
  const vor = PRAEFIX[p.sicht];
  const eintraege: SystematikEintrag[] = [];
  const antworten = [{ url: wurzel.url, roh: wurzel.roh }];
  const warnungen = new Set(wurzel.warnungen);
  const codes = new Set<string>();
  const erwartung = (levelCur: number) => ({
    jahr: p.jahr, account: ACCOUNT[p.konto], quota: 'target' as const, unit: UNIT[p.sicht], levelCur, levelMax: 4 as const,
  });

  const code = (id: string, laenge: number, eltern: string, url: string): string => {
    const m = new RegExp(`^${vor}(\\d{${laenge}})$`).exec(id);
    if (!m) throw new ApiVertragsFehler(`Code ungültig: ${id}`, url);
    if (!m[1]!.startsWith(eltern)) throw new ApiVertragsFehler(`Code ${id} gehört nicht zu ${eltern}`, url);
    if (codes.has(m[1]!)) throw new ApiVertragsFehler(`Code ${id} mehrfach vorhanden`, url);
    codes.add(m[1]!);
    return m[1]!;
  };
  const eintrag = (c: string, ebene: 1 | 2 | 3, label: string, wert: number) =>
    eintraege.push({ code: c, ebene, label: label.replace(CODE_PRAEFIX, ''), betragCent: zuCent(wert) });
  const holeKnoten = async (id: string) => {
    const url = systematikUrl(p, id);
    const g = await holeGeprueft(url, abruf);
    if (!g) throw new ApiVertragsFehler('Knoten nicht gefunden (404)', url);
    if (g.antwort.detail.id !== id) throw new ApiVertragsFehler(`Antwort gehört zu Knoten ${g.antwort.detail.id} statt ${id}`, url);
    antworten.push({ url, roh: g.roh });
    for (const w of g.warnungen) warnungen.add(w);
    return { url, a: g.antwort };
  };

  pruefeKonsistenz(wurzel.antwort, wurzel.url, erwartung(0));
  for (const h of wurzel.antwort.children) {
    const c1 = code(h.id, 1, '', wurzel.url);
    eintrag(c1, 1, h.label, h.value);
    const { url: u1, a: a1 } = await holeKnoten(h.id);
    pruefeKonsistenz(a1, u1, erwartung(1));
    pruefeElternwert('Ebene 1', h.id, zuCent(a1.detail.value), zuCent(h.value), u1);
    for (const o of a1.children) {
      const c2 = code(o.id, 2, c1, u1);
      eintrag(c2, 2, o.label, o.value);
      const { url: u2, a: a2 } = await holeKnoten(o.id);
      pruefeKonsistenz(a2, u2, erwartung(2));
      pruefeElternwert('Ebene 2', o.id, zuCent(a2.detail.value), zuCent(o.value), u2);
      for (const f of a2.children) eintrag(code(f.id, 3, c2, u2), 3, f.label, f.value);
    }
  }
  return { quelleTimestamp: wurzel.antwort.meta.timestamp, eintraege, antworten, warnungen: [...warnungen] };
}
