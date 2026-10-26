import { DIRS, type Level } from './types';

/** Cell → arrow index (-1 empty). Only alive arrows are marked when `alive` is given. */
export function buildOcc(level: Level, alive?: Uint8Array): Int32Array {
  const occ = new Int32Array(level.cols * level.rows).fill(-1);
  level.arrows.forEach((a, i) => {
    if (alive && !alive[i]) return;
    for (const cell of a.cells) occ[cell] = i;
  });
  return occ;
}

/** Cells from the head (exclusive) to the board edge, nearest first. */
export function exitLine(level: Level, i: number): number[] {
  const { cols, rows } = level;
  const a = level.arrows[i];
  const head = a.cells[a.cells.length - 1];
  const [dc, dr] = DIRS[a.dir];
  const out: number[] = [];
  let c = (head % cols) + dc;
  let r = Math.floor(head / cols) + dr;
  while (c >= 0 && c < cols && r >= 0 && r < rows) {
    out.push(r * cols + c);
    c += dc;
    r += dr;
  }
  return out;
}

/** Distinct other arrows on arrow `i`'s exit line, nearest first. */
export function blockersOf(level: Level, occ: Int32Array, i: number): number[] {
  const out: number[] = [];
  for (const cell of exitLine(level, i)) {
    const j = occ[cell];
    if (j >= 0 && j !== i && !out.includes(j)) out.push(j);
  }
  return out;
}

/**
 * Topological analysis (edges blocker → blocked). Returns a valid removal order,
 * the number of initially free arrows and the longest blocking chain in arrows,
 * or `null` if the level contains a cycle.
 */
export function analyze(
  level: Level,
): { order: number[]; initiallyFree: number; depth: number } | null {
  const n = level.arrows.length;
  const occ = buildOcc(level);
  const pending = new Int32Array(n);
  const blocks: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const bs = blockersOf(level, occ, i);
    pending[i] = bs.length;
    for (const b of bs) blocks[b].push(i);
  }
  const depthOf = new Int32Array(n).fill(1);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (pending[i] === 0) queue.push(i);
  const initiallyFree = queue.length;
  const order: number[] = [];
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    order.push(i);
    for (const j of blocks[i]) {
      depthOf[j] = Math.max(depthOf[j], depthOf[i] + 1);
      if (--pending[j] === 0) queue.push(j);
    }
  }
  if (order.length !== n) return null;
  let depth = 0;
  for (let i = 0; i < n; i++) depth = Math.max(depth, depthOf[i]);
  return { order, initiallyFree, depth };
}
