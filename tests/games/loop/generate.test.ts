import { expect, test } from 'vitest';
import { DAILY_PRESET, PRESETS, generatePuzzle, loopDailySeed } from '../../../src/games/loop/generate';
import { countSolutions, deduce } from '../../../src/games/loop/solver';
import { geometry } from '../../../src/games/loop/geometry';
import { seedFromString } from '../../../src/core/rng';
import type { PresetId, Puzzle } from '../../../src/games/loop/types';

const IDS: PresetId[] = ['small', 'medium', 'large'];
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

const BOARDS = IDS.flatMap((id) => SEEDS.map((seed) => ({ id, seed, p: generatePuzzle(PRESETS[id].size, seed) })));

const text = (p: Puzzle): string => p.clues.map((c) => (c === null ? '.' : String(c))).join('');

test('presets match spec', () => {
  expect(PRESETS).toEqual({
    small: { size: 5, label: 'Small' },
    medium: { size: 7, label: 'Medium' },
    large: { size: 10, label: 'Large' },
  });
  expect(DAILY_PRESET).toBe('medium');
});

test('loopDailySeed is namespaced', () => {
  expect(loopDailySeed('2026-10-27')).toBe(seedFromString('loop-daily:2026-10-27'));
});

test('deterministic', () => {
  for (const id of IDS) {
    const size = PRESETS[id].size;
    expect(generatePuzzle(size, 1)).toEqual(generatePuzzle(size, 1));
    expect(text(generatePuzzle(size, 1))).toMatchSnapshot(id);
  }
});

test('single loop', () => {
  for (const { id, seed, p } of BOARDS) {
    const at = `${id} ${seed}`;
    const g = geometry(p.size);
    const lines = p.solution.map((v, e) => (v ? e : -1)).filter((e) => e >= 0);
    expect(lines.length, at).toBeGreaterThan(0);
    for (const edges of g.dotEdges) expect([0, 2], at).toContain(edges.filter((e) => p.solution[e]).length);
    const parent = g.dotEdges.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const e of lines) parent[find(g.edgeDots[e][0])] = find(g.edgeDots[e][1]);
    const roots = new Set(lines.map((e) => find(g.edgeDots[e][0])));
    expect(roots.size, at).toBe(1);
  }
});

test('clues match the solution and some are hidden', () => {
  for (const { id, seed, p } of BOARDS) {
    const at = `${id} ${seed}`;
    const g = geometry(p.size);
    p.clues.forEach((c, cell) => {
      if (c !== null) expect(c, at).toBe(g.cellEdges[cell].reduce((n, e) => n + p.solution[e], 0));
    });
    expect(p.clues.some((c) => c === null), at).toBe(true);
  }
});

test('deducible', () => {
  for (const { id, seed, p } of BOARDS) expect(deduce(p.size, p.clues), `${id} ${seed}`).toEqual(p.solution);
});

// countSolutions backtracks slowly on sparse boards (2 to 60 s each), so only the two quickest seeds are cross-checked.
test('unique (small)', () => {
  for (const seed of [1, 2]) expect(countSolutions(5, BOARDS.find((b) => b.id === 'small' && b.seed === seed)!.p.clues, 2), `small ${seed}`).toBe(1);
}, 30_000);

test('daily is stable', () => {
  expect(text(generatePuzzle(7, loopDailySeed('2026-10-27')))).toMatchSnapshot();
});

test('fast enough', () => {
  const t0 = performance.now();
  for (let seed = 1; seed <= 10; seed++) generatePuzzle(10, seed);
  expect((performance.now() - t0) / 10).toBeLessThan(150);
});

test('throws on unsupported sizes', () => {
  for (const size of [4, 11]) expect(() => generatePuzzle(size, 1)).toThrow();
});
