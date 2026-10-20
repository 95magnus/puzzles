import type { Cell, Puzzle } from './types';

export type GameState = {
  puzzle: Puzzle;
  paths: Cell[][];
  undo: Cell[][][];
  active: number | null;
  moves: number;
};

const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
const inBounds = (p: Puzzle, c: Cell) => c.r >= 0 && c.c >= 0 && c.r < p.size && c.c < p.size;
const adjacent = (a: Cell, b: Cell) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

const pathsEqual = (a: Cell[][], b: Cell[][]) =>
  a.length === b.length &&
  a.every((p, i) => p.length === b[i].length && p.every((cell, j) => same(cell, b[i][j])));

export function newGame(puzzle: Puzzle): GameState {
  return { puzzle, paths: puzzle.pairs.map(() => []), undo: [], active: null, moves: 0 };
}

/** The endpoint a path must end on to be complete (the one it did not start from). */
function targetOf(s: GameState, color: number): Cell | null {
  const p = s.paths[color];
  if (p.length === 0) return null;
  const { a, b } = s.puzzle.pairs[color];
  return same(p[0], a) ? b : a;
}

export function isPairComplete(s: GameState, color: number): boolean {
  const p = s.paths[color];
  const t = targetOf(s, color);
  return p.length >= 2 && t !== null && same(p[p.length - 1], t);
}

function endpointColor(s: GameState, cell: Cell): number {
  return s.puzzle.pairs.findIndex(pr => same(pr.a, cell) || same(pr.b, cell));
}

export function pointerDown(s: GameState, cell: Cell): GameState {
  if (s.active !== null || !inBounds(s.puzzle, cell)) return s;
  const paths = s.paths.slice();
  let color = endpointColor(s, cell);
  if (color >= 0) {
    paths[color] = [cell];
  } else {
    color = s.paths.findIndex(p => p.some(x => same(x, cell)));
    if (color < 0) return s;
    const i = s.paths[color].findIndex(x => same(x, cell));
    paths[color] = s.paths[color].slice(0, i + 1);
  }
  return { ...s, paths, undo: [...s.undo, s.paths], active: color };
}

/** Apply one orthogonal step to the active path. Returns the same state if blocked/no-op. */
function step(s: GameState, next: Cell): GameState {
  const color = s.active!;
  const p = s.paths[color];
  if (isPairComplete(s, color)) return s;
  const i = p.findIndex(x => same(x, next));
  if (i >= 0) {
    // revisiting own path: backtrack to that cell
    if (i === p.length - 1) return s;
    const paths = s.paths.slice();
    paths[color] = p.slice(0, i + 1);
    return { ...s, paths };
  }
  const other = endpointColor(s, next);
  const target = targetOf(s, color)!;
  if (other >= 0 && !same(next, target)) return s; // another pair's dot
  const paths = s.paths.map((q, k) => {
    if (k === color) return [...p, next];
    const j = q.findIndex(x => same(x, next));
    return j >= 0 ? q.slice(0, j) : q;
  });
  return { ...s, paths };
}

export function pointerMove(s: GameState, cell: Cell): GameState {
  if (s.active === null || !inBounds(s.puzzle, cell)) return s;
  let cur = s;
  for (let guard = 0; guard < s.puzzle.size * 2; guard++) {
    const p = cur.paths[cur.active!];
    const last = p[p.length - 1];
    const dr = cell.r - last.r;
    const dc = cell.c - last.c;
    if (dr === 0 && dc === 0) break;
    const next =
      Math.abs(dr) >= Math.abs(dc)
        ? { r: last.r + Math.sign(dr), c: last.c }
        : { r: last.r, c: last.c + Math.sign(dc) };
    const after = step(cur, next);
    if (after === cur) break;
    cur = after;
  }
  return cur;
}

export function pointerUp(s: GameState): GameState {
  if (s.active === null) return s;
  const snapshot = s.undo[s.undo.length - 1];
  if (snapshot && pathsEqual(snapshot, s.paths)) {
    return { ...s, undo: s.undo.slice(0, -1), active: null };
  }
  return { ...s, active: null, moves: s.moves + 1 };
}

export function clearPath(s: GameState, color: number): GameState {
  if (s.active !== null || !s.paths[color] || s.paths[color].length === 0) return s;
  const paths = s.paths.slice();
  paths[color] = [];
  return { ...s, paths, undo: [...s.undo, s.paths], moves: s.moves + 1 };
}

export function undo(s: GameState): GameState {
  if (s.active !== null || s.undo.length === 0) return s;
  return { ...s, paths: s.undo[s.undo.length - 1], undo: s.undo.slice(0, -1) };
}

/** Clear every path. Undoable (one step) and counted as a move; no-op on an empty board. */
export function reset(s: GameState): GameState {
  if (s.active !== null || s.paths.every(p => p.length === 0)) return s;
  return { ...s, paths: s.puzzle.pairs.map(() => []), undo: [...s.undo, s.paths], moves: s.moves + 1 };
}

function filledCount(s: GameState): number {
  return s.paths.reduce((n, p) => n + p.length, 0);
}

export function stats(s: GameState): { flowsDone: number; flowsTotal: number; fillPct: number } {
  const flowsTotal = s.puzzle.pairs.length;
  let flowsDone = 0;
  for (let k = 0; k < flowsTotal; k++) if (isPairComplete(s, k)) flowsDone++;
  const fillPct = Math.floor((filledCount(s) * 100) / (s.puzzle.size * s.puzzle.size));
  return { flowsDone, flowsTotal, fillPct };
}

function allComplete(s: GameState): boolean {
  return s.puzzle.pairs.every((_, k) => isPairComplete(s, k));
}

export function isSolved(s: GameState): boolean {
  return allComplete(s) && filledCount(s) === s.puzzle.size * s.puzzle.size;
}

export function needsFillHint(s: GameState): boolean {
  return allComplete(s) && filledCount(s) < s.puzzle.size * s.puzzle.size;
}

export function restore(puzzle: Puzzle, paths: Cell[][]): GameState | null {
  if (!Array.isArray(paths) || paths.length !== puzzle.pairs.length) return null;
  const seen = new Set<string>();
  const clean: Cell[][] = [];
  for (let k = 0; k < paths.length; k++) {
    const p = paths[k];
    if (!Array.isArray(p)) return null;
    const { a, b } = puzzle.pairs[k];
    const out: Cell[] = [];
    for (let i = 0; i < p.length; i++) {
      const cell = p[i];
      if (!cell || !Number.isInteger(cell.r) || !Number.isInteger(cell.c)) return null;
      if (!inBounds(puzzle, cell)) return null;
      if (i === 0) {
        if (!same(cell, a) && !same(cell, b)) return null;
      } else {
        if (!adjacent(p[i - 1], cell)) return null;
        const own = same(p[0], a) ? b : a;
        const ep = puzzle.pairs.some(pr => same(pr.a, cell) || same(pr.b, cell));
        if (ep && !(same(cell, own) && i === p.length - 1)) return null;
      }
      const key = `${cell.r},${cell.c}`;
      if (seen.has(key)) return null;
      seen.add(key);
      out.push({ r: cell.r, c: cell.c });
    }
    clean.push(out);
  }
  // Seed `moves` from restored work so thresholds (e.g. Reset's confirm) reflect it.
  const moves = clean.filter(p => p.length > 0).length;
  return { puzzle, paths: clean, undo: [], active: null, moves };
}
