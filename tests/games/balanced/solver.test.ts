import { describe, expect, it } from 'vitest';
import { countSolutions, deduce, isSolved, propagate } from '../../../src/games/balanced/solver';
import { CHAIN6, CONTRA4, DEDUCE4, DEDUCE4_SOLUTION, EMPTY4, sym } from './helpers';

describe('balanced solver', () => {
  it('deduces a deducible board', () => {
    expect(deduce(DEDUCE4)).toEqual(sym(DEDUCE4_SOLUTION));
    expect(countSolutions(DEDUCE4, 2)).toBe(1);
    expect(DEDUCE4.solution).toEqual(sym(DEDUCE4_SOLUTION));
  });

  it('stalls on an open board', () => {
    expect(deduce(EMPTY4)).toBeNull();
    expect(propagate(EMPTY4)).toEqual(Array(16).fill(0));
    expect(countSolutions(EMPTY4, 2)).toBe(2);
    expect(countSolutions(EMPTY4, 1)).toBe(1);
  });

  it('contradiction returns null', () => {
    expect(propagate(CONTRA4)).toBeNull();
    expect(deduce(CONTRA4)).toBeNull();
    expect(countSolutions(CONTRA4, 2)).toBe(0);
  });

  it('edge chain fills a line', () => {
    const g = propagate(CHAIN6)!;
    expect(g.slice(0, 6)).toEqual(sym('SMMSSM'));
    expect(g.slice(6).every((x) => x === 0)).toBe(true);
  });

  it('isSolved checks every rule', () => {
    const good = sym(DEDUCE4_SOLUTION);
    expect(isSolved(DEDUCE4, good)).toBe(true);
    const swapped = good.slice();
    [swapped[0], swapped[2]] = [swapped[2], swapped[0]]; // column 0 and 2 lose balance
    expect(isSolved(DEDUCE4, swapped)).toBe(false);
    // Lines alone are fine; only the edge clue breaks (cells 1 and 5 differ in the solution).
    expect(isSolved({ size: 4, edges: [{ a: 1, b: 5, kind: 'eq' }] }, good)).toBe(false);
    const holed = good.slice();
    holed[7] = 0;
    expect(isSolved(DEDUCE4, holed)).toBe(false);
  });
});
