import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/e2e/**', 'node_modules/**'] },
});
