import { components, totals } from './geometry';
import { isSolved } from './solver';
import type { Count, GameState, Move, Puzzle, Violations } from './types';

// Pure game state. Mutating actions report whether something changed;
// all are ignored once the game is won.

export function newGame(p: Puzzle): GameState {
  return { puzzle: p, bridges: p.links.map(() => 0 as Count), history: [], status: 'playing' };
}

/** Bridge total at each island. */
export function islandTotals(s: GameState): number[] {
  return totals(s.puzzle, s.bridges);
}

/** Islands whose total equals their number. */
export function satisfied(s: GameState): number {
  const tot = islandTotals(s);
  return s.puzzle.islands.filter((isl, i) => tot[i] === isl.n).length;
}

/** Islands over their number; and, only once every island is satisfied, the islands outside the main (largest, then lowest-indexed) component. */
export function violations(s: GameState): Violations {
  const { islands } = s.puzzle;
  const tot = islandTotals(s);
  const out: Violations = { over: new Set(), split: new Set() };
  islands.forEach((isl, i) => {
    if (tot[i] > isl.n) out.over.add(i);
  });
  if (!islands.every((isl, i) => tot[i] === isl.n)) return out;
  const comp = components(s.puzzle, s.bridges);
  const size = new Map<number, number>();
  for (const c of comp) size.set(c, (size.get(c) ?? 0) + 1);
  // Component ids are lowest island indices, so scanning ids in ascending order and keeping strict maxima breaks ties to the lowest.
  let main = comp[0];
  for (const c of [...size.keys()].sort((x, y) => x - y)) if (size.get(c)! > size.get(main)!) main = c;
  comp.forEach((c, i) => {
    if (c !== main) out.split.add(i);
  });
  return out;
}

export function isWin(s: GameState): boolean {
  return isSolved(s.puzzle, s.bridges);
}

function commit(s: GameState, move: Move): void {
  s.history.push(move);
  if (isWin(s)) s.status = 'won';
}

/** Set one link as a move. */
function setLink(s: GameState, link: number, v: Count): void {
  const before = s.bridges[link];
  s.bridges[link] = v;
  commit(s, { links: [link], before: [before] });
}

/** 0 → 1 → 2 → 0. Adding the first bridge across carrying links is refused, naming them. */
export function cycle(s: GameState, link: number): { changed: boolean; blockedBy: number[] } {
  if (s.status === 'won') return { changed: false, blockedBy: [] };
  const cur = s.bridges[link];
  if (cur === 0) {
    const blockedBy = s.puzzle.links[link].crosses.filter((j) => s.bridges[j] > 0);
    if (blockedBy.length > 0) return { changed: false, blockedBy };
  }
  setLink(s, link, ((cur + 1) % 3) as Count);
  return { changed: true, blockedBy: [] };
}

/** 2 → 1 → 0; `false` at 0. */
export function remove(s: GameState, link: number): boolean {
  if (s.status === 'won' || s.bridges[link] === 0) return false;
  setLink(s, link, (s.bridges[link] - 1) as Count);
  return true;
}

export function undo(s: GameState): boolean {
  if (s.status === 'won') return false;
  const move = s.history.pop();
  if (!move) return false;
  move.links.forEach((l, i) => (s.bridges[l] = move.before[i]));
  return true;
}

/** Remove every bridge as one move. */
export function clear(s: GameState): boolean {
  if (s.status === 'won') return false;
  const links = s.bridges.flatMap((v, l) => (v !== 0 ? [l] : []));
  if (links.length === 0) return false;
  const before = links.map((l) => s.bridges[l]);
  for (const l of links) s.bridges[l] = 0;
  commit(s, { links, before });
  return true;
}

/** One char per link: 0, 1 or 2 bridges. */
export function encode(s: GameState): string {
  return s.bridges.join('');
}

/** `null` unless `text` has one 0/1/2 per link and no two crossing links both carry bridges. */
export function restore(p: Puzzle, text: string): GameState | null {
  if (text.length !== p.links.length || !/^[012]*$/.test(text)) return null;
  const bridges = [...text].map(Number) as Count[];
  if (p.links.some((l, i) => bridges[i] > 0 && l.crosses.some((j) => bridges[j] > 0))) return null;
  const s: GameState = { puzzle: p, bridges, history: [], status: 'playing' };
  if (isWin(s)) s.status = 'won';
  return s;
}
