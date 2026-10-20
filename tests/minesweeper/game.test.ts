import { expect, test } from 'vitest';
import { chord, encodeCells, newGame, restoreGame, reveal, toggleFlag } from '../../src/minesweeper/game';
import { neighbours } from '../../src/minesweeper/generate';
import { boardFrom } from './helpers';

const idx = (r: number, c: number) => r * 5 + c;
const revealedIdx = (cells: Uint8Array) => [...cells].flatMap((v, i) => (v === 1 ? [i] : []));

/** Mines in two corners; every safe cell connects through zeros. */
const OPEN = () => boardFrom(['....*', '.....', '.....', '.....', '*....'], [0, 0]);
/** A wall of mines splits the board; the start opening is the top-left 2×2. */
const WALL = () => boardFrom(['..*..', '..*..', '***..', '.....', '.....'], [0, 0]);
/** Two mines; used via restoreGame to set up chords. (1,1) has adj 2. */
const TWO = () => boardFrom(['.*...', '.....', '*....'], [0, 4]);
const TWO_PLAYING = 'hhrrr' + 'hrrrr' + 'hhrrr';

test('newGame reveals the start flood', () => {
  const s = newGame(WALL());
  expect(revealedIdx(s.cells)).toEqual([0, 1, 5, 6]);
  expect(s.revealed).toBe(4);
  expect(s.flags).toBe(0);
  expect(s.explodedAt).toBe(-1);
  expect(s.status).toBe('playing');
});

test('an opening that clears every safe cell wins immediately', () => {
  const s = newGame(OPEN());
  expect(s.revealed).toBe(23);
  expect(s.status).toBe('won');
});

test('flood skips flagged cells', () => {
  const s = newGame(WALL());
  toggleFlag(s, idx(3, 4));
  reveal(s, idx(4, 4));
  expect(s.cells[idx(3, 4)]).toBe(2);
  expect(s.cells[idx(4, 0)]).toBe(1);
  expect(s.cells[idx(3, 3)]).toBe(1);
  // (2,4) is a zero only reachable through the flagged cell
  expect(s.cells[idx(2, 4)]).toBe(0);
});

test('flood on a near-empty Huge board does not overflow the stack', () => {
  const cols = 50, rows = 30;
  const mines = new Uint8Array(cols * rows);
  mines[0] = 1;
  const adj = new Uint8Array(cols * rows);
  for (const j of neighbours(cols, rows, 0)) adj[j] = 1;
  const s = newGame({ cols, rows, mines, adj, start: cols * rows - 1 });
  expect(s.revealed).toBe(1499);
  expect(s.status).toBe('won');
});

test('toggleFlag cycles hidden <-> flagged, updates flags, ignores revealed cells', () => {
  const s = newGame(WALL());
  expect(toggleFlag(s, idx(0, 2))).toEqual([idx(0, 2)]);
  expect(s.cells[idx(0, 2)]).toBe(2);
  expect(s.flags).toBe(1);
  expect(toggleFlag(s, idx(0, 2))).toEqual([idx(0, 2)]);
  expect(s.cells[idx(0, 2)]).toBe(0);
  expect(s.flags).toBe(0);
  expect(toggleFlag(s, idx(0, 0))).toEqual([]);
  expect(s.flags).toBe(0);
});

test('reveal ignores revealed and flagged cells', () => {
  const s = newGame(WALL());
  expect(reveal(s, idx(0, 0))).toEqual([]);
  toggleFlag(s, idx(0, 2));
  expect(reveal(s, idx(0, 2))).toEqual([]);
  expect(s.status).toBe('playing');
});

test('reveal on a mine loses, sets explodedAt, later actions are no-ops', () => {
  const s = newGame(WALL());
  expect(reveal(s, idx(0, 2))).toEqual([idx(0, 2)]);
  expect(s.status).toBe('lost');
  expect(s.explodedAt).toBe(idx(0, 2));
  expect(reveal(s, idx(4, 4))).toEqual([]);
  expect(toggleFlag(s, idx(4, 4))).toEqual([]);
  expect(chord(s, idx(1, 0))).toEqual([]);
});

