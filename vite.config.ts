import { defineConfig } from 'vitest/config';
import { PAGES } from './src/pages';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    // The dashboard and every puzzle page (src/pages.ts). Paths resolve against the project root.
    rolldownOptions: { input: PAGES },
  },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
