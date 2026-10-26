import { layout } from '../../src/bridges/geometry';
import { deduce } from '../../src/bridges/solver';
import type { Puzzle } from '../../src/bridges/types';

/** Rows of digits (islands) and `.` (water) → puzzle; `solution` is what `deduce` finds (empty when it stalls). */
export function hz(rows: string[]): Puzzle {
  const size = rows.length;
  const islands = [...rows.join('')].flatMap((ch, cell) => (ch === '.' ? [] : [{ cell, n: Number(ch) }]));
  const p = layout(size, islands);
  return { ...p, solution: deduce(p) ?? [] };
}

export const CORNER = hz(['4.2', '...', '2..']); // links 0-1, 0-2; unique 2,2 (capacity only)
export const BLOCK = hz(['2.1.1', '.....', '.....', '.....', '.....']); // links 0-1, 1-2 only; no solution
export const PLUS = hz(['..1..', '.....', '1...1', '.....', '..1..']); // links 0-3 (v) × 1-2 (h); no solution
// Links 0-1 h, 0-3 v, 1-2 h, 1-5 v, 2-4 v, 3-4 h; 1-5 crosses 3-4. Unique 1,1,1,1,1,0; needs the crossing rule.
export const CROSS = hz(['2.3.2', '.....', '1...1', '.....', '..1..']);
// Links 0-1, 0-2, 1-3, 2-3 (a 4-cycle). Each needs the isolation rule; capacity alone stalls.
export const ISO_DOUBLE = hz(['1.2', '...', '1.2']); // unique 1,0,1,1 ("2=2" ruled out)
export const ISO_ONES = hz(['1.1', '...', '2.2']); // unique 0,1,1,1 ("1-1" ruled out)
export const TWO_SOL = hz(['3.3', '...', '3.3']); // exactly 2 solutions: 1,2,2,1 and 2,1,1,2
export const CONTRA = hz(['2.2.2', '.....', '.....', '.....', '.....']); // middle island forced to 4 → no solution
