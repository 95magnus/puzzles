import type { GameState, Mark, Move, Puzzle } from './types';

// Pure game state. Every action mutates `s` and returns the changed cells;
// all are ignored (return []) once the game is won.

export function newGame(p: Puzzle): GameState {
  return { puzzle: p, cells: new Uint8Array(p.size * p.size), history: [], status: 'playing' };
}

export function queenCount(s: GameState): number {
  let n = 0;
  for (const c of s.cells) if (c === 2) n++;
  return n;
}

export function conflicts(s: GameState): Set<number> {
  const { size, regions } = s.puzzle;
  const queens: number[] = [];
  s.cells.forEach((c, i) => {
    if (c === 2) queens.push(i);
  });
  const bad = new Set<number>();
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const a = queens[i];
      const b = queens[j];
      const ar = Math.floor(a / size);
      const br = Math.floor(b / size);
      const ac = a % size;
      const bc = b % size;
      if (
        ar === br ||
        ac === bc ||
        regions[a] === regions[b] ||
        (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)
      ) {
        bad.add(a);
        bad.add(b);
      }
    }
  }
  return bad;
}

export function isWin(s: GameState): boolean {
  return queenCount(s) === s.puzzle.size && conflicts(s).size === 0;
}

export function cycle(s: GameState, cell: number): number[] {
  if (s.status === 'won') return [];
  const old = s.cells[cell] as Mark;
  s.cells[cell] = (old + 1) % 3;
  s.history.push({ cells: [cell], before: [old] });
  if (isWin(s)) s.status = 'won';
  return [cell];
}

export function paint(s: GameState, cells: number[], to: 0 | 1, gesture: number): number[] {
  if (s.status === 'won') return [];
  const changed: number[] = [];
  const before: Mark[] = [];
  for (const c of cells) {
    const old = s.cells[c] as Mark;
    if (old === 2 || old === to || changed.includes(c)) continue;
    changed.push(c);
    before.push(old);
  }
  if (changed.length === 0) return [];
  const last = s.history.at(-1);
  let move: Move;
  if (last && last.gesture === gesture) {
    move = last;
  } else {
    move = { cells: [], before: [], gesture };
    s.history.push(move);
  }
  changed.forEach((c, i) => {
    // Keep the earliest `before` per cell if the gesture already touched it.
    if (!move.cells.includes(c)) {
      move.cells.push(c);
      move.before.push(before[i]);
    }
    s.cells[c] = to;
  });
  return changed;
}

export function undo(s: GameState): number[] {
  if (s.status === 'won') return [];
  const move = s.history.pop();
  if (!move) return [];
  move.cells.forEach((c, i) => {
    s.cells[c] = move.before[i];
  });
  return move.cells.slice();
}

export function clear(s: GameState): number[] {
  if (s.status === 'won') return [];
  const move: Move = { cells: [], before: [] };
  s.cells.forEach((c, i) => {
    if (c !== 0) {
      move.cells.push(i);
      move.before.push(c as Mark);
      s.cells[i] = 0;
    }
  });
  if (move.cells.length === 0) return [];
  s.history.push(move);
  return move.cells.slice();
}

export function encode(s: GameState): string {
  return Array.from(s.cells, (c) => String(c)).join('');
}

export function restore(p: Puzzle, cells: string): GameState | null {
  if (cells.length !== p.size * p.size || !/^[012]*$/.test(cells)) return null;
  const s = newGame(p);
  for (let i = 0; i < cells.length; i++) s.cells[i] = Number(cells[i]);
  if (isWin(s)) s.status = 'won';
  return s;
}
