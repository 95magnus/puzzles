import { expect, test } from 'vitest';
import { DAILY_PRESET, PRESETS, generatePuzzle, balancedDailySeed } from '../../src/balanced/generate';
import { countSolutions, deduce, isSolved } from '../../src/balanced/solver';
import { seedFromString } from '../../src/core/rng';
import type { PresetId, Puzzle } from '../../src/balanced/types';

const IDS: PresetId[] = ['small', 'medium', 'large'];
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

/** Every preset × seed board, generated once and shared by the property tests. */
const BOARDS = IDS.flatMap((id) => SEEDS.map((seed) => ({ id, seed, p: generatePuzzle(PRESETS[id].size, seed) })));

test('presets match spec', () => {
  expect(PRESETS).toEqual({
    small: { size: 6, label: 'Small', edgeDensity: 0.35, minGivens: 6 },
    medium: { size: 8, label: 'Medium', edgeDensity: 0.35, minGivens: 8 },
    large: { size: 10, label: 'Large', edgeDensity: 0.35, minGivens: 10 },
  });
  expect(DAILY_PRESET).toBe('medium');
});

test('balancedDailySeed is namespaced', () => {
  expect(balancedDailySeed('2026-10-25')).toBe(seedFromString('balanced-daily:2026-10-25'));
});

test('deterministic', () => {
  expect(generatePuzzle(8, 7)).toEqual(generatePuzzle(8, 7));
  for (const id of IDS) expect(JSON.stringify(generatePuzzle(PRESETS[id].size, 7))).toMatchSnapshot(id);
});

test('solution follows the rules and agrees with every clue', () => {
  for (const { id, seed, p } of BOARDS) {
    const at = `${id} ${seed}`;
    expect(isSolved(p, p.solution), at).toBe(true);
    expect(p.givens.every((v, i) => v === 0 || v === p.solution[i]), at).toBe(true);
    expect(p.edges.every((e) => (p.solution[e.a] === p.solution[e.b]) === (e.kind === 'eq')), at).toBe(true);
  }
});

test('deducible and unique', () => {
  for (const { id, seed, p } of BOARDS) {
    expect(deduce(p), `${id} ${seed}`).toEqual(p.solution);
    expect(countSolutions(p, 2), `${id} ${seed}`).toBe(1);
  }
});

test('clue minimums and edge shape', () => {
  for (const { id, seed, p } of BOARDS) {
    const at = `${id} ${seed}`;
    const n = p.size;
    expect(p.givens.filter((v) => v !== 0).length, at).toBeGreaterThanOrEqual(n);
    expect(p.edges.length, at).toBeGreaterThanOrEqual(2);
    for (const e of p.edges) {
      expect(e.b === e.a + n || (e.b === e.a + 1 && e.a % n !== n - 1), at).toBe(true);
    }
    const keys = p.edges.map((e) => e.a * 256 + e.b);
    expect(keys, at).toEqual([...keys].sort((x, y) => x - y));
  }
});

test('every remaining clue is needed', () => {
  for (const id of IDS) {
    const p = generatePuzzle(PRESETS[id].size, 1);
    const givens = p.givens.filter((v) => v !== 0).length;
    p.edges.forEach((_, i) => {
      const q: Puzzle = { ...p, edges: p.edges.filter((__, j) => j !== i) };
      expect(deduce(q), `${id} edge ${i}`).toBeNull();
    });
    if (givens > PRESETS[id].minGivens) {
      p.givens.forEach((v, c) => {
        if (v === 0) return;
        const g = p.givens.slice();
        g[c] = 0;
        expect(deduce({ ...p, givens: g }), `${id} given ${c}`).toBeNull();
      });
    }
  }
});

test('daily is stable', () => {
  expect(JSON.stringify(generatePuzzle(8, balancedDailySeed('2026-10-25')))).toMatchSnapshot();
});

test('fast enough', () => {
  const times = [1, 2, 3, 4, 5].map((seed) => {
    const t0 = performance.now();
    generatePuzzle(10, seed);
    return performance.now() - t0;
  });
  times.sort((a, b) => a - b);
  expect(times[2]).toBeLessThan(100);
});

test('throws on unsupported sizes', () => {
  for (const size of [3, 7, 12]) expect(() => generatePuzzle(size, 1)).toThrow();
});
