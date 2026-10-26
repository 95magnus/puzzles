import { describe, expect, it } from 'vitest';
import { clear, cycle, encode, isWin, islandTotals, newGame, remove, restore, satisfied, undo, violations } from '../../../src/games/bridges/game';
import type { Count, GameState } from '../../../src/games/bridges/types';
import { CORNER, CROSS, ISO_ONES } from './helpers';

/** Tap `link` until it shows `v`. */
function set(s: GameState, link: number, v: Count): void {
  while (s.bridges[link] !== v) cycle(s, link);
}

describe('bridges game', () => {
  it('cycle order', () => {
    const s = newGame(CORNER);
    const seen: Count[] = [];
    for (let i = 0; i < 3; i++) {
      expect(cycle(s, 0).changed).toBe(true);
      seen.push(s.bridges[0]);
    }
    expect(seen).toEqual([1, 2, 0]);
    expect(s.history).toHaveLength(3);
  });

  it('refused crossing pushes nothing', () => {
    const s = newGame(CROSS);
    expect(cycle(s, 3)).toEqual({ changed: true, blockedBy: [] });
    expect(cycle(s, 5)).toEqual({ changed: false, blockedBy: [3] });
    expect(s.bridges[5]).toBe(0);
    expect(s.history).toHaveLength(1);
    expect(undo(s)).toBe(true);
    expect(s.bridges[3]).toBe(0);
  });

  it('remove', () => {
    const s = newGame(CORNER);
    set(s, 0, 2);
    expect(remove(s, 0)).toBe(true);
    expect(s.bridges[0]).toBe(1);
    expect(remove(s, 0)).toBe(true);
    expect(s.bridges[0]).toBe(0);
    expect(remove(s, 0)).toBe(false);
  });

  it('undo and clear', () => {
    const s = newGame(CORNER);
    expect(clear(s)).toBe(false);
    expect(s.history).toHaveLength(0);
    set(s, 0, 1);
    set(s, 1, 1);
    const n = s.history.length;
    expect(clear(s)).toBe(true);
    expect(s.bridges).toEqual([0, 0]);
    expect(s.history).toHaveLength(n + 1);
    expect(undo(s)).toBe(true);
    expect(s.bridges).toEqual([1, 1]);
  });

  it('totals and satisfied count islands at their number', () => {
    const s = newGame(CORNER);
    set(s, 0, 2);
    set(s, 1, 2);
    expect(islandTotals(s)).toEqual([4, 2, 2]);
    expect(satisfied(s)).toBe(3);
  });

  it('over', () => {
    const s = newGame(CROSS);
    set(s, 0, 2);
    set(s, 1, 1);
    expect([...violations(s).over]).toEqual([0]);
    expect(violations(s).split.size).toBe(0);
  });

  it('split only when every island is satisfied', () => {
    const s = newGame(ISO_ONES);
    set(s, 3, 2);
    expect(violations(s).split.size).toBe(0);
    set(s, 0, 1);
    expect(satisfied(s)).toBe(4);
    expect([...violations(s).split].sort((a, b) => a - b)).toEqual([2, 3]);
    expect(s.status).toBe('playing');
  });

  it('win, then everything is ignored', () => {
    const s = newGame(CROSS);
    CROSS.solution.forEach((v, i) => set(s, i, v));
    expect(s.status).toBe('won');
    expect(isWin(s)).toBe(true);
    expect(satisfied(s)).toBe(6);
    const len = s.history.length;
    expect(cycle(s, 5)).toEqual({ changed: false, blockedBy: [] });
    expect(remove(s, 0)).toBe(false);
    expect(undo(s)).toBe(false);
    expect(clear(s)).toBe(false);
    expect(s.history).toHaveLength(len);
  });

  it('encode/restore round trip', () => {
    const s = newGame(CROSS);
    set(s, 0, 2);
    set(s, 2, 1);
    const r = restore(CROSS, encode(s));
    expect(r?.bridges).toEqual(s.bridges);
    expect(r?.history).toEqual([]);
    expect(r?.status).toBe('playing');
    expect(restore(CROSS, '111110')?.status).toBe('won');
  });

  it('restore rejects bad text', () => {
    expect(restore(CROSS, '11111')).toBeNull();
    expect(restore(CROSS, '11111x')).toBeNull();
    expect(restore(CROSS, '111111')).toBeNull();
  });
});
