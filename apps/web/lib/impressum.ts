/** Pflichtangaben stehen nur in Umgebungsvariablen (Vercel), nie im Repository. */
export function impressum(env: Record<string, string | undefined> = process.env): { name: string; anschrift: string[]; kontakt: string } | null {
  const name = env.HB_IMPRESSUM_NAME?.trim();
  const anschrift = env.HB_IMPRESSUM_ANSCHRIFT?.split('|').map((z) => z.trim()).filter(Boolean);
  const kontakt = env.HB_IMPRESSUM_KONTAKT?.trim();
  if (!name || !anschrift || anschrift.length === 0 || !kontakt) return null;
  return { name, anschrift, kontakt };
}
