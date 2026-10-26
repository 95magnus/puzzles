// Queens tap / drag-to-mark input as a pure state machine. The board feeds it pointer
// events; it never sees the game. A tap cycles a cell; a drag paints ✕ (or erases ✕).

import type { Mark } from './types';

export type InputEvent =
  | { type: 'down'; cell: number; mark: Mark } // mark = current Mark of that cell
  | { type: 'move'; cell: number | null } // null = off the board
  | { type: 'up' }
  | { type: 'cancel' };

export type InputAction =
  | { kind: 'tap'; cell: number }
  | { kind: 'paint'; cells: number[]; to: 0 | 1; gesture: number };

export type InputState = { mode: 'idle' | 'pressed' | 'drag'; start: number; last: number; to: 0 | 1; gesture: number };

export const initialInput: InputState = { mode: 'idle', start: -1, last: -1, to: 1, gesture: 0 };

export function step(s: InputState, e: InputEvent): { state: InputState; action?: InputAction } {
  switch (e.type) {
    case 'down':
      return {
        state: { mode: 'pressed', start: e.cell, last: e.cell, to: e.mark === 1 ? 0 : 1, gesture: s.gesture + 1 },
      };
    case 'move': {
      if (s.mode === 'idle' || e.cell === null || e.cell === s.last) return { state: s };
      const cells = s.mode === 'pressed' ? [s.start, e.cell] : [e.cell];
      return {
        state: { ...s, mode: 'drag', last: e.cell },
        action: { kind: 'paint', cells, to: s.to, gesture: s.gesture },
      };
    }
    case 'up':
      if (s.mode === 'idle') return { state: s };
      return {
        state: { ...s, mode: 'idle' },
        action: s.mode === 'pressed' ? { kind: 'tap', cell: s.start } : undefined,
      };
    case 'cancel':
      return { state: { ...s, mode: 'idle' } };
  }
}
