import { describe, expect, test } from 'vitest';
import { generate, generateWithSolution, targetPairs } from '../../../src/games/flow/generate';
import { mulberry32, seedFromDate } from '../../../src/core/rng';
import { countSolutions } from '../../../src/games/flow/solver';

const SIZES = [5, 6, 7, 8, 9];

test('targetPairs = min(size + 1, 9)', () => {
  expect([5, 6, 7, 8, 9].map(targetPairs)).toEqual([6, 7, 8, 9, 9]);
});

test.each(SIZES)('size %i: deterministic for a fixed seed', (n) => {
  expect(generate(n, mulberry32(123))).toEqual(generate(n, mulberry32(123)));
});

test.each(SIZES)('size %i: solution covers grid, matches pairs, is unique', (n) => {
  for (let s = 0; s < 20; s++) {
    const { puzzle, solution } = generateWithSolution(n, mulberry32(s));
    expect(solution.flat()).toHaveLength(n * n);
    expect(new Set(solution.flat().map((c) => c.r * n + c.c)).size).toBe(n * n);
    puzzle.pairs.forEach((p, i) => {
      expect(solution[i][0]).toEqual(p.a);
      expect(solution[i].at(-1)).toEqual(p.b);
    });
    expect(puzzle.pairs.length).toBeLessThanOrEqual(9);
    expect(countSolutions(puzzle)).toBe(1);
  }
}, 60_000);

test('daily snapshot stays stable', () => {
  expect(generate(7, mulberry32(seedFromDate('2026-10-20')))).toMatchSnapshot();
});

describe.skipIf(!import.meta.env.SLOW)('slow: timing', () => {
  test.each(SIZES)('size %i: p95 generation time < 500ms, always terminates', (n) => {
    const times: number[] = [];
    for (let s = 0; s < 1000; s++) {
      const t = performance.now();
      generate(n, mulberry32(s));
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    console.log(`size ${n}: p95 = ${p95.toFixed(1)} ms, max = ${times.at(-1)!.toFixed(1)} ms`);
    expect(p95).toBeLessThan(500);
  }, 600_000);
});
