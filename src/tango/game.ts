import { lineCells } from './lines';
import type { GameState, Move, Puzzle, Sym, Violations } from './types';

// Pure game state. Mutating actions return true iff something changed;
// all are ignored (return false) once the game is won.

export function newGame(p: Puzzle): GameState {
  return { puzzle: p, cells: p.givens.slice(), history: [], status: 'playing' };
}

export function isGiven(s: GameState, cell: number): boolean {
  return s.puzzle.givens[cell] !== 0;
}

/** Runs of three or more equal symbols, lines holding more than half of one symbol, and edge clues broken by two filled cells. */
export function violations(s: GameState): Violations {
  const { size, edges } = s.puzzle;
  const out: Violations = { triples: new Set(), lines: new Set(), edges: new Set() };
  for (let i = 0; i < 2 * size; i++) {
    const cells = lineCells(size, i);
    const count = [0, 0, 0];
    for (const c of cells) count[s.cells[c]]++;
    if (count[1] > size / 2 || count[2] > size / 2) out.lines.add(i);
    for (let k = 0; k + 2 < size; k++) {
      const v = s.cells[cells[k]];
      if (v !== 0 && v === s.cells[cells[k + 1]] && v === s.cells[cells[k + 2]]) {
        for (let j = k; j < k + 3; j++) out.triples.add(cells[j]);
      }
    }
  }
  edges.forEach((e, i) => {
    const a = s.cells[e.a];
    const b = s.cells[e.b];
    if (a !== 0 && b !== 0 && (a === b) !== (e.kind === 'eq')) out.edges.add(i);
  });
  return out;
}

/** Filled cells, givens included. */
export function filled(s: GameState): number {
  return s.cells.filter((v) => v !== 0).length;
}

export function isWin(s: GameState): boolean {
  if (s.cells.some((v) => v === 0)) return false;
  const v = violations(s);
  return v.triples.size === 0 && v.lines.size === 0 && v.edges.size === 0;
}

function commit(s: GameState, move: Move): boolean {
  s.history.push(move);
  if (isWin(s)) s.status = 'won';
  return true;
}

/** Empty → sun → moon → empty on a non-given cell. */
export function cycle(s: GameState, cell: number): boolean {
  if (s.status === 'won' || isGiven(s, cell)) return false;
  const before = s.cells[cell];
  s.cells[cell] = ((before + 1) % 3) as Sym;
  return commit(s, { cells: [cell], before: [before] });
}

/** Put `sym` on a non-given cell, or empty it when it already shows `sym` (right-click → moon). */
export function toggle(s: GameState, cell: number, sym: 1 | 2): boolean {
  if (s.status === 'won' || isGiven(s, cell)) return false;
  const before = s.cells[cell];
  s.cells[cell] = before === sym ? 0 : sym;
  return commit(s, { cells: [cell], before: [before] });
}

export function undo(s: GameState): boolean {
  if (s.status === 'won') return false;
  const move = s.history.pop();
  if (!move) return false;
  move.cells.forEach((c, i) => (s.cells[c] = move.before[i]));
  if (isWin(s)) s.status = 'won';
  return true;
}

/** Empty every non-given cell as one move. */
export function clear(s: GameState): boolean {
  if (s.status === 'won') return false;
  const cells = s.cells.flatMap((v, c) => (v !== 0 && !isGiven(s, c) ? [c] : []));
  if (cells.length === 0) return false;
  const before = cells.map((c) => s.cells[c]);
  for (const c of cells) s.cells[c] = 0;
  return commit(s, { cells, before });
}

/** One char per cell: 0 empty, 1 sun, 2 moon. */
export function encode(s: GameState): string {
  return s.cells.join('');
}

/** `null` unless `text` has one 0/1/2 per cell and keeps every given. */
export function restore(p: Puzzle, text: string): GameState | null {
  if (text.length !== p.size * p.size || !/^[012]*$/.test(text)) return null;
  const cells = [...text].map(Number) as Sym[];
  if (p.givens.some((v, c) => v !== 0 && cells[c] !== v)) return null;
  const s: GameState = { puzzle: p, cells, history: [], status: 'playing' };
  if (isWin(s)) s.status = 'won';
  return s;
}
