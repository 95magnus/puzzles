import { describe, expect, it } from 'vitest';
import { components, layout, linkFrom, totals } from '../../src/bridges/geometry';
import { BLOCK, CORNER, CROSS, PLUS } from './helpers';

const pairs = (p: { links: { a: number; b: number }[] }) => p.links.map((l) => [l.a, l.b]);

describe('bridges geometry', () => {
  it('links and inner cells', () => {
    expect(CORNER.links.map(({ crosses, ...l }) => l)).toEqual([
      { a: 0, b: 1, horizontal: true, inner: [1] },
      { a: 0, b: 2, horizontal: false, inner: [3] },
    ]);
    expect(CORNER.islandLinks).toEqual([[0, 1], [0], [1]]);
  });

  it('an island in between blocks the farther one', () => {
    expect(pairs(BLOCK)).toEqual([[0, 1], [1, 2]]);
  });

  it('crosses are symmetric', () => {
    expect(PLUS.links[0]).toEqual({ a: 0, b: 3, horizontal: false, inner: [7, 12, 17], crosses: [1] });
    expect(PLUS.links[1]).toMatchObject({ a: 1, b: 2, horizontal: true, crosses: [0] });
    expect(pairs(CROSS)).toEqual([[0, 1], [0, 3], [1, 2], [1, 5], [2, 4], [3, 4]]);
    expect(CROSS.links.map((l) => l.crosses)).toEqual([[], [], [], [5], [], [3]]);
  });

  it('linkFrom', () => {
    expect((['up', 'right', 'down', 'left'] as const).map((d) => linkFrom(CROSS, 1, d))).toEqual([-1, 2, 3, 0]);
  });

  it('totals and components', () => {
    const bridges = [2, 0, 1, 0, 0, 0];
    expect(totals(CROSS, bridges)).toEqual([2, 3, 1, 0, 0, 0]);
    expect(components(CROSS, bridges)).toEqual([0, 0, 0, 3, 4, 5]);
  });

  it('layout sorts islands by cell', () => {
    const p = layout(3, [{ cell: 6, n: 2 }, { cell: 0, n: 4 }, { cell: 2, n: 2 }]);
    expect(p.islands.map((i) => i.cell)).toEqual([0, 2, 6]);
    expect(pairs(p)).toEqual([[0, 1], [0, 2]]);
  });
});
