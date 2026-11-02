import { describe, expect, test, it } from 'vitest';
import { DAILY_PRESET, PRESETS, generatePuzzle, sumsDailySeed } from '../../../src/games/sums/generate';
import { countSolutions, deduce, lineCells } from '../../../src/games/sums/solver';
import { seedFromString } from '../../../src/core/rng';
import type { PresetId, Puzzle } from '../../../src/games/sums/types';

const IDS: PresetId[] = ['easy', 'medium', 'hard'];
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

const BOARDS = IDS.flatMap((id) => SEEDS.map((seed) => ({ id, seed, p: generatePuzzle(PRESETS[id].size, seed) })));

const text = (p: Puzzle): string => `${p.digits.join('')} ${p.solution.join('')}`;

test('presets match spec', () => {
  expect(PRESETS).toEqual({
    easy: { size: 5, label: 'Easy' },
    medium: { size: 7, label: 'Medium' },
    hard: { size: 9, label: 'Hard' },
  });
  expect(DAILY_PRESET).toBe('medium');
});

test('sumsDailySeed is namespaced', () => {
  expect(sumsDailySeed('2026-11-02')).toBe(seedFromString('sums-daily:2026-11-02'));
});

test('deterministic', () => {
  for (const id of IDS) {
    const size = PRESETS[id].size;
    expect(generatePuzzle(size, 1)).toEqual(generatePuzzle(size, 1));
    expect(text(generatePuzzle(size, 1))).toMatchSnapshot(id);
  }
});

test('shape', () => {
  for (const { id, seed, p } of BOARDS) {
    const at = `${id} ${seed}`;
    expect(p.size, at).toBe(PRESETS[id].size);
    expect(p.digits.length, at).toBe(p.size * p.size);
    for (const d of p.digits) expect(d >= 1 && d <= 9 && Number.isInteger(d), at).toBe(true);
    lineCells(p.size).forEach((cells, l) => {
      const kept = cells.filter((c) => p.solution[c]);
      expect(kept.length, at).toBeGreaterThanOrEqual(1);
      expect(kept.length, at).toBeLessThan(p.size);
      expect(p.targets[l], at).toBe(kept.reduce((n, c) => n + p.digits[c], 0));
    });
  }
});

test('deducible', () => {
  for (const { id, seed, p } of BOARDS) expect(deduce(p.size, p.digits, p.targets), `${id} ${seed}`).toEqual(p.solution);
});

test('daily is stable', () => {
  expect(text(generatePuzzle(PRESETS[DAILY_PRESET].size, sumsDailySeed('2026-11-02')))).toMatchSnapshot();
});

test('fast enough', () => {
  const t0 = performance.now();
  for (let seed = 1; seed <= 10; seed++) generatePuzzle(PRESETS.hard.size, seed);
  expect((performance.now() - t0) / 10).toBeLessThan(100);
});

test('throws on unsupported sizes', () => {
  for (const size of [4, 10]) expect(() => generatePuzzle(size, 1)).toThrow();
});

// Backtracking is slow, so uniqueness only runs with SLOW=1 (npm run test:slow).
describe('slow: uniqueness', () => {
  it.skipIf(!import.meta.env.SLOW).each(Array.from({ length: 10 }, (_, i) => i + 1))(
    'easy %i has exactly one solution',
    (seed) => {
      const p = generatePuzzle(5, seed);
      expect(countSolutions(5, p.digits, p.targets, 2)).toBe(1);
    },
    300_000,
  );
});
