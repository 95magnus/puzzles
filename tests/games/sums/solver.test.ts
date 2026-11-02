import { describe, expect, it } from 'vitest';
import { analyse, countSolutions, deduce, lineCells, lineRule } from '../../../src/games/sums/solver';
import { allSolutions, puzzle } from './helpers';

// A 2x2 rectangle of equal digits (rows 0-1 x cols 0-1) whose kept diagonal can swap, among distinct filler.
const SWAP_DIGITS = [
  5, 5, 1, 2, 3,
  5, 5, 4, 6, 7,
  8, 9, 5, 6, 2,
  3, 1, 7, 5, 4,
  6, 2, 9, 7, 1,
];
const SWAP_KEEP: (0 | 1)[] = [
  1, 0, 0, 1, 0,
  0, 1, 1, 0, 0,
  0, 0, 1, 0, 1,
  0, 0, 0, 1, 0,
  1, 0, 0, 0, 1,
];

// Found with a throwaway search over random 5x5 boards: unique, but the plain line rule stalls.
const TRIAL_DIGITS = [4, 5, 4, 3, 2, 6, 3, 6, 5, 5, 5, 3, 1, 1, 2, 2, 2, 5, 2, 1, 5, 4, 3, 2, 3];
const TRIAL_KEEP: (0 | 1)[] = [0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1];

describe('lineCells', () => {
  it('lists rows then columns, cached', () => {
    const lines = lineCells(3);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toEqual([0, 1, 2]);
    expect(lines[3]).toEqual([0, 3, 6]);
    expect(lineCells(3)).toBe(lines);
  });
});

describe('lineRule', () => {
  it('strikes a digit above the target and keeps the only match', () => {
    const r = lineRule([9, 1, 3], [0, 0, 0], 4)!;
    expect(r.keep).toEqual([false, true, true]);
    expect(r.strike).toEqual([true, false, false]);
  });

  it('keeps everything when the line sums to its target', () => {
    const r = lineRule([2, 3, 1], [0, 0, 0], 6)!;
    expect(r.keep).toEqual([true, true, true]);
    expect(r.strike).toEqual([false, false, false]);
  });

  it('keeps a digit every combination needs', () => {
    const r = lineRule([4, 2, 1, 3, 9], [0, 0, 0, 0, 0], 7)!;
    expect(r.keep).toEqual([true, false, false, false, false]);
    expect(r.strike).toEqual([false, false, false, false, true]);
  });

  it('returns null when no assignment is valid', () => {
    expect(lineRule([4, 2], [2, 0], 4)).toBeNull();
  });
});

describe('analyse / deduce', () => {
  it('needs a trial', () => {
    const p = puzzle(5, TRIAL_DIGITS, TRIAL_KEEP);
    const plain = analyse(5, p.digits, p.targets, { trials: false })!;
    expect(plain.includes(0)).toBe(true);
    expect(deduce(5, p.digits, p.targets)).toEqual(TRIAL_KEEP);
    expect(countSolutions(5, p.digits, p.targets, 5)).toBe(1);
  });

  it('two solutions stall', () => {
    const p = puzzle(5, SWAP_DIGITS, SWAP_KEEP);
    expect(deduce(5, p.digits, p.targets)).toBeNull();
    expect(countSolutions(5, p.digits, p.targets, 5)).toBe(2);
  });

  it('contradiction', () => {
    const p = puzzle(5, SWAP_DIGITS, SWAP_KEEP);
    const targets = p.targets.slice();
    targets[0] = 99;
    expect(analyse(5, p.digits, targets)).toBeNull();
    expect(countSolutions(5, p.digits, targets, 5)).toBe(0);
  });

  it('soundness: fixed cells agree with every solution', () => {
    const p = puzzle(5, SWAP_DIGITS, SWAP_KEEP);
    const state = analyse(5, p.digits, p.targets)!;
    const sols = allSolutions(5, p.digits, p.targets);
    expect(sols.length).toBe(2);
    for (const sol of sols) {
      state.forEach((v, i) => {
        if (v === 1) expect(sol[i]).toBe(1);
        if (v === 2) expect(sol[i]).toBe(0);
      });
    }
  });
});
