export type Konfiguration = { url: string; key: string };

/** Zugang zur Data API (nur serverseitig; der Publishable Key ist öffentlich, wird aber nicht an den Browser gegeben). */
export function konfiguration(env: Record<string, string | undefined> = process.env): Konfiguration {
  const url = env.HB_API_URL;
  const key = env.HB_API_KEY;
  if (!url || !key) throw new Error('HB_API_URL und HB_API_KEY müssen gesetzt sein');
  return { url: url.replace(/\/+$/, ''), key };
}
