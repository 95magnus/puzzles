import type { Cell, Pair, Puzzle } from './types';
import { type Rng, shuffle } from '../../core/rng';
import { countSolutions } from './solver';

const MAX_PAIRS = 9; // palette size
const FAILS_BEFORE_RELAX = 200;

export function targetPairs(size: number): number {
  return Math.min(size + 1, MAX_PAIRS);
}

/**
 * True when joining P (at its endpoint u) to Q (at its endpoint v) yields a
 * non-self-touching path, i.e. no two cells at index distance >= 2 are
 * orthogonally adjacent. P and Q are each already non-self-touching, so the only
 * adjacencies to check are between a cell of P and a cell of Q; the junction u-v
 * is at distance 1 and allowed. Scans only P (the short path) via the owner map.
 */
function canJoin(P: Cell[], Q: Cell[], u: number, v: number, size: number, owner: Cell[][]): boolean {
  for (const { r, c } of P) {
    const k = r * size + c;
    if (r > 0 && owner[k - size] === Q && !(k === u && k - size === v)) return false;
    if (r < size - 1 && owner[k + size] === Q && !(k === u && k + size === v)) return false;
    if (c > 0 && owner[k - 1] === Q && !(k === u && k - 1 === v)) return false;
    if (c < size - 1 && owner[k + 1] === Q && !(k === u && k + 1 === v)) return false;
  }
  return true;
}

/**
 * Start from one single-cell path per cell and repeatedly merge a shortest
 * mergeable path (preferring the globally shortest ones) with a neighbouring path
 * end-to-end, keeping every path non-self-touching. Returns null when no path can
 * merge at all, or when some path is shorter than minLen.
 */
function fillPaths(size: number, rng: Rng, target: number, minLen: number): Cell[][] | null {
  const paths: Cell[][] = [];
  const owner: Cell[][] = new Array(size * size);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const p = [{ r, c }];
      paths.push(p);
      owner[r * size + c] = p;
    }
  const idx = (cell: Cell) => cell.r * size + cell.c;

  outer: while (paths.length > target) {
    let minLength = Infinity;
    for (const p of paths) if (p.length < minLength) minLength = p.length;
    // Shortest paths first (shuffled); if none of them can merge, fall back to
    // progressively longer paths (shuffled, then stably sorted by length).
    const candidates = shuffle(
      rng,
      paths.filter((p) => p.length === minLength),
    );
    const longer = shuffle(
      rng,
      paths.filter((p) => p.length !== minLength),
    ).sort((x, y) => x.length - y.length);
    candidates.push(...longer);
    for (const P of candidates) {
      const pFirst = idx(P[0]);
      const pLast = idx(P[P.length - 1]);
      for (const u of pFirst === pLast ? [pFirst] : [pFirst, pLast]) {
        const ur = Math.floor(u / size);
        const uc = u % size;
        const neighbours: number[] = [];
        if (ur > 0) neighbours.push(u - size);
        if (ur < size - 1) neighbours.push(u + size);
        if (uc > 0) neighbours.push(u - 1);
        if (uc < size - 1) neighbours.push(u + 1);
        for (const v of shuffle(rng, neighbours)) {
          const Q = owner[v];
          if (Q === P) continue;
          const qStartsAtV = idx(Q[0]) === v;
          if (!qStartsAtV && idx(Q[Q.length - 1]) !== v) continue; // v not an endpoint of Q
          if (!canJoin(P, Q, u, v, size, owner)) continue;
          const head = pLast === u ? P : [...P].reverse();
          const tail = qStartsAtV ? Q : [...Q].reverse();
          const merged = head.concat(tail);
          paths.splice(paths.indexOf(P), 1);
          paths.splice(paths.indexOf(Q), 1);
          paths.push(merged);
          for (const cell of merged) owner[idx(cell)] = merged;
          continue outer;
        }
      }
    }
    return null; // stuck
  }
  return paths.every((p) => p.length >= minLen) ? paths : null;
}

function rowMajor(cell: Cell, size: number): number {
  return cell.r * size + cell.c;
}

export function generateWithSolution(size: number, rng: Rng): { puzzle: Puzzle; solution: Cell[][] } {
  let target = targetPairs(size);
  let minLen = 3;
  let fails = 0;
  for (;;) {
    const paths = fillPaths(size, rng, target, minLen);
    if (paths) {
      const solution = paths
        .map((p) => (rowMajor(p[0], size) <= rowMajor(p[p.length - 1], size) ? p : [...p].reverse()))
        .sort((x, y) => rowMajor(x[0], size) - rowMajor(y[0], size));
      const pairs: Pair[] = solution.map((p, color) => ({ color, a: p[0], b: p[p.length - 1] }));
      const puzzle: Puzzle = { size, pairs };
      if (countSolutions(puzzle, 2) === 1) return { puzzle, solution };
    }
    if (++fails >= FAILS_BEFORE_RELAX) {
      fails = 0;
      if (target < MAX_PAIRS) target++;
      else minLen = 2;
    }
  }
}

export function generate(size: number, rng: Rng): Puzzle {
  return generateWithSolution(size, rng).puzzle;
}
