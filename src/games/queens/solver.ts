import type { Puzzle } from './types';

/** Count solutions (one queen per row, column and region; no two touching), stopping at `limit`. */
export function countSolutions(p: Puzzle, limit: number): number {
  const { size, regions } = p;
  let count = 0;
  // `prev` is the previous row's queen column (-2 for none), so |c - prev| <= 1 means touching.
  const place = (row: number, cols: number, regs: number, prev: number): void => {
    if (row === size) {
      count++;
      return;
    }
    for (let c = 0; c < size && count < limit; c++) {
      if (cols & (1 << c) || Math.abs(c - prev) <= 1) continue;
      const reg = 1 << regions[row * size + c];
      if (regs & reg) continue;
      place(row + 1, cols | (1 << c), regs | reg, c);
    }
  };
  place(0, 0, 0, -2);
  return count;
}

/** Queen column per row of the first solution found, or `null` if there is none. */
export function solve(p: Puzzle): number[] | null {
  const { size, regions } = p;
  const out: number[] = [];
  const place = (row: number, cols: number, regs: number, prev: number): boolean => {
    if (row === size) return true;
    for (let c = 0; c < size; c++) {
      if (cols & (1 << c) || Math.abs(c - prev) <= 1) continue;
      const reg = 1 << regions[row * size + c];
      if (regs & reg) continue;
      out[row] = c;
      if (place(row + 1, cols | (1 << c), regs | reg, c)) return true;
    }
    return false;
  };
  return place(0, 0, 0, -2) ? out : null;
}

/** True if `cols` (one column per row) is a complete, rule-abiding placement. */
export function isValidPlacement(p: Puzzle, cols: number[]): boolean {
  const { size, regions } = p;
  if (cols.length !== size) return false;
  const usedCols = new Set<number>();
  const usedRegions = new Set<number>();
  for (let r = 0; r < size; r++) {
    const c = cols[r];
    if (!Number.isInteger(c) || c < 0 || c >= size) return false;
    usedCols.add(c);
    usedRegions.add(regions[r * size + c]);
    if (r > 0 && Math.abs(c - cols[r - 1]) <= 1) return false;
  }
  return usedCols.size === size && usedRegions.size === size;
}
