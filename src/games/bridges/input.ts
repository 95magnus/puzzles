// Bridges tap / drag input as a pure state machine. The board converts pointer positions to
// cell units (cell (r, c) spans x in [c, c+1), y in [r, r+1)) and feeds events in; off-board
// points are passed through unclamped. A tap on a gap between islands cycles that link, and so
// does a tap near an island's edge facing it. A drag from an island snaps to the link in its
// dominant direction and previews it; letting go cycles it. A drag from water next to an island
// drags from that island, its direction taken from the press. Dragging back, off the board, or
// from open water adds nothing.
// `step` returns a list of actions: a gesture that ends after showing a preview yields
// `cycle` (if any) followed by `preview -1`. Right-click is not part of the machine: the board
// calls `linkNear` on `contextmenu` and then removes the link.

import { linkFrom } from './geometry';
import type { Dir, Layout } from './types';

export const SLOP = 0.4; // cells: below this a press is a tap, at or above it a drag
export const EDGE = 0.25; // cells from an island's centre: a tap this far out picks the link on that side
export const REACH = 1; // cells from an island's centre: a drag from water this close drags from it

export type InputEvent =
  | { type: 'down'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'up' }
  | { type: 'cancel' };

export type InputAction =
  | { kind: 'cycle'; link: number }
  | { kind: 'preview'; link: number }; // -1 clears the preview

/** `link` is the link currently previewed (-1 none); `island` is the island pressed (-1 water); `near` is the island a drag from water starts from (-1 none). */
export type InputState = { mode: 'idle' | 'pressed' | 'drag'; island: number; near: number; x0: number; y0: number; link: number };

export const initialInput: InputState = { mode: 'idle', island: -1, near: -1, x0: 0, y0: 0, link: -1 };

/** The island whose cell contains the point, else -1. */
export function islandAt(p: Layout, x: number, y: number): number {
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (c < 0 || r < 0 || c >= p.size || r >= p.size) return -1;
  const cell = r * p.size + c;
  return p.islands.findIndex((i) => i.cell === cell);
}

/** The link whose inner span contains the point along its axis and whose centre line is under half a cell away; nearest wins, ties to the lower index; else -1. */
export function linkNear(p: Layout, x: number, y: number): number {
  let best = -1;
  let bestDist = 0.5;
  p.links.forEach((l, i) => {
    const first = l.inner[0];
    const last = l.inner[l.inner.length - 1];
    const along = l.horizontal ? x : y;
    const lo = l.horizontal ? first % p.size : Math.floor(first / p.size);
    const hi = (l.horizontal ? last % p.size : Math.floor(last / p.size)) + 1;
    if (along < lo || along >= hi) return;
    const line = (l.horizontal ? Math.floor(first / p.size) : first % p.size) + 0.5;
    const d = Math.abs((l.horizontal ? y : x) - line);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** The island whose centre is nearest the point and under `REACH` away; ties to the lower index; else -1. */
function islandNear(p: Layout, x: number, y: number): number {
  let best = -1;
  let bestDist = REACH;
  p.islands.forEach((isl, i) => {
    const d = Math.hypot(x - ((isl.cell % p.size) + 0.5), y - (Math.floor(isl.cell / p.size) + 0.5));
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** The link leaving `island` in the dominant direction from (ox, oy) to (x, y), or -1 when under `min` away. */
function linkToward(p: Layout, island: number, ox: number, oy: number, x: number, y: number, min: number): number {
  const dx = x - ox;
  const dy = y - oy;
  if (Math.hypot(dx, dy) < min) return -1;
  const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  return linkFrom(p, island, dir);
}

function centre(p: Layout, island: number): [number, number] {
  const cell = p.islands[island].cell;
  return [(cell % p.size) + 0.5, Math.floor(cell / p.size) + 0.5];
}

function previewOf(p: Layout, s: InputState, x: number, y: number): number {
  if (s.island >= 0) return linkToward(p, s.island, ...centre(p, s.island), x, y, SLOP);
  return s.near >= 0 ? linkToward(p, s.near, s.x0, s.y0, x, y, SLOP) : -1;
}

export function step(p: Layout, s: InputState, e: InputEvent): { state: InputState; actions: InputAction[] } {
  const clear: InputAction[] = s.mode === 'drag' && s.link >= 0 ? [{ kind: 'preview', link: -1 }] : [];
  switch (e.type) {
    case 'down': {
      const island = islandAt(p, e.x, e.y);
      const near = island < 0 ? islandNear(p, e.x, e.y) : -1;
      return { state: { mode: 'pressed', island, near, x0: e.x, y0: e.y, link: -1 }, actions: clear };
    }
    case 'move': {
      if (s.mode === 'idle') return { state: s, actions: [] };
      if (s.mode === 'pressed' && Math.hypot(e.x - s.x0, e.y - s.y0) < SLOP) return { state: s, actions: [] };
      const link = previewOf(p, s, e.x, e.y);
      return {
        state: { ...s, mode: 'drag', link },
        actions: link === s.link ? [] : [{ kind: 'preview', link }],
      };
    }
    case 'up': {
      if (s.mode === 'idle') return { state: s, actions: [] };
      const state = { ...initialInput };
      if (s.mode === 'pressed') {
        const link =
          s.island < 0 ? linkNear(p, s.x0, s.y0) : linkToward(p, s.island, ...centre(p, s.island), s.x0, s.y0, EDGE);
        return { state, actions: link >= 0 ? [{ kind: 'cycle', link }] : [] };
      }
      return { state, actions: s.link >= 0 ? [{ kind: 'cycle', link: s.link }, ...clear] : [] };
    }
    case 'cancel':
      return { state: { ...initialInput }, actions: clear };
  }
}
