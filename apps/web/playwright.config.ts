import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3100' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'node e2e/fixture-api.mjs', url: 'http://127.0.0.1:4010/health', reuseExistingServer: !process.env.CI },
    {
      command: 'pnpm build && pnpm start -p 3100',
      url: 'http://127.0.0.1:3100/impressum',
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: { HB_API_URL: 'http://127.0.0.1:4010', HB_API_KEY: 'aufnahme', HB_HEUTE: '2026-10-12', REVALIDATE_TOKEN: 'e2e-token' },
    },
  ],
});
