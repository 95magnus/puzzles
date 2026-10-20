import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  webServer: {
    command: 'npm run build && npx vite preview --port 4173',
    port: 4173,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
