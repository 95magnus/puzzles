import { describe, expect, it } from 'vitest';
import { cellsOf, contains, fits, inBounds, normalize, overlaps, shapeOf } from '../../../src/games/patches/rect';

describe('patches rect', () => {
  it('normalize works in all four directions', () => {
    const want = { r: 0, c: 0, w: 2, h: 2 };
    expect(normalize(4, 0, 5)).toEqual(want);
    expect(normalize(4, 5, 0)).toEqual(want);
    expect(normalize(4, 1, 4)).toEqual(want);
    expect(normalize(4, 4, 1)).toEqual(want);
    expect(normalize(4, 6, 6)).toEqual({ r: 1, c: 2, w: 1, h: 1 });
  });

  it('cellsOf lists cells in reading order and contains agrees', () => {
    const x = { r: 1, c: 1, w: 2, h: 2 };
    expect(cellsOf(4, x)).toEqual([5, 6, 9, 10]);
    expect(contains(4, x, 10)).toBe(true);
    expect(contains(4, x, 11)).toBe(false);
  });

  it('overlaps ignores touching edges', () => {
    const a = { r: 0, c: 0, w: 2, h: 2 };
    expect(overlaps(a, { r: 1, c: 1, w: 2, h: 2 })).toBe(true);
    expect(overlaps(a, { r: 0, c: 2, w: 2, h: 2 })).toBe(false);
  });

  it('shapeOf and fits', () => {
    expect(shapeOf({ r: 0, c: 0, w: 1, h: 1 })).toBe('square');
    expect(shapeOf({ r: 0, c: 0, w: 2, h: 2 })).toBe('square');
    expect(shapeOf({ r: 0, c: 0, w: 3, h: 1 })).toBe('wide');
    expect(shapeOf({ r: 0, c: 0, w: 1, h: 2 })).toBe('tall');
    expect(fits('any', { r: 0, c: 0, w: 3, h: 1 })).toBe(true);
    expect(fits('wide', { r: 0, c: 0, w: 3, h: 1 })).toBe(true);
    expect(fits('tall', { r: 0, c: 0, w: 3, h: 1 })).toBe(false);
  });

  it('inBounds rejects overflow and empty rectangles', () => {
    expect(inBounds(4, { r: 0, c: 3, w: 2, h: 1 })).toBe(false);
    expect(inBounds(4, { r: 0, c: 0, w: 0, h: 1 })).toBe(false);
    expect(inBounds(4, { r: 0, c: 2, w: 2, h: 4 })).toBe(true);
  });
});
