import { MIN_AREA, contains, fits, inBounds, overlaps } from './rect';
import type { GameState, Move, Puzzle, Rect } from './types';

// Pure game state. Mutating actions return true iff something changed;
// all are ignored (return false) once the game is won.

export function newGame(p: Puzzle): GameState {
  return { puzzle: p, rects: [], history: [], status: 'playing' };
}

/** `clue` is the index of the single clue inside `x` (else null); `ok` iff `x` is at least MIN_AREA cells and that clue's shape and optional area match. */
export function checkRect(p: Puzzle, x: Rect): { clue: number | null; ok: boolean } {
  let clue: number | null = null;
  for (let i = 0; i < p.clues.length; i++) {
    if (!contains(p.size, x, p.clues[i].cell)) continue;
    if (clue !== null) return { clue: null, ok: false };
    clue = i;
  }
  if (clue === null) return { clue, ok: false };
  const { shape, area } = p.clues[clue];
  return { clue, ok: x.w * x.h >= MIN_AREA && fits(shape, x) && (area === undefined || area === x.w * x.h) };
}

/** Indices into `s.rects` of rectangles that break their clue. */
export function invalid(s: GameState): Set<number> {
  const bad = new Set<number>();
  s.rects.forEach((x, i) => {
    if (!checkRect(s.puzzle, x).ok) bad.add(i);
  });
  return bad;
}

/** Number of covered cells (placed rectangles never overlap). */
export function coverage(s: GameState): number {
  let n = 0;
  for (const x of s.rects) n += x.w * x.h;
  return n;
}

export function isWin(s: GameState): boolean {
  return coverage(s) === s.puzzle.size * s.puzzle.size && invalid(s).size === 0;
}

function commit(s: GameState, move: Move): boolean {
  s.history.push(move);
  if (isWin(s)) s.status = 'won';
  return true;
}

/** Whether `x` overlaps a placed rectangle; a drag never draws over one. */
export function blocked(s: GameState, x: Rect): boolean {
  return s.rects.some((o) => overlaps(o, x));
}

/** Ignored for a single cell (never a patch) and for a rectangle overlapping a placed one. */
export function place(s: GameState, x: Rect): boolean {
  if (s.status === 'won' || x.w * x.h < MIN_AREA || blocked(s, x)) return false;
  s.rects.push(x);
  return commit(s, { added: [x], removed: [] });
}

export function removeAt(s: GameState, cell: number): boolean {
  if (s.status === 'won') return false;
  const hit = s.rects.find((x) => contains(s.puzzle.size, x, cell));
  if (!hit) return false;
  s.rects = s.rects.filter((x) => x !== hit);
  return commit(s, { added: [], removed: [hit] });
}

/** A tap removes the rectangle under it; on an empty cell it does nothing. */
export function tap(s: GameState, cell: number): boolean {
  return removeAt(s, cell);
}

export function undo(s: GameState): boolean {
  if (s.status === 'won') return false;
  const move = s.history.pop();
  if (!move) return false;
  s.rects = [...s.rects.filter((x) => !move.added.includes(x)), ...move.removed];
  return true;
}

export function clear(s: GameState): boolean {
  if (s.status === 'won' || s.rects.length === 0) return false;
  const removed = s.rects;
  s.rects = [];
  return commit(s, { added: [], removed });
}

export function encode(s: GameState): string {
  return [...s.rects]
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map((x) => `${x.r},${x.c},${x.w},${x.h}`)
    .join(';');
}

export function restore(p: Puzzle, text: string): GameState | null {
  const s = newGame(p);
  if (text === '') return s;
  for (const part of text.split(';')) {
    if (!/^\d+,\d+,\d+,\d+$/.test(part)) return null;
    const [r, c, w, h] = part.split(',').map(Number);
    const x = { r, c, w, h };
    if (!inBounds(p.size, x) || x.w * x.h < MIN_AREA || s.rects.some((o) => overlaps(o, x))) return null;
    s.rects.push(x);
  }
  if (isWin(s)) s.status = 'won';
  return s;
}
