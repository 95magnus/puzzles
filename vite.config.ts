import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    // Seven pages: the dashboard, Flow, Mines, Tangle, Queens, Patches and Tango. Paths resolve against the project root.
    rolldownOptions: { input: { home: 'index.html', flow: 'flow.html', mines: 'minesweeper.html', tangle: 'tangle.html', queens: 'queens.html', patches: 'patches.html', tango: 'tango.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
