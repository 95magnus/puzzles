import { geometry } from './geometry';
import type { Edge, GameState, Move, PaintMode, Puzzle, Violations } from './types';

// Pure game state. Mutating actions report whether something changed;
// all are ignored once the game is won.

export function newGame(p: Puzzle): GameState {
  return { puzzle: p, edges: new Array<Edge>(2 * (p.size + 1) * p.size).fill(0), history: [], status: 'playing' };
}

/** Number of clue cells. */
export function clueCount(p: Puzzle): number {
  return p.clues.filter((c) => c !== null).length;
}

function sides(s: GameState, cell: number, v: Edge): number {
  return geometry(s.puzzle.size).cellEdges[cell].filter((e) => s.edges[e] === v).length;
}

/** Clue cells with too many lines or too many ✕; dots with a branch (3 or 4 lines). */
export function violations(s: GameState): Violations {
  const g = geometry(s.puzzle.size);
  const out: Violations = { clues: new Set(), dots: new Set() };
  s.puzzle.clues.forEach((n, cell) => {
    if (n !== null && (sides(s, cell, 1) > n || sides(s, cell, 2) > 4 - n)) out.clues.add(cell);
  });
  g.dotEdges.forEach((es, d) => {
    if (es.filter((e) => s.edges[e] === 1).length >= 3) out.dots.add(d);
  });
  return out;
}

/** Clue cells whose line sides equal their number. */
export function matched(s: GameState): number {
  return s.puzzle.clues.filter((n, cell) => n !== null && sides(s, cell, 1) === n).length;
}

/** Every dot has 0 or 2 lines, the lines form one connected loop, every clue is met. ✕ counts as no line. */
export function isWon(s: GameState): boolean {
  const g = geometry(s.puzzle.size);
  const lines = s.edges.flatMap((v, e) => (v === 1 ? [e] : []));
  if (lines.length === 0) return false;
  if (g.dotEdges.some((es) => ![0, 2].includes(es.filter((e) => s.edges[e] === 1).length))) return false;
  if (!s.puzzle.clues.every((n, cell) => n === null || sides(s, cell, 1) === n)) return false;
  const seen = new Set<number>([lines[0]]);
  const stack = [lines[0]];
  while (stack.length > 0) {
    const e = stack.pop()!;
    for (const d of g.edgeDots[e]) {
      for (const f of g.dotEdges[d]) {
        if (s.edges[f] === 1 && !seen.has(f)) {
          seen.add(f);
          stack.push(f);
        }
      }
    }
  }
  return seen.size === lines.length;
}

function commit(s: GameState, move: Move): void {
  s.history.push(move);
  if (isWon(s)) s.status = 'won';
}

/** Set `edges[i]` to `values[i]` for those that differ, as one move; `false` if none differ. */
function apply(s: GameState, edges: number[], values: Edge[]): boolean {
  const changed: number[] = [];
  const before: Edge[] = [];
  edges.forEach((e, i) => {
    if (s.edges[e] === values[i] || changed.includes(e)) return;
    changed.push(e);
    before.push(s.edges[e]);
    s.edges[e] = values[i];
  });
  if (changed.length === 0) return false;
  commit(s, { edges: changed, before });
  return true;
}

/** Unknown → line → ✕ → unknown. */
export function cycle(s: GameState, edge: number): boolean {
  if (s.status === 'won') return false;
  return apply(s, [edge], [((s.edges[edge] + 1) % 3) as Edge]);
}

/** Line or unknown → ✕; ✕ → unknown. */
export function toggleCross(s: GameState, edge: number): boolean {
  if (s.status === 'won') return false;
  return apply(s, [edge], [s.edges[edge] === 2 ? 0 : 2]);
}

/** Draw lines (over ✕ too) or erase lines (✕ stay), as one move. */
export function paint(s: GameState, edges: number[], mode: PaintMode): boolean {
  if (s.status === 'won') return false;
  if (mode === 'draw') return apply(s, edges, edges.map(() => 1));
  const lines = edges.filter((e) => s.edges[e] === 1);
  return apply(s, lines, lines.map(() => 0));
}

export function undo(s: GameState): boolean {
  if (s.status === 'won') return false;
  const move = s.history.pop();
  if (!move) return false;
  move.edges.forEach((e, i) => (s.edges[e] = move.before[i]));
  return true;
}

/** Set every edge to unknown as one move. */
export function clear(s: GameState): boolean {
  if (s.status === 'won') return false;
  const edges = s.edges.flatMap((v, e) => (v !== 0 ? [e] : []));
  return apply(s, edges, edges.map(() => 0));
}

/** One char per edge: 0, 1 or 2. */
export function encode(s: GameState): string {
  return s.edges.join('');
}

/** `null` unless `text` has one 0/1/2 per edge. */
export function restore(p: Puzzle, text: string): GameState | null {
  const s = newGame(p);
  if (text.length !== s.edges.length || !/^[012]*$/.test(text)) return null;
  s.edges = [...text].map(Number) as Edge[];
  if (isWon(s)) s.status = 'won';
  return s;
}
