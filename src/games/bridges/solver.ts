import { components, totals } from './geometry';
import type { Count, Layout } from './types';

/**
 * Range fixpoint: every link keeps a range [lo, hi] of possible bridge counts, narrowed by the
 * crossing, capacity, isolation and reachability rules until a full pass changes nothing.
 * `null` on a contradiction; links nobody can fix keep a range with lo < hi.
 */
export function propagate(p: Layout): { lo: Count[]; hi: Count[] } | null {
  const lo: number[] = p.links.map(() => 0);
  const hi: number[] = p.links.map((l) => Math.min(2, p.islands[l.a].n, p.islands[l.b].n));
  const everyone = p.islands.length;
  let changed = true;
  const raise = (i: number, v: number) => {
    if (v > lo[i]) {
      lo[i] = v;
      changed = true;
    }
  };
  const lower = (i: number, v: number) => {
    if (v < hi[i]) {
      hi[i] = v;
      changed = true;
    }
  };
  while (changed) {
    changed = false;

    // Crossing: a link that must carry bridges shuts every link crossing it.
    p.links.forEach((l, i) => {
      if (lo[i] >= 1) for (const j of l.crosses) lower(j, 0);
    });

    // Capacity: an island's links must be able to sum to its number.
    for (let k = 0; k < everyone; k++) {
      const n = p.islands[k].n;
      let sumMax = 0;
      let sumMin = 0;
      for (const i of p.islandLinks[k]) {
        sumMax += hi[i];
        sumMin += lo[i];
      }
      if (sumMax < n || sumMin > n) return null;
      for (const i of p.islandLinks[k]) {
        raise(i, n - (sumMax - hi[i]));
        lower(i, n - (sumMin - lo[i]));
      }
    }
    if (p.links.some((_, i) => lo[i] > hi[i])) return null;

    // Isolation: a value that would close off a saturated group of islands from the rest is impossible.
    p.links.forEach((l, i) => {
      for (let k = hi[i]; k > lo[i]; k--) {
        const trial = lo.slice();
        trial[i] = k;
        const comp = components(p, trial);
        const tot = totals(p, trial);
        const group = p.islands.map((_, x) => x).filter((x) => comp[x] === comp[l.a]);
        if (group.length === everyone || !group.every((x) => tot[x] === p.islands[x].n)) break;
        lower(i, k - 1);
      }
    });

    // Reachability: a group that cannot reach any island outside it can never connect.
    const comp = components(p, lo);
    const roots = new Set(comp);
    if (roots.size > 1) {
      for (const root of roots) {
        const exit = p.links.some((l, i) => hi[i] > 0 && (comp[l.a] === root) !== (comp[l.b] === root));
        if (!exit) return null;
      }
    }
  }
  return { lo: lo as Count[], hi: hi as Count[] };
}

/** True when totals equal the numbers, no two crossing links both carry bridges, and the network is one piece. */
export function isSolved(p: Layout, bridges: readonly number[]): boolean {
  const tot = totals(p, bridges);
  if (!p.islands.every((isl, i) => tot[i] === isl.n)) return false;
  if (p.links.some((l, i) => bridges[i] > 0 && l.crosses.some((j) => bridges[j] > 0))) return false;
  return new Set(components(p, bridges)).size <= 1;
}

/** The unique solution if deduction alone finishes the board (which proves it unique), else `null`. */
export function deduce(p: Layout): Count[] | null {
  const r = propagate(p);
  if (!r || r.lo.some((v, i) => v !== r.hi[i])) return null;
  return isSolved(p, r.lo) ? r.lo : null;
}

/**
 * Number of solutions, stopping at `limit`: backtracking over the links with values 0..2, pruning
 * on island over-totals, crossings, and islands whose remaining links can no longer reach their
 * number; connectivity is checked at the leaves. For tests.
 */
export function countSolutions(p: Layout, limit: number): number {
  const cur: number[] = p.links.map(() => 0);
  const tot: number[] = p.islands.map(() => 0);
  // Links with index > idx still undecided at island k.
  const open = (k: number, idx: number) => p.islandLinks[k].filter((i) => i > idx).length;
  let count = 0;
  const go = (idx: number): void => {
    if (count >= limit) return;
    if (idx === p.links.length) {
      if (isSolved(p, cur)) count++;
      return;
    }
    const l = p.links[idx];
    for (let v = 0; v <= 2; v++) {
      if (v > 0 && l.crosses.some((j) => j < idx && cur[j] > 0)) break;
      cur[idx] = v;
      tot[l.a] += v;
      tot[l.b] += v;
      const ok = [l.a, l.b].every((k) => tot[k] <= p.islands[k].n && tot[k] + 2 * open(k, idx) >= p.islands[k].n);
      if (ok) go(idx + 1);
      tot[l.a] -= v;
      tot[l.b] -= v;
    }
    cur[idx] = 0;
  };
  go(0);
  return count;
}
