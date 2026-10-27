import { describe, expect, it } from 'vitest';
import { clear, clueCount, cycle, encode, isWon, matched, newGame, paint, restore, toggleCross, undo, violations } from '../../../src/games/loop/game';
import { hEdge, vEdge } from '../../../src/games/loop/geometry';
import type { Puzzle } from '../../../src/games/loop/types';
import { fixture } from './helpers';

const lines = (p: Puzzle): number[] => p.solution.flatMap((v, e) => (v ? [e] : []));

describe('loop game', () => {
  it('cycle order', () => {
    const s = newGame(fixture());
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      expect(cycle(s, 0)).toBe(true);
      seen.push(s.edges[0]);
    }
    expect(seen).toEqual([1, 2, 0]);
    expect(s.history).toHaveLength(3);
  });

  it('toggleCross', () => {
    const s = newGame(fixture());
    toggleCross(s, 0);
    expect(s.edges[0]).toBe(2);
    toggleCross(s, 0);
    expect(s.edges[0]).toBe(0);
    cycle(s, 1);
    toggleCross(s, 1);
    expect(s.edges[1]).toBe(2);
    expect(s.history).toHaveLength(4);
  });

  it('paint draw overwrites ✕ as one move', () => {
    const s = newGame(fixture());
    toggleCross(s, 1);
    expect(paint(s, [0, 1, 2], 'draw')).toBe(true);
    expect(s.edges.slice(0, 3)).toEqual([1, 1, 1]);
    expect(s.history).toHaveLength(2);
    expect(paint(s, [0, 1, 2], 'draw')).toBe(false);
    expect(s.history).toHaveLength(2);
  });

  it('paint erase clears lines, leaves ✕, pushes nothing when unchanged', () => {
    const s = newGame(fixture());
    cycle(s, 0);
    toggleCross(s, 1);
    const n = s.history.length;
    expect(paint(s, [0, 1, 2], 'erase')).toBe(true);
    expect(s.edges.slice(0, 3)).toEqual([0, 2, 0]);
    expect(s.history).toHaveLength(n + 1);
    expect(paint(s, [0, 1, 2], 'erase')).toBe(false);
    expect(s.history).toHaveLength(n + 1);
  });

  it('undo restores a paint in one step', () => {
    const s = newGame(fixture());
    toggleCross(s, 1);
    paint(s, [0, 1, 2], 'draw');
    expect(undo(s)).toBe(true);
    expect(s.edges.slice(0, 3)).toEqual([0, 2, 0]);
    undo(s);
    expect(undo(s)).toBe(false);
  });

  it('clear is one move, no-op when empty', () => {
    const s = newGame(fixture());
    expect(clear(s)).toBe(false);
    expect(s.history).toHaveLength(0);
    cycle(s, 0);
    toggleCross(s, 3);
    expect(clear(s)).toBe(true);
    expect(s.edges.every((e) => e === 0)).toBe(true);
    undo(s);
    expect(s.edges[0]).toBe(1);
    expect(s.edges[3]).toBe(2);
  });

  it('violations: dots', () => {
    const s = newGame(fixture());
    const dot = 5; // dot (1,1) in a 3×3: w = 4
    const around = [hEdge(3, 1, 0), hEdge(3, 1, 1), vEdge(3, 0, 1)];
    paint(s, around, 'draw');
    expect([...violations(s).dots]).toEqual([dot]);
  });

  it('violations: clues', () => {
    const s = newGame(fixture());
    // cell 0 clue 2: top, bottom, left lines
    paint(s, [hEdge(3, 0, 0), hEdge(3, 1, 0), vEdge(3, 0, 0)], 'draw');
    expect(violations(s).clues.has(0)).toBe(true);
    const t = newGame(fixture());
    for (const e of [hEdge(3, 0, 0), hEdge(3, 1, 0), vEdge(3, 0, 0)]) toggleCross(t, e);
    expect(violations(t).clues.has(0)).toBe(true);
    const u = newGame(fixture());
    for (const e of [hEdge(3, 0, 0), hEdge(3, 1, 0)]) toggleCross(u, e);
    expect(violations(u).clues.has(0)).toBe(false);
  });

  it('matched and clueCount', () => {
    const p = fixture();
    const s = newGame(p);
    expect(clueCount(p)).toBe(4);
    expect(matched(s)).toBe(0);
    paint(s, [hEdge(3, 0, 0), vEdge(3, 0, 0)], 'draw');
    expect(matched(s)).toBe(1);
  });

  it('no win: unmet clue', () => {
    const p = fixture();
    p.clues[4] = 1;
    const s = newGame(p);
    paint(s, lines(p), 'draw');
    expect(isWon(s)).toBe(false);
    expect(s.status).toBe('playing');
  });

  it('no win: extra separate loop', () => {
    const size = 4;
    const block = [hEdge(size, 0, 0), hEdge(size, 0, 1), hEdge(size, 2, 0), hEdge(size, 2, 1), vEdge(size, 0, 0), vEdge(size, 1, 0), vEdge(size, 0, 2), vEdge(size, 1, 2)];
    const stray = [hEdge(size, 3, 3), hEdge(size, 4, 3), vEdge(size, 3, 3), vEdge(size, 3, 4)];
    const p: Puzzle = { size, clues: new Array(16).fill(null), solution: new Array(40).fill(0) };
    const s = newGame(p);
    paint(s, block, 'draw');
    expect(s.status).toBe('won');
    const t = newGame(p);
    paint(t, [...block, ...stray], 'draw');
    expect(violations(t).dots.size).toBe(0);
    expect(isWon(t)).toBe(false);
  });

  it('no win on empty board of no-clue puzzle', () => {
    const p: Puzzle = { size: 3, clues: new Array(9).fill(null), solution: fixture().solution };
    expect(isWon(newGame(p))).toBe(false);
  });

  it('win: painting the solution; then everything is ignored', () => {
    const p = fixture();
    const s = newGame(p);
    paint(s, lines(p), 'draw');
    expect(s.status).toBe('won');
    expect(isWon(s)).toBe(true);
    expect(cycle(s, 0)).toBe(false);
    expect(toggleCross(s, 0)).toBe(false);
    expect(paint(s, [0], 'erase')).toBe(false);
    expect(undo(s)).toBe(false);
    expect(clear(s)).toBe(false);
  });

  it('win counts ✕ as not-a-line', () => {
    const p = fixture();
    const s = newGame(p);
    toggleCross(s, hEdge(3, 3, 0));
    paint(s, lines(p), 'draw');
    expect(s.status).toBe('won');
  });

  it('encode/restore round-trip', () => {
    const p = fixture();
    const s = newGame(p);
    cycle(s, 0);
    toggleCross(s, 5);
    const r = restore(p, encode(s))!;
    expect(r.edges).toEqual(s.edges);
    expect(r.history).toEqual([]);
    expect(r.status).toBe('playing');
  });

  it('restore rejects bad input, restores a win', () => {
    const p = fixture();
    expect(restore(p, '0101')).toBeNull();
    expect(restore(p, '3'.repeat(p.solution.length))).toBeNull();
    const won = restore(p, p.solution.join(''))!;
    expect(won.status).toBe('won');
  });
});
