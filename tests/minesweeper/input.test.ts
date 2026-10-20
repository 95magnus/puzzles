import { expect, test } from 'vitest';
import { initialInput, step, type InputAction, type InputEvent, type Preview } from '../../src/minesweeper/input';

const down = (buttons: number, cell: number): InputEvent => ({ type: 'down', pointer: 'mouse', buttons, cell });
const move = (buttons: number, cell: number): InputEvent => ({ type: 'move', pointer: 'mouse', buttons, cell });
const up = (buttons: number, cell: number): InputEvent => ({ type: 'up', pointer: 'mouse', buttons, cell });
const tDown = (cell: number): InputEvent => ({ type: 'down', pointer: 'touch', buttons: 1, cell });
const tMove = (cell: number): InputEvent => ({ type: 'move', pointer: 'touch', buttons: 1, cell });
const tUp = (cell: number): InputEvent => ({ type: 'up', pointer: 'touch', buttons: 0, cell });

function run(events: InputEvent[]) {
  let state = initialInput;
  const actions: InputAction[] = [];
  const previews: Preview[] = [];
  for (const e of events) {
    const r = step(state, e);
    state = r.state;
    if (r.action) actions.push(r.action);
    previews.push(r.preview);
  }
  return { actions, previews, lastPreview: previews[previews.length - 1], state };
}

test('left press previews, release reveals', () => {
  const r = run([down(1, 5)]);
  expect(r.lastPreview).toEqual({ cell: 5, chord: false });
  expect(r.actions).toEqual([]);
  const r2 = run([down(1, 5), up(0, 5)]);
  expect(r2.actions).toEqual([{ kind: 'reveal', cell: 5 }]);
  expect(r2.lastPreview).toBeNull();
  expect(r2.state.mode).toBe('idle');
});

test('left drag moves the preview; release off board does nothing', () => {
  const r = run([down(1, 5), move(1, 6)]);
  expect(r.lastPreview).toEqual({ cell: 6, chord: false });
  const r2 = run([down(1, 5), move(1, 6), up(0, 6)]);
  expect(r2.actions).toEqual([{ kind: 'reveal', cell: 6 }]);
  const r3 = run([down(1, 5), move(1, -1), up(0, -1)]);
  expect(r3.previews[1]).toBeNull();
  expect(r3.actions).toEqual([]);
  expect(r3.state.mode).toBe('idle');
});

test('right press flags immediately; release does nothing', () => {
  const r = run([down(2, 7)]);
  expect(r.actions).toEqual([{ kind: 'flag', cell: 7 }]);
  expect(r.lastPreview).toBeNull();
  const r2 = run([down(2, 7), move(2, 8), up(0, 8)]);
  expect(r2.actions).toEqual([{ kind: 'flag', cell: 7 }]);
  expect(r2.state.mode).toBe('idle');
});

test('right press off board does nothing', () => {
  expect(run([down(2, -1)]).actions).toEqual([]);
});

test('left then right (right arrives as move) => chord preview, release either => one chord', () => {
  const r = run([down(1, 5), move(3, 5)]);
  expect(r.lastPreview).toEqual({ cell: 5, chord: true });
  // releasing one of two buttons arrives as a move...
  expect(run([down(1, 5), move(3, 5), move(2, 5), up(0, 5)]).actions).toEqual([{ kind: 'chord', cell: 5 }]);
  // ...or, in some browsers, as an up
  expect(run([down(1, 5), move(3, 5), up(1, 5), up(0, 5)]).actions).toEqual([{ kind: 'chord', cell: 5 }]);
});

test('chord preview follows the pointer and fires on the cell under it', () => {
  const r = run([down(1, 5), move(3, 5), move(3, 9), move(1, 9), up(0, 9)]);
  expect(r.previews[2]).toEqual({ cell: 9, chord: true });
  expect(r.actions).toEqual([{ kind: 'chord', cell: 9 }]);
});

test('right then left => one flag (from the first right press) then chord, no reveal', () => {
  const r = run([down(2, 5), move(3, 5), move(1, 5), up(0, 5)]);
  expect(r.actions).toEqual([
    { kind: 'flag', cell: 5 },
    { kind: 'chord', cell: 5 },
  ]);
});

test('both buttons in the same event start a chord', () => {
  expect(run([down(3, 4), up(0, 4)]).actions).toEqual([{ kind: 'chord', cell: 4 }]);
});

test('after a chord, re-pressing a button before all are up does nothing', () => {
  const r = run([down(1, 5), move(3, 5), move(1, 5), move(3, 5), move(2, 5), up(0, 5)]);
  expect(r.actions).toEqual([{ kind: 'chord', cell: 5 }]);
  expect(r.previews.slice(2)).toEqual([null, null, null, null]);
  expect(r.state.mode).toBe('idle');
});

// Review Focus 4
test('chord released off board => no action, idle after all up', () => {
  const r = run([down(1, 5), move(3, 5), move(3, -1), move(1, -1), up(0, -1)]);
  expect(r.previews[2]).toBeNull();
  expect(r.actions).toEqual([]);
  expect(r.state.mode).toBe('idle');
});

// Review Focus 1
test('lost mouseup: a move with no buttons returns to idle without acting', () => {
  expect(run([down(1, 5), move(0, 6)])).toMatchObject({ actions: [], lastPreview: null, state: { mode: 'idle' } });
  expect(run([down(1, 5), move(3, 5), move(0, 5)])).toMatchObject({ actions: [], state: { mode: 'idle' } });
});

test('lost mouseup: a fresh down starts over from idle', () => {
  expect(run([down(1, 5), down(1, 6), up(0, 6)]).actions).toEqual([{ kind: 'reveal', cell: 6 }]);
});

test('cancel resets from any mode without acting', () => {
  for (const pre of [[down(1, 5)], [down(2, 5)], [down(1, 5), move(3, 5)], [tDown(5)]]) {
    const r = run([...pre, { type: 'cancel' }]);
    expect(r.state.mode).toBe('idle');
    expect(r.lastPreview).toBeNull();
    expect(r.actions.filter((a) => a.kind !== 'flag')).toEqual([]);
  }
});

test('touch tap => tap', () => {
  const r = run([tDown(3), tUp(3)]);
  expect(r.previews[0]).toEqual({ cell: 3, chord: false });
  expect(r.actions).toEqual([{ kind: 'tap', cell: 3 }]);
});

test('touch long press => flag, and no tap on release', () => {
  const r = run([tDown(3), { type: 'longpress' }, tUp(3)]);
  expect(r.actions).toEqual([{ kind: 'flag', cell: 3 }]);
  expect(r.state.mode).toBe('idle');
});

test('touch move to another cell cancels', () => {
  const r = run([tDown(3), tMove(4), { type: 'longpress' }, tUp(4)]);
  expect(r.actions).toEqual([]);
  expect(r.state.mode).toBe('idle');
});

test('longpress outside a touch is ignored', () => {
  expect(run([down(1, 3), { type: 'longpress' }, up(0, 3)]).actions).toEqual([{ kind: 'reveal', cell: 3 }]);
});
