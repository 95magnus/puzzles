// Patches tap / drag-to-draw input as a pure state machine. The board resolves pointer
// positions to cells and feeds events in; it never sees the game. A tap selects a cell;
// a drag previews, then draws, the rectangle spanned by the start and the current cell.

import { normalize } from './rect';
import type { Rect } from './types';

export type InputEvent =
  | { type: 'down'; cell: number }
  | { type: 'move'; cell: number | null } // null = off the board
  | { type: 'up' }
  | { type: 'cancel' };

export type InputAction =
  | { kind: 'tap'; cell: number }
  | { kind: 'preview'; rect: Rect | null } // null clears the preview
  | { kind: 'draw'; rect: Rect };

export type InputState = { mode: 'idle' | 'pressed' | 'drag'; start: number; last: number };

export const initialInput: InputState = { mode: 'idle', start: -1, last: -1 };

const IDLE = (s: InputState): InputState => ({ ...s, mode: 'idle' });

export function step(size: number, s: InputState, e: InputEvent): { state: InputState; action?: InputAction } {
  switch (e.type) {
    case 'down':
      return { state: { mode: 'pressed', start: e.cell, last: e.cell } };
    case 'move':
      if (s.mode === 'idle') return { state: s };
      // Leaving the board abandons the gesture.
      if (e.cell === null) return { state: IDLE(s), action: { kind: 'preview', rect: null } };
      if (e.cell === s.last) return { state: s };
      return {
        state: { ...s, mode: 'drag', last: e.cell },
        action: { kind: 'preview', rect: normalize(size, s.start, e.cell) },
      };
    case 'up':
      if (s.mode === 'idle') return { state: s };
      return {
        state: IDLE(s),
        action:
          s.mode === 'pressed'
            ? { kind: 'tap', cell: s.start }
            : { kind: 'draw', rect: normalize(size, s.start, s.last) },
      };
    case 'cancel':
      return {
        state: IDLE(s),
        action: s.mode === 'drag' ? { kind: 'preview', rect: null } : undefined,
      };
  }
}
