import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    // Five pages: the dashboard, Flow, Mines, Tangle and Queens. Paths resolve against the project root.
    rolldownOptions: { input: { home: 'index.html', flow: 'flow.html', mines: 'minesweeper.html', tangle: 'tangle.html', queens: 'queens.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
