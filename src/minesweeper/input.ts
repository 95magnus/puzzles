// Classic Minesweeper mouse handling as a pure state machine. The board feeds it DOM
// pointer events; it never sees the game. Pointer Events report a second button pressed
// (or one of two released) as a *move*, so transitions come from the `buttons` bitmask
// on every event, not from the event type.

export type InputEvent =
  | { type: 'down' | 'move' | 'up'; pointer: 'mouse' | 'touch'; buttons: number; cell: number /* -1 = off board */ }
  /** Fired by the board 350 ms after a touch down. */
  | { type: 'longpress' }
  /** pointercancel, lostpointercapture, window blur. */
  | { type: 'cancel' };

/** 'tap' is a touch tap: the app chords on revealed cells and reveals otherwise. */
export type InputAction = { kind: 'reveal' | 'flag' | 'chord' | 'tap'; cell: number };
export type Preview = { cell: number; chord: boolean } | null;

export type InputState = {
  mode: 'idle' | 'left' | 'right' | 'chord' | 'waitAllUp' | 'touch';
  cell: number;
  buttons: number;
  longFired: boolean;
};

export type StepResult = { state: InputState; action?: InputAction; preview: Preview };

const LEFT = 1;
const RIGHT = 2;
const BOTH = LEFT | RIGHT;

export const initialInput: InputState = { mode: 'idle', cell: -1, buttons: 0, longFired: false };

const idle = (): StepResult => ({ state: initialInput, preview: null });

function at(mode: InputState['mode'], cell: number, buttons: number, preview: Preview, action?: InputAction): StepResult {
  return { state: { mode, cell, buttons, longFired: false }, preview, action };
}

function single(cell: number): Preview {
  return cell >= 0 ? { cell, chord: false } : null;
}

function chordPreview(cell: number): Preview {
  return cell >= 0 ? { cell, chord: true } : null;
}

function touchStep(s: InputState, e: InputEvent): StepResult {
  if (e.type === 'longpress') {
    if (s.mode !== 'touch' || s.longFired || s.cell < 0) return { state: s, preview: null };
    return { state: { ...s, longFired: true }, preview: null, action: { kind: 'flag', cell: s.cell } };
  }
  if (e.type === 'cancel') return idle();
  if (e.type === 'down') return at('touch', e.cell, 0, single(e.cell));
  if (s.mode !== 'touch') return idle();
  if (e.type === 'move') {
    if (e.cell === s.cell) return { state: s, preview: s.longFired ? null : single(s.cell) };
    return idle();
  }
  // up
  if (!s.longFired && e.cell === s.cell && e.cell >= 0) return { ...idle(), action: { kind: 'tap', cell: e.cell } };
  return idle();
}

function fromIdle(buttons: number, cell: number): StepResult {
  if (buttons === LEFT) return at('left', cell, buttons, single(cell));
  if (buttons === RIGHT) return at('right', cell, buttons, null, cell >= 0 ? { kind: 'flag', cell } : undefined);
  if (buttons === BOTH) return at('chord', cell, buttons, chordPreview(cell));
  return idle();
}

export function step(s: InputState, e: InputEvent): StepResult {
  if (e.type === 'cancel') return idle();
  if (e.type === 'longpress' || s.mode === 'touch' || e.pointer === 'touch') {
    return touchStep(s, e);
  }

  const now = e.buttons & BOTH;
  const { cell } = e;
  // A fresh down means any earlier gesture lost its up: start over.
  if (e.type === 'down' || s.mode === 'idle') return fromIdle(now, cell);

  switch (s.mode) {
    case 'left':
      if (now === LEFT) return at('left', cell, now, single(cell));
      if (now === BOTH) return at('chord', cell, now, chordPreview(cell));
      if (now === 0 && e.type === 'up' && cell >= 0) return { ...idle(), action: { kind: 'reveal', cell } };
      if (now === 0) return idle(); // released off board, or the up was lost
      return at('waitAllUp', cell, now, null);
    case 'right':
      if (now === RIGHT) return at('right', cell, now, null);
      if (now === BOTH) return at('chord', cell, now, chordPreview(cell));
      if (now === 0) return idle();
      return at('waitAllUp', cell, now, null);
    case 'chord': {
      if (now === BOTH) return at('chord', cell, now, chordPreview(cell));
      // Both bits gone in a single move: the ups were lost outside the window.
      if (now === 0 && e.type === 'move') return idle();
      const action: InputAction | undefined = cell >= 0 ? { kind: 'chord', cell } : undefined;
      return now === 0 ? { ...idle(), action } : at('waitAllUp', cell, now, null, action);
    }
    case 'waitAllUp':
      return now === 0 ? idle() : at('waitAllUp', cell, now, null);
  }
  return idle();
}
