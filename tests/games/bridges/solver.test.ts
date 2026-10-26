import { describe, expect, it } from 'vitest';
import { countSolutions, deduce, isSolved, propagate } from '../../../src/games/bridges/solver';
import { BLOCK, CONTRA, CORNER, CROSS, ISO_DOUBLE, ISO_ONES, PLUS, TWO_SOL } from './helpers';

describe('bridges solver', () => {
  it('capacity', () => {
    expect(deduce(CORNER)).toEqual([2, 2]);
  });

  it('crossing', () => {
    expect(deduce(CROSS)).toEqual([1, 1, 1, 1, 1, 0]);
  });

  it('isolation', () => {
    expect(deduce(ISO_DOUBLE)).toEqual([1, 0, 1, 1]);
    expect(deduce(ISO_ONES)).toEqual([0, 1, 1, 1]);
  });

  it('stalls with two solutions', () => {
    expect(deduce(TWO_SOL)).toBeNull();
    const r = propagate(TWO_SOL)!;
    expect(r.lo).toEqual([1, 1, 1, 1]);
    expect(r.hi).toEqual([2, 2, 2, 2]);
    expect(countSolutions(TWO_SOL, 5)).toBe(2);
    expect(countSolutions(TWO_SOL, 1)).toBe(1);
  });

  it('contradictions', () => {
    for (const p of [CONTRA, PLUS, BLOCK]) {
      expect(propagate(p)).toBeNull();
      expect(countSolutions(p, 5)).toBe(0);
    }
  });

  it('unique fixtures count 1', () => {
    for (const p of [CORNER, CROSS, ISO_DOUBLE, ISO_ONES]) expect(countSolutions(p, 2)).toBe(1);
  });

  it('isSolved', () => {
    expect(isSolved(CROSS, [1, 1, 1, 1, 1, 0])).toBe(true);
    expect(isSolved(CROSS, [1, 1, 1, 1, 1, 1])).toBe(false);
    expect(isSolved(CROSS, [0, 1, 1, 1, 1, 0])).toBe(false);
    expect(isSolved(ISO_ONES, [1, 0, 0, 2])).toBe(false);
  });
});
