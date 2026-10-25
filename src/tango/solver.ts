import { lineCells, lineEdges, linePatterns, type LineEdge } from './lines';
import type { Puzzle, Sym } from './types';

type Clues = Pick<Puzzle, 'size' | 'givens' | 'edges'>;
type Line = { cells: number[]; edges: LineEdge[] };

function linesOf(p: Pick<Puzzle, 'size' | 'edges'>): Line[] {
  const out: Line[] = [];
  for (let i = 0; i < 2 * p.size; i++) out.push({ cells: lineCells(p.size, i), edges: lineEdges(p, i) });
  return out;
}

function fits(pt: readonly Sym[], line: Line, g: readonly Sym[]): boolean {
  for (let k = 0; k < pt.length; k++) {
    const v = g[line.cells[k]];
    if (v !== 0 && v !== pt[k]) return false;
  }
  for (const e of line.edges) if ((pt[e.x] === pt[e.y]) !== e.eq) return false;
  return true;
}

/**
 * Line-wise fixpoint from the givens: in every row and column, keep the patterns that agree with
 * the known cells and the line's edge clues, and fix each cell all of them agree on.
 * `null` on a contradiction; cells nobody can fix stay 0.
 */
export function propagate(p: Clues): Sym[] | null {
  const g = p.givens.slice();
  const lines = linesOf(p);
  const patterns = linePatterns(p.size);
  let changed = true;
  while (changed) {
    changed = false;
    for (const line of lines) {
      const alive = patterns.filter((pt) => fits(pt, line, g));
      if (alive.length === 0) return null;
      for (let k = 0; k < p.size; k++) {
        const c = line.cells[k];
        if (g[c] !== 0) continue;
        const v = alive[0][k];
        if (alive.every((pt) => pt[k] === v)) {
          g[c] = v;
          changed = true;
        }
      }
    }
  }
  return g;
}

/** The full grid if deduction alone finishes the board (which proves it unique), else `null`. */
export function deduce(p: Clues): Sym[] | null {
  const g = propagate(p);
  return g && g.every((v) => v !== 0) ? g : null;
}

/**
 * Number of solutions, stopping at `limit`: propagate, then branch on both values of the first
 * empty cell. Exhaustive (propagation only removes impossible values), so the count is exact. For tests.
 */
export function countSolutions(p: Clues, limit: number): number {
  const g = propagate(p);
  if (!g) return 0;
  const cell = g.indexOf(0);
  if (cell < 0) return 1;
  let count = 0;
  for (const v of [1, 2] as const) {
    if (count >= limit) break;
    const givens = g.slice();
    givens[cell] = v;
    count += countSolutions({ ...p, givens }, limit - count);
  }
  return count;
}

/** Every cell filled, every line balanced and triple-free, every edge clue holds. */
export function isSolved(p: Pick<Puzzle, 'size' | 'edges'>, cells: readonly Sym[]): boolean {
  if (cells.length !== p.size * p.size || cells.some((v) => v === 0)) return false;
  const patterns = linePatterns(p.size);
  return linesOf(p).every((line) => patterns.some((pt) => fits(pt, line, cells)));
}
