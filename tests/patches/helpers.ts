import { solve } from '../../src/patches/solver';
import type { Puzzle, Shape } from '../../src/patches/types';

// Only solution: [{0,0,2,2}, {0,3,1,4}, {0,2,1,2}, {2,0,3,1}, {3,0,3,1}] (r,c,w,h), aligned with clues.
export const UNIQUE4: [number, Shape, number?][] = [[0, 'square', 4], [3, 'tall', 4], [6, 'tall', 2], [8, 'wide', 3], [13, 'wide', 3]];
export const TWO4: [number, Shape, number?][] = [[0, 'any', 8], [15, 'any', 8]]; // two 4×2 or two 2×4
export const NONE4: [number, Shape, number?][] = [[0, 'square', 4], [5, 'square', 1], [15, 'any', 11]]; // clue 0 has no candidate

/** Build a puzzle from `[cell, shape, area?]` clues (colour = 1 + index, as index 0 is the invalid red; sorted by cell), with its solution filled in by the solver (empty if unsolvable). */
export function pz(size: number, clues: [cell: number, shape: Shape, area?: number][]): Puzzle {
  const sorted = [...clues].sort((a, b) => a[0] - b[0]);
  const puzzle: Puzzle = {
    size,
    clues: sorted.map(([cell, shape, area], i) => ({ cell, shape, ...(area === undefined ? {} : { area }), color: 1 + (i % 8) })),
    solution: [],
  };
  puzzle.solution = solve(puzzle) ?? [];
  return puzzle;
}
