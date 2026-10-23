import { describe, expect, it } from 'vitest';
import { candidates, countSolutions, isSolution, solutions, solve } from '../../src/patches/solver';
import type { Rect } from '../../src/patches/types';
import { NONE4, TWO4, UNIQUE4, pz } from './helpers';

const UNIQUE4_SOLUTION: Rect[] = [
  { r: 0, c: 0, w: 2, h: 2 },
  { r: 0, c: 3, w: 1, h: 4 },
  { r: 0, c: 2, w: 1, h: 2 },
  { r: 2, c: 0, w: 3, h: 1 },
  { r: 3, c: 0, w: 3, h: 1 },
];

describe('patches solver', () => {
  it('unique board counts 1', () => {
    expect(countSolutions(pz(4, UNIQUE4), 2)).toBe(1);
    expect(solve(pz(4, UNIQUE4))).toEqual(UNIQUE4_SOLUTION);
  });

  it('two solutions count 2 and stop at the limit', () => {
    expect(countSolutions(pz(4, TWO4), 2)).toBe(2);
    expect(countSolutions(pz(4, TWO4), 1)).toBe(1);
  });

  it('impossible board counts 0', () => {
    const p = pz(4, NONE4);
    expect(countSolutions(p, 2)).toBe(0);
    expect(solve(p)).toBeNull();
    expect(candidates(p, 0)).toEqual([]);
  });

  it('hidden area widens candidates', () => {
    const p = pz(4, [[0, 'square', 4], [3, 'tall'], [6, 'tall', 2], [8, 'wide', 3], [13, 'wide', 3]]);
    expect(candidates(p, 1)).toHaveLength(3);
    expect(countSolutions(p, 2)).toBe(1);
  });

  it('any accepts every shape at its area', () => {
    const p = pz(4, [[0, 'square', 4], [3, 'any', 4], [6, 'tall', 2], [8, 'wide', 3], [13, 'wide', 3]]);
    expect(candidates(p, 1)).toHaveLength(1);
    expect(countSolutions(p, 2)).toBe(1);
  });

  it('candidates never swallow another clue', () => {
    const p = pz(4, UNIQUE4);
    for (let i = 0; i < p.clues.length; i++) {
      for (const x of candidates(p, i)) {
        const held = p.clues.filter((c) => x.r <= Math.floor(c.cell / 4) && Math.floor(c.cell / 4) < x.r + x.h && x.c <= c.cell % 4 && c.cell % 4 < x.c + x.w);
        expect(held).toEqual([p.clues[i]]);
      }
    }
  });

  it('a placement that leaves cells uncovered is not a solution', () => {
    // One clue, area 2, on a 2x2 board: placing it covers only half the board.
    expect(countSolutions(pz(2, [[0, 'wide', 2]]), 2)).toBe(0);
  });

  it('a single cell is never a candidate', () => {
    expect(candidates(pz(2, [[0, 'square']]), 0)).toEqual([{ r: 0, c: 0, w: 2, h: 2 }]);
    expect(candidates(pz(2, [[0, 'square', 1]]), 0)).toEqual([]);
  });

  it('isSolution accepts the fixture and rejects broken variants', () => {
    const p = pz(4, UNIQUE4);
    expect(isSolution(p, UNIQUE4_SOLUTION)).toBe(true);
    const shrunk = UNIQUE4_SOLUTION.map((x, i) => (i === 3 ? { ...x, w: 2 } : x));
    expect(isSolution(p, shrunk)).toBe(false);
    const swapped = [...UNIQUE4_SOLUTION];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(isSolution(p, swapped)).toBe(false);
    expect(isSolution(p, UNIQUE4_SOLUTION.slice(1))).toBe(false);
  });

  it('solutions collects distinct solutions up to the limit', () => {
    expect(solutions(pz(4, UNIQUE4), 2)).toEqual([UNIQUE4_SOLUTION]);
    const p = pz(4, TWO4);
    const two = solutions(p, 2);
    expect(two).toHaveLength(2);
    expect(two.every((s) => isSolution(p, s))).toBe(true);
    expect(two[0]).not.toEqual(two[1]);
    expect(solutions(p, 1)).toHaveLength(1);
    expect(solutions(pz(4, NONE4), 2)).toEqual([]);
  });
});
