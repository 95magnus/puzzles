import { expect, test } from 'vitest';
import { DAILY_PRESET, PRESETS, adjacent, generatePuzzle, patchesDailySeed } from '../../src/patches/generate';
import { cellsOf, contains, shapeOf } from '../../src/patches/rect';
import { countSolutions, isSolution } from '../../src/patches/solver';
import { seedFromString } from '../../src/core/rng';
import { PALETTE } from '../../src/ui/palette';
import type { PresetId } from '../../src/patches/types';

const IDS: PresetId[] = ['small', 'medium', 'large'];
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

/** Every preset × seed board, generated once and shared by the property tests. */
const BOARDS = IDS.flatMap((id) => SEEDS.map((seed) => ({ id, seed, p: generatePuzzle(PRESETS[id].size, seed) })));

test('presets match spec', () => {
  expect(PRESETS).toEqual({
    small: { size: 6, label: 'Small', maxArea: 6, hideArea: 0.2, anyShape: 0.1 },
    medium: { size: 8, label: 'Medium', maxArea: 8, hideArea: 0.3, anyShape: 0.15 },
    large: { size: 10, label: 'Large', maxArea: 10, hideArea: 0.35, anyShape: 0.15 },
  });
  expect(DAILY_PRESET).toBe('medium');
});

test('patchesDailySeed is namespaced', () => {
  expect(patchesDailySeed('2026-10-23')).toBe(seedFromString('patches-daily:2026-10-23'));
});

test('adjacent means sharing an edge segment', () => {
  const a = { r: 0, c: 0, w: 2, h: 2 };
  expect(adjacent(a, { r: 0, c: 2, w: 1, h: 1 })).toBe(true); // right, partial edge
  expect(adjacent(a, { r: 2, c: 1, w: 3, h: 1 })).toBe(true); // below, overhanging
  expect(adjacent({ r: 2, c: 1, w: 3, h: 1 }, a)).toBe(true);
  expect(adjacent(a, { r: 2, c: 2, w: 1, h: 1 })).toBe(false); // corner only
  expect(adjacent(a, { r: 0, c: 3, w: 1, h: 2 })).toBe(false); // gap
  expect(adjacent(a, { r: 1, c: 1, w: 2, h: 2 })).toBe(false); // overlapping
});

test('deterministic', () => {
  expect(generatePuzzle(8, 7)).toEqual(generatePuzzle(8, 7));
  for (const id of IDS) expect(JSON.stringify(generatePuzzle(PRESETS[id].size, 7))).toMatchSnapshot(id);
});

test('solution tiles the grid', () => {
  for (const { id, seed, p } of BOARDS) {
    const { size, clues, solution } = p;
    expect(solution).toHaveLength(clues.length);
    const seen = new Array<number>(size * size).fill(0);
    for (const x of solution) for (const cell of cellsOf(size, x)) seen[cell]++;
    expect(seen.every((v) => v === 1), `${id} ${seed}`).toBe(true);
    for (let i = 0; i < clues.length; i++) {
      const held = clues.filter((c) => contains(size, solution[i], c.cell));
      expect(held, `${id} ${seed} clue ${i}`).toEqual([clues[i]]);
    }
    for (let i = 1; i < clues.length; i++) expect(clues[i].cell).toBeGreaterThan(clues[i - 1].cell);
  }
});

test('unique and correct', () => {
  for (const { id, seed, p } of BOARDS) {
    expect(countSolutions(p, 2), `${id} ${seed}`).toBe(1);
    expect(isSolution(p, p.solution), `${id} ${seed}`).toBe(true);
  }
});

test('clue info', () => {
  for (const id of IDS) {
    const { hideArea, anyShape } = PRESETS[id];
    let fraction = 0;
    for (const { seed, p } of BOARDS.filter((b) => b.id === id)) {
      const n = p.clues.length;
      p.clues.forEach((c, i) => {
        const x = p.solution[i];
        expect(c.area === undefined && c.shape === 'any', `${id} ${seed} clue ${i}`).toBe(false);
        if (c.area !== undefined) expect(c.area).toBe(x.w * x.h);
        if (c.shape !== 'any') expect(c.shape).toBe(shapeOf(x));
      });
      const hidden = p.clues.filter((c) => c.area === undefined).length;
      expect(hidden, `${id} ${seed}`).toBeLessThanOrEqual(Math.round(hideArea * n));
      expect(p.clues.filter((c) => c.shape === 'any').length).toBeLessThanOrEqual(Math.round(anyShape * n));
      fraction += hidden / n;
    }
    expect(fraction / SEEDS.length, id).toBeGreaterThanOrEqual(0.6 * hideArea);
  }
});

test('shape mix', () => {
  for (const { id, seed, p } of BOARDS) {
    expect(p.solution.every((x) => x.w * x.h >= 2), `${id} ${seed}: no single-cell patches`).toBe(true);
    expect(p.solution.every((x) => x.w * x.h <= PRESETS[id].maxArea), `${id} ${seed}`).toBe(true);
  }
});

test('wide and tall are balanced', () => {
  for (const id of IDS) {
    const rects = BOARDS.filter((b) => b.id === id).flatMap((b) => b.p.solution);
    const wide = rects.filter((x) => shapeOf(x) === 'wide').length;
    const tall = rects.filter((x) => shapeOf(x) === 'tall').length;
    expect(wide / tall, `${id} ${wide}:${tall}`).toBeGreaterThanOrEqual(0.75);
    expect(wide / tall, `${id} ${wide}:${tall}`).toBeLessThanOrEqual(1.33);
  }
});

test('long 1-wide strips are rare: area ≥ 4 strips are ≤ 12 % of solution rects per preset', () => {
  for (const id of IDS) {
    const rects = BOARDS.filter((b) => b.id === id).flatMap((b) => b.p.solution);
    const strips = rects.filter((x) => Math.min(x.w, x.h) === 1 && x.w * x.h >= 4).length;
    expect(strips / rects.length, `${id} ${strips}/${rects.length}`).toBeLessThanOrEqual(0.12);
  }
});

test('colours', () => {
  for (const { id, seed, p } of BOARDS) {
    const { clues, solution } = p;
    // Index 0 is the invalid red; clue colours use 1..8 only.
    for (const c of clues) {
      expect(Number.isInteger(c.color), `${id} ${seed}`).toBe(true);
      expect(c.color, `${id} ${seed}`).toBeGreaterThanOrEqual(1);
      expect(c.color, `${id} ${seed}`).toBeLessThanOrEqual(8);
      expect(PALETTE[c.color], `${id} ${seed}`).not.toBe('#ff5c7a');
    }
    for (let i = 0; i < clues.length; i++) {
      for (let j = i + 1; j < clues.length; j++) {
        if (adjacent(solution[i], solution[j])) expect(clues[i].color, `${id} ${seed} ${i}/${j}`).not.toBe(clues[j].color);
      }
    }
  }
});

test('daily is stable', () => {
  const p = generatePuzzle(PRESETS[DAILY_PRESET].size, patchesDailySeed('2026-10-23'));
  expect(JSON.stringify(p)).toMatchSnapshot();
});

test.skipIf(!!import.meta.env.CI)('fast enough: large median < 100 ms', () => {
  const times: number[] = [];
  for (let seed = 1; seed <= 5; seed++) {
    const t0 = performance.now();
    generatePuzzle(10, seed);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  expect(times[2]).toBeLessThan(100);
});

test('throws on unsupported sizes', () => {
  expect(() => generatePuzzle(3, 1)).toThrow();
  expect(() => generatePuzzle(11, 1)).toThrow();
});
