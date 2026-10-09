import { z } from 'zod';

export class ApiVertragsFehler extends Error {
  readonly url: string;

  constructor(meldung: string, url: string) {
    super(`${meldung} (bei ${url})`);
    this.name = 'ApiVertragsFehler';
    this.url = url;
  }
}

const KIND = z.object({
  id: z.string().regex(/^(\d{2}|\d{4}|\d{9}|[FG]-\d{1,3})$/),
  budgetNumber: z.string(),
  label: z.string(),
  value: z.number(),
  relativeToParentValue: z.number(),
  relativeValue: z.number(),
});

const META = z.object({
  year: z.number().int(),
  unit: z.enum(['single', 'function', 'group']),
  quota: z.enum(['target', 'actual']),
  account: z.enum(['expenses', 'income']),
  timestamp: z.number().int(),
  modifyDate: z.string(),
  entity: z.enum(['Budget', 'Section', 'Chapter', 'Title', 'Function', 'Group']),
  levelCur: z.number().int().min(0).max(3),
  levelMax: z.union([z.literal(3), z.literal(4)]),
});

const DETAIL = z.object({
  id: z.string().optional(),
  budgetNumber: z.string().optional(),
  label: z.string(),
  value: z.number(),
  relativeToParentValue: z.number(),
  relativeValue: z.number(),
  tableLabel: z.string().optional(),
  selectionLabel: z.string().optional(),
  pdf: z.array(z.string()).optional(),
});

const ANTWORT = z.object({
  meta: META,
  detail: DETAIL,
  children: z.array(KIND).default([]),
  parents: z.unknown().optional(),
  related: z.unknown().optional(),
});

export type ApiKind = z.infer<typeof KIND>;
export type ApiAntwort = z.infer<typeof ANTWORT>;

const BEKANNT = {
  antwort: new Set(Object.keys(ANTWORT.shape)),
  meta: new Set(Object.keys(META.shape)),
  detail: new Set(Object.keys(DETAIL.shape)),
  kind: new Set(Object.keys(KIND.shape)),
};

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function unbekannteFelder(json: Record<string, unknown>): string[] {
  const warnungen = new Set<string>();
  const pruefe = (obj: unknown, bekannt: Set<string>, praefix: string) => {
    if (!istObjekt(obj)) return;
    for (const schluessel of Object.keys(obj)) if (!bekannt.has(schluessel)) warnungen.add(`Unbekanntes Feld ${praefix}${schluessel}`);
  };
  pruefe(json, BEKANNT.antwort, '');
  pruefe(json.meta, BEKANNT.meta, 'meta.');
  pruefe(json.detail, BEKANNT.detail, 'detail.');
  if (Array.isArray(json.children)) for (const kind of json.children) pruefe(kind, BEKANNT.kind, 'children[].');
  return [...warnungen];
}

/** Prüft eine Antwort gegen den Datenvertrag. Pflichtverletzungen werfen, unbekannte Felder werden Warnungen. */
export function pruefeApiAntwort(json: unknown, url: string): { antwort: ApiAntwort; warnungen: string[] } {
  if (!istObjekt(json)) throw new ApiVertragsFehler('Antwort ist kein JSON-Objekt', url);
  const ergebnis = ANTWORT.safeParse(json);
  if (!ergebnis.success) {
    const fehler = ergebnis.error.issues.map((i) => `${i.path.join('.') || '(wurzel)'}: ${i.message}`).join('; ');
    throw new ApiVertragsFehler(`Antwort verletzt das Schema: ${fehler}`, url);
  }
  return { antwort: ergebnis.data, warnungen: unbekannteFelder(json) };
}
