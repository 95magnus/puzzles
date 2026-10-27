// Loop tap / drag input as a pure state machine. The board converts pointer positions to dot
// units (dot (r, c) is at x = c, y = r) and feeds events in; points outside the grid are passed
// through unclamped. A tap (up without having crossed an edge) cycles the edge nearest the last
// point. A drag starts on the dot nearest the press; whenever the pointer lands on a different
// dot it walks there dot by dot (along the row, then down the column), crossing each edge. The
// first crossed edge fixes the mode for the whole drag (a line erases, anything else draws);
// edges are de-duplicated in first-crossing order.
// `step` returns actions: `preview` (all edges crossed so far, for live rendering) on each
// crossing, and `paint` (the same list, committed) when the drag ends by `up` or `cancel`.
// Right-click is not part of the machine: the board handles `contextmenu` itself.

import { geometry, hEdge, vEdge } from './geometry';
import type { Edge, PaintMode } from './types';

export const DOT_R = 0.35; // dot units: a point this close to a dot is on it
export const EDGE_R = 0.5; // dot units: a tap this close to an edge midpoint picks that edge

export type InputEvent =
  | { type: 'down' | 'move'; x: number; y: number }
  | { type: 'up' }
  | { type: 'cancel' };

/** `dot` is the current dot; (`x`, `y`) the last point seen; `edges` those crossed so far; `paint` the mode once fixed. */
export type InputState = {
  mode: 'idle' | 'pressed' | 'drag';
  dot: number;
  x: number;
  y: number;
  edges: number[];
  paint: PaintMode | null;
};

export const initialInput: InputState = { mode: 'idle', dot: -1, x: 0, y: 0, edges: [], paint: null };

export type InputAction =
  | { kind: 'cycle'; edge: number }
  | { kind: 'preview'; edges: number[]; mode: PaintMode }
  | { kind: 'paint'; edges: number[]; mode: PaintMode };

/** The edge whose midpoint is nearest the point and within `EDGE_R`; ties to the lower index; else -1. */
export function edgeNear(size: number, x: number, y: number): number {
  let best = -1;
  let bestDist = EDGE_R;
  geometry(size).mid.forEach((m, e) => {
    const d = Math.hypot(x - m.x, y - m.y);
    if (d <= bestDist && (best < 0 || d < bestDist)) {
      best = e;
      bestDist = d;
    }
  });
  return best;
}

/** The dot the point is on (within `DOT_R`), else -1. */
export function dotAt(size: number, x: number, y: number): number {
  const c = Math.round(x);
  const r = Math.round(y);
  if (c < 0 || r < 0 || c > size || r > size || Math.hypot(x - c, y - r) > DOT_R) return -1;
  return r * (size + 1) + c;
}

/** The dot nearest the point, clamped to the grid. */
export function nearestDot(size: number, x: number, y: number): number {
  const c = Math.min(size, Math.max(0, Math.round(x)));
  const r = Math.min(size, Math.max(0, Math.round(y)));
  return r * (size + 1) + c;
}

/** The edges crossed going from dot `from` to dot `to`: along the row first, then down or up the column. */
export function walk(size: number, from: number, to: number): number[] {
  const w = size + 1;
  const out: number[] = [];
  const r1 = Math.floor(from / w);
  const r2 = Math.floor(to / w);
  const c2 = to % w;
  let c = from % w;
  const sc = Math.sign(c2 - c);
  while (c !== c2) {
    out.push(hEdge(size, r1, sc > 0 ? c : c - 1));
    c += sc;
  }
  let r = r1;
  const sr = Math.sign(r2 - r);
  while (r !== r2) {
    out.push(vEdge(size, sr > 0 ? r : r - 1, c2));
    r += sr;
  }
  return out;
}

export function step(
  size: number,
  edgeState: (e: number) => Edge,
  s: InputState,
  ev: InputEvent,
): { state: InputState; actions: InputAction[] } {
  switch (ev.type) {
    case 'down':
      return {
        state: { mode: 'pressed', dot: nearestDot(size, ev.x, ev.y), x: ev.x, y: ev.y, edges: [], paint: null },
        actions: [],
      };
    case 'move': {
      if (s.mode === 'idle') return { state: s, actions: [] };
      const to = dotAt(size, ev.x, ev.y);
      if (to < 0 || to === s.dot) return { state: { ...s, x: ev.x, y: ev.y }, actions: [] };
      const crossed = walk(size, s.dot, to);
      const paint: PaintMode = s.paint ?? (edgeState(crossed[0]) === 1 ? 'erase' : 'draw');
      const edges = [...s.edges];
      for (const e of crossed) if (!edges.includes(e)) edges.push(e);
      return {
        state: { mode: 'drag', dot: to, x: ev.x, y: ev.y, edges, paint },
        actions: [{ kind: 'preview', edges, mode: paint }],
      };
    }
    case 'up':
    case 'cancel': {
      if (s.mode === 'idle') return { state: s, actions: [] };
      const state = { ...initialInput };
      if (s.mode === 'drag' && s.paint) return { state, actions: [{ kind: 'paint', edges: s.edges, mode: s.paint }] };
      if (ev.type === 'cancel') return { state, actions: [] };
      const edge = edgeNear(size, s.x, s.y);
      return { state, actions: edge >= 0 ? [{ kind: 'cycle', edge }] : [] };
    }
  }
}
