import { geometry, type Geometry } from './geometry';

const UNKNOWN = 0;
const LINE = 1;
const CROSS = 2;

/**
 * One solver state, all typed arrays so a trial is a cheap copy. `parent` is a union-find over
 * dots joined by lines; `lines[root]` counts the lines in that root's piece; `total` counts all lines.
 */
type State = { edges: Int8Array; parent: Int32Array; lines: Int32Array; total: number };

function copy(s: State): State {
  return { edges: s.edges.slice(), parent: s.parent.slice(), lines: s.lines.slice(), total: s.total };
}

/** The deduction rules of spec §5 for one board, with a worklist of cells and dots shared by every state. */
class Solver {
  readonly g: Geometry;
  readonly clues: Int8Array;
  readonly clueCells: number[] = [];
  private readonly cells: number;
  // Worklist items: cells are 0..cells-1, dots follow. Each item is queued at most once.
  private readonly queue: Int32Array;
  private readonly queued: Uint8Array;
  private head = 0;
  private pending = 0;

  constructor(size: number, clues: (number | null)[]) {
    this.g = geometry(size);
    this.cells = size * size;
    this.clues = Int8Array.from(clues, (n) => n ?? -1);
    clues.forEach((n, cell) => {
      if (n !== null) this.clueCells.push(cell);
    });
    this.queue = new Int32Array(this.cells + this.g.dotCount);
    this.queued = new Uint8Array(this.queue.length);
  }

  initial(): State {
    const n = this.g.dotCount;
    const s: State = {
      edges: new Int8Array(this.g.edgeCount),
      parent: Int32Array.from({ length: n }, (_, d) => d),
      lines: new Int32Array(n),
      total: 0,
    };
    for (let item = 0; item < this.queue.length; item++) this.push(item);
    return s;
  }

  private push(item: number): void {
    if (this.queued[item]) return;
    this.queued[item] = 1;
    this.queue[(this.head + this.pending++) % this.queue.length] = item;
  }

  private clear(): void {
    this.queued.fill(0);
    this.head = 0;
    this.pending = 0;
  }

  private find(s: State, d: number): number {
    const p = s.parent;
    while (p[d] !== d) {
      p[d] = p[p[d]];
      d = p[d];
    }
    return d;
  }

  private cluesMet(edges: Int8Array): boolean {
    for (const cell of this.clueCells) {
      let l = 0;
      for (const e of this.g.cellEdges[cell]) if (edges[e] === LINE) l++;
      if (l !== this.clues[cell]) return false;
    }
    return true;
  }

  private dotLines(edges: Int8Array, d: number): number {
    let l = 0;
    for (const e of this.g.dotEdges[d]) if (edges[e] === LINE) l++;
    return l;
  }

  /** Sets unknown edge `e` and queues its dots and cells; false when a line closes a loop that cannot be the answer. */
  set(s: State, e: number, v: typeof LINE | typeof CROSS): boolean {
    s.edges[e] = v;
    const [a, b] = this.g.edgeDots[e];
    this.push(this.cells + a);
    this.push(this.cells + b);
    for (const cell of this.g.edgeCells[e]) this.push(cell);
    if (v === CROSS) return true;
    s.total++;
    const ra = this.find(s, a);
    const rb = this.find(s, b);
    if (ra !== rb) {
      s.parent[ra] = rb;
      s.lines[rb] += s.lines[ra] + 1;
      return true;
    }
    // A closed loop must hold every line and meet every clue; then nothing else can be a line.
    s.lines[ra]++;
    if (s.lines[ra] !== s.total || !this.cluesMet(s.edges)) return false;
    for (let x = 0; x < s.edges.length; x++) if (s.edges[x] === UNKNOWN) this.set(s, x, CROSS);
    return true;
  }

  private cellRule(s: State, cell: number): boolean {
    const n = this.clues[cell];
    if (n < 0) return true;
    const sides = this.g.cellEdges[cell];
    let l = 0;
    let u = 0;
    for (const e of sides) {
      if (s.edges[e] === LINE) l++;
      else if (s.edges[e] === UNKNOWN) u++;
    }
    if (l > n || l + u < n) return false;
    if (u === 0 || (l !== n && l + u !== n)) return true;
    const v = l === n ? CROSS : LINE;
    for (const e of sides) if (s.edges[e] === UNKNOWN && !this.set(s, e, v)) return false;
    return true;
  }

  private dotRule(s: State, d: number): boolean {
    const es = this.g.dotEdges[d];
    let l = 0;
    let u = 0;
    for (const e of es) {
      if (s.edges[e] === LINE) l++;
      else if (s.edges[e] === UNKNOWN) u++;
    }
    if (l > 2 || (l === 1 && u === 0)) return false;
    if (u === 0) return true;
    let v: typeof LINE | typeof CROSS;
    if (l === 2) v = CROSS;
    else if (u === 1) v = l === 1 ? LINE : CROSS;
    else return true;
    for (const e of es) if (s.edges[e] === UNKNOWN && !this.set(s, e, v)) return false;
    return true;
  }

  /** An unknown edge joining the two ends of one path, where closing it would not finish the puzzle. */
  private closesEarly(s: State, e: number): boolean {
    const [a, b] = this.g.edgeDots[e];
    const root = this.find(s, a);
    if (root !== this.find(s, b) || this.dotLines(s.edges, a) !== 1 || this.dotLines(s.edges, b) !== 1) return false;
    if (s.lines[root] !== s.total) return true;
    s.edges[e] = LINE;
    const met = this.cluesMet(s.edges);
    s.edges[e] = UNKNOWN;
    return !met;
  }

