import type { Puzzle } from '../../src/queens/types';
import { solve } from '../../src/queens/solver';

export const UNIQUE4 = ['1022', '1222', '1333', '1333']; // only solution [1, 3, 0, 2]
export const TWO4 = ['0000', '1111', '2222', '3333']; // [1, 3, 0, 2] and [2, 0, 3, 1]
export const NONE4 = ['0111', '2211', '2333', '2333']; // region 0 forces col 0 in row 0 → impossible

/** Build a puzzle from rows of region digits; `solution` is the first solution (or empty). */
export function pz(rows: string[]): Puzzle {
  const size = rows.length;
  const regions = new Uint8Array(size * size);
  rows.forEach((row, r) => {
    for (let c = 0; c < size; c++) regions[r * size + c] = Number(row[c]);
  });
  const p: Puzzle = { size, regions, solution: [] };
  p.solution = solve(p) ?? [];
  return p;
}
