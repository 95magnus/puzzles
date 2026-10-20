import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    // Two pages: Flow and Mines. Paths resolve against the project root.
    rolldownOptions: { input: { main: 'index.html', mines: 'minesweeper.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
