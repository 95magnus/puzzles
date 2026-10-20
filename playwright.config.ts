import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: { command: 'npm run build && npx vite preview --port 4174 --strictPort', port: 4174, reuseExistingServer: false },
  use: { baseURL: 'http://localhost:4174' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
