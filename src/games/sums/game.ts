import { lineCells } from './solver';
import type { Cell, GameState, Puzzle, Status } from './types';

// The functions mutate the state in place; the result tells the board what to animate.

export const MAX_LIVES = 3;

export type StrikeResult = 'struck' | 'mistake' | 'ignored';

export function newGame(p: Puzzle): GameState {
  const left = p.solution.reduce<number>((n, k) => n + (k ? 0 : 1), 0);
  return {
    puzzle: p,
    cells: new Array<Cell>(p.size * p.size).fill(0),
    lives: MAX_LIVES,
    status: left === 0 ? 'won' : 'playing',
    left,
  };
}

/** Strikes an open cell: a non-solution digit is struck, a solution digit locks and costs a life. */
export function strike(s: GameState, cell: number): StrikeResult {
  if (s.status !== 'playing' || s.cells[cell] !== 0 || isLocked(s, cell)) return 'ignored';
  if (s.puzzle.solution[cell]) {
    s.cells[cell] = 3;
    s.lives--;
    if (s.lives === 0) s.status = 'lost';
    return 'mistake';
  }
  s.cells[cell] = 1;
  s.left--;
  if (s.left === 0) s.status = 'won';
  return 'struck';
}

/** Toggles open and marked; returns whether anything changed. */
export function toggleMark(s: GameState, cell: number): boolean {
  if (s.status !== 'playing') return false;
  const c = s.cells[cell];
  if ((c !== 0 && c !== 2) || isLocked(s, cell)) return false;
  s.cells[cell] = c === 0 ? 2 : 0;
  return true;
}

/** The line's digits that are not struck, summed, minus its target. 0 means the line is done. */
export function remaining(s: GameState, line: number): number {
  let sum = 0;
  for (const i of lineCells(s.puzzle.size)[line])
    if (s.cells[i] !== 1) sum += s.puzzle.digits[i];
  return sum - s.puzzle.targets[line];
}

/**
 * Whether a digit is settled: a mistake, or a digit left in a finished line. Only wrong digits can be
 * struck, so a finished line holds exactly its solution. Derived from the cells, so saves don't store it.
 */
export function isLocked(s: GameState, cell: number): boolean {
  const c = s.cells[cell];
  if (c === 3) return true;
  if (c === 1) return false;
  const n = s.puzzle.size;
  return remaining(s, Math.floor(cell / n)) === 0 || remaining(s, n + (cell % n)) === 0;
}

/** The line's target minus its kept digits (marked or locked). Below 0 means too many are kept. */
export function need(s: GameState, line: number): number {
  let n = s.puzzle.targets[line];
  for (const i of lineCells(s.puzzle.size)[line])
    if (s.cells[i] === 2 || isLocked(s, i)) n -= s.puzzle.digits[i];
  return n;
}

/** One char per cell, `0`–`3`. */
export function encode(s: GameState): string {
  return s.cells.join('');
}

export function restore(
  p: Puzzle,
  str: string,
  lives: number,
): GameState | null {
  if (str.length !== p.size * p.size || !/^[0-3]*$/.test(str)) return null;
  if (!Number.isInteger(lives) || lives < 0 || lives > MAX_LIVES) return null;
  const cells: Cell[] = [];
  let locks = 0;
  let left = 0;
  for (let i = 0; i < str.length; i++) {
    const c = Number(str[i]) as Cell;
    if (c === 1 && p.solution[i]) return null;
    if (c === 3) {
      if (!p.solution[i]) return null;
      locks++;
    }
    if (!p.solution[i] && c !== 1) left++;
    cells.push(c);
  }
  if (locks !== MAX_LIVES - lives) return null;
  const status: Status = left === 0 ? 'won' : lives === 0 ? 'lost' : 'playing';
  return { puzzle: p, cells, lives, status, left };
}
