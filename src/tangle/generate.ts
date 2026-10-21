import { mulberry32, randInt, seedFromString, shuffle, type Rng } from '../core/rng';
import { analyze } from './solver';
import { DIRS, type Arrow, type Dir, type Level, type LevelSpec, type PresetId } from './types';

export const PRESETS: Record<PresetId, LevelSpec & { label: string }> = {
  medium: { cols: 30, rows: 30, maxLen: 12, blockBias: 1, label: 'Medium' },
  hard: { cols: 40, rows: 40, maxLen: 14, blockBias: 4, label: 'Hard' },
  huge: { cols: 50, rows: 50, maxLen: 16, blockBias: 4, label: 'Huge' },
};

export const DAILY_PRESET: PresetId = 'hard';

/** Palette size; colours are indices into `PALETTE` (src/ui/palette.ts). */
const COLORS = 9;
/** Sub-seeds tried by the quality gate. */
const TRIES = 8;
const MIN_FILL = 0.95;
const MAX_FREE = 0.2;
const GAP_PASSES = 6;
const STRAIGHT = 0.4;

export function tangleDailySeed(isoDate: string): number {
  return seedFromString('tangle-daily:' + isoDate);
}

/** Covered cells / all cells. */
export function fillRatio(level: Level): number {
  let covered = 0;
  for (const a of level.arrows) covered += a.cells.length;
  return covered / (level.cols * level.rows);
}

/**
 * Deterministic per `(spec, seed)`. Builds a solvable level by reverse construction, then
 * densifies it with solver-checked gap filling. For biased specs a quality gate retries with
 * `seed + 1 … seed + 7` until the board is dense and few arrows start free, else keeps the best.
 */
export function generateLevel(spec: LevelSpec, seed: number): Level {
  if (spec.cols < 4 || spec.rows < 4) {
    throw new RangeError(`a ${spec.cols}×${spec.rows} board is too small`);
  }
  let best: Level | null = null;
  let bestFill = -1;
  let bestFree = Infinity;
  for (let k = 0; k < TRIES; k++) {
    const level = attempt(spec, mulberry32(seed + k));
    if (spec.blockBias === 1) return level;
    const fill = fillRatio(level);
    const free = analyze(level)!.initiallyFree;
    if (fill >= MIN_FILL && free <= MAX_FREE * level.arrows.length) return level;
    if (fill > bestFill || (fill === bestFill && free < bestFree)) {
      best = level;
      bestFill = fill;
      bestFree = free;
    }
  }
  return best!;
}

/** True if `cell` lies on the exit line of an arrow with head `head` facing `dir`. */
function onLine(cols: number, head: number, dir: Dir, cell: number): boolean {
  const hc = head % cols;
  const hr = Math.floor(head / cols);
  const c = cell % cols;
  const r = Math.floor(cell / cols);
  switch (dir) {
    case 0:
      return c === hc && r < hr;
    case 1:
      return r === hr && c > hc;
    case 2:
      return c === hc && r > hr;
    default:
      return r === hr && c < hc;
  }
}

