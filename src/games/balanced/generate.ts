import { mulberry32, seedFromString, shuffle, type Rng } from '../../core/rng';
import { deduce } from './solver';
import type { Edge, PresetId, Puzzle, Sym } from './types';

type Params = { edgeDensity: number; minGivens: number };

export const PRESETS: Record<PresetId, { size: number; label: string } & Params> = {
  small: { size: 6, label: 'Small', edgeDensity: 0.35, minGivens: 6 },
  medium: { size: 8, label: 'Medium', edgeDensity: 0.35, minGivens: 8 },
  large: { size: 10, label: 'Large', edgeDensity: 0.35, minGivens: 10 },
};

export const DAILY_PRESET: PresetId = 'medium';

const MIN_SIZE = 4;
const MAX_SIZE = 10;
const MAX_ATTEMPTS = 200;
const MAX_BACKTRACKS = 10_000;

export function balancedDailySeed(isoDate: string): number {
  return seedFromString('balanced-daily:' + isoDate);
}

function params(size: number): Params {
  const preset = Object.values(PRESETS).find((x) => x.size === size);
  return preset ? { edgeDensity: preset.edgeDensity, minGivens: preset.minGivens } : { edgeDensity: 0.35, minGivens: size };
}

/** A random valid full grid by row-major backtracking; `null` when it runs out of backtracks. */
function tryFill(size: number, rng: Rng): Sym[] | null {
  const g: Sym[] = new Array(size * size).fill(0);
  const half = size / 2;
  const rowCount = [new Array(size).fill(0), new Array(size).fill(0)];
  const colCount = [new Array(size).fill(0), new Array(size).fill(0)];
  let backtracks = 0;
  const allowed = (cell: number, s: Sym): boolean => {
    const r = Math.floor(cell / size);
    const c = cell % size;
    if (rowCount[s - 1][r] === half || colCount[s - 1][c] === half) return false;
    if (c >= 2 && g[cell - 1] === s && g[cell - 2] === s) return false;
    if (r >= 2 && g[cell - size] === s && g[cell - 2 * size] === s) return false;
    return true;
  };
  const walk = (cell: number): boolean => {
    if (cell === size * size) return true;
    const r = Math.floor(cell / size);
    const c = cell % size;
    const order: Sym[] = rng() < 0.5 ? [1, 2] : [2, 1];
    for (const s of order) {
      if (!allowed(cell, s)) continue;
      g[cell] = s;
      rowCount[s - 1][r]++;
      colCount[s - 1][c]++;
      if (walk(cell + 1)) return true;
      rowCount[s - 1][r]--;
      colCount[s - 1][c]--;
      g[cell] = 0;
      if (++backtracks > MAX_BACKTRACKS) return false;
    }
    return false;
  };
  return walk(0) ? g : null;
}

function fillSolution(size: number, rng: Rng): Sym[] {
  for (;;) {
    const g = tryFill(size, rng);
    if (g) return g;
  }
}

type Item = { given: number } | { edge: Edge };

/**
 * A deterministic board for `(size, seed)`: a random solved grid, every cell given plus random
 * `=` / `×` clues, then one shuffled pass dropping each clue the deduction solver can do without.
 */
export function generatePuzzle(size: number, seed: number): Puzzle {
  if (size % 2 !== 0 || size < MIN_SIZE || size > MAX_SIZE) throw new Error(`balanced: unsupported size ${size}`);
  const rng = mulberry32(seed);
  const cfg = params(size);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const solution = fillSolution(size, rng);
    const all: Edge[] = [];
    for (let a = 0; a < size * size; a++) {
      const neighbours = [];
      if (a % size !== size - 1) neighbours.push(a + 1);
      if (a + size < size * size) neighbours.push(a + size);
      for (const b of neighbours) {
        if (rng() < cfg.edgeDensity) all.push({ a, b, kind: solution[a] === solution[b] ? 'eq' : 'neq' });
      }
    }
    const givens = solution.slice();
    const edges = new Set(all);
    let givenCount = size * size;
    const items: Item[] = shuffle(rng, [...givens.map((_, given) => ({ given })), ...all.map((edge) => ({ edge }))]);
    for (const item of items) {
      if ('given' in item) {
        if (givenCount === cfg.minGivens) continue;
        givens[item.given] = 0;
        if (deduce({ size, givens, edges: [...edges] })) givenCount--;
        else givens[item.given] = solution[item.given];
      } else {
        edges.delete(item.edge);
        if (!deduce({ size, givens, edges: [...edges] })) edges.add(item.edge);
      }
    }
    if (edges.size >= 2) {
      const sorted = [...edges].sort((x, y) => x.a - y.a || x.b - y.b);
      return { size, givens, edges: sorted, solution };
    }
  }
  throw new Error('balanced: no puzzle');
}
