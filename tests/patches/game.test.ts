import { describe, expect, it } from 'vitest';
import { candidates } from '../../src/patches/solver';
import { checkRect, clear, coverage, encode, invalid, isWin, newGame, place, removeAt, restore, tap, undo } from '../../src/patches/game';
import type { Rect } from '../../src/patches/types';
import { pz, UNIQUE4 } from './helpers';

const p = pz(4, UNIQUE4);
const fresh = () => newGame(p);
const R = (r: number, c: number, w: number, h: number): Rect => ({ r, c, w, h });
const byPos = (a: Rect, b: Rect) => a.r - b.r || a.c - b.c;

describe('patches game', () => {
  it('place adds a rect and checkRect classifies it', () => {
    const s = fresh();
    expect(place(s, R(0, 0, 2, 2))).toBe(true);
    expect(s.rects).toEqual([R(0, 0, 2, 2)]);
    expect(s.history).toHaveLength(1);
    expect(checkRect(p, R(0, 0, 2, 2))).toEqual({ clue: 0, ok: true });
    expect(checkRect(p, R(0, 0, 1, 1))).toEqual({ clue: 0, ok: false });
    expect(checkRect(p, R(0, 0, 4, 1)).clue).toBeNull();
    expect(checkRect(p, R(0, 0, 4, 1)).ok).toBe(false);
    expect(checkRect(p, R(1, 0, 1, 1))).toEqual({ clue: null, ok: false });
  });

  it('place replaces every overlapped rect in one move', () => {
    const s = fresh();
    place(s, R(0, 0, 1, 1));
    place(s, R(0, 1, 1, 1));
    expect(place(s, R(0, 0, 2, 2))).toBe(true);
    expect(s.rects).toEqual([R(0, 0, 2, 2)]);
    expect(s.history).toHaveLength(3);
  });

  it('undo after a replacing draw restores every replaced rectangle', () => {
    const s = fresh();
    place(s, R(0, 0, 1, 1));
    place(s, R(0, 1, 1, 1));
    place(s, R(0, 0, 2, 2));
    expect(undo(s)).toBe(true);
    expect([...s.rects].sort(byPos)).toEqual([R(0, 0, 1, 1), R(0, 1, 1, 1)]);
    expect(undo(s)).toBe(true);
    expect(undo(s)).toBe(true);
    expect(s.rects).toEqual([]);
    expect(undo(s)).toBe(false);
  });

  it('placing an identical rect is a no-op', () => {
    const s = fresh();
    place(s, R(0, 0, 2, 2));
    expect(place(s, R(0, 0, 2, 2))).toBe(false);
    expect(s.history).toHaveLength(1);
    expect(s.rects).toHaveLength(1);
  });

  it('tap removes a covering rectangle, else places 1×1', () => {
    const s = fresh();
    expect(tap(s, 5)).toBe(true);
    expect(s.rects).toEqual([R(1, 1, 1, 1)]);
    place(s, R(0, 0, 2, 2));
    expect(s.rects).toEqual([R(0, 0, 2, 2)]);
    expect(tap(s, 5)).toBe(true);
    expect(s.rects).toEqual([]);
    expect(removeAt(s, 5)).toBe(false);
    undo(s);
    expect(s.rects).toEqual([R(0, 0, 2, 2)]);
  });

  it('validity agrees with solver candidates', () => {
    const q = pz(4, [[0, 'square', 4], [3, 'tall'], [6, 'tall', 2], [8, 'wide', 3], [13, 'wide', 3]]);
    for (const x of candidates(q, 1)) expect(checkRect(q, x).ok).toBe(true);
    expect(checkRect(q, R(0, 3, 1, 1)).ok).toBe(false);
    const r = pz(4, [[0, 'square', 4], [3, 'any', 4], [6, 'tall', 2], [8, 'wide', 3], [13, 'wide', 3]]);
    expect(checkRect(r, R(0, 3, 1, 4)).ok).toBe(true);
    expect(checkRect(r, R(0, 3, 1, 3)).ok).toBe(false);
  });

  it('clear is one undoable move', () => {
    const s = fresh();
    place(s, R(0, 0, 2, 2));
    place(s, R(0, 3, 1, 4));
    expect(clear(s)).toBe(true);
    expect(s.rects).toEqual([]);
    expect(s.history).toHaveLength(3);
    expect(undo(s)).toBe(true);
    expect([...s.rects].sort(byPos)).toEqual([R(0, 0, 2, 2), R(0, 3, 1, 4)]);
  });

  it('clear on an empty board pushes nothing', () => {
    const s = fresh();
    expect(clear(s)).toBe(false);
    expect(s.history).toHaveLength(0);
  });

  it('wins when the solution is placed in any order, then freezes', () => {
    const orders = [p.solution, [...p.solution].reverse(), [p.solution[2], p.solution[0], p.solution[4], p.solution[1], p.solution[3]]];
    for (const order of orders) {
      const s = fresh();
      for (const x of order) place(s, x);
      expect(s.status).toBe('won');
      expect(isWin(s)).toBe(true);
      expect(coverage(s)).toBe(16);
      expect(invalid(s).size).toBe(0);
      const n = s.history.length;
      expect(place(s, R(0, 0, 1, 1))).toBe(false);
      expect(tap(s, 0)).toBe(false);
      expect(removeAt(s, 0)).toBe(false);
      expect(undo(s)).toBe(false);
      expect(clear(s)).toBe(false);
      expect(s.history).toHaveLength(n);
      expect(s.rects).toHaveLength(5);
    }
  });

  it('full coverage with one wrong rect is not a win and flags that rect', () => {
    const s = fresh();
    // Swap the two bottom wide rects' split for a different tiling: two 3×1 rows become 3×2 (two clues).
    const [a, b, c] = p.solution;
    place(s, a);
    place(s, b);
    place(s, c);
    place(s, R(2, 0, 3, 2));
    expect(coverage(s)).toBe(16);
    expect(s.status).toBe('playing');
    expect(isWin(s)).toBe(false);
    const bad = invalid(s);
    expect(bad.size).toBe(1);
    expect(s.rects[[...bad][0]]).toEqual(R(2, 0, 3, 2));
  });

  it('coverage counts covered cells', () => {
    const s = fresh();
    expect(coverage(s)).toBe(0);
    place(s, R(0, 0, 2, 2));
    place(s, R(3, 3, 1, 1));
    expect(coverage(s)).toBe(5);
  });

  it('encode/restore round trip', () => {
    const s = fresh();
    place(s, R(3, 0, 3, 1));
    place(s, R(0, 3, 1, 4));
    place(s, R(0, 0, 2, 2));
    expect(encode(s)).toBe('0,0,2,2;0,3,1,4;3,0,3,1');
    const t = restore(p, encode(s));
    expect(t).not.toBeNull();
    expect(t!.rects).toEqual([R(0, 0, 2, 2), R(0, 3, 1, 4), R(3, 0, 3, 1)]);
    expect(t!.history).toEqual([]);
    expect(t!.status).toBe('playing');
    expect(encode(newGame(p))).toBe('');
  });

  it('restore of the solution string is won', () => {
    const s = fresh();
    for (const x of p.solution) place(s, x);
    const t = restore(p, encode(s));
    expect(t!.status).toBe('won');
  });

  it('restore rejects bad input', () => {
    expect(restore(p, '0,0,2')).toBeNull();
    expect(restore(p, '0,0,5,1')).toBeNull();
    expect(restore(p, '0,0,2,2;1,1,1,1')).toBeNull();
    expect(restore(p, 'a,b,c,d')).toBeNull();
    expect(restore(p, '0,0,0,1')).toBeNull();
    expect(restore(p, '0,0,2,2;')).toBeNull();
    const empty = restore(p, '');
    expect(empty).not.toBeNull();
    expect(empty!.rects).toEqual([]);
    expect(empty!.status).toBe('playing');
  });
});
