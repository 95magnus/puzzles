import type { Rect, Shape } from './types';

/** Bounding rectangle of two cells, whichever corner each one is. */
export function normalize(size: number, a: number, b: number): Rect {
  const r1 = Math.floor(a / size);
  const c1 = a % size;
  const r2 = Math.floor(b / size);
  const c2 = b % size;
  const r = Math.min(r1, r2);
  const c = Math.min(c1, c2);
  return { r, c, w: Math.max(c1, c2) - c + 1, h: Math.max(r1, r2) - r + 1 };
}

/** Cell indices covered by the rectangle, in reading order. */
export function cellsOf(size: number, x: Rect): number[] {
  const out: number[] = [];
  for (let r = x.r; r < x.r + x.h; r++) for (let c = x.c; c < x.c + x.w; c++) out.push(r * size + c);
  return out;
}

export function contains(size: number, x: Rect, cell: number): boolean {
  const r = Math.floor(cell / size);
  const c = cell % size;
  return r >= x.r && r < x.r + x.h && c >= x.c && c < x.c + x.w;
}

/** True when the rectangles share at least one cell (touching edges do not count). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;
}

export function sameRect(a: Rect, b: Rect): boolean {
  return a.r === b.r && a.c === b.c && a.w === b.w && a.h === b.h;
}

export function shapeOf(x: Rect): Exclude<Shape, 'any'> {
  return x.w === x.h ? 'square' : x.w > x.h ? 'wide' : 'tall';
}

export function fits(shape: Shape, x: Rect): boolean {
  return shape === 'any' || shapeOf(x) === shape;
}

/** At least 1×1 and entirely inside the board. */
export function inBounds(size: number, x: Rect): boolean {
  return x.w >= 1 && x.h >= 1 && x.r >= 0 && x.c >= 0 && x.r + x.h <= size && x.c + x.w <= size;
}
