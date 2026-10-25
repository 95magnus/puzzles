import { deduce } from '../../src/tango/solver';
import type { Puzzle, Sym } from '../../src/tango/types';

/** `S/M/.` string → cells (S = dot 1, M = ring 2, . = empty 0). */
export function sym(s: string): Sym[] {
  return [...s].map((ch) => (ch === 'S' ? 1 : ch === 'M' ? 2 : 0));
}

/** Build a puzzle from rows of `S/M/.` givens and `[a, b, '=' | 'x']` edge clues (sorted by cell pair), with its solution filled in by deduction (empty if it stalls). */
export function tz(rows: string[], edges: [a: number, b: number, kind: '=' | 'x'][] = []): Puzzle {
  const puzzle: Puzzle = {
    size: rows.length,
    givens: sym(rows.join('')),
    edges: edges
      .map(([a, b, kind]) => ({ a: Math.min(a, b), b: Math.max(a, b), kind: kind === '=' ? ('eq' as const) : ('neq' as const) }))
      .sort((x, y) => x.a - y.a || x.b - y.b),
    solution: [],
  };
  puzzle.solution = deduce(puzzle) ?? [];
  return puzzle;
}

// Unique solution SSMM MMSS SMMS MSSM; fully deducible.
export const DEDUCE4 = tz(['..M.', '...S', 'S..S', '....'], [[1, 5, 'x']]);
export const DEDUCE4_SOLUTION = 'SSMM' + 'MMSS' + 'SMMS' + 'MSSM';
export const EMPTY4 = tz(['....', '....', '....', '....']); // ≥ 2 solutions, deduce stalls
export const CONTRA4 = tz(['SS..', '....', '....', '....'], [[1, 2, '=']]); // forces SSS → no solution
// Row 0 is forced to SMMSSM by the chain alone; the rest stays empty.
export const CHAIN6 = tz(['S.....', '......', '......', '......', '......', '......'], [
  [0, 1, 'x'],
  [1, 2, '='],
  [2, 3, 'x'],
  [3, 4, '='],
  [4, 5, 'x'],
]);
