type Rect = { left: number; top: number; width: number; height: number };

/** Map a client point to a grid cell using the board's live bounding rect. */
export function cellFromPoint(x: number, y: number, rect: Rect, size: number): { r: number; c: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return null;
  return { r: Math.min(size - 1, Math.floor(fy * size)), c: Math.min(size - 1, Math.floor(fx * size)) };
}
