import { expect, test } from 'vitest';
import { DAILY_PRESET, EXTRA_LINK, PRESETS, bridgesDailySeed, generatePuzzle } from '../../../src/games/bridges/generate';
import { countSolutions, deduce, isSolved } from '../../../src/games/bridges/solver';
import { seedFromString } from '../../../src/core/rng';
import type { PresetId } from '../../../src/games/bridges/types';

const IDS: PresetId[] = ['small', 'medium', 'large'];
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

/** Every preset × seed board, generated once and shared by the property tests. */
const BOARDS = IDS.flatMap((id) => SEEDS.map((seed) => ({ id, seed, p: generatePuzzle(PRESETS[id].size, seed) })));

test('presets match spec', () => {
  expect(PRESETS).toEqual({
    small: { size: 7, label: 'Small', minIslands: 10, maxIslands: 13 },
    medium: { size: 9, label: 'Medium', minIslands: 17, maxIslands: 22 },
    large: { size: 11, label: 'Large', minIslands: 26, maxIslands: 32 },
  });
  expect(DAILY_PRESET).toBe('medium');
  expect(EXTRA_LINK).toBe(0.4);
});

test('bridgesDailySeed is namespaced', () => {
  expect(bridgesDailySeed('2026-10-26')).toBe(seedFromString('bridges-daily:2026-10-26'));
});

test('deterministic', () => {
  expect(generatePuzzle(9, 7)).toEqual(generatePuzzle(9, 7));
  for (const id of IDS) expect(JSON.stringify(generatePuzzle(PRESETS[id].size, 7))).toMatchSnapshot(id);
});

test('shape', () => {
  for (const { id, seed, p } of BOARDS) {
    const at = `${id} ${seed}`;
    expect(p.size, at).toBe(PRESETS[id].size);
    expect(p.islands.length, at).toBeGreaterThanOrEqual(PRESETS[id].minIslands);
    expect(p.islands.length, at).toBeLessThanOrEqual(PRESETS[id].maxIslands);
    expect(p.solution.length, at).toBe(p.links.length);
    const cells = p.islands.map((i) => i.cell);
    expect(cells, at).toEqual([...cells].sort((a, b) => a - b));
    const set = new Set(cells);
    for (const isl of p.islands) {
      expect(isl.n, at).toBeGreaterThanOrEqual(1);
      expect(isl.n, at).toBeLessThanOrEqual(8);
      const c = isl.cell % p.size;
      expect(c < p.size - 1 && set.has(isl.cell + 1), at).toBe(false);
      expect(set.has(isl.cell + p.size), at).toBe(false);
    }
  }
});

test('solution is valid', () => {
  for (const { id, seed, p } of BOARDS) {
    const at = `${id} ${seed}`;
    expect(isSolved(p, p.solution), at).toBe(true);
    const total = p.islands.map(() => 0);
    p.links.forEach((l, i) => {
      total[l.a] += p.solution[i];
      total[l.b] += p.solution[i];
    });
    expect(total, at).toEqual(p.islands.map((i) => i.n));
  }
});

test('deducible and unique', () => {
  for (const { id, seed, p } of BOARDS) {
    expect(deduce(p), `${id} ${seed}`).toEqual(p.solution);
    expect(countSolutions(p, 2), `${id} ${seed}`).toBe(1);
  }
}, 120_000);

test('not a tree', () => {
  const mediums = BOARDS.filter((b) => b.id === 'medium');
  const cyclic = mediums.filter(({ p }) => p.solution.filter((c) => c > 0).length > p.islands.length - 1);
  expect(cyclic.length).toBeGreaterThanOrEqual(mediums.length / 2);
});

test('daily is stable', () => {
  expect(JSON.stringify(generatePuzzle(9, bridgesDailySeed('2026-10-26')))).toMatchSnapshot();
});

test('fast enough', () => {
  const times = [1, 2, 3, 4, 5].map((seed) => {
    const t0 = performance.now();
    generatePuzzle(11, seed);
    return performance.now() - t0;
  });
  times.sort((a, b) => a - b);
  expect(times[2]).toBeLessThan(50);
});

test('throws on unsupported sizes', () => {
  for (const size of [6, 12]) expect(() => generatePuzzle(size, 1)).toThrow();
});
