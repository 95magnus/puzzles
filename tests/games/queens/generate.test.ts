import { expect, test } from 'vitest';
import {
  DAILY_PRESET,
  PRESETS,
  generatePuzzle,
  isConnected,
  queensDailySeed,
  regionSizes,
} from '../../../src/games/queens/generate';
import { countSolutions, isValidPlacement } from '../../../src/games/queens/solver';
import { seedFromString } from '../../../src/core/rng';
import type { PresetId } from '../../../src/games/queens/types';

const IDS: PresetId[] = ['small', 'medium', 'large'];
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

const snap = (p: { regions: Uint8Array; solution: number[] }) =>
  JSON.stringify({ regions: [...p.regions], solution: p.solution });

test('presets match spec', () => {
  expect(PRESETS).toEqual({
    small: { size: 7, label: 'Small' },
    medium: { size: 8, label: 'Medium' },
    large: { size: 9, label: 'Large' },
  });
  expect(DAILY_PRESET).toBe('medium');
});

test('queensDailySeed is namespaced', () => {
  expect(queensDailySeed('2026-10-22')).toBe(seedFromString('queens-daily:2026-10-22'));
});

test('deterministic', () => {
  expect(generatePuzzle(8, 7)).toEqual(generatePuzzle(8, 7));
  for (const id of IDS) expect(snap(generatePuzzle(PRESETS[id].size, 7))).toMatchSnapshot(id);
});

test('regions are well formed', () => {
  for (const id of IDS) {
    const { size } = PRESETS[id];
    for (const seed of SEEDS) {
      const p = generatePuzzle(size, seed);
      expect(p.regions.length).toBe(size * size);
      expect(p.regions.every((r) => r < size), `${id} ${seed}`).toBe(true);
      const sizes = regionSizes(p);
      expect(sizes.length).toBe(size);
      expect(sizes.every((s) => s > 0), `${id} ${seed}`).toBe(true);
      expect(sizes.filter((s) => s === 1).length).toBeLessThanOrEqual(1);
      for (let k = 0; k < size; k++) expect(isConnected(p, k), `${id} ${seed} region ${k}`).toBe(true);
    }
  }
});

test('unique and correct', () => {
  for (const id of IDS) {
    for (const seed of SEEDS) {
      const p = generatePuzzle(PRESETS[id].size, seed);
      expect(countSolutions(p, 2), `${id} ${seed}`).toBe(1);
      expect(isValidPlacement(p, p.solution)).toBe(true);
    }
  }
});

test('daily is stable', () => {
  const p = generatePuzzle(PRESETS[DAILY_PRESET].size, queensDailySeed('2026-10-22'));
  expect(snap(p)).toMatchSnapshot();
});

test.skipIf(!!import.meta.env.CI)('fast enough: large median < 100 ms', () => {
  const times: number[] = [];
  for (let seed = 1; seed <= 5; seed++) {
    const t0 = performance.now();
    generatePuzzle(9, seed);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  expect(times[2]).toBeLessThan(100);
});

test('throws on unsupported sizes', () => {
  expect(() => generatePuzzle(3, 1)).toThrow();
  expect(() => generatePuzzle(10, 1)).toThrow();
});
