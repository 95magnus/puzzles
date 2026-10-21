import { describe, expect, it } from 'vitest';
import { MAX_LIVES, encode, newGame, restore, tap } from '../../src/tangle/game';
import { lvl } from './helpers';

// 5x1: arrow 0 occupies c0-c1 heading right; arrow 1 is a single cell at c3 heading up (free).
const blocked = () =>
  lvl(5, 1, [
    [[[0, 0], [0, 1]], 1],
    [[[0, 3]], 0],
  ]);

describe('tangle game', () => {
  it('free arrow exits', () => {
    const s = newGame(lvl(5, 1, [[[[0, 0], [0, 1]], 1]]));
    expect(tap(s, 1)).toEqual({ kind: 'exit', arrow: 0, distance: 3 });
    expect(s.alive[0]).toBe(0);
    expect(s.occ[0]).toBe(-1);
    expect(s.occ[1]).toBe(-1);
    expect(s.left).toBe(0);
  });

  it('tapping any body cell launches the arrow', () => {
    const s = newGame(lvl(5, 1, [[[[0, 0], [0, 1]], 1]]));
    expect(tap(s, 0)).toEqual({ kind: 'exit', arrow: 0, distance: 3 });
  });

  it('bump costs a life and changes nothing else', () => {
    const s = newGame(blocked());
    expect(tap(s, 0)).toEqual({ kind: 'bump', arrow: 0, blocker: 1, distance: 1 });
    expect(s.lives).toBe(MAX_LIVES - 1);
    expect(Array.from(s.alive)).toEqual([1, 1]);
    expect(s.left).toBe(2);
    expect(s.status).toBe('playing');
  });

  it('removing the blocker frees the blocked arrow', () => {
    const s = newGame(blocked());
    expect(tap(s, 3).kind).toBe('exit');
    expect(tap(s, 1)).toEqual({ kind: 'exit', arrow: 0, distance: 3 });
  });

  it('win on last arrow', () => {
    const s = newGame(blocked());
    tap(s, 3);
    tap(s, 0);
    expect(s.status).toBe('won');
  });

  it('loss on third bump', () => {
    const s = newGame(blocked());
    tap(s, 0);
    tap(s, 0);
    tap(s, 0);
    expect(s.lives).toBe(0);
    expect(s.status).toBe('lost');
  });

  it('tap on an empty cell is ignored', () => {
    const s = newGame(blocked());
    expect(tap(s, 4)).toEqual({ kind: 'ignored' });
    expect(s.lives).toBe(MAX_LIVES);
  });

  it('taps after the end are ignored', () => {
    const won = newGame(blocked());
    tap(won, 3);
    tap(won, 0);
    expect(tap(won, 0)).toEqual({ kind: 'ignored' });
    const lost = newGame(blocked());
    for (let i = 0; i < 3; i++) tap(lost, 0);
    expect(tap(lost, 3)).toEqual({ kind: 'ignored' });
    expect(lost.alive[1]).toBe(1);
    expect(lost.lives).toBe(0);
  });

  it('encode/restore round trip', () => {
    const s = newGame(blocked());
    tap(s, 0);
    tap(s, 3);
    expect(encode(s)).toBe('10');
    const r = restore(blocked(), encode(s), s.lives)!;
    expect(r.lives).toBe(2);
    expect(Array.from(r.alive)).toEqual([1, 0]);
    expect(r.left).toBe(1);
    expect(r.status).toBe('playing');
    expect(Array.from(r.occ)).toEqual(Array.from(s.occ));
  });

  it('restore rejects bad input', () => {
    const l = blocked();
    expect(restore(l, '1', 3)).toBeNull();
    expect(restore(l, '12', 3)).toBeNull();
    expect(restore(l, '11', 4)).toBeNull();
    expect(restore(l, '11', -1)).toBeNull();
    expect(restore(l, '11', 1.5)).toBeNull();
    expect(restore(l, '00', 2)!.status).toBe('won');
    expect(restore(l, '11', 0)!.status).toBe('lost');
  });
});
