export type Geometry = {
  size: number;
  edgeCount: number;
  dotCount: number;
  /** Per cell: its sides as `[top, bottom, left, right]` edge indices. */
  cellEdges: number[][];
  /** Per dot: the edges that meet there (2 to 4). */
  dotEdges: number[][];
  /** Per edge: its two dots, lower index first. */
  edgeDots: [number, number][];
  /** Per edge: the cells it borders (1 on the border, otherwise 2). */
  edgeCells: number[][];
  /** Per edge: its midpoint in dot units (dot `(r, c)` is at `x = c, y = r`). */
  mid: { x: number; y: number }[];
};

/** The horizontal edge from dot `(r, c)` to `(r, c + 1)`. */
export function hEdge(size: number, r: number, c: number): number {
  return r * size + c;
}

/** The vertical edge from dot `(r, c)` to `(r + 1, c)`. */
export function vEdge(size: number, r: number, c: number): number {
  return (size + 1) * size + r * (size + 1) + c;
}

function build(size: number): Geometry {
  const w = size + 1;
  const edgeCount = 2 * w * size;
  const dotCount = w * w;
  const cellEdges: number[][] = [];
  const dotEdges: number[][] = Array.from({ length: dotCount }, () => []);
  const edgeDots: [number, number][] = new Array(edgeCount);
  const edgeCells: number[][] = Array.from({ length: edgeCount }, () => []);
  const mid: { x: number; y: number }[] = new Array(edgeCount);
  for (let r = 0; r <= size; r++) {
    for (let c = 0; c < size; c++) {
      const e = hEdge(size, r, c);
      edgeDots[e] = [r * w + c, r * w + c + 1];
      mid[e] = { x: c + 0.5, y: r };
    }
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size; c++) {
      const e = vEdge(size, r, c);
      edgeDots[e] = [r * w + c, (r + 1) * w + c];
      mid[e] = { x: c, y: r + 0.5 };
    }
  }
  edgeDots.forEach(([a, b], e) => {
    dotEdges[a].push(e);
    dotEdges[b].push(e);
  });
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const sides = [hEdge(size, r, c), hEdge(size, r + 1, c), vEdge(size, r, c), vEdge(size, r, c + 1)];
      cellEdges.push(sides);
      for (const e of sides) edgeCells[e].push(r * size + c);
    }
  }
  return { size, edgeCount, dotCount, cellEdges, dotEdges, edgeDots, edgeCells, mid };
}

const cache = new Map<number, Geometry>();

/** The grid's edge, dot and cell relations for a `size` x `size` puzzle (built once per size). */
export function geometry(size: number): Geometry {
  let g = cache.get(size);
  if (!g) {
    g = build(size);
    cache.set(size, g);
  }
  return g;
}
