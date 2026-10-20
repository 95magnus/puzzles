import { describe, expect, test } from 'vitest';
import {
  clearPath,
  isPairComplete,
  isSolved,
  needsFillHint,
  newGame,
  pointerDown,
  pointerMove,
  pointerUp,
  reset,
  restore,
  stats,
  undo,
  type GameState,
} from '../../src/core/game';
import type { Cell, Puzzle } from '../../src/core/types';
import { P5x5_solution, P5x5_unique } from '../fixtures';

const P = P5x5_unique;
const c = (r: number, col: number): Cell => ({ r, c: col });

/** One full gesture: press the first cell, move through the rest, release. */
function drag(s: GameState, cells: Cell[]): GameState {
  let g = pointerDown(s, cells[0]);
  for (const cell of cells.slice(1)) g = pointerMove(g, cell);
  return pointerUp(g);
}

function solvedGame(): GameState {
  let s = newGame(P);
  for (const path of P5x5_solution) s = drag(s, path);
  return s;
}

const adjacent = (x: Cell, y: Cell) => Math.abs(x.r - y.r) + Math.abs(x.c - y.c) === 1;

describe('game state', () => {
  test('press dot starts path; drag extends orthogonally', () => {
    let s = pointerDown(newGame(P), P.pairs[0].a);
    expect(s.active).toBe(0);
    expect(s.paths[0]).toEqual([c(0, 1)]);
    s = pointerMove(s, c(0, 0));
    s = pointerMove(s, c(1, 0));
    expect(s.paths[0]).toEqual([c(0, 1), c(0, 0), c(1, 0)]);
    s = pointerUp(s);
    expect(s.active).toBeNull();
    expect(s.moves).toBe(1);
  });

  test('fast jump fills intermediate cells: down on dot (4,4), move to (1,4) gives 4 cells', () => {
    let s = pointerDown(newGame(P), c(4, 4));
    s = pointerMove(s, c(1, 4));
    expect(s.paths[1]).toEqual([c(4, 4), c(3, 4), c(2, 4), c(1, 4)]);
  });

  test('diagonal jump steps along larger-delta axis first, never diagonally', () => {
    // rows delta larger: (1,3) -> (3,4) goes down twice, then right
    let s = pointerMove(pointerDown(newGame(P), c(1, 3)), c(3, 4));
    expect(s.paths[2]).toEqual([c(1, 3), c(2, 3), c(3, 3), c(3, 4)]);
    // cols delta larger: (2,2) -> (1,0) goes left first; then the delta ties, rows first, and
    // (1,1) is a foreign dot, so the jump stops at the first blocked step
    s = pointerMove(pointerDown(newGame(P), c(2, 2)), c(1, 0));
    expect(s.paths[3]).toEqual([c(2, 2), c(2, 1)]);
    // tie: rows first
    s = pointerMove(pointerDown(newGame(P), c(1, 3)), c(2, 4));
    expect(s.paths[2]).toEqual([c(1, 3), c(2, 3), c(2, 4)]);
    for (const p of s.paths) for (let i = 1; i < p.length; i++) expect(adjacent(p[i - 1], p[i])).toBe(true);
  });

  test('drag back over own path backtracks', () => {
    let s = pointerDown(newGame(P), P.pairs[0].a);
    s = pointerMove(s, c(0, 0));
    s = pointerMove(s, c(1, 0));
    s = pointerMove(s, c(2, 0));
    s = pointerMove(s, c(1, 0));
    expect(s.paths[0]).toEqual([c(0, 1), c(0, 0), c(1, 0)]);
    s = pointerMove(s, c(0, 1)); // fast jump back to the start dot
    expect(s.paths[0]).toEqual([c(0, 1)]);
  });

  test('drag into another color path cuts it at the crossing cell (prefix kept)', () => {
    let s = drag(newGame(P), [c(1, 1), c(1, 2), c(0, 2)]);
    expect(s.paths[1]).toEqual([c(1, 1), c(1, 2), c(0, 2)]);
    s = drag(s, [c(1, 3), c(1, 2)]);
    expect(s.paths[1]).toEqual([c(1, 1)]);
    expect(s.paths[2]).toEqual([c(1, 3), c(1, 2)]);
  });

  test("drag into another color's dot is blocked; path unchanged", () => {
    let s = pointerDown(newGame(P), P.pairs[0].a);
    s = pointerMove(s, c(0, 0));
    s = pointerMove(s, c(1, 0));
    const before = s.paths;
    s = pointerMove(s, c(1, 1)); // dot of color 1
    expect(s.paths).toEqual(before);
    expect(s.paths[1]).toEqual([]);
  });

  test('reaching matching dot completes pair; further moves ignored', () => {
    let s = pointerDown(newGame(P), P.pairs[0].a);
    for (const cell of P5x5_solution[0].slice(1)) s = pointerMove(s, cell);
    expect(isPairComplete(s, 0)).toBe(true);
    const done = s.paths[0];
    s = pointerMove(s, c(3, 2));
    s = pointerMove(s, c(2, 1));
    expect(s.paths[0]).toEqual(done);
    expect(isPairComplete(s, 1)).toBe(false);
  });

  test('press mid-path truncates to that cell and continues from it', () => {
    let s = drag(newGame(P), [c(1, 1), c(1, 2), c(0, 2), c(0, 3)]);
    s = pointerDown(s, c(0, 2));
    expect(s.active).toBe(1);
    expect(s.paths[1]).toEqual([c(1, 1), c(1, 2), c(0, 2)]);
    s = pointerMove(s, c(0, 3));
    s = pointerMove(s, c(0, 4));
    expect(s.paths[1]).toEqual([c(1, 1), c(1, 2), c(0, 2), c(0, 3), c(0, 4)]);
  });

  test('press dot of a color with an existing path clears and restarts it', () => {
    let s = drag(newGame(P), [c(0, 1), c(0, 0), c(1, 0)]);
    s = pointerDown(s, c(0, 1));
    expect(s.paths[0]).toEqual([c(0, 1)]);
    s = pointerUp(s);
    // restart from the other endpoint
    s = pointerDown(s, P.pairs[0].b);
    expect(s.paths[0]).toEqual([c(3, 1)]);
    expect(s.active).toBe(0);
  });

  test('pressing an empty cell does nothing (active stays null)', () => {
    const s0 = newGame(P);
    const s = pointerDown(s0, c(0, 0));
    expect(s.active).toBeNull();
    expect(s).toBe(s0);
    expect(pointerUp(s)).toBe(s0);
  });

  test('undo reverts one whole gesture; gesture with no change adds no undo entry', () => {
    let s = drag(newGame(P), [c(0, 1), c(0, 0)]);
    s = drag(s, [c(1, 1), c(1, 2), c(0, 2)]);
    expect(s.undo).toHaveLength(2);
    expect(s.moves).toBe(2);

    // pressing the tip of an existing path and releasing changes nothing
    const noop = drag(s, [c(0, 2)]);
    expect(noop.undo).toHaveLength(2);
    expect(noop.moves).toBe(2);
    expect(noop.paths).toEqual(s.paths);

    s = undo(s);
    expect(s.paths[1]).toEqual([]);
    expect(s.paths[0]).toEqual([c(0, 1), c(0, 0)]);
    s = undo(s);
    expect(s.paths.every(p => p.length === 0)).toBe(true);
    expect(undo(s)).toBe(s);
  });

  test('clearPath removes a path and is undoable', () => {
    let s = drag(newGame(P), [c(0, 1), c(0, 0), c(1, 0)]);
    const movesBefore = s.moves;
    s = clearPath(s, 0);
    expect(s.paths[0]).toEqual([]);
    expect(s.moves).toBe(movesBefore + 1);
    s = undo(s);
    expect(s.paths[0]).toEqual([c(0, 1), c(0, 0), c(1, 0)]);
    const empty = newGame(P);
    expect(clearPath(empty, 2)).toBe(empty);
  });

  test('isSolved only when all pairs complete AND all cells filled', () => {
    expect(isSolved(newGame(P))).toBe(false);
    let s = newGame(P);
    for (const path of P5x5_solution.slice(0, 3)) s = drag(s, path);
    expect(isSolved(s)).toBe(false);
    s = drag(s, P5x5_solution[3]);
    expect(isSolved(s)).toBe(true);
    // complete pairs but unfilled grid is not solved
    const small = twoRowPuzzle();
    let g = drag(newGame(small), [c(0, 0), c(0, 1), c(0, 2)]);
    g = drag(g, [c(2, 0), c(2, 1), c(2, 2)]);
    expect(isSolved(g)).toBe(false);
  });

  test('needsFillHint true when all complete but cells empty', () => {
    const small = twoRowPuzzle();
    let g = drag(newGame(small), [c(0, 0), c(0, 1), c(0, 2)]);
    expect(needsFillHint(g)).toBe(false);
    g = drag(g, [c(2, 0), c(2, 1), c(2, 2)]);
    expect(needsFillHint(g)).toBe(true);
    expect(needsFillHint(solvedGame())).toBe(false);
    expect(needsFillHint(newGame(P))).toBe(false);
  });

  test('stats reports flowsDone/flowsTotal and integer fillPct', () => {
    expect(stats(newGame(P))).toEqual({ flowsDone: 0, flowsTotal: 4, fillPct: 0 });
    const s = drag(newGame(P), P5x5_solution[0]); // 6 of 25 cells = 24%
    expect(stats(s)).toEqual({ flowsDone: 1, flowsTotal: 4, fillPct: 24 });
    const partial = drag(newGame(P), [c(1, 3), c(2, 3)]); // 2 of 25 = 8%
    expect(stats(partial)).toEqual({ flowsDone: 0, flowsTotal: 4, fillPct: 8 });
    const third = drag(newGame(P), [c(2, 2), c(2, 1), c(2, 0)]); // 3 of 25 = 12%
    expect(Number.isInteger(stats(third).fillPct)).toBe(true);
    expect(stats(solvedGame())).toEqual({ flowsDone: 4, flowsTotal: 4, fillPct: 100 });
  });

  // Review Focus 5
  test('undo and reset are ignored while active !== null', () => {
    let s = pointerDown(newGame(P), P.pairs[0].a);
    s = pointerMove(s, { r: 0, c: 0 });
    expect(s.paths[0]).toHaveLength(2);
    expect(s.active).toBe(0);
    expect(undo(s)).toBe(s);
    expect(reset(s)).toBe(s);
  });

  test('reset clears all paths when idle', () => {
    const s = reset(drag(newGame(P), [c(0, 1), c(0, 0)]));
    expect(s.paths.every(p => p.length === 0)).toBe(true);
    expect(s.active).toBeNull();
  });

  test('reset is undoable and counts as a move; no-op on an empty board', () => {
    const before = drag(drag(newGame(P), [c(0, 1), c(0, 0)]), [c(1, 3), c(2, 3)]);
    const r = reset(before);
    expect(r.paths.every(p => p.length === 0)).toBe(true);
    expect(r.moves).toBe(before.moves + 1);
    expect(r.undo).toHaveLength(before.undo.length + 1);
    const u = undo(r);
    expect(u.paths).toEqual(before.paths);
    const empty = newGame(P);
    expect(reset(empty)).toBe(empty);
  });

  test('restore seeds moves from the number of non-empty paths', () => {
    const s = restore(P, [[c(0, 1), c(0, 0), c(1, 0)], [], [c(1, 3), c(2, 3)], []])!;
    expect(s.moves).toBe(2);
    expect(s.undo).toEqual([]);
    expect(restore(P, [[], [], [], []])!.moves).toBe(0);
  });

  // Review Focus 3
  test('restore rejects paths that do not match the puzzle', () => {
    const validPartialPaths: Cell[][] = [[c(0, 1), c(0, 0), c(1, 0)], [], [c(1, 3), c(2, 3)], []];
    expect(restore(P, [[{ r: 4, c: 4 }, { r: 4, c: 3 }]])).toBeNull(); // wrong length / not starting at an endpoint
    expect(restore(P, [[c(4, 4), c(4, 3)], [], [], []])).toBeNull(); // starts at color 1's endpoint, not color 0's
    expect(restore(P, [[P.pairs[0].a, { r: 2, c: 2 }], [], [], []])).toBeNull(); // non-adjacent step
    expect(restore(P, [[P.pairs[0].a], [P.pairs[0].a], [], []])).toBeNull(); // overlapping cells
    expect(restore(P, 'garbage' as any)).toBeNull();
    expect(restore(P, [[c(0, 1), c(1, 1)], [], [], []])).toBeNull(); // through another pair's endpoint
    expect(restore(P, [[c(0, 1), c(0, 0), c(9, 0)], [], [], []])).toBeNull(); // out of bounds
    expect(restore(P, [[c(0, 1), c(0, 0), c(1, 0), c(2, 0), c(2, 1), c(3, 1), c(3, 2)], [], [], []])).toBeNull(); // continues past own end
    expect(restore(P, validPartialPaths)?.paths).toEqual(validPartialPaths);
    expect(restore(P, P5x5_solution) && isSolved(restore(P, P5x5_solution)!)).toBe(true);
  });
});

/** 3x3 with two straight flows on rows 0 and 2; the middle row stays empty. */
function twoRowPuzzle(): Puzzle {
  return {
    size: 3,
    pairs: [
      { color: 0, a: c(0, 0), b: c(0, 2) },
      { color: 1, a: c(2, 0), b: c(2, 2) },
    ],
  };
}
