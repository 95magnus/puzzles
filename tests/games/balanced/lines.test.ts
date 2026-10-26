import { describe, expect, it } from 'vitest';
import { lineCells, lineEdges, lineOf, linePatterns } from '../../../src/games/balanced/lines';
import { CHAIN6, tz } from './helpers';

describe('balanced lines', () => {
  it('linePatterns counts', () => {
    expect([4, 6, 8, 10].map((n) => linePatterns(n).length)).toEqual([6, 14, 34, 84]);
    for (const n of [4, 6, 8, 10]) {
      for (const p of linePatterns(n)) {
        expect(p).toHaveLength(n);
        expect(p.filter((x) => x === 1)).toHaveLength(n / 2);
        expect(p.filter((x) => x === 2)).toHaveLength(n / 2);
        for (let i = 0; i + 2 < n; i++) expect(p[i] === p[i + 1] && p[i] === p[i + 2]).toBe(false);
      }
    }
    expect(linePatterns(6)).toBe(linePatterns(6));
  });

  it('lineCells walks rows then columns, and lineOf finds both lines', () => {
    expect(lineCells(4, 1)).toEqual([4, 5, 6, 7]);
    expect(lineCells(4, 6)).toEqual([2, 6, 10, 14]);
    expect(lineOf(4, 6)).toEqual([1, 6]);
  });

  it('lineEdges keeps only the edges inside a line', () => {
    const row = lineEdges(CHAIN6, 0);
    expect(row.map((e) => [e.x, e.y])).toEqual([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
    expect(row.map((e) => e.eq)).toEqual([false, true, false, true, false]);
    expect(row.map((e) => e.edge)).toEqual([0, 1, 2, 3, 4]);
    expect(lineEdges(CHAIN6, 6)).toEqual([]);

    const vertical = tz(['S.....', '......', '......', '......', '......', '......'], [[0, 6, '=']]);
    expect(lineEdges(vertical, 0)).toEqual([]);
    expect(lineEdges(vertical, 6)).toEqual([{ x: 0, y: 1, eq: true, edge: 0 }]);
  });
});
