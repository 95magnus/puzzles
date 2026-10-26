import { describe, expect, it } from 'vitest';
import { cycle, clear, conflicts, encode, newGame, paint, queenCount, restore, undo } from '../../../src/games/queens/game';
import { pz, UNIQUE4 } from './helpers';

const fresh = () => newGame(pz(UNIQUE4));

describe('queens game', () => {
  it('cycle goes empty → ✕ → queen → empty', () => {
    const s = fresh();
    expect(cycle(s, 3)).toEqual([3]);
    expect(s.cells[3]).toBe(1);
    cycle(s, 3);
    expect(s.cells[3]).toBe(2);
    cycle(s, 3);
    expect(s.cells[3]).toBe(0);
    expect(s.history).toHaveLength(3);
    expect(s.history[0].gesture).toBeUndefined();
  });

  it('paint skips queens and unchanged cells', () => {
    const s = fresh();
    cycle(s, 0);
    cycle(s, 0);
    cycle(s, 2);
    expect(s.cells[0]).toBe(2);
    expect(s.cells[2]).toBe(1);
    expect(paint(s, [0, 1, 2], 1, 1)).toEqual([1]);
    expect(s.cells[0]).toBe(2);
  });

  it('one undo reverts a whole drag', () => {
    const s = fresh();
    paint(s, [1], 1, 5);
    paint(s, [2, 3], 1, 5);
    expect(s.history).toHaveLength(1);
    expect(undo(s).sort()).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((i) => s.cells[i])).toEqual([0, 0, 0]);
  });

  it('paint merges by gesture id, not by position in history', () => {
    const s = fresh();
    cycle(s, 4);
    paint(s, [0], 1, 9);
    paint(s, [1], 1, 9);
    expect(s.history).toHaveLength(2);
    undo(s);
    expect(s.cells[4]).toBe(1);
    expect(s.cells[0]).toBe(0);
  });

  it('paint that changes nothing pushes nothing', () => {
    const s = fresh();
    paint(s, [1, 2], 1, 1);
    expect(paint(s, [1, 2], 1, 2)).toEqual([]);
    expect(s.history).toHaveLength(1);
  });

  it('paint can erase marks', () => {
    const s = fresh();
    paint(s, [1, 2], 1, 1);
    expect(paint(s, [1, 2], 0, 2).sort()).toEqual([1, 2]);
    expect(s.cells[1]).toBe(0);
  });

  it('clear is one undoable move; empty board pushes nothing', () => {
    const s = fresh();
    expect(clear(s)).toEqual([]);
    expect(s.history).toHaveLength(0);
    cycle(s, 0);
    cycle(s, 5);
    cycle(s, 5);
    expect(clear(s).sort((a, b) => a - b)).toEqual([0, 5]);
    expect(Array.from(s.cells).every((c) => c === 0)).toBe(true);
    expect(s.history).toHaveLength(4);
    undo(s);
    expect(s.cells[0]).toBe(1);
    expect(s.cells[5]).toBe(2);
  });

  const queen = (s: ReturnType<typeof fresh>, c: number) => {
    cycle(s, c);
    cycle(s, c);
  };

  it('conflicts', () => {
    let s = fresh();
    queen(s, 0);
    expect(conflicts(s).size).toBe(0);
    queen(s, 2);
    expect([...conflicts(s)].sort()).toEqual([0, 2]); // row
    s = fresh();
    queen(s, 0);
    queen(s, 8);
    expect([...conflicts(s)].sort()).toEqual([0, 8]); // column (also region 1)
    s = fresh();
    queen(s, 3);
    queen(s, 5);
    expect([...conflicts(s)].sort()).toEqual([3, 5]); // region 2, not touching
    s = fresh();
    queen(s, 0);
    queen(s, 5);
    expect([...conflicts(s)].sort()).toEqual([0, 5]); // diagonal
  });

  it('conflicts clear when the clashing queen goes', () => {
    const s = fresh();
    queen(s, 0);
    queen(s, 1);
    expect(conflicts(s).size).toBe(2);
    cycle(s, 1);
    expect(conflicts(s).size).toBe(0);
  });

  it('win', () => {
    const s = fresh();
    cycle(s, 0);
    for (const c of [1, 7, 8]) queen(s, c);
    expect(s.status).toBe('playing');
    queen(s, 14);
    expect(s.status).toBe('won');
    expect(queenCount(s)).toBe(4);
    expect(cycle(s, 3)).toEqual([]);
    expect(paint(s, [3], 1, 99)).toEqual([]);
    expect(undo(s)).toEqual([]);
    expect(clear(s)).toEqual([]);
    expect(s.cells[14]).toBe(2);
  });

  it('encode/restore round trip', () => {
    const s = fresh();
    queen(s, 1);
    cycle(s, 4);
    const str = encode(s);
    expect(str).toHaveLength(16);
    const r = restore(s.puzzle, str)!;
    expect(encode(r)).toBe(str);
    expect(r.history).toEqual([]);
    expect(r.status).toBe('playing');
    const win = Array(16).fill('0');
    for (const c of [1, 7, 8, 14]) win[c] = '2';
    expect(restore(s.puzzle, win.join(''))!.status).toBe('won');
  });

  it('restore rejects bad input', () => {
    const p = pz(UNIQUE4);
    expect(restore(p, '000')).toBeNull();
    expect(restore(p, '0'.repeat(15) + '3')).toBeNull();
    expect(restore(p, '0'.repeat(15) + 'x')).toBeNull();
  });
});