  /** Spec §2 on a state with no unknowns left. */
  private finished(s: State): boolean {
    if (s.total === 0 || !this.cluesMet(s.edges)) return false;
    for (let d = 0; d < this.g.dotCount; d++) {
      const l = this.dotLines(s.edges, d);
      if (l !== 0 && l !== 2) return false;
    }
    const first = s.edges.indexOf(LINE);
    return s.lines[this.find(s, this.g.edgeDots[first][0])] === s.total;
  }

  /** Runs the cell, dot and no-early-loop rules to their fixpoint; false on a contradiction. */
  propagate(s: State): boolean {
    for (;;) {
      while (this.pending > 0) {
        const item = this.queue[this.head];
        this.head = (this.head + 1) % this.queue.length;
        this.pending--;
        this.queued[item] = 0;
        const ok = item < this.cells ? this.cellRule(s, item) : this.dotRule(s, item - this.cells);
        if (!ok) {
          this.clear();
          return false;
        }
      }
      let changed = false;
      for (let e = 0; e < s.edges.length; e++) {
        if (s.edges[e] === UNKNOWN && this.closesEarly(s, e)) {
          this.set(s, e, CROSS);
          changed = true;
        }
      }
      if (!changed) break;
    }
    return s.edges.includes(UNKNOWN) || this.finished(s);
  }

  /** Whether setting `e` to `v` on a copy of `s` and propagating hits a contradiction. */
  refutes(s: State, e: number, v: typeof LINE | typeof CROSS): boolean {
    const t = copy(s);
    if (this.set(t, e, v)) return !this.propagate(t);
    this.clear();
    return true;
  }
}

/**
 * The deduction fixpoint per edge (0 unknown, 1 line, 2 cross), or `null` on a contradiction:
 * the plain rules, then one-step trials (an edge whose line or cross leads to a contradiction
 * takes the other value) until a full sweep of trials changes nothing. Trials never nest.
 */
export function analyse(size: number, clues: (number | null)[]): Int8Array | null {
  const solver = new Solver(size, clues);
  const s = solver.initial();
  if (!solver.propagate(s)) return null;
  const count = s.edges.length;
  // Sweep the edges cyclically, stopping after `count` trials in a row that change nothing.
  let quiet = 0;
  for (let e = 0; quiet < count; e = (e + 1) % count) {
    quiet++;
    if (s.edges[e] !== UNKNOWN) continue;
    let v: typeof LINE | typeof CROSS | null = null;
    if (solver.refutes(s, e, LINE)) v = CROSS;
    else if (solver.refutes(s, e, CROSS)) v = LINE;
    if (v === null) continue;
    if (!solver.set(s, e, v) || !solver.propagate(s)) return null;
    quiet = 0;
  }
  return s.edges;
}

/** The unique solution as 0/1 per edge if deduction fixes every edge, else `null`. */
export function deduce(size: number, clues: (number | null)[]): (0 | 1)[] | null {
  const s = analyse(size, clues);
  if (!s || s.includes(UNKNOWN)) return null;
  return Array.from(s, (v) => (v === LINE ? 1 : 0));
}

/** Spec §2 for 0/1 edges: every dot has 0 or 2 lines, the lines form one loop, every clue is met. */
function isLoop(g: Geometry, clues: (number | null)[], edges: Int8Array): boolean {
  for (let cell = 0; cell < g.cellEdges.length; cell++) {
    if (clues[cell] !== null && g.cellEdges[cell].filter((e) => edges[e] === LINE).length !== clues[cell]) return false;
  }
  let start = -1;
  for (let d = 0; d < g.dotCount; d++) {
    const l = g.dotEdges[d].filter((e) => edges[e] === LINE).length;
    if (l !== 0 && l !== 2) return false;
    if (l === 2 && start < 0) start = d;
  }
  if (start < 0) return false;
  // Walk the loop through `start`; it must use every line.
  let walked = 0;
  let prev = -1;
  let d = start;
  do {
    const e = g.dotEdges[d].find((x) => edges[x] === LINE && x !== prev)!;
    const [a, b] = g.edgeDots[e];
    d = a === d ? b : a;
    prev = e;
    walked++;
  } while (d !== start);
  return walked === edges.reduce((sum, v) => sum + v, 0);
}

/**
 * Number of solutions, stopping at `limit`: backtracking over the edges in index order, pruning
 * cells and dots whose lines can no longer work out; the single loop is checked at the leaves. For tests.
 */
export function countSolutions(size: number, clues: (number | null)[], limit: number): number {
  const g = geometry(size);
  const edges = new Int8Array(g.edgeCount);
  // Lines among `sides` with edges up to `e` decided, and how many of them are still open.
  const tally = (sides: number[], e: number) => {
    let lines = 0;
    let open = 0;
    for (const x of sides) {
      if (x > e) open++;
      else if (edges[x] === LINE) lines++;
    }
    return { lines, open };
  };
  const cellOk = (cell: number, e: number) => {
    const n = clues[cell];
    if (n === null) return true;
    const { lines, open } = tally(g.cellEdges[cell], e);
    return lines <= n && lines + open >= n;
  };
  const dotOk = (d: number, e: number) => {
    const { lines, open } = tally(g.dotEdges[d], e);
    return lines <= 2 && !(lines === 1 && open === 0);
  };
  const ok = (e: number) => g.edgeCells[e].every((cell) => cellOk(cell, e)) && g.edgeDots[e].every((d) => dotOk(d, e));
  let count = 0;
  const go = (e: number): void => {
    if (count >= limit) return;
    if (e === g.edgeCount) {
      if (isLoop(g, clues, edges)) count++;
      return;
    }
    for (const v of [UNKNOWN, LINE]) {
      edges[e] = v;
      if (ok(e)) go(e + 1);
    }
    edges[e] = UNKNOWN;
  };
  go(0);
  return count;
}
