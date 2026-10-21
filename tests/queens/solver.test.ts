import { describe, expect, it } from 'vitest';
import { countSolutions, isValidPlacement, solve } from '../../src/queens/solver';
import { NONE4, TWO4, UNIQUE4, pz } from './helpers';

describe('queens solver', () => {
  it('unique board counts 1', () => {
    expect(countSolutions(pz(UNIQUE4), 2)).toBe(1);
    expect(solve(pz(UNIQUE4))).toEqual([1, 3, 0, 2]);
  });

  it('two solutions count 2 and stop at the limit', () => {
    expect(countSolutions(pz(TWO4), 2)).toBe(2);
    expect(countSolutions(pz(TWO4), 1)).toBe(1);
  });

  it('impossible board counts 0', () => {
    expect(countSolutions(pz(NONE4), 2)).toBe(0);
    expect(solve(pz(NONE4))).toBeNull();
  });

  it('touch rule', () => {
    expect(isValidPlacement(pz(TWO4), [0, 1, 2, 3])).toBe(false);
    expect(isValidPlacement(pz(TWO4), [1, 3, 0, 2])).toBe(true);
  });

  it('isValidPlacement rejects a shared region', () => {
    expect(isValidPlacement(pz(UNIQUE4), [2, 0, 3, 1])).toBe(false);
  });
});
