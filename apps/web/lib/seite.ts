export type SuchParameter = Record<string, string | string[] | undefined>;

export function einzeln(sp: SuchParameter, name: string): string | undefined {
  const wert = sp[name];
  return Array.isArray(wert) ? wert[0] : wert;
}

export const MAX_EINGABE = 40;

/** Nutzereingaben erscheinen in Hinweisen nur gekürzt, damit niemand über die URL längere Texte auf der Seite platziert. */
export function kuerze(text: string, max: number = MAX_EINGABE): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
