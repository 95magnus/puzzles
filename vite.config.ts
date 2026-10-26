import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    // Eight pages: the dashboard, Flow, Mines, Tangle, Queens, Patches, Balanced and Bridges. Paths resolve against the project root.
    rolldownOptions: { input: { home: 'index.html', flow: 'flow.html', mines: 'minesweeper.html', tangle: 'tangle.html', queens: 'queens.html', patches: 'patches.html', balanced: 'balanced.html', bridges: 'bridges.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
