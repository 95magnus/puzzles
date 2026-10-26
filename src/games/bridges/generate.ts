import { mulberry32, randInt, seedFromString, shuffle, type Rng } from '../../core/rng';
import { layout } from './geometry';
import { deduce } from './solver';
import type { Count, Island, PresetId, Puzzle } from './types';

type Params = { minIslands: number; maxIslands: number };

export const PRESETS: Record<PresetId, { size: number; label: string } & Params> = {
  small: { size: 7, label: 'Small', minIslands: 10, maxIslands: 13 },
  medium: { size: 9, label: 'Medium', minIslands: 17, maxIslands: 22 },
  large: { size: 11, label: 'Large', minIslands: 26, maxIslands: 32 },
};

export const DAILY_PRESET: PresetId = 'medium';

/** Chance that a freshly placed island is also joined to a second island, which makes cycles. */
export const EXTRA_LINK = 0.4;

const MIN_SIZE = 7;
const MAX_SIZE = 11;
const MAX_ATTEMPTS = 300;
const MAX_FAILS = 200;
const MAX_TOTAL = 8;
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export function bridgesDailySeed(isoDate: string): number {
  return seedFromString('bridges-daily:' + isoDate);
}

function params(size: number): Params {
  const preset = Object.values(PRESETS).find((x) => x.size === size);
  return preset
    ? { minIslands: preset.minIslands, maxIslands: preset.maxIslands }
    : { minIslands: Math.round(0.21 * size * size), maxIslands: Math.round(0.265 * size * size) };
}

type Laid = { x: number; y: number; count: Count };

/** One growth attempt: islands (with their totals so far) and the bridges laid between them. */
function grow(size: number, rng: Rng, maxIslands: number): { cells: number[]; total: number[]; laid: Laid[] } {
  const used = new Map<number, 'island' | 'bridge'>();
  const cells = [randInt(rng, size * size)];
  const total = [0];
  const laid: Laid[] = [];
  used.set(cells[0], 'island');
  const hasIsland = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < size && r < size && used.get(r * size + c) === 'island';
  const bridgeCount = (): Count => (rng() < 0.6 ? 1 : 2);
  const lay = (x: number, y: number, count: number, path: number[]): void => {
    laid.push({ x, y, count: count as Count });
    for (const cell of path) used.set(cell, 'bridge');
    total[x] += count;
    total[y] += count;
  };
  let fails = 0;
  while (cells.length < maxIslands && fails < MAX_FAILS) {
    const open = cells.map((_, i) => i).filter((i) => total[i] < MAX_TOTAL);
    if (open.length === 0) break;
    const x = open[randInt(rng, open.length)];
    const [dc, dr] = DIRS[randInt(rng, 4)];
    const dist = 2 + randInt(rng, size);
    const c0 = cells[x] % size;
    const r0 = Math.floor(cells[x] / size);
    const tc = c0 + dc * dist;
    const tr = r0 + dr * dist;
    if (tc < 0 || tr < 0 || tc >= size || tr >= size) {
      fails++;
      continue;
    }
    const target = tr * size + tc;
    const path: number[] = [];
    for (let k = 1; k < dist; k++) path.push((r0 + dr * k) * size + c0 + dc * k);
    if (
      used.has(target) ||
      path.some((cell) => used.has(cell)) ||
      DIRS.some(([ec, er]) => hasIsland(tc + ec, tr + er))
    ) {
      fails++;
      continue;
    }
    const y = cells.length;
    cells.push(target);
    total.push(0);
    used.set(target, 'island');
    lay(x, y, Math.min(bridgeCount(), MAX_TOTAL - total[x]), path);
    fails = 0;
    if (rng() >= EXTRA_LINK) continue;
    for (const [ec, er] of shuffle(
      rng,
      DIRS.filter(([a, b]) => a !== -dc || b !== -dr).map((d) => [...d] as [number, number]),
    )) {
      // Nearest island that way, through free water only, with at least one cell between.
      const between: number[] = [];
      let z = -1;
      for (let k = 1; ; k++) {
        const c = tc + ec * k;
        const r = tr + er * k;
        if (c < 0 || r < 0 || c >= size || r >= size) break;
        const cell = r * size + c;
        const what = used.get(cell);
        if (what === 'bridge') break;
        if (what === 'island') {
          if (between.length > 0) z = cells.indexOf(cell);
          break;
        }
        between.push(cell);
      }
      if (z < 0 || z === x || total[y] >= MAX_TOTAL || total[z] >= MAX_TOTAL) continue;
      lay(y, z, Math.min(bridgeCount(), MAX_TOTAL - total[y], MAX_TOTAL - total[z]), between);
      break;
    }
  }
  return { cells, total, laid };
}

/**
 * A deterministic board for `(size, seed)`: grow a random bridge network on the grid, number every island
 * with its bridge total, and keep the board only when the deduction solver reproduces the network exactly.
 */
export function generatePuzzle(size: number, seed: number): Puzzle {
  if (size < MIN_SIZE || size > MAX_SIZE) throw new Error(`bridges: unsupported size ${size}`);
  const rng = mulberry32(seed);
  const { minIslands, maxIslands } = params(size);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { cells, total, laid } = grow(size, rng, maxIslands);
    if (cells.length < minIslands) continue;
    const islands: Island[] = cells.map((cell, i) => ({ cell, n: total[i] }));
    const p = layout(size, islands);
    const index = new Map(p.islands.map((isl, i) => [isl.cell, i]));
    const count = new Map<string, Count>();
    for (const { x, y, count: n } of laid) {
      const a = index.get(cells[x])!;
      const b = index.get(cells[y])!;
      count.set(`${Math.min(a, b)},${Math.max(a, b)}`, n);
    }
    const solution = p.links.map((l) => count.get(`${l.a},${l.b}`) ?? 0);
    const found = deduce(p);
    if (found && found.every((v, i) => v === solution[i])) return { ...p, solution };
  }
  throw new Error('bridges: no puzzle');
}
