import { mulberry32, randInt, seedFromString, shuffle, type Rng } from '../../core/rng';
import { geometry } from './geometry';
import { deduce } from './solver';
import type { PresetId, Puzzle } from './types';

export const PRESETS: Record<PresetId, { size: number; label: string }> = {
  small: { size: 5, label: 'Small' },
  medium: { size: 7, label: 'Medium' },
  large: { size: 10, label: 'Large' },
};

export const DAILY_PRESET: PresetId = 'medium';

const MIN_SIZE = 5;
const MAX_SIZE = 10;
const MAX_ATTEMPTS = 100;
const MAX_FAILS = 200;
const MIN_AREA = 0.35;
const MAX_AREA = 0.6;

export function loopDailySeed(isoDate: string): number {
  return seedFromString('loop-daily:' + isoDate);
}

const NEIGHBOURS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

/** Whether adding `cell` keeps the outside (plus the exterior) in one piece and makes no diagonal-only 2x2 block. */
function canGrow(size: number, inside: boolean[], cell: number): boolean {
  const r0 = Math.floor(cell / size);
  const c0 = cell % size;
  const at = (r: number, c: number): boolean => (r === r0 && c === c0) || (r >= 0 && c >= 0 && r < size && c < size && inside[r * size + c]);
  for (let r = r0 - 1; r <= r0; r++) {
    for (let c = c0 - 1; c <= c0; c++) {
      const a = at(r, c);
      const b = at(r, c + 1);
      const d = at(r + 1, c);
      const e = at(r + 1, c + 1);
      if (a === e && b === d && a !== b) return false;
    }
  }
  let outside = 0;
  for (let i = 0; i < size * size; i++) if (!inside[i] && i !== cell) outside++;
  const seen = new Uint8Array(size * size);
  const stack: number[] = [];
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    if (!inside[i] && i !== cell && (r === 0 || c === 0 || r === size - 1 || c === size - 1)) {
      seen[i] = 1;
      stack.push(i);
    }
  }
  let reached = stack.length;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const r = Math.floor(i / size);
    const c = i % size;
    for (const [dr, dc] of NEIGHBOURS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const n = nr * size + nc;
      if (inside[n] || n === cell || seen[n]) continue;
      seen[n] = 1;
      reached++;
      stack.push(n);
    }
  }
  return reached === outside;
}

/** Grows a hole-free, connected region of cells and returns which cells are inside. */
function growRegion(size: number, rng: Rng): boolean[] {
  const total = size * size;
  const inside: boolean[] = new Array(total).fill(false);
  const lo = Math.round(MIN_AREA * total);
  const hi = Math.round(MAX_AREA * total);
  const target = lo + randInt(rng, hi - lo + 1);
  inside[randInt(rng, total)] = true;
  let count = 1;
  let fails = 0;
  while (count < target && fails < MAX_FAILS) {
    const border: number[] = [];
    for (let i = 0; i < total; i++) {
      if (inside[i]) continue;
      const r = Math.floor(i / size);
      const c = i % size;
      if (NEIGHBOURS.some(([dr, dc]) => r + dr >= 0 && c + dc >= 0 && r + dr < size && c + dc < size && inside[(r + dr) * size + c + dc])) border.push(i);
    }
    if (border.length === 0) break;
    const cell = border[randInt(rng, border.length)];
    if (canGrow(size, inside, cell)) {
      inside[cell] = true;
      count++;
      fails = 0;
    } else {
      fails++;
    }
  }
  return inside;
}

function sameLines(a: (0 | 1)[] | null, b: (0 | 1)[]): boolean {
  return a !== null && a.every((v, i) => v === b[i]);
}

function attempt(size: number, rng: Rng): Puzzle | null {
  const g = geometry(size);
  const inside = growRegion(size, rng);
  const solution = g.edgeCells.map((cells) => {
    const a = inside[cells[0]];
    const b = cells.length > 1 ? inside[cells[1]] : false;
    return a !== b ? 1 : 0;
  }) as (0 | 1)[];
  const clues: (number | null)[] = g.cellEdges.map((sides) => sides.reduce((n, e) => n + solution[e], 0));
  if (!sameLines(deduce(size, clues), solution)) return null;
  const order = shuffle(
    rng,
    clues.map((_, i) => i),
  );
  for (const cell of order) {
    const kept = clues[cell];
    clues[cell] = null;
    if (!sameLines(deduce(size, clues), solution)) clues[cell] = kept;
  }
  return { size, clues, solution };
}

export function generatePuzzle(size: number, seed: number): Puzzle {
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) throw new Error(`Unsupported Loop size ${size}`);
  const rng = mulberry32(seed);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const puzzle = attempt(size, rng);
    if (puzzle) return puzzle;
  }
  throw new Error(`Could not generate a ${size}x${size} Loop for seed ${seed}`);
}
