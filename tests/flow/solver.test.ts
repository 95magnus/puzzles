import { expect, test } from 'vitest';
import { countSolutions } from '../../src/flow/solver';
import type { Puzzle } from '../../src/flow/types';
import { P5x5_unique } from './fixtures';

const P2x2_rows: Puzzle = {
  size: 2,
  pairs: [
    { color: 0, a: { r: 0, c: 0 }, b: { r: 0, c: 1 } },
    { color: 1, a: { r: 1, c: 0 }, b: { r: 1, c: 1 } },
  ],
};
const P2x2_cross: Puzzle = {
  size: 2,
  pairs: [
    { color: 0, a: { r: 0, c: 0 }, b: { r: 1, c: 1 } },
    { color: 1, a: { r: 0, c: 1 }, b: { r: 1, c: 0 } },
  ],
};
const P3x3_single_top: Puzzle = {
  size: 3,
  pairs: [{ color: 0, a: { r: 0, c: 0 }, b: { r: 0, c: 2 } }],
};
const P4x4_ambiguous: Puzzle = {
  size: 4,
  pairs: [
    { color: 0, a: { r: 0, c: 0 }, b: { r: 1, c: 2 } },
    { color: 1, a: { r: 0, c: 3 }, b: { r: 1, c: 1 } },
    { color: 2, a: { r: 2, c: 1 }, b: { r: 2, c: 2 } },
  ],
};

test('2x2 with one pair along each row has exactly one solution', () => {
  // A A / B B  — pairs: A (0,0)-(0,1), B (1,0)-(1,1)
  expect(countSolutions(P2x2_rows)).toBe(1);
});
test('unsolvable: crossing pairs', () => {
  // 2x2 with A (0,0)-(1,1), B (0,1)-(1,0)
  expect(countSolutions(P2x2_cross)).toBe(0);
});
test('cannot fill every cell -> 0', () => {
  // 3x3, single pair (0,0)-(0,2): any path leaves cells empty or self-touches
  expect(countSolutions(P3x3_single_top)).toBe(0);
});
test('ambiguous puzzle returns limit', () => {
  // 4x4, A (0,0)-(1,2), B (0,3)-(1,1), C (2,1)-(2,2)
  expect(countSolutions(P4x4_ambiguous, 2)).toBe(2);
});
test('known unique 5x5 fixture', () => {
  expect(countSolutions(P5x5_unique)).toBe(1);
});
