import { describe, expect, it } from 'vitest';
import { clear, cycle, encode, filled, isGiven, isWin, newGame, restore, toggle, undo, violations } from '../../src/tango/game';
import type { GameState, Sym } from '../../src/tango/types';
import { CHAIN6, DEDUCE4, DEDUCE4_SOLUTION, sym, tz } from './helpers';

const EMPTY6 = tz(['......', '......', '......', '......', '......', '......']);

/** Tap `cell` until it shows `v`. */
function set(s: GameState, cell: number, v: Sym): void {
  while (s.cells[cell] !== v) cycle(s, cell);
}

describe('tango game', () => {
  it('cycle order', () => {
    const s = newGame(DEDUCE4);
    const seen: Sym[] = [];
    for (let i = 0; i < 3; i++) {
      expect(cycle(s, 0)).toBe(true);
      seen.push(s.cells[0]);
    }
    expect(seen).toEqual([1, 2, 0]);
    expect(s.history).toHaveLength(3);
  });

  it('toggle places a symbol, or empties a cell already showing it', () => {
    const s = newGame(DEDUCE4);
    expect(toggle(s, 0, 2)).toBe(true);
    expect(s.cells[0]).toBe(2);
    expect(toggle(s, 0, 2)).toBe(true);
    expect(s.cells[0]).toBe(0);
    cycle(s, 0); // sun
    expect(toggle(s, 0, 2)).toBe(true);
    expect(s.cells[0]).toBe(2);
    expect(s.history).toHaveLength(4);
    undo(s);
    expect(s.cells[0]).toBe(1);
    expect(toggle(s, 2, 2)).toBe(false); // given
    expect(s.history).toHaveLength(3);
  });

  it('givens are locked and push nothing', () => {
    const s = newGame(DEDUCE4);
    expect(isGiven(s, 2)).toBe(true);
    expect(isGiven(s, 0)).toBe(false);
    expect(cycle(s, 2)).toBe(false);
    expect(s.cells[2]).toBe(2);
    expect(s.history).toHaveLength(0);
  });

  it('undo reverts a tap; clear is one undoable move', () => {
    const s = newGame(DEDUCE4);
    expect(clear(s)).toBe(false);
    cycle(s, 0);
    expect(undo(s)).toBe(true);
    expect(s.cells[0]).toBe(0);
    expect(undo(s)).toBe(false);
    for (const c of [0, 1, 3]) cycle(s, c);
    expect(filled(s)).toBe(4 + 3);
    expect(clear(s)).toBe(true);
    expect(s.cells).toEqual(DEDUCE4.givens);
    expect(s.history).toHaveLength(4);
    undo(s);
    expect([s.cells[0], s.cells[1], s.cells[3]]).toEqual([1, 1, 1]);
  });

  it('violations', () => {
    const s = newGame(EMPTY6);
    for (const c of [0, 1, 2]) set(s, c, 1);
    expect(violations(s).triples).toEqual(new Set([0, 1, 2]));
    expect(violations(s).lines.size).toBe(0);
    set(s, 4, 1);
    set(s, 5, 1);
    expect(violations(s).lines).toEqual(new Set([0]));

    const t = newGame(CHAIN6);
    set(t, 1, 1);
    expect(violations(t).edges).toEqual(new Set([0]));
    set(t, 2, 2);
    expect(violations(t).edges).toEqual(new Set([0, 1]));
  });

  it('no false alarms on partial lines and half-empty edges', () => {
    const s = newGame(EMPTY6);
    for (const c of [0, 2, 4]) set(s, c, 1);
    const v = violations(s);
    expect([v.triples.size, v.lines.size, v.edges.size]).toEqual([0, 0, 0]);
    expect(violations(newGame(CHAIN6)).edges.size).toBe(0);
  });

  it('undo recomputes violations', () => {
    const s = newGame(EMPTY6);
    for (const c of [0, 1, 2]) set(s, c, 1);
    undo(s);
    expect(violations(s).triples.size).toBe(0);
  });

  it('win', () => {
    const s = newGame(DEDUCE4);
    const want = sym(DEDUCE4_SOLUTION);
    want.forEach((v, c) => {
      if (!isGiven(s, c)) set(s, c, v);
    });
    expect(s.status).toBe('won');
    expect(cycle(s, 0)).toBe(false);
    expect(undo(s)).toBe(false);
    expect(clear(s)).toBe(false);

    // Full and balanced lines are not enough when a run of three exists.
    const t = newGame(EMPTY6);
    sym('SSSMMM' + 'MMMSSS' + 'SSSMMM' + 'MMMSSS' + 'SSSMMM' + 'MMMSSS').forEach((v, c) => set(t, c, v));
    expect(isWin(t)).toBe(false);
    expect(t.status).toBe('playing');
  });

  it('encode/restore round trip', () => {
    const s = newGame(DEDUCE4);
    cycle(s, 0);
    const r = restore(DEDUCE4, encode(s))!;
    expect(r.cells).toEqual(s.cells);
    expect(r.history).toEqual([]);
    expect(r.status).toBe('playing');
    expect(restore(DEDUCE4, sym(DEDUCE4_SOLUTION).join(''))!.status).toBe('won');
  });

  it('restore rejects changed givens', () => {
    const base = encode(newGame(DEDUCE4));
    expect(restore(DEDUCE4, base.slice(1))).toBeNull();
    expect(restore(DEDUCE4, '3' + base.slice(1))).toBeNull();
    expect(restore(DEDUCE4, base.slice(0, 2) + '1' + base.slice(3))).toBeNull();
    expect(restore(DEDUCE4, base.slice(0, 2) + '0' + base.slice(3))).toBeNull();
  });
});
