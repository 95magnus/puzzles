/** Per-cell solver state: 0 unknown, 1 keep, 2 strike. */
const UNKNOWN = 0;
const KEEP = 1;
const STRIKE = 2;

const linesCache = new Map<number, number[][]>();

/** The cells of every line: `size` rows first, then `size` columns, each in order. Cached per size. */
export function lineCells(size: number): number[][] {
  let lines = linesCache.get(size);
  if (!lines) {
    lines = [];
    for (let r = 0; r < size; r++) lines.push(Array.from({ length: size }, (_, c) => r * size + c));
    for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => r * size + c));
    linesCache.set(size, lines);
  }
  return lines;
}

/**
 * One line in isolation. `known` is 0 unknown, 1 keep, 2 strike. `keep[i]` / `strike[i]` are true when every
 * valid assignment agrees; `null` when no assignment reaches the target.
 */
export function lineRule(
  digits: number[],
  known: (0 | 1 | 2)[],
  target: number,
): { keep: boolean[]; strike: boolean[] } | null {
  const unknown: number[] = [];
  let base = 0;
  for (let i = 0; i < digits.length; i++) {
    if (known[i] === UNKNOWN) unknown.push(i);
    else if (known[i] === KEEP) base += digits[i];
  }
  const k = unknown.length;
  let all = (1 << k) - 1;
  let any = 0;
  let valid = false;
  for (let mask = 0; mask < 1 << k; mask++) {
    let sum = base;
    for (let j = 0; j < k; j++) if (mask & (1 << j)) sum += digits[unknown[j]];
    if (sum !== target) continue;
    valid = true;
    all &= mask;
    any |= mask;
  }
  if (!valid) return null;
  const keep = known.map((v) => v === KEEP);
  const strike = known.map((v) => v === STRIKE);
  unknown.forEach((cell, j) => {
    keep[cell] = (all & (1 << j)) !== 0;
    strike[cell] = (any & (1 << j)) === 0;
  });
  return { keep, strike };
}

/** Line-rule propagation over a worklist of lines, shared by every state of one `analyse` call. */
class Propagator {
  private readonly lines: number[][];
  private readonly cellLines: [number, number][];
  private readonly queue: number[] = [];
  private readonly queued: Uint8Array;

  constructor(
    readonly size: number,
    private readonly digits: number[],
    private readonly targets: number[],
  ) {
    this.lines = lineCells(size);
    this.cellLines = Array.from({ length: size * size }, (_, i) => [Math.floor(i / size), size + (i % size)]);
    this.queued = new Uint8Array(2 * size);
  }

  push(line: number): void {
    if (this.queued[line]) return;
    this.queued[line] = 1;
    this.queue.push(line);
  }

  /** Sets a cell and queues its row and column. */
  set(s: Int8Array, cell: number, v: number): void {
    s[cell] = v;
    this.push(this.cellLines[cell][0]);
    this.push(this.cellLines[cell][1]);
  }

  /** Runs the line rule on queued lines to a fixpoint; false on a contradiction (the queue is cleared). */
  run(s: Int8Array): boolean {
    let at = 0;
    while (at < this.queue.length) {
      const line = this.queue[at++];
      this.queued[line] = 0;
      const cells = this.lines[line];
      const r = lineRule(
        cells.map((c) => this.digits[c]),
        cells.map((c) => s[c] as 0 | 1 | 2),
        this.targets[line],
      );
      if (!r) {
        for (let i = at; i < this.queue.length; i++) this.queued[this.queue[i]] = 0;
        this.queue.length = 0;
        return false;
      }
      cells.forEach((c, i) => {
        if (s[c] !== UNKNOWN) return;
        if (r.keep[i]) this.set(s, c, KEEP);
        else if (r.strike[i]) this.set(s, c, STRIKE);
      });
    }
    this.queue.length = 0;
    return true;
  }
}

/**
 * Deduces what it can: the line rule to a fixpoint, then one-step trials (assume a value for a cell, propagate,
 * and fix the opposite when that contradicts; trials never nest). Cells are 0 unknown, 1 keep, 2 strike.
 * `null` on a contradiction.
 */
export function analyse(
  size: number,
  digits: number[],
  targets: number[],
  opts: { trials?: boolean } = {},
): Int8Array | null {
  const { trials = true } = opts;
  const p = new Propagator(size, digits, targets);
  const s = new Int8Array(size * size);
  for (let l = 0; l < 2 * size; l++) p.push(l);
  if (!p.run(s)) return null;
  if (!trials) return s;
  let changed = true;
  while (changed) {
    changed = false;
    for (let cell = 0; cell < s.length; cell++) {
      if (s[cell] !== UNKNOWN) continue;
      for (const v of [KEEP, STRIKE]) {
        const t = s.slice();
        p.set(t, cell, v);
        if (p.run(t)) continue;
        p.set(s, cell, v === KEEP ? STRIKE : KEEP);
        if (!p.run(s)) return null;
        changed = true;
        break;
      }
    }
  }
  return s;
}

/** The unique keep mask when `analyse` settles every cell, else `null` (stalled or contradictory). */
export function deduce(size: number, digits: number[], targets: number[]): (0 | 1)[] | null {
  const s = analyse(size, digits, targets);
  if (!s || s.includes(UNKNOWN)) return null;
  return Array.from(s, (v): 0 | 1 => (v === KEEP ? 1 : 0));
}

/** Counts keep masks that meet every target, stopping at `limit`. Plain backtracking in cell order. */
export function countSolutions(size: number, digits: number[], targets: number[], limit: number): number {
  const n = size * size;
  const kept = new Array<number>(2 * size).fill(0);
  const undecided = new Array<number>(2 * size).fill(0);
  for (let i = 0; i < n; i++) {
    undecided[Math.floor(i / size)] += digits[i];
    undecided[size + (i % size)] += digits[i];
  }
  let found = 0;
  const rec = (i: number): void => {
    if (found >= limit) return;
    if (i === n) {
      if (kept.every((k, l) => k === targets[l])) found++;
      return;
    }
    const a = Math.floor(i / size);
    const b = size + (i % size);
    const d = digits[i];
    undecided[a] -= d;
    undecided[b] -= d;
    for (const keep of [true, false]) {
      if (keep) {
        kept[a] += d;
        kept[b] += d;
      }
      const ok =
        kept[a] <= targets[a] &&
        kept[b] <= targets[b] &&
        kept[a] + undecided[a] >= targets[a] &&
        kept[b] + undecided[b] >= targets[b];
      if (ok) rec(i + 1);
      if (keep) {
        kept[a] -= d;
        kept[b] -= d;
      }
    }
    undecided[a] += d;
    undecided[b] += d;
  };
  rec(0);
  return found;
}
