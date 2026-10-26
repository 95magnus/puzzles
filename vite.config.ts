import { defineConfig } from 'vitest/config';
import { offline } from './build/offline.ts';
import { PAGES } from './src/pages.ts';

export default defineConfig({
  base: './',
  plugins: [offline()],
  worker: { format: 'es' },
  build: {
    // The dashboard and every puzzle page (src/pages.ts). Paths resolve against the project root.
    rolldownOptions: { input: PAGES },
  },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
