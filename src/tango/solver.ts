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

/** Number of solutions by plain backtracking, stopping at `limit`. For tests. */
export function countSolutions(p: Clues, limit: number): number {
  const n = p.size;
  const g = p.givens.slice();
  const lines = linesOf(p);
  const patterns = linePatterns(n);
  const ok = (i: number) => patterns.some((pt) => fits(pt, lines[i], g));
  if (!lines.every((_, i) => ok(i))) return 0;
  let count = 0;
  const walk = (cell: number): void => {
    if (count >= limit) return;
    if (cell === n * n) {
      count++;
      return;
    }
    if (g[cell] !== 0) return walk(cell + 1);
    for (const v of [1, 2] as const) {
      g[cell] = v;
      if (ok(Math.floor(cell / n)) && ok(n + (cell % n))) walk(cell + 1);
    }
    g[cell] = 0;
  };
  walk(0);
  return count;
}

/** Every cell filled, every line balanced and triple-free, every edge clue holds. */
export function isSolved(p: Pick<Puzzle, 'size' | 'edges'>, cells: readonly Sym[]): boolean {
  if (cells.length !== p.size * p.size || cells.some((v) => v === 0)) return false;
  const patterns = linePatterns(p.size);
  return linesOf(p).every((line) => patterns.some((pt) => fits(pt, line, cells)));
}
