import { neighbours } from './generate';
import type { Board, GameState, Status } from './types';

// Actions mutate the state in place and return the indices whose cell state changed
// (empty = no-op), so the renderer can diff-update large boards.

const HIDDEN = 0;
const REVEALED = 1;
const FLAGGED = 2;
const CODES = 'hrf';

function safeCount(board: Board): number {
  let mines = 0;
  for (const m of board.mines) mines += m;
  return board.mines.length - mines;
}

function nbs(board: Board, i: number): number[] {
  return neighbours(board.cols, board.rows, i);
}

export function newGame(board: Board): GameState {
  const s: GameState = {
    board,
    cells: new Uint8Array(board.mines.length),
    status: 'playing',
    revealed: 0,
    flags: 0,
    explodedAt: -1,
  };
  reveal(s, board.start);
  return s;
}

/** On a win, auto-flag the remaining mines. */
function checkWin(s: GameState, changed: number[]): void {
  if (s.revealed !== safeCount(s.board)) return;
  s.status = 'won';
  s.board.mines.forEach((m, i) => {
    if (m && s.cells[i] !== FLAGGED) {
      s.cells[i] = FLAGGED;
      s.flags++;
      changed.push(i);
    }
  });
}

export function reveal(s: GameState, i: number): number[] {
  if (s.status !== 'playing' || s.cells[i] !== HIDDEN) return [];
  const { board } = s;
  if (board.mines[i]) {
    s.cells[i] = REVEALED;
    s.status = 'lost';
    s.explodedAt = i;
    return [i];
  }
  // Iterative flood: zeros open their hidden, unflagged neighbours.
  const changed: number[] = [];
  const stack = [i];
  while (stack.length > 0) {
    const k = stack.pop()!;
    if (s.cells[k] !== HIDDEN) continue;
    s.cells[k] = REVEALED;
    s.revealed++;
    changed.push(k);
    if (board.adj[k] !== 0) continue;
    for (const j of nbs(board, k)) {
      if (s.cells[j] === HIDDEN && !board.mines[j]) stack.push(j);
    }
  }
  checkWin(s, changed);
  return changed;
}

export function toggleFlag(s: GameState, i: number): number[] {
  if (s.status !== 'playing' || s.cells[i] === REVEALED) return [];
  if (s.cells[i] === FLAGGED) {
    s.cells[i] = HIDDEN;
    s.flags--;
  } else {
    s.cells[i] = FLAGGED;
    s.flags++;
  }
  return [i];
}

/** Reveal around a revealed number whose adjacent flag count matches it. */
export function chord(s: GameState, i: number): number[] {
  const { board } = s;
  if (s.status !== 'playing' || s.cells[i] !== REVEALED || board.adj[i] === 0) return [];
  const around = nbs(board, i);
  if (around.filter((j) => s.cells[j] === FLAGGED).length !== board.adj[i]) return [];
  const changed: number[] = [];
  for (const j of around) changed.push(...reveal(s, j));
  return changed;
}

export function encodeCells(s: GameState): string {
  let out = '';
  for (const v of s.cells) out += CODES[v];
  return out;
}

/** Rebuild a game from a save; null if the save does not fit this board. */
export function restoreGame(board: Board, cells: string, status: Status): GameState | null {
  const n = board.mines.length;
  if (cells.length !== n) return null;
  const state = new Uint8Array(n);
  let revealed = 0;
  let flags = 0;
  let explodedAt = -1;
  let revealedMines = 0;
  for (let i = 0; i < n; i++) {
    const v = CODES.indexOf(cells[i]);
    if (v < 0) return null;
    state[i] = v;
    if (v === FLAGGED) flags++;
    if (v === REVEALED) {
      if (board.mines[i]) {
        revealedMines++;
        explodedAt = i;
      } else {
        revealed++;
      }
    }
  }
  if (state[board.start] !== REVEALED) return null;
  if (revealedMines !== (status === 'lost' ? 1 : 0)) return null;
  const allSafe = revealed === safeCount(board);
  if (status === 'won' && !allSafe) return null;
  if (status === 'playing' && allSafe) return null;
  return { board, cells: state, status, revealed, flags, explodedAt };
}
