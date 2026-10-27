import { hEdge, vEdge } from '../../../src/games/loop/geometry';
import type { Puzzle } from '../../../src/games/loop/types';

/** A 3×3 whose solution is the outline of the 2×2 block at the top left. */
export function fixture(): Puzzle {
  const size = 3;
  const solution: (0 | 1)[] = new Array(2 * (size + 1) * size).fill(0);
  for (const c of [0, 1]) {
    solution[hEdge(size, 0, c)] = 1;
    solution[hEdge(size, 2, c)] = 1;
  }
  for (const r of [0, 1]) {
    solution[vEdge(size, r, 0)] = 1;
    solution[vEdge(size, r, 2)] = 1;
  }
  return { size, clues: [2, 2, null, 2, 2, null, null, null, null], solution };
}
