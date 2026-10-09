import type { Konto } from '@hb/shared';
import { holeMitWiederholung, type Drossel, type HttpOptionen } from '../abruf/http';
import { ApiVertragsFehler, pruefeApiAntwort, type ApiAntwort } from './schema';

export type Quote = 'soll' | 'ist';
export type ApiParameter = { jahr: number; konto: Konto; quote: Quote };
export type ApiRohAntwort = { status: 200; json: unknown; roh: Buffer } | { status: 404 };
export type ApiAbruf = (url: string) => Promise<ApiRohAntwort>;

export type ApiTitel = { einzelplanNr: string; kapitelNr: string; titelNr: string; fkt: string; label: string; betragCent: number };
export type ApiKnoten = { ebene: 'gesamt' | 'einzelplan' | 'kapitel'; knotenId: string; label: string; betragCent: number };
export type Wurzel =
  | { status: 'nicht_verfuegbar'; url: string }
  | { status: 'ok'; url: string; antwort: ApiAntwort; roh: Buffer; warnungen: string[] };
export type CrawlErgebnis = {
  quelleTimestamp: number;
  modifyDate: string;
  knoten: ApiKnoten[];
  titel: ApiTitel[];
  antworten: { url: string; roh: Buffer }[];
  warnungen: string[];
};

export const API_BASIS = 'https://www.bundeshaushalt.de/internalapi/budgetData';
export const ACCOUNT = { ausgaben: 'expenses', einnahmen: 'income' } as const;
const QUOTA = { ist: 'actual', soll: 'target' } as const;
const BUDGET_NUMBER_TITEL = /^(\d{4}) (\d{3}) (\d{2}) - (\d{3})$/;
const LABEL_PRAEFIX = /^\d{4} \d{3} \d{2} /;

export function apiUrl(p: ApiParameter, id?: string): string {
  const basis = `${API_BASIS}?year=${p.jahr}&account=${ACCOUNT[p.konto]}&quota=${QUOTA[p.quote]}&unit=single`;
  return id === undefined ? basis : `${basis}&id=${id}`;
}

export const zuCent = (wert: number): number => Math.round(wert * 100);

export function centZuDezimal(cent: number): string {
  const vorzeichen = cent < 0 ? '-' : '';
  const betrag = Math.abs(cent);
  return `${vorzeichen}${Math.trunc(betrag / 100)}.${String(betrag % 100).padStart(2, '0')}`;
}

export async function holeGeprueft(url: string, abruf: ApiAbruf) {
  const roh = await abruf(url);
  if (roh.status === 404) return null;
  return { roh: roh.roh, ...pruefeApiAntwort(roh.json, url) };
}

export type Erwartung = {
  jahr: number;
  account: 'expenses' | 'income';
  quota: 'target' | 'actual';
  unit: 'single' | 'function' | 'group';
  levelCur: number;
  levelMax: 3 | 4;
};

/** Prüft, dass die Antwort zur Anfrage passt und der Knoten centgenau der Summe seiner Kinder entspricht. */
export function pruefeKonsistenz(a: ApiAntwort, url: string, e: Erwartung): void {
  if (a.meta.year !== e.jahr || a.meta.account !== e.account || a.meta.quota !== e.quota || a.meta.unit !== e.unit || a.meta.levelMax !== e.levelMax) {
    throw new ApiVertragsFehler('Antwort passt nicht zur Anfrage', url);
  }
  if (a.meta.levelCur !== e.levelCur) throw new ApiVertragsFehler(`levelCur ${a.meta.levelCur} statt ${e.levelCur}`, url);
  const kinderCent = a.children.reduce((s, k) => s + zuCent(k.value), 0);
  const knotenCent = zuCent(a.detail.value);
  if (kinderCent !== knotenCent) {
    throw new ApiVertragsFehler(`Summe der Kinder ${centZuDezimal(kinderCent)} weicht vom Knoten ${centZuDezimal(knotenCent)} ab`, url);
  }
}

export function pruefeElternwert(ebene: string, id: string, eigenCent: number, elternCent: number, url: string): void {
  if (eigenCent !== elternCent) {
    throw new ApiVertragsFehler(`${ebene} ${id}: Wert ${centZuDezimal(eigenCent)} weicht vom Elternknoten ${centZuDezimal(elternCent)} ab`, url);
  }
}

export async function holeWurzel(p: ApiParameter, abruf: ApiAbruf): Promise<Wurzel> {
  const url = apiUrl(p);
  const g = await holeGeprueft(url, abruf);
  if (!g) return { status: 'nicht_verfuegbar', url };
  return { status: 'ok', url, antwort: g.antwort, roh: g.roh, warnungen: g.warnungen };
}

