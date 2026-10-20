import { expect, test } from 'vitest';
import { BOARD_BG_EFFECTIVE, GLYPHS, PALETTE, contrastRatio } from '../../src/ui/palette';

test('every palette color has >= 3:1 contrast on the board', () =>
  PALETTE.forEach(c => expect(contrastRatio(c, BOARD_BG_EFFECTIVE)).toBeGreaterThanOrEqual(3)));

test('9 colors and 9 distinct glyphs', () => {
  expect(PALETTE).toHaveLength(9);
  expect(new Set(GLYPHS).size).toBe(9);
  GLYPHS.forEach(g => expect([...g]).toHaveLength(1));
});

test('palette is exactly the approved Dusk colors, in order', () => {
  expect(PALETTE).toEqual([
    '#ff5c7a', '#4cb0ff', '#34e3a0', '#ffd447', '#b48cff', '#ff9f45', '#3fe0e6', '#ff7ad9', '#c9f05a',
  ]);
});

test('contrastRatio follows WCAG (black/white = 21, symmetric, self = 1)', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  expect(contrastRatio('#4cb0ff', '#4cb0ff')).toBeCloseTo(1, 5);
});
