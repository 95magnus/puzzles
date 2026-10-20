import type { Puzzle } from './types';

/**
 * Counts complete, non-self-touching solutions of a Flow puzzle, capped at `limit`.
 *
 * A solution assigns every cell to exactly one color such that each color's cells form
 * a single path from pair.a to pair.b in which no cell is orthogonally adjacent to a
 * non-consecutive cell of the same path (i.e. each path is an induced path).
 *
 * Backtracking DFS over a mutable grid; paths are grown from pair.a towards pair.b.
 * All state lives in preallocated typed arrays; changes are recorded on a trail and undone.
 */
export function countSolutions(puzzle: Puzzle, limit = 2): number {
  const n = puzzle.size;
  const N = n * n;
  const K = puzzle.pairs.length;
  if (limit <= 0) return 0;
  if (K === 0) return N === 0 ? 1 : 0;

  // ---- static topology ----
  const nb = new Int32Array(N * 4).fill(-1);
  const deg = new Uint8Array(N);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      let d = 0;
      if (r > 0) nb[i * 4 + d++] = i - n;
      if (r < n - 1) nb[i * 4 + d++] = i + n;
      if (c > 0) nb[i * 4 + d++] = i - 1;
      if (c < n - 1) nb[i * 4 + d++] = i + 1;
      deg[i] = d;
    }
  }

  // ---- mutable state ----
  const owner = new Int16Array(N).fill(-1); // -1 = empty, else color index
  const head = new Int32Array(K);
  const target = new Int32Array(K);
  const done = new Uint8Array(K);
  let doneCount = 0;
  let empty = N;

  const inBounds = (r: number, c: number) => r >= 0 && r < n && c >= 0 && c < n;
  for (let k = 0; k < K; k++) {
    const { a, b } = puzzle.pairs[k];
    if (!inBounds(a.r, a.c) || !inBounds(b.r, b.c)) return 0;
    const ai = a.r * n + a.c;
    const bi = b.r * n + b.c;
    if (ai === bi || owner[ai] !== -1 || owner[bi] !== -1) return 0;
    owner[ai] = k;
    owner[bi] = k;
    head[k] = ai;
    target[k] = bi;
    empty -= 2;
  }

  // trail: pairs of (color, previous head)
  const trail = new Int32Array(2 * (N + K) + 2);
  let trailLen = 0;
  // move buffers: 4 slots per recursion depth
  const moves = new Int32Array(4 * (N + 2));
  // prune scratch
  const comp = new Int32Array(N);
  const queue = new Int32Array(N);
  const covered = new Uint8Array(N);

  /** Writes legal next cells for color c into moves[off..]; returns how many. */
  function legalMoves(c: number, off: number): number {
    const h = head[c];
    const b = target[c];
    const hb = h * 4;
    const hd = deg[h];
    // Adjacent to own target: the only non-self-touching continuation is to step into it.
    for (let i = 0; i < hd; i++) {
      if (nb[hb + i] === b) {
        const bb = b * 4;
        const bd = deg[b];
        for (let j = 0; j < bd; j++) {
          const u = nb[bb + j];
          if (u !== h && owner[u] === c) return 0;
        }
        moves[off] = b;
        return 1;
      }
    }
    let cnt = 0;
    for (let i = 0; i < hd; i++) {
      const v = nb[hb + i];
      if (owner[v] !== -1) continue;
      const vb = v * 4;
      const vd = deg[v];
      let ok = true;
      for (let j = 0; j < vd; j++) {
        const u = nb[vb + j];
        // owner === c and u !== b means u is already on c's path
        if (u !== h && u !== b && owner[u] === c) {
          ok = false;
          break;
        }
      }
      if (ok) moves[off + cnt++] = v;
    }
    return cnt;
  }

  function apply(c: number, v: number): void {
    trail[trailLen++] = c;
    trail[trailLen++] = head[c];
    head[c] = v;
    if (v === target[c]) {
      done[c] = 1;
      doneCount++;
    } else {
      owner[v] = c;
      empty--;
    }
  }

  function undoTo(mark: number): void {
    while (trailLen > mark) {
      const prev = trail[--trailLen];
      const c = trail[--trailLen];
      const v = head[c];
      if (v === target[c]) {
        done[c] = 0;
        doneCount--;
      } else {
        owner[v] = -1;
        empty++;
      }
      head[c] = prev;
    }
  }

  /** True if neighbour u could be the path-neighbour of an empty cell in some completion. */
  function isOpen(u: number): boolean {
    const o = owner[u];
    if (o === -1) return true;
    return done[o] === 0 && (u === head[o] || u === target[o]);
  }

  /** Returns false if the position provably has no completion. Never rejects a solvable one. */
  function prune(): boolean {
    // 1. Every empty cell will be a path interior cell, so it needs >= 2 open neighbours.
    for (let i = 0; i < N; i++) {
      comp[i] = -1;
      if (owner[i] !== -1) continue;
      const ib = i * 4;
      const d = deg[i];
      let open = 0;
      for (let j = 0; j < d; j++) if (isOpen(nb[ib + j])) open++;
      if (open < 2) return false;
    }
    // Label empty components.
    let numComps = 0;
    for (let s = 0; s < N; s++) {
      if (owner[s] !== -1 || comp[s] !== -1) continue;
      const id = numComps++;
      covered[id] = 0;
      let qh = 0;
      let qt = 0;
      queue[qt++] = s;
      comp[s] = id;
      while (qh < qt) {
        const x = queue[qh++];
        const xb = x * 4;
        const xd = deg[x];
        for (let j = 0; j < xd; j++) {
          const y = nb[xb + j];
          if (owner[y] === -1 && comp[y] === -1) {
            comp[y] = id;
            queue[qt++] = y;
          }
        }
      }
    }
    // 2. Each unfinished color's head and target must share an empty component.
    //    (After propagation no unfinished head is adjacent to its target.)
    for (let k = 0; k < K; k++) {
      if (done[k]) continue;
      const h = head[k];
      const b = target[k];
      const hb = h * 4;
      const bb = b * 4;
      const hd = deg[h];
      const bd = deg[b];
      let any = false;
      for (let i = 0; i < hd; i++) {
        const ch = comp[nb[hb + i]];
        if (ch === -1) continue;
        for (let j = 0; j < bd; j++) {
          if (comp[nb[bb + j]] === ch) {
            covered[ch] = 1;
            any = true;
          }
        }
      }
      if (!any) return false;
    }
    // 3. Every empty component must be served by some unfinished color.
    for (let id = 0; id < numComps; id++) if (!covered[id]) return false;
    return true;
  }

  function search(depth: number): number {
    const mark = trailLen;
    const off = depth * 4;
    // Propagate forced moves to a fixpoint.
    let changed = true;
    while (changed) {
      changed = false;
      for (let k = 0; k < K; k++) {
        if (done[k]) continue;
        const m = legalMoves(k, off);
        if (m === 0) {
          undoTo(mark);
          return 0;
        }
        if (m === 1) {
          apply(k, moves[off]);
          changed = true;
        }
      }
    }
    if (doneCount === K) {
      const res = empty === 0 ? 1 : 0;
      undoTo(mark);
      return res;
    }
    if (!prune()) {
      undoTo(mark);
      return 0;
    }
    // Branch on the unfinished color with the fewest legal moves.
    let best = -1;
    let bestCnt = 5;
    for (let k = 0; k < K; k++) {
      if (done[k]) continue;
      const m = legalMoves(k, off);
      if (m < bestCnt) {
        bestCnt = m;
        best = k;
        if (m === 2) break;
      }
    }
    legalMoves(best, off);
    let total = 0;
    for (let i = 0; i < bestCnt; i++) {
      const m2 = trailLen;
      apply(best, moves[off + i]);
      total += search(depth + 1);
      undoTo(m2);
      if (total >= limit) break;
    }
    undoTo(mark);
    return total >= limit ? limit : total;
  }

  return search(0);
}
