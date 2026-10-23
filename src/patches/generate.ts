import { mulberry32, randInt, seedFromString, shuffle, type Rng } from '../core/rng';
import { PALETTE } from '../ui/palette';
import { MIN_AREA, cellsOf, sameRect, shapeOf } from './rect';
import { countSolutions, solutions } from './solver';
import type { Clue, PresetId, Puzzle, Rect } from './types';

type Params = { maxArea: number; hideArea: number; anyShape: number };

export const PRESETS: Record<PresetId, { size: number; label: string } & Params> = {
  small: { size: 6, label: 'Small', maxArea: 6, hideArea: 0.2, anyShape: 0.1 },
  medium: { size: 8, label: 'Medium', maxArea: 8, hideArea: 0.3, anyShape: 0.15 },
  large: { size: 10, label: 'Large', maxArea: 10, hideArea: 0.35, anyShape: 0.15 },
};

export const DAILY_PRESET: PresetId = 'medium';

const MIN_SIZE = 4;
const MAX_SIZE = 10;
const MAX_ATTEMPTS = 2000;
const REPAIR_STEPS = 30;

export function patchesDailySeed(isoDate: string): number {
  return seedFromString('patches-daily:' + isoDate);
}

function params(size: number): Params {
  const preset = Object.values(PRESETS).find((x) => x.size === size);
  return preset ? { maxArea: preset.maxArea, hideArea: preset.hideArea, anyShape: preset.anyShape } : { maxArea: size, hideArea: 0.3, anyShape: 0.15 };
}

/**
 * Area 3–6 is favoured (a single cell is never offered). Long 1×N strips (area ≥ 4) are cut to an eighth of their
 * area's weight: the anchor offers many of them on a wide-open board, and halving alone left a fifth of the
 * rectangles as strips. Integer weights keep the draw exact and deterministic.
 */
function weight(w: number, h: number): number {
  const area = w * h;
  const base = area === 2 ? 8 : area <= 6 ? 16 : 8;
  return Math.min(w, h) === 1 && area >= 4 ? base / 8 : base;
}

/** First uncovered cell scanning rows (`byRow`) or columns, or -1. Either way the cells above and left of it are covered, so it is a top-left corner. */
function firstFree(size: number, covered: Uint8Array, byRow: boolean): number {
  for (let a = 0; a < size; a++) {
    for (let b = 0; b < size; b++) {
      const cell = byRow ? a * size + b : b * size + a;
      if (!covered[cell]) return cell;
    }
  }
  return -1;
}

/**
 * Tile the board: anchor at the first uncovered cell, scanning rows or columns at random each time (one
 * scan order alone favours tall rectangles, its transpose wide ones), and pick a weighted random rectangle there.
 * Returns null when an anchor is boxed in so that only a single cell would fit.
 */
function partition(size: number, maxArea: number, rng: Rng): Rect[] | null {
  const covered = new Uint8Array(size * size);
  const rects: Rect[] = [];
  for (let cell = firstFree(size, covered, true); cell >= 0; cell = firstFree(size, covered, rng() < 0.5)) {
    const r = Math.floor(cell / size);
    const c = cell % size;
    const options: Rect[] = [];
    const weights: number[] = [];
    let total = 0;
    let maxW = size - c;
    for (let h = 1; r + h <= size && h <= maxArea; h++) {
      const row = (r + h - 1) * size;
      let run = 0;
      while (run < maxW && !covered[row + c + run]) run++;
      maxW = run;
      if (maxW === 0) break;
      for (let w = 1; w <= maxW && w * h <= maxArea; w++) {
        if (w * h < MIN_AREA) continue;
        options.push({ r, c, w, h });
        weights.push(weight(w, h));
        total += weight(w, h);
      }
    }
    if (!options.length) return null;
    let pick = rng() * total;
    let k = 0;
    while (k < options.length - 1 && (pick -= weights[k]) >= 0) k++;
    const x = options[k];
    for (const taken of cellsOf(size, x)) covered[taken] = 1;
    rects.push(x);
  }
  return rects;
}

/** A planted rectangle, its clue, and the clue cells already tried inside it during repair. */
type Patch = { rect: Rect; clue: Clue; tried: Set<number> };

const byCell = (a: Patch, b: Patch) => a.clue.cell - b.clue.cell;

function toPuzzle(size: number, patches: Patch[]): Puzzle {
  return { size, clues: patches.map((x) => x.clue), solution: patches.map((x) => x.rect) };
}

function placeClue(size: number, rect: Rect, rng: Rng): Patch {
  const cells = cellsOf(size, rect);
  const cell = cells[randInt(rng, cells.length)];
  return { rect, clue: { cell, shape: shapeOf(rect), area: rect.w * rect.h, color: 0 }, tried: new Set([cell]) };
}

