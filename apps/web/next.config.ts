import type { NextConfig } from 'next';

// TypeScript 7 bietet die klassische Compiler-Schnittstelle nicht mehr an, die next build für die Typprüfung nutzt.
// Die Typen prüft deshalb `pnpm typecheck` (tsc) in der CI; der Build überspringt sie.
// Härtung ohne Content-Security-Policy: eine CSP bräuchte Nonces für die Skripte von Next.js und eigene Tests.
const SICHERHEITS_HEADER = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: SICHERHEITS_HEADER }];
  },
};

export default config;
