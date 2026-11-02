import { describe, expect, it } from 'vitest';
import {
  MAX_LIVES,
  encode,
  newGame,
  remaining,
  restore,
  strike,
  toggleMark,
} from '../../../src/games/sums/game';
import { lineCells } from '../../../src/games/sums/solver';
import { puzzle } from './helpers';

// 5x5; keep mask is a diagonal plus a few extras, so every line keeps at least one digit.
const digits = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7,
];
const keep: (0 | 1)[] = [
  1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
];
const p = puzzle(5, digits, keep);
const kept = keep.indexOf(1);
const dropped = keep.indexOf(0);
const droppedCells = keep.flatMap((k, i) => (k ? [] : [i]));

describe('newGame', () => {
  it('starts open with full lives', () => {
    const s = newGame(p);
    expect(s.cells.every((c) => c === 0)).toBe(true);
    expect(s.cells).toHaveLength(25);
    expect(s.lives).toBe(MAX_LIVES);
    expect(MAX_LIVES).toBe(3);
    expect(s.status).toBe('playing');
    expect(s.left).toBe(droppedCells.length);
  });
});

describe('strike', () => {
  it('strikes a non-solution cell', () => {
    const s = newGame(p);
    const left = s.left;
    expect(strike(s, dropped)).toBe('struck');
    expect(s.cells[dropped]).toBe(1);
    expect(s.left).toBe(left - 1);
  });

  it('locks a solution cell and costs a life', () => {
    const s = newGame(p);
    expect(strike(s, kept)).toBe('mistake');
    expect(s.cells[kept]).toBe(3);
    expect(s.lives).toBe(2);
    expect(s.status).toBe('playing');
  });

  it('loses on the third mistake and then ignores input', () => {
    const s = newGame(p);
    const keptCells = keep.flatMap((k, i) => (k ? [i] : []));
    for (let i = 0; i < 3; i++) strike(s, keptCells[i]);
    expect(s.status).toBe('lost');
    expect(s.lives).toBe(0);
    expect(strike(s, dropped)).toBe('ignored');
    expect(toggleMark(s, dropped)).toBe(false);
    expect(s.cells[dropped]).toBe(0);
  });

  it('wins on the last strike and then ignores input', () => {
    const s = newGame(p);
    for (const c of droppedCells) strike(s, c);
    expect(s.status).toBe('won');
    expect(s.left).toBe(0);
    expect(strike(s, kept)).toBe('ignored');
    expect(toggleMark(s, kept)).toBe(false);
    expect(s.cells[kept]).toBe(0);
    expect(s.lives).toBe(3);
  });

  it('ignores marked, struck and locked cells', () => {
    const s = newGame(p);
    toggleMark(s, dropped);
    expect(strike(s, dropped)).toBe('ignored');
    expect(s.cells[dropped]).toBe(2);
    const other = droppedCells[1];
    strike(s, other);
    expect(strike(s, other)).toBe('ignored');
    expect(s.cells[other]).toBe(1);
    strike(s, kept);
    const lives = s.lives;
    expect(strike(s, kept)).toBe('ignored');
    expect(s.lives).toBe(lives);
    expect(s.cells[kept]).toBe(3);
  });
});

describe('toggleMark', () => {
  it('toggles open and marked', () => {
    const s = newGame(p);
    expect(toggleMark(s, dropped)).toBe(true);
    expect(s.cells[dropped]).toBe(2);
    expect(toggleMark(s, dropped)).toBe(true);
    expect(s.cells[dropped]).toBe(0);
  });

  it('refuses struck and locked cells', () => {
    const s = newGame(p);
    strike(s, dropped);
    strike(s, kept);
    expect(toggleMark(s, dropped)).toBe(false);
    expect(toggleMark(s, kept)).toBe(false);
    expect(s.cells[dropped]).toBe(1);
    expect(s.cells[kept]).toBe(3);
  });
});

describe('remaining', () => {
  const lines = lineCells(5);
  const total = (l: number) => lines[l].reduce((a, c) => a + digits[c], 0);

  it('starts at line total minus target', () => {
    const s = newGame(p);
    for (let l = 0; l < 10; l++)
      expect(remaining(s, l)).toBe(total(l) - p.targets[l]);
  });

  it('drops by the struck digit', () => {
    const s = newGame(p);
    const before = remaining(s, 0);
    const c = lines[0].find((i) => !keep[i])!;
    strike(s, c);
    expect(remaining(s, 0)).toBe(before - digits[c]);
  });

  it('is 0 once the line is fully struck, and ignores mistakes', () => {
    const s = newGame(p);
    strike(s, kept);
    expect(remaining(s, 0)).toBe(total(0) - p.targets[0]);
    for (const c of lines[0]) if (!keep[c]) strike(s, c);
    expect(remaining(s, 0)).toBe(0);
  });
});

describe('encode / restore', () => {
  it('round-trips marks, strikes and a lock', () => {
    const s = newGame(p);
    toggleMark(s, droppedCells[0]);
    strike(s, droppedCells[1]);
    strike(s, kept);
    const str = encode(s);
    expect(str).toHaveLength(25);
    const r = restore(p, str, s.lives)!;
    expect(r).not.toBeNull();
    expect(r.cells).toEqual(s.cells);
    expect(r.lives).toBe(2);
    expect(r.left).toBe(s.left);
    expect(r.status).toBe('playing');
  });

  it('restores won and lost games', () => {
    const w = newGame(p);
    for (const c of droppedCells) strike(w, c);
    expect(restore(p, encode(w), 3)!.status).toBe('won');

    const l = newGame(p);
    keep.forEach((k, i) => k && l.status === 'playing' && strike(l, i));
    expect(restore(p, encode(l), 0)!.status).toBe('lost');
  });

  it('rejects bad saves', () => {
    const ok = encode(newGame(p)).split('');
    const with_ = (i: number, ch: string) => {
      const a = ok.slice();
      a[i] = ch;
      return a.join('');
    };
    expect(restore(p, '0'.repeat(24), 3)).toBeNull();
    expect(restore(p, '0'.repeat(26), 3)).toBeNull();
    expect(restore(p, with_(0, '4'), 3)).toBeNull();
    expect(restore(p, with_(kept, '1'), 3)).toBeNull();
    expect(restore(p, with_(dropped, '3'), 2)).toBeNull();
    expect(restore(p, ok.join(''), 4)).toBeNull();
    expect(restore(p, ok.join(''), -1)).toBeNull();
    expect(restore(p, ok.join(''), 1.5)).toBeNull();
    expect(restore(p, with_(kept, '3'), 3)).toBeNull();
  });
});
