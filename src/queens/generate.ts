import { mulberry32, randInt, seedFromString, shuffle, type Rng } from '../core/rng';
import { countSolutions } from './solver';
import type { PresetId, Puzzle } from './types';

export const PRESETS: Record<PresetId, { size: number; label: string }> = {
  small: { size: 7, label: 'Small' },
  medium: { size: 8, label: 'Medium' },
  large: { size: 9, label: 'Large' },
};

export const DAILY_PRESET: PresetId = 'medium';

const MIN_SIZE = 4;
const MAX_SIZE = 9;
const MAX_ATTEMPTS = 2000;
const REPAIR_STEPS = 40;
const UNASSIGNED = 255;

export function queensDailySeed(isoDate: string): number {
  return seedFromString('queens-daily:' + isoDate);
}

/** Cell count of each region id 0..size-1. */
export function regionSizes(p: Puzzle): number[] {
  const out = new Array<number>(p.size).fill(0);
  for (const r of p.regions) if (r < p.size) out[r]++;
  return out;
}

/** True if the cells of `region` form one orthogonally connected group (false if empty). */
export function isConnected(p: Puzzle, region: number): boolean {
  const { size, regions } = p;
  const start = regions.indexOf(region);
  if (start < 0) return false;
  let total = 0;
  for (const r of regions) if (r === region) total++;
  const seen = new Uint8Array(size * size);
  const stack = [start];
  seen[start] = 1;
  let reached = 0;
  while (stack.length) {
    const cell = stack.pop()!;
    reached++;
    for (const nb of neighbours(size, cell)) {
      if (!seen[nb] && regions[nb] === region) {
        seen[nb] = 1;
        stack.push(nb);
      }
    }
  }
  return reached === total;
}

function neighbours(size: number, cell: number): number[] {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

/** One queen per row/column, never touching: backtracking over shuffled column orders. */
function randomQueens(size: number, rng: Rng): number[] {
  const cols: number[] = [];
  const used = new Array<boolean>(size).fill(false);
  const place = (row: number): boolean => {
    if (row === size) return true;
    for (const c of shuffle(rng, Array.from({ length: size }, (_, i) => i))) {
      if (used[c] || (row > 0 && Math.abs(c - cols[row - 1]) < 2)) continue;
      used[c] = true;
      cols[row] = c;
      if (place(row + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  place(0);
  return cols;
}

/** Grow regions from the queen cells; small regions are favoured so sizes stay balanced. */
function growRegions(size: number, cols: number[], rng: Rng): Uint8Array {
  const ids = shuffle(rng, Array.from({ length: size }, (_, i) => i));
  const regions = new Uint8Array(size * size).fill(UNASSIGNED);
  const frontier: number[][] = Array.from({ length: size }, () => []);
  const count = new Array<number>(size).fill(1);
  const claim = (cell: number, k: number) => {
    regions[cell] = k;
    for (const nb of neighbours(size, cell)) if (regions[nb] === UNASSIGNED) frontier[k].push(nb);
  };
  for (let r = 0; r < size; r++) claim(r * size + cols[r], ids[r]);
  for (let left = size * size - size; left > 0; left--) {
    let total = 0;
    const weight = new Array<number>(size).fill(0);
    for (let k = 0; k < size; k++) {
      // Drop frontier cells that were taken since they were queued.
      const f = frontier[k].filter((cell) => regions[cell] === UNASSIGNED);
      frontier[k] = f;
      if (f.length) total += weight[k] = 1 / (count[k] * count[k]);
    }
    let pick = rng() * total;
    let k = 0;
    for (; k < size; k++) {
      if (weight[k] === 0) continue;
      pick -= weight[k];
      if (pick < 0) break;
    }
    if (k === size) while (weight[--k] === 0); // float round-off: take the last eligible region
    const f = frontier[k];
    const cell = f[randInt(rng, f.length)];
    count[k]++;
    claim(cell, k);
  }
  return regions;
}

/** A valid placement other than `p.solution`, or null if the solution is unique. */
function otherSolution(p: Puzzle): number[] | null {
  const { size, regions, solution } = p;
  const out: number[] = [];
  const place = (row: number, cols: number, regs: number, prev: number, differs: boolean): boolean => {
    if (row === size) return differs;
    for (let c = 0; c < size; c++) {
      if (cols & (1 << c) || Math.abs(c - prev) <= 1) continue;
      const reg = 1 << regions[row * size + c];
      if (regs & reg) continue;
      out[row] = c;
      if (place(row + 1, cols | (1 << c), regs | reg, c, differs || c !== solution[row])) return true;
    }
    return false;
  };
  return place(0, 0, 0, -2, false) ? out : null;
}

/** Cells of `region` still connected if `without` is removed. */
function staysConnected(p: Puzzle, region: number, without: number): boolean {
  const { regions } = p;
  const saved = regions[without];
  regions[without] = UNASSIGNED;
  const ok = isConnected(p, region);
  regions[without] = saved;
  return ok;
}

/**
 * Makes `p` unique by moving the second solution's queen cells into neighbouring regions
 * (keeping every region connected) until it has no other solution. False if it gets stuck.
 */
function repair(p: Puzzle, rng: Rng): boolean {
  const { size, regions, solution } = p;
  for (let step = 0; step < REPAIR_STEPS; step++) {
    const alt = otherSolution(p);
    if (!alt) return true;
    const moves: [number, number][] = [];
    for (let r = 0; r < size; r++) {
      const cell = r * size + alt[r];
      if (alt[r] === solution[r]) continue;
      const from = regions[cell];
      const seen = new Set<number>();
      for (const nb of neighbours(size, cell)) {
        const to = regions[nb];
        if (to !== from && !seen.has(to)) {
          seen.add(to);
          moves.push([cell, to]);
        }
      }
    }
    shuffle(rng, moves);
    const move = moves.find(([cell]) => staysConnected(p, regions[cell], cell));
    if (!move) return false;
    regions[move[0]] = move[1];
  }
  return false;
}

/** Deterministic per `(size, seed)`; the region layout has exactly one solution. */
export function generatePuzzle(size: number, seed: number): Puzzle {
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new RangeError(`queens: unsupported size ${size}`);
  }
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cols = randomQueens(size, rng);
    const regions = growRegions(size, cols, rng);
    const p: Puzzle = { size, regions, solution: cols };
    if (regionSizes(p).filter((s) => s === 1).length > 1) continue;
    if (repair(p, rng) && regionSizes(p).filter((s) => s === 1).length <= 1 && countSolutions(p, 2) === 1) {
      return p;
    }
  }
  throw new Error('queens: no unique puzzle');
}
