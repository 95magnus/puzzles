import type { Puzzle, Sym } from './types';

/** Cells of line `i`: rows are lines `0..size-1`, columns `size..2·size-1`. */
export function lineCells(size: number, i: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < size; k++) out.push(i < size ? i * size + k : k * size + (i - size));
  return out;
}

/** The row and column line ids through `cell`. */
export function lineOf(size: number, cell: number): [row: number, col: number] {
  return [Math.floor(cell / size), size + (cell % size)];
}

export type LineEdge = { x: number; y: number; eq: boolean; edge: number };

/** Edge clues with both cells in line `i`, as positions `x < y` within the line plus their index in `p.edges`. */
export function lineEdges(p: Pick<Puzzle, 'size' | 'edges'>, i: number): LineEdge[] {
  const pos = new Map(lineCells(p.size, i).map((c, k) => [c, k]));
  const out: LineEdge[] = [];
  p.edges.forEach((e, edge) => {
    const x = pos.get(e.a);
    const y = pos.get(e.b);
    if (x !== undefined && y !== undefined) out.push({ x, y, eq: e.kind === 'eq', edge });
  });
  return out;
}

const patternCache = new Map<number, Sym[][]>();

/** Every balanced, triple-free sun/moon line of length `n`, in lexicographic order. Cached. */
export function linePatterns(n: number): readonly Sym[][] {
  let out = patternCache.get(n);
  if (out) return out;
  out = [];
  const cur: Sym[] = [];
  const walk = (suns: number, moons: number): void => {
    const k = cur.length;
    if (k === n) {
      out!.push(cur.slice());
      return;
    }
    for (const s of [1, 2] as const) {
      if (s === 1 ? suns === n / 2 : moons === n / 2) continue;
      if (k >= 2 && cur[k - 1] === s && cur[k - 2] === s) continue;
      cur.push(s);
      walk(suns + (s === 1 ? 1 : 0), moons + (s === 2 ? 1 : 0));
      cur.pop();
    }
  };
  walk(0, 0);
  patternCache.set(n, out);
  return out;
}

/** Lookup key for the unordered cell pair (a, b). */
export function edgeKey(a: number, b: number): number {
  return Math.min(a, b) * 256 + Math.max(a, b);
}