/** Läuft Wurzel → Einzelpläne → Kapitel ab und prüft jede Ebene centgenau gegen die Summe ihrer Kinder. */
export async function crawle(p: ApiParameter, abruf: ApiAbruf, wurzel: Extract<Wurzel, { status: 'ok' }>): Promise<CrawlErgebnis> {
  const knoten: ApiKnoten[] = [];
  const titel: ApiTitel[] = [];
  const antworten = [{ url: wurzel.url, roh: wurzel.roh }];
  const warnungen = new Set(wurzel.warnungen);
  const titelKeys = new Set<string>();

  const pruefeAntwort = (a: ApiAntwort, url: string, levelCur: number) =>
    pruefeKonsistenz(a, url, { jahr: p.jahr, account: ACCOUNT[p.konto], quota: QUOTA[p.quote], unit: 'single', levelCur, levelMax: 3 });
  const pruefeKnotenId = (a: ApiAntwort, id: string, url: string) => {
    if (a.detail.id !== id) throw new ApiVertragsFehler(`Antwort gehört zu Knoten ${a.detail.id ?? '(ohne ID)'} statt ${id}`, url);
  };
  const holeKnoten = async (id: string) => {
    const url = apiUrl(p, id);
    const g = await holeGeprueft(url, abruf);
    if (!g) throw new ApiVertragsFehler('Knoten nicht gefunden (404)', url);
    antworten.push({ url, roh: g.roh });
    for (const w of g.warnungen) warnungen.add(w);
    return { url, a: g.antwort };
  };

  const w = wurzel.antwort;
  pruefeAntwort(w, wurzel.url, 0);
  if (w.children.length === 0) throw new ApiVertragsFehler('Wurzel ohne Einzelpläne', wurzel.url);
  knoten.push({ ebene: 'gesamt', knotenId: '', label: w.detail.label, betragCent: zuCent(w.detail.value) });

  for (const ep of w.children) {
    if (!/^\d{2}$/.test(ep.id)) throw new ApiVertragsFehler(`Einzelplan-ID ungültig: ${ep.id}`, wurzel.url);
    const { url: epUrl, a: epA } = await holeKnoten(ep.id);
    pruefeAntwort(epA, epUrl, 1);
    pruefeKnotenId(epA, ep.id, epUrl);
    pruefeElternwert('Einzelplan', ep.id, zuCent(epA.detail.value), zuCent(ep.value), epUrl);
    knoten.push({ ebene: 'einzelplan', knotenId: ep.id, label: ep.label, betragCent: zuCent(ep.value) });

    for (const kap of epA.children) {
      if (!/^\d{4}$/.test(kap.id) || !kap.id.startsWith(ep.id)) throw new ApiVertragsFehler(`Kapitel-ID ungültig: ${kap.id}`, epUrl);
      const { url: kapUrl, a: kapA } = await holeKnoten(kap.id);
      pruefeAntwort(kapA, kapUrl, 2);
      pruefeKnotenId(kapA, kap.id, kapUrl);
      pruefeElternwert('Kapitel', kap.id, zuCent(kapA.detail.value), zuCent(kap.value), kapUrl);
      knoten.push({ ebene: 'kapitel', knotenId: kap.id, label: kap.label, betragCent: zuCent(kap.value) });

      for (const t of kapA.children) {
        if (!/^\d{9}$/.test(t.id) || !t.id.startsWith(kap.id)) throw new ApiVertragsFehler(`Titel-ID ungültig: ${t.id}`, kapUrl);
        const m = BUDGET_NUMBER_TITEL.exec(t.budgetNumber);
        if (!m || m[1] !== kap.id || `${m[2]}${m[3]}` !== t.id.slice(4)) {
          throw new ApiVertragsFehler(`budgetNumber ungültig für Titel ${t.id}: ${t.budgetNumber}`, kapUrl);
        }
        if (titelKeys.has(t.id)) throw new ApiVertragsFehler(`Titel ${t.id} mehrfach vorhanden`, kapUrl);
        titelKeys.add(t.id);
        titel.push({
          einzelplanNr: ep.id,
          kapitelNr: kap.id,
          titelNr: t.id.slice(4),
          fkt: m[4]!,
          label: t.label.replace(LABEL_PRAEFIX, ''),
          betragCent: zuCent(t.value),
        });
      }
    }
  }

  return { quelleTimestamp: w.meta.timestamp, modifyDate: w.meta.modifyDate, knoten, titel, antworten, warnungen: [...warnungen] };
}

/** Abruf über das Netz: jede Anfrage wartet auf die gemeinsame Drossel; 404 ist ein Ergebnis, kein Fehler. */
export function netzAbruf(opt: { userAgent: string; drossel: Drossel; http?: Partial<HttpOptionen> }): ApiAbruf {
  return async (url) => {
    await opt.drossel.warteAufSlot();
    const antwort = await holeMitWiederholung(url, { ...opt.http, userAgent: opt.userAgent });
    if (antwort.status === 404) return { status: 404 };
    if (antwort.status !== 200) throw new Error(`Unerwarteter Status ${antwort.status} für ${url}`);
    const contentType = antwort.headers.get('content-type') ?? '';
    if (!/json/i.test(contentType)) throw new Error(`Antwort ist kein JSON (Content-Type: ${contentType || 'fehlt'}) bei ${url}`);
    let json: unknown;
    try {
      json = JSON.parse(antwort.inhalt.toString('utf8'));
    } catch {
      throw new ApiVertragsFehler('Antwort ist kein gültiges JSON', url);
    }
    return { status: 200, json, roh: antwort.inhalt };
  };
}
