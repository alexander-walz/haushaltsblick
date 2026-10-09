export type Schwere = 'error' | 'warn';
export type KatalogEintrag = { checkId: string; schwere: Schwere };
export type DbtTest = { name: string; dqId: string; schwere: Schwere; status: string; failures: number; nachricht: string | null };
export type DqStatus = 'pass' | 'warn' | 'fail';
export type DqErgebnis = { checkId: string; status: DqStatus; failures: number; details: string[] };
export type Ampel = 'green' | 'yellow' | 'red';
/** Aufrufdaten des dbt-Laufs aus run_results.json (args und metadata.invocation_id). */
export type DbtAufruf = { invocation_id: string | null; which: string | null; select: unknown[]; exclude: unknown[]; vars: Record<string, unknown> };

type Objekt = Record<string, unknown>;
const istObjekt = (x: unknown): x is Objekt => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Verknüpft die Ergebnisse von dbt mit den Knoten des Manifests; nur Tests mit dq_id zählen. */
export function leseDbtTests(runResults: unknown, manifest: unknown): DbtTest[] {
  const ergebnisse = istObjekt(runResults) && Array.isArray(runResults.results) ? runResults.results : [];
  const knoten = istObjekt(manifest) && istObjekt(manifest.nodes) ? manifest.nodes : {};
  const tests: DbtTest[] = [];
  for (const r of ergebnisse) {
    if (!istObjekt(r) || typeof r.unique_id !== 'string') continue;
    const k = knoten[r.unique_id];
    if (!istObjekt(k) || k.resource_type !== 'test' || !istObjekt(k.config)) continue;
    const dqId = istObjekt(k.config.meta) ? k.config.meta.dq_id : undefined;
    if (typeof dqId !== 'string') continue;
    const schwere = typeof k.config.severity === 'string' && k.config.severity.toLowerCase() === 'warn' ? 'warn' : 'error';
    tests.push({
      name: String(k.name),
      dqId,
      schwere,
      status: String(r.status),
      failures: typeof r.failures === 'number' ? r.failures : 0,
      nachricht: typeof r.message === 'string' ? r.message : null,
    });
  }
  return tests;
}

/** Liest, wie dbt aufgerufen wurde; gesetzte vars kennzeichnen einen gelockerten Testlauf. */
export function leseDbtAufruf(runResults: unknown): DbtAufruf {
  const args = istObjekt(runResults) && istObjekt(runResults.args) ? runResults.args : {};
  const metadata = istObjekt(runResults) && istObjekt(runResults.metadata) ? runResults.metadata : {};
  return {
    invocation_id: typeof metadata.invocation_id === 'string' ? metadata.invocation_id : null,
    which: typeof args.which === 'string' ? args.which : null,
    select: Array.isArray(args.select) ? args.select : [],
    exclude: Array.isArray(args.exclude) ? args.exclude : [],
    vars: istObjekt(args.vars) ? args.vars : {},
  };
}

const RANG: Record<DqStatus, number> = { pass: 0, warn: 1, fail: 2 };

function bewerteTest(t: DbtTest): { status: DqStatus; detail: string | null } {
  const detail = t.failures > 0 ? `${t.name}: ${t.failures} Zeilen` : (t.nachricht ?? `${t.name}: ${t.failures} Zeilen`);
  switch (t.status) {
    case 'pass':
      return { status: 'pass', detail: null };
    case 'warn':
      return { status: 'warn', detail };
    case 'fail':
      return { status: t.schwere === 'warn' ? 'warn' : 'fail', detail };
    default:
      return { status: 'fail', detail: `${t.name}: nicht ausgeführt (${t.status})` };
  }
}

export function bewerteDq(tests: DbtTest[], katalog: KatalogEintrag[]): { ergebnisse: DqErgebnis[]; ampel: Ampel; score: number } {
  const bekannt = new Set(katalog.map((k) => k.checkId));
  for (const t of tests) {
    if (!bekannt.has(t.dqId)) throw new Error(`Test ${t.name} verweist auf unbekannte Prüfung ${t.dqId}`);
  }
  const ergebnisse: DqErgebnis[] = katalog.map((k) => {
    const eigene = tests.filter((t) => t.dqId === k.checkId);
    if (eigene.length === 0) return { checkId: k.checkId, status: 'fail', failures: 0, details: ['kein Test gefunden'] };
    let status: DqStatus = 'pass';
    let failures = 0;
    const details: string[] = [];
    for (const t of eigene) {
      // Für die Statusabbildung zählt die Schwere aus dem Katalog; eine abweichende dbt-Schwere ist ein Fehler.
      const b = t.schwere === k.schwere
        ? bewerteTest(t)
        : { status: 'fail' as const, detail: `${t.name}: Schwere ${t.schwere} weicht vom Katalog (${k.schwere}) ab` };
      if (RANG[b.status] > RANG[status]) status = b.status;
      failures += t.failures;
      if (b.detail) details.push(b.detail);
    }
    return { checkId: k.checkId, status, failures, details };
  });
  const ampel: Ampel = ergebnisse.some((e) => e.status === 'fail') ? 'red' : ergebnisse.some((e) => e.status === 'warn') ? 'yellow' : 'green';
  const gewicht = (k: KatalogEintrag) => (k.schwere === 'error' ? 3 : 1);
  const gesamt = katalog.reduce((s, k) => s + gewicht(k), 0);
  const bestanden = katalog.reduce((s, k, i) => s + (ergebnisse[i]?.status === 'pass' ? gewicht(k) : 0), 0);
  const score = gesamt === 0 ? 0 : Math.round((100 * bestanden / gesamt) * 100) / 100;
  return { ergebnisse, ampel, score };
}
