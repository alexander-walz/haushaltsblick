import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Next.js löst `server-only` im Server-Bundle zu einem leeren Modul auf; die Tests laufen ohne diese Bedingung.
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx', 'app/**/*.test.ts'],
    environment: 'node',
  },
});