/** The union of `a` and `b` when it is itself a rectangle, else null. */
function union(a: Rect, b: Rect): Rect | null {
  if (a.r === b.r && a.h === b.h && (a.c + a.w === b.c || b.c + b.w === a.c)) {
    return { r: a.r, c: Math.min(a.c, b.c), w: a.w + b.w, h: a.h };
  }
  if (a.c === b.c && a.w === b.w && (a.r + a.h === b.r || b.r + b.h === a.r)) {
    return { r: Math.min(a.r, b.r), c: a.c, w: a.w, h: a.h + b.h };
  }
  return null;
}

/**
 * Makes the planted partition the only solution: where a second solution differs, move that clue to an
 * untried cell of its rectangle, or once every cell is tried, merge the rectangle with a neighbour.
 * Returns the repaired patches (sorted by cell), or null when it gets stuck.
 */
function repair(size: number, maxArea: number, patches: Patch[], rng: Rng): Patch[] | null {
  for (let step = 0; ; step++) {
    const p = toPuzzle(size, patches);
    const alt = solutions(p, 2).find((s) => s.some((x, i) => !sameRect(x, p.solution[i])));
    if (!alt) return patches;
    if (step === REPAIR_STEPS) return null;
    const i = alt.findIndex((x, k) => !sameRect(x, p.solution[k]));
    const target = patches[i];
    const untried = cellsOf(size, target.rect).filter((cell) => !target.tried.has(cell));
    if (untried.length) {
      const cell = untried[randInt(rng, untried.length)];
      target.tried.add(cell);
      target.clue.cell = cell;
    } else {
      const merges: [number, Rect][] = [];
      patches.forEach((other, j) => {
        const u = j === i ? null : union(target.rect, other.rect);
        if (u && u.w * u.h <= maxArea) merges.push([j, u]);
      });
      if (!merges.length) return null;
      const [j, u] = merges[randInt(rng, merges.length)];
      patches = patches.filter((_, k) => k !== i && k !== j);
      patches.push(placeClue(size, u, rng));
    }
    patches.sort(byCell);
  }
}

/** Swap in `relax(clue)` for up to `target` clues (visited in shuffled order), keeping each swap only while the board stays unique. */
function hide(p: Puzzle, eligible: number[], target: number, relax: (c: Clue) => Clue, rng: Rng): void {
  let done = 0;
  for (const i of shuffle(rng, [...eligible])) {
    if (done === target) return;
    const kept = p.clues[i];
    p.clues[i] = relax(kept);
    if (countSolutions(p, 2) === 1) done++;
    else p.clues[i] = kept;
  }
}

const dropArea = (c: Clue): Clue => ({ cell: c.cell, shape: c.shape, color: c.color });
const relaxShape = (c: Clue): Clue => ({ ...c, shape: 'any' });

const SHAPE_ORDER: Clue['shape'][] = ['square', 'wide', 'tall', 'any'];

/**
 * Colour clues by what they show: every clue with the same shape and area (or the same shape with the area
 * hidden) gets the same colour. The board's distinct clue types, sorted by area (hidden last) then shape, take
 * PALETTE indices 1..8 in order, cycling when a board has more than eight. Index 0 (#ff5c7a) is the invalid red,
 * so no valid tile may wear it.
 */
export function colourClues(clues: Pick<Clue, 'shape' | 'area' | 'color'>[]): void {
  const key = (c: Pick<Clue, 'shape' | 'area'>) => (c.area ?? 99) * SHAPE_ORDER.length + SHAPE_ORDER.indexOf(c.shape);
  const kinds = [...new Set(clues.map(key))].sort((a, b) => a - b);
  const hues = PALETTE.length - 1;
  for (const c of clues) c.color = 1 + (kinds.indexOf(key(c)) % hues);
}

/** Deterministic per `(size, seed)`; the clues have exactly one solution, `solution`. */
export function generatePuzzle(size: number, seed: number): Puzzle {
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new RangeError(`patches: unsupported size ${size}`);
  }
  const rng = mulberry32(seed);
  const cfg = params(size);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rects = partition(size, cfg.maxArea, rng);
    if (!rects) continue;
    const repaired = repair(size, cfg.maxArea, rects.map((x) => placeClue(size, x, rng)).sort(byCell), rng);
    if (!repaired) continue;
    const p = toPuzzle(size, repaired);
    if (p.solution.some((x) => x.w * x.h > cfg.maxArea)) continue;
    const n = p.clues.length;
    const all = p.clues.map((_, i) => i);
    hide(p, all, Math.round(cfg.hideArea * n), dropArea, rng);
    const shown = all.filter((i) => p.clues[i].area !== undefined);
    hide(p, shown, Math.round(cfg.anyShape * n), relaxShape, rng);
    colourClues(p.clues);
    return p;
  }
  throw new Error('patches: no unique puzzle');
}
