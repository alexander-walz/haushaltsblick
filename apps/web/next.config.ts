import type { NextConfig } from 'next';

// TypeScript 7 bietet die klassische Compiler-Schnittstelle nicht mehr an, die next build für die Typprüfung nutzt.
// Die Typen prüft deshalb `pnpm typecheck` (tsc) in der CI; der Build überspringt sie.
const config: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