test('chord with matching flags reveals hidden unflagged neighbours', () => {
  const b = TWO();
  expect(b.adj[idx(1, 1)]).toBe(2);
  const g = restoreGame(b, TWO_PLAYING, 'playing')!;
  toggleFlag(g, idx(0, 1));
  toggleFlag(g, idx(2, 0));
  expect(chord(g, idx(1, 1)).sort((x, y) => x - y)).toEqual([idx(0, 0), idx(1, 0), idx(2, 1)]);
  expect(g.status).toBe('won');
});

test('chord is a no-op on mismatched flag count, hidden cells, and zeros', () => {
  const g = restoreGame(TWO(), TWO_PLAYING, 'playing')!;
  toggleFlag(g, idx(0, 1));
  expect(chord(g, idx(1, 1))).toEqual([]); // 1 flag, needs 2
  expect(chord(g, idx(0, 0))).toEqual([]); // hidden
  expect(chord(g, idx(1, 4))).toEqual([]); // zero
  expect(g.status).toBe('playing');
});

test('chord with a wrong flag hits a mine and loses', () => {
  const g = restoreGame(TWO(), TWO_PLAYING, 'playing')!;
  toggleFlag(g, idx(0, 1));
  toggleFlag(g, idx(1, 0)); // wrong: (2,0) is the real mine
  expect(chord(g, idx(1, 1))).toContain(idx(2, 0));
  expect(g.status).toBe('lost');
  expect(g.explodedAt).toBe(idx(2, 0));
});

test('revealing the last safe cell wins and auto-flags remaining mines', () => {
  const g = restoreGame(TWO(), TWO_PLAYING, 'playing')!;
  reveal(g, idx(0, 0));
  reveal(g, idx(1, 0));
  const changed = reveal(g, idx(2, 1));
  expect(g.status).toBe('won');
  expect(g.flags).toBe(2);
  expect(g.cells[idx(0, 1)]).toBe(2);
  expect(g.cells[idx(2, 0)]).toBe(2);
  expect(changed).toEqual(expect.arrayContaining([idx(2, 1), idx(0, 1), idx(2, 0)]));
});

test('encodeCells/restoreGame round-trip for playing, won and lost games', () => {
  const playing = newGame(WALL());
  toggleFlag(playing, idx(0, 2));
  expect(restoreGame(WALL(), encodeCells(playing), 'playing')).toEqual(playing);

  const won = restoreGame(TWO(), TWO_PLAYING, 'playing')!;
  reveal(won, idx(0, 0));
  reveal(won, idx(1, 0));
  reveal(won, idx(2, 1));
  expect(restoreGame(TWO(), encodeCells(won), 'won')).toEqual(won);

  const lost = newGame(WALL());
  reveal(lost, idx(0, 2));
  expect(encodeCells(lost)[idx(0, 2)]).toBe('r');
  expect(restoreGame(WALL(), encodeCells(lost), 'lost')).toEqual(lost);
});

// Review Focus 3
test('restoreGame rejects inconsistent saves', () => {
  const b = TWO();
  expect(restoreGame(b, TWO_PLAYING, 'playing')).not.toBeNull();
  expect(restoreGame(b, TWO_PLAYING.slice(1), 'playing')).toBeNull(); // wrong length
  expect(restoreGame(b, 'x' + TWO_PLAYING.slice(1), 'playing')).toBeNull(); // bad char
  expect(restoreGame(b, 'hhrrh' + 'hrrrr' + 'hhrrr', 'playing')).toBeNull(); // start (0,4) hidden
  expect(restoreGame(b, 'hrrrr' + 'hrrrr' + 'hhrrr', 'playing')).toBeNull(); // 'r' on a mine while playing
  expect(restoreGame(b, TWO_PLAYING, 'lost')).toBeNull(); // lost with no revealed mine
  expect(restoreGame(b, 'hrrrr' + 'hrrrr' + 'rhrrr', 'lost')).toBeNull(); // lost with two revealed mines
  expect(restoreGame(b, TWO_PLAYING, 'won')).toBeNull(); // won with safe cells hidden
  expect(restoreGame(b, 'rfrrr' + 'rrrrr' + 'frrrr', 'playing')).toBeNull(); // all safe revealed but playing
});
