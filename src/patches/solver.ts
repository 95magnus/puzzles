import { contains, fits, inBounds } from './rect';
import type { Puzzle, Rect } from './types';

/** Every rectangle that could belong to `clues[i]`: it holds the clue's cell and no other clue's, and matches its shape and area. */
export function candidates(p: Puzzle, i: number): Rect[] {
  const { size, clues } = p;
  const { cell, shape, area } = clues[i];
  const cr = Math.floor(cell / size);
  const cc = cell % size;
  const others = clues.filter((_, j) => j !== i).map((o) => ({ r: Math.floor(o.cell / size), c: o.cell % size }));
  const out: Rect[] = [];
  for (let r0 = 0; r0 <= cr; r0++) {
    for (let r1 = cr; r1 < size; r1++) {
      const h = r1 - r0 + 1;
      if (area !== undefined && area % h !== 0) continue;
      const wMin = area === undefined ? 1 : area / h;
      const wMax = area === undefined ? size : area / h;
      for (let w = wMin; w <= wMax; w++) {
        const probe = { r: r0, c: 0, w, h };
        if (!fits(shape, probe)) continue;
        for (let c0 = Math.max(0, cc - w + 1); c0 <= Math.min(cc, size - w); c0++) {
          if (others.some((o) => o.r >= r0 && o.r <= r1 && o.c >= c0 && o.c < c0 + w)) continue;
          out.push({ r: r0, c: c0, w, h });
        }
      }
    }
  }
  return out;
}

/** Search the exact cover; returns the solution count (capped at `limit`) and the solutions found (all of them, at most `limit`). */
function search(p: Puzzle, limit: number): { count: number; found: Rect[][] } {
  const { size, clues } = p;
  const n = clues.length;
  const cells = size * size;
  const words = Math.ceil(cells / 32);
  const cands = clues.map((_, i) => candidates(p, i));
  if (cands.some((c) => c.length === 0) || limit <= 0) return { count: 0, found: [] };

  // masks[i] holds candidate k's cell set at [k * words, (k + 1) * words).
  const masks = cands.map((list) => {
    const m = new Uint32Array(list.length * words);
    list.forEach((x, k) => {
      for (let r = x.r; r < x.r + x.h; r++) {
        for (let c = x.c; c < x.c + x.w; c++) {
          const cell = r * size + c;
          m[k * words + (cell >> 5)] |= 1 << (cell & 31);
        }
      }
    });
    return m;
  });

  const covered = new Uint32Array(words);
  for (let cell = cells; cell < words * 32; cell++) covered[cell >> 5] |= 1 << (cell & 31); // padding counts as covered
  const placed = new Uint8Array(n);
  const chosen = new Int32Array(n);
  const reach = new Uint32Array(words);
  let count = 0;
  const found: Rect[][] = [];

  const fitsNow = (m: Uint32Array, base: number): boolean => {
    for (let w = 0; w < words; w++) if (m[base + w] & covered[w]) return false;
    return true;
  };

  const go = (left: number): void => {
    let full = true;
    for (let w = 0; w < words; w++) if (~covered[w]) full = false;
    if (full) {
      count++;
      found.push(cands.map((list, i) => list[chosen[i]]));
      return;
    }
    if (left === 0) return;

    let best = -1;
    let bestCount = Infinity;
    reach.fill(0);
    for (let i = 0; i < n; i++) {
      if (placed[i]) continue;
      const m = masks[i];
      let cnt = 0;
      for (let k = 0, len = cands[i].length; k < len; k++) {
        const base = k * words;
        if (!fitsNow(m, base)) continue;
        cnt++;
        for (let w = 0; w < words; w++) reach[w] |= m[base + w];
      }
      if (cnt === 0) return;
      if (cnt < bestCount) {
        bestCount = cnt;
        best = i;
      }
    }
    // Every uncovered cell must still be reachable by some unplaced clue.
    for (let w = 0; w < words; w++) if (~covered[w] & ~reach[w]) return;

    const m = masks[best];
    placed[best] = 1;
    for (let k = 0, len = cands[best].length; k < len && count < limit; k++) {
      const base = k * words;
      if (!fitsNow(m, base)) continue;
      for (let w = 0; w < words; w++) covered[w] |= m[base + w];
      chosen[best] = k;
      go(left - 1);
      for (let w = 0; w < words; w++) covered[w] &= ~m[base + w];
    }
    placed[best] = 0;
  };

  go(n);
  return { count, found };
}

/** Count solutions (each clue gets one matching rectangle; together they tile the board), stopping at `limit`. Ignores `p.solution`. */
export function countSolutions(p: Puzzle, limit: number): number {
  return search(p, limit).count;
}

/** The first solution found, aligned with `p.clues`, or `null` if there is none. */
export function solve(p: Puzzle): Rect[] | null {
  return search(p, 1).found[0] ?? null;
}

/** Up to `limit` distinct solutions, each aligned with `p.clues`, in search order. */
export function solutions(p: Puzzle, limit: number): Rect[][] {
  return search(p, limit).found;
}

/** True if `rects[i]` is a valid rectangle for `p.clues[i]` and together they cover every cell exactly once. */
export function isSolution(p: Puzzle, rects: Rect[]): boolean {
  const { size, clues } = p;
  if (rects.length !== clues.length) return false;
  const seen = new Uint8Array(size * size);
  for (let i = 0; i < clues.length; i++) {
    const x = rects[i];
    const { shape, area } = clues[i];
    if (!inBounds(size, x) || !fits(shape, x)) return false;
    if (area !== undefined && x.w * x.h !== area) return false;
    if (clues.some((o, j) => contains(size, x, o.cell) !== (j === i))) return false;
    for (let r = x.r; r < x.r + x.h; r++) {
      for (let c = x.c; c < x.c + x.w; c++) {
        if (seen[r * size + c]) return false;
        seen[r * size + c] = 1;
      }
    }
  }
  return seen.every((v) => v === 1);
}