function attempt(spec: LevelSpec, rng: Rng): Level {
  const { cols, rows, maxLen, blockBias } = spec;
  const n = cols * rows;
  const arrows: Arrow[] = [];
  const level: Level = { cols, rows, arrows };
  const occ = new Int32Array(n).fill(-1);
  /** Arrows whose exit line passes through each cell. */
  const lines: number[][] = Array.from({ length: n }, () => []);
  /** Empty cells with O(1) removal. */
  const empty: number[] = Array.from({ length: n }, (_, i) => i);
  const pos = Int32Array.from(empty);
  const stamp = new Int32Array(n + 1);
  let stampGen = 0;

  const neighbour = (cell: number, d: number): number => {
    const c = (cell % cols) + DIRS[d][0];
    const r = Math.floor(cell / cols) + DIRS[d][1];
    return c >= 0 && c < cols && r >= 0 && r < rows ? r * cols + c : -1;
  };

  const lineOf = (head: number, dir: Dir): number[] => {
    const out: number[] = [];
    for (let cell = neighbour(head, dir); cell >= 0; cell = neighbour(cell, dir)) out.push(cell);
    return out;
  };

  const take = (cell: number) => {
    const p = pos[cell];
    const last = empty.pop()!;
    if (last !== cell) {
      empty[p] = last;
      pos[last] = p;
    }
  };

  const pickColor = (cells: number[], self: number): number => {
    const clash = (color: number) =>
      cells.some((cell) =>
        DIRS.some((_, d) => {
          const nb = neighbour(cell, d);
          const j = nb >= 0 ? occ[nb] : -1;
          return j >= 0 && j !== self && arrows[j].color === color;
        }),
      );
    const color = randInt(rng, COLORS);
    return clash(color) ? randInt(rng, COLORS) : color;
  };

  /** Adds an arrow whose cells are already validated; returns its index. */
  const commit = (cells: number[], dir: Dir): number => {
    const i = arrows.length;
    for (const cell of cells) {
      occ[cell] = i;
      take(cell);
    }
    arrows.push({ cells, dir, color: pickColor(cells, i) });
    for (const cell of lineOf(cells[cells.length - 1], dir)) lines[cell].push(i);
    return i;
  };

  const drawCandidate = (): { cells: number[]; dir: Dir } | null => {
    const head = empty[randInt(rng, empty.length)];
    const dir = randInt(rng, 4) as Dir;
    const line = lineOf(head, dir);
    for (const cell of line) if (occ[cell] >= 0) return null;
    const neck = neighbour(head, (dir + 2) % 4);
    if (neck < 0 || occ[neck] >= 0) return null;
    const len = 3 + randInt(rng, maxLen - 2);
    const body = [head, neck];
    let step = (dir + 2) % 4;
    while (body.length < len) {
      const tip = body[body.length - 1];
      const options: number[] = [];
      let straight = false;
      for (let d = 0; d < 4; d++) {
        const nb = neighbour(tip, d);
        if (nb < 0 || occ[nb] >= 0 || body.includes(nb) || line.includes(nb)) continue;
        options.push(d);
        if (d === step) straight = true;
      }
      if (options.length === 0) break;
      if (!(straight && rng() < STRAIGHT)) step = options[randInt(rng, options.length)];
      body.push(neighbour(tip, step));
    }
    return { cells: body.reverse(), dir };
  };

  const crossings = (cells: number[]): number => {
    stampGen++;
    let count = 0;
    for (const cell of cells) {
      for (const j of lines[cell]) {
        if (stamp[j] !== stampGen) {
          stamp[j] = stampGen;
          count++;
        }
      }
    }
    return count;
  };

  // Phase 1: reverse construction. Each arrow's exit line is clear of earlier arrows, so
  // removing arrows in reverse placement order always works.
  let fails = 0;
  while (fails < 30 * cols && empty.length > 0) {
    let best: { cells: number[]; dir: Dir } | null = null;
    let bestCross = -1;
    for (let k = 0; k < blockBias; k++) {
      const cand = drawCandidate();
      if (!cand) continue;
      const cross = blockBias > 1 ? crossings(cand.cells) : 0;
      if (cross > bestCross) {
        best = cand;
        bestCross = cross;
      }
    }
    if (!best) {
      fails++;
      continue;
    }
    fails = 0;
    commit(best.cells, best.dir);
  }

  // Phase 2: gap fill. A change that puts no new cell on any exit line, or adds an arrow
  // with a clear exit line, cannot close a cycle, so the solver only runs otherwise.
  for (let pass = 0; pass < GAP_PASSES; pass++) {
    let changed = false;
    const cells = shuffle(rng, empty.slice());
    for (const c of cells) {
      if (occ[c] >= 0) continue;
      if (extendTail(c) || addPair(c)) changed = true;
    }
    if (!changed) break;
  }
  return level;

  function extendTail(c: number): boolean {
    for (let d = 0; d < 4; d++) {
      const nb = neighbour(c, d);
      if (nb < 0) continue;
      const j = occ[nb];
      if (j < 0) continue;
      const a = arrows[j];
      if (a.cells[0] !== nb || onLine(cols, a.cells[a.cells.length - 1], a.dir, c)) continue;
      a.cells.unshift(c);
      occ[c] = j;
      if (lines[c].length === 0 || analyze(level)) {
        take(c);
        return true;
      }
      a.cells.shift();
      occ[c] = -1;
    }
    return false;
  }

  function addPair(c: number): boolean {
    for (let d = 0; d < 4; d++) {
      const nb = neighbour(c, d);
      if (nb < 0 || occ[nb] >= 0) continue;
      // (tail, head) = (c, nb) points along d; (nb, c) points the other way.
      for (const [tail, head, dir] of [
        [c, nb, d],
        [nb, c, (d + 2) % 4],
      ] as [number, number, Dir][]) {
        const i = arrows.length;
        const line = lineOf(head, dir);
        const safe =
          (lines[tail].length === 0 && lines[head].length === 0) || line.every((cell) => occ[cell] < 0);
        arrows.push({ cells: [tail, head], dir, color: 0 });
        occ[tail] = i;
        occ[head] = i;
        if (safe || analyze(level)) {
          arrows.pop();
          occ[tail] = -1;
          occ[head] = -1;
          commit([tail, head], dir);
          return true;
        }
        arrows.pop();
        occ[tail] = -1;
        occ[head] = -1;
      }
    }
    return false;
  }
}
