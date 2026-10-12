import type { Zeile } from './daten/schemas';

export function zahl(z: Zeile | undefined, name: string): number | null {
  const w = z?.[name];
  return typeof w === 'number' ? w : null;
}

export function text(z: Zeile | undefined, name: string): string | null {
  const w = z?.[name];
  if (typeof w === 'string') return w;
  if (typeof w === 'number') return String(w);
  return null;
}
