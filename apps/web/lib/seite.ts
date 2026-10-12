export type SuchParameter = Record<string, string | string[] | undefined>;

export function einzeln(sp: SuchParameter, name: string): string | undefined {
  const wert = sp[name];
  return Array.isArray(wert) ? wert[0] : wert;
}
