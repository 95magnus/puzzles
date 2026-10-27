import { describe, expect, it } from 'vitest';
import { geometry, hEdge, vEdge } from '../../../src/games/loop/geometry';

describe('loop geometry', () => {
  it('edge and dot counts', () => {
    expect(geometry(3).edgeCount).toBe(24);
    expect(geometry(3).dotCount).toBe(16);
    expect(geometry(10).edgeCount).toBe(220);
  });

  it('cell sides are top, bottom, left, right', () => {
    expect(geometry(3).cellEdges[4]).toEqual([hEdge(3, 1, 1), hEdge(3, 2, 1), vEdge(3, 1, 1), vEdge(3, 1, 2)]);
    expect(geometry(3).cellEdges[4]).toEqual([4, 7, 17, 18]);
  });

  it('dot degree: corners 2, border 3, inner 4', () => {
    const { dotEdges } = geometry(3);
    const degree = (r: number, c: number) => dotEdges[r * 4 + c].length;
    expect([degree(0, 0), degree(0, 3), degree(3, 0), degree(3, 3)]).toEqual([2, 2, 2, 2]);
    expect([degree(0, 1), degree(1, 0), degree(2, 3), degree(3, 2)]).toEqual([3, 3, 3, 3]);
    expect([degree(1, 1), degree(1, 2), degree(2, 1), degree(2, 2)]).toEqual([4, 4, 4, 4]);
  });

  it('edge cells: border edges touch one cell, inner edges two', () => {
    const { edgeCells } = geometry(3);
    expect(edgeCells[hEdge(3, 0, 1)]).toEqual([1]);
    expect(edgeCells[vEdge(3, 1, 3)]).toEqual([5]);
    expect(edgeCells[hEdge(3, 1, 1)]).toHaveLength(2);
    expect(edgeCells[vEdge(3, 1, 1)]).toHaveLength(2);
  });

  it('edgeCells is the inverse of cellEdges', () => {
    for (const size of [1, 3, 5]) {
      const g = geometry(size);
      for (let cell = 0; cell < size * size; cell++) {
        for (const e of g.cellEdges[cell]) expect(g.edgeCells[e]).toContain(cell);
      }
      g.edgeCells.forEach((cells, e) => {
        for (const cell of cells) expect(g.cellEdges[cell]).toContain(e);
      });
    }
  });

  it('1x1 grid', () => {
    const g = geometry(1);
    expect(g.cellEdges[0]).toEqual([0, 1, 2, 3]);
    expect(g.dotEdges.map((e) => e.length)).toEqual([2, 2, 2, 2]);
  });

  it('edge dots are the lower then higher dot index', () => {
    const g = geometry(3);
    expect(g.edgeDots[hEdge(3, 0, 0)]).toEqual([0, 1]);
    expect(g.edgeDots[vEdge(3, 0, 0)]).toEqual([0, 4]);
    expect(g.edgeDots[vEdge(3, 2, 3)]).toEqual([11, 15]);
    g.dotEdges.forEach((edges, d) => {
      for (const e of edges) expect(g.edgeDots[e]).toContain(d);
    });
  });

  it('edge midpoints in dot units', () => {
    const g = geometry(3);
    expect(g.mid[hEdge(3, 0, 0)]).toEqual({ x: 0.5, y: 0 });
    expect(g.mid[vEdge(3, 0, 0)]).toEqual({ x: 0, y: 0.5 });
  });

  it('is cached per size', () => {
    expect(geometry(3)).toBe(geometry(3));
    expect(geometry(3)).not.toBe(geometry(4));
  });
});
