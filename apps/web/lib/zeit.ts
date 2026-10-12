/** Heutiges Datum; HB_HEUTE (YYYY-MM-DD) macht Tests und aufgezeichnete Ende-zu-Ende-Läufe deterministisch. */
export function heute(env: Record<string, string | undefined> = process.env): Date {
  const wert = env.HB_HEUTE;
  if (!wert) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) throw new Error(`HB_HEUTE muss YYYY-MM-DD sein, nicht ${wert}`);
  return new Date(`${wert}T12:00:00Z`);
}
