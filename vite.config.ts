import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    // Three pages: the dashboard, Flow and Mines. Paths resolve against the project root.
    rolldownOptions: { input: { home: 'index.html', flow: 'flow.html', mines: 'minesweeper.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
