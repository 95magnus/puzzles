import { blockersOf, buildOcc, exitLine } from './solver';
import type { GameState, Level, Status, TapResult } from './types';

// `tap` mutates the state in place; the result describes what happened so the
// renderer can animate it. Animation timing is not this module's concern.

export const MAX_LIVES = 3;

export function newGame(level: Level): GameState {
  const alive = new Uint8Array(level.arrows.length).fill(1);
  return {
    level,
    alive,
    occ: buildOcc(level, alive),
    lives: MAX_LIVES,
    status: level.arrows.length === 0 ? 'won' : 'playing',
    left: level.arrows.length,
  };
}

export function tap(s: GameState, cell: number): TapResult {
  if (s.status !== 'playing') return { kind: 'ignored' };
  const arrow = s.occ[cell];
  if (arrow === undefined || arrow < 0) return { kind: 'ignored' };

  const line = exitLine(s.level, arrow);
  const blockers = blockersOf(s.level, s.occ, arrow);
  if (blockers.length === 0) {
    s.alive[arrow] = 0;
    for (const c of s.level.arrows[arrow].cells) s.occ[c] = -1;
    s.left--;
    if (s.left === 0) s.status = 'won';
    return { kind: 'exit', arrow, distance: line.length };
  }

  let distance = 0;
  while (s.occ[line[distance]] < 0) distance++;
  s.lives--;
  if (s.lives === 0) s.status = 'lost';
  return { kind: 'bump', arrow, blocker: blockers[0], distance };
}

/** `'1'` per arrow still on the board, `'0'` per removed arrow. */
export function encode(s: GameState): string {
  return Array.from(s.alive, (a) => (a ? '1' : '0')).join('');
}

export function restore(level: Level, removed: string, lives: number): GameState | null {
  if (removed.length !== level.arrows.length || !/^[01]*$/.test(removed)) return null;
  if (!Number.isInteger(lives) || lives < 0 || lives > MAX_LIVES) return null;
  const alive = Uint8Array.from(removed, (ch) => (ch === '1' ? 1 : 0));
  let left = 0;
  for (const a of alive) left += a;
  const status: Status = left === 0 ? 'won' : lives === 0 ? 'lost' : 'playing';
  return { level, alive, occ: buildOcc(level, alive), lives, status, left };
}
