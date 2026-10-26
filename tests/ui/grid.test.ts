import { expect, test } from 'vitest';
import { cellFromPoint } from '../../src/ui/grid';

test('cellFromPoint maps points, including scaled rects', () => {
  const rect = { left: 100, top: 50, width: 350, height: 350 };
  expect(cellFromPoint(101, 51, rect, 7)).toEqual({ r: 0, c: 0 });
  expect(cellFromPoint(449, 399, rect, 7)).toEqual({ r: 6, c: 6 });
  expect(cellFromPoint(99, 60, rect, 7)).toBeNull();
  expect(cellFromPoint(200, 400, rect, 7)).toBeNull();
  // scaled (CSS transform / zoom): same relative position, different pixel size
  expect(cellFromPoint(100 + 175, 50 + 175, { left: 100, top: 50, width: 350, height: 350 }, 7)).toEqual({ r: 3, c: 3 });
  expect(cellFromPoint(10 + 70, 10 + 70, { left: 10, top: 10, width: 140, height: 140 }, 7)).toEqual({ r: 3, c: 3 });
});
