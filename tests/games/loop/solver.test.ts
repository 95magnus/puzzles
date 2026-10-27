import { describe, expect, it } from 'vitest';
import { geometry, hEdge, vEdge } from '../../../src/games/loop/geometry';
import { analyse, countSolutions, deduce } from '../../../src/games/loop/solver';

const blank = (size: number) => Array.from({ length: size * size }, (): number | null => null);
const withClues = (size: number, clues: Record<number, number>) => {
  const out = blank(size);
  for (const [cell, n] of Object.entries(clues)) out[Number(cell)] = n;
  return out;
};

const ZERO = withClues(3, { 4: 0 });
const CORNER = withClues(3, { 0: 3 });
const THREES = withClues(3, { 3: 3, 4: 3, 2: 1 });

/** True when the lines form one closed loop (at least one line) and every clue is met. */
function isLoop(size: number, clues: (number | null)[], edges: number[]): boolean {
  const g = geometry(size);
  if (g.cellEdges.some((sides, cell) => clues[cell] !== null && sides.filter((e) => edges[e] === 1).length !== clues[cell])) return false;
  if (g.dotEdges.some((es) => ![0, 2].includes(es.filter((e) => edges[e] === 1).length))) return false;
  const lines = edges.flatMap((v, e) => (v === 1 ? [e] : []));
  if (lines.length === 0) return false;
  const seen = new Set<number>([g.edgeDots[lines[0]][0]]);
  const stack = [...seen];
  while (stack.length) {
    const d = stack.pop()!;
    for (const e of g.dotEdges[d]) {
      if (edges[e] !== 1) continue;
      for (const n of g.edgeDots[e]) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
  }
  return lines.every((e) => seen.has(g.edgeDots[e][0]));
}

/** Every solution, by backtracking over the edges with dot-degree pruning. */
function allSolutions(size: number, clues: (number | null)[]): number[][] {
  const g = geometry(size);
  const edges: number[] = new Array(g.edgeCount).fill(0);
  const out: number[][] = [];
  const go = (e: number): void => {
    if (e === g.edgeCount) {
      if (isLoop(size, clues, edges)) out.push(edges.slice());
      return;
    }
    for (const v of [0, 1]) {
      edges[e] = v;
      const degreeOk = (d: number) => {
        const l = g.dotEdges[d].filter((x) => edges[x] === 1).length;
        return l <= 2 && (l !== 1 || g.dotEdges[d].some((x) => x > e));
      };
      if (g.edgeDots[e].every(degreeOk)) go(e + 1);
    }
    edges[e] = 0;
  };
  go(0);
  return out;
}

describe('loop solver', () => {
  it('0 crosses its sides', () => {
    const s = analyse(3, ZERO)!;
    for (const e of geometry(3).cellEdges[4]) expect(s[e]).toBe(2);
  });

  it('corner 3', () => {
    const s = analyse(3, CORNER)!;
    expect(s[hEdge(3, 0, 0)]).toBe(1);
    expect(s[vEdge(3, 0, 0)]).toBe(1);
  });

  it('3-3 with an unmet clue elsewhere', () => {
    expect(analyse(3, THREES)![vEdge(3, 1, 1)]).toBe(1);
  });

  it('1×1 without clues', () => {
    expect(deduce(1, [null])).toEqual([1, 1, 1, 1]);
  });

  it('contradictions', () => {
    expect(deduce(1, [0])).toBeNull();
    expect(deduce(1, [2])).toBeNull();
    expect(analyse(1, [2])).toBeNull();
  });

  it('two solutions stall', () => {
    expect(deduce(2, blank(2))).toBeNull();
  });

  it('countSolutions', () => {
    expect(countSolutions(1, [null], 5)).toBe(1);
    expect(countSolutions(1, [0], 5)).toBe(0);
    expect(countSolutions(2, blank(2), 2)).toBe(2);
    expect(countSolutions(2, blank(2), 100)).toBe(13);
  });

  it('soundness: every fixed edge agrees with every solution', () => {
    for (const clues of [ZERO, CORNER, THREES]) {
      const s = analyse(3, clues)!;
      const sols = allSolutions(3, clues);
      expect(sols.length).toBeGreaterThan(0);
      expect(countSolutions(3, clues, 1000)).toBe(sols.length);
      for (const sol of sols) {
        s.forEach((v, e) => {
          if (v !== 0) expect(sol[e]).toBe(v === 1 ? 1 : 0);
        });
      }
    }
  });
});
