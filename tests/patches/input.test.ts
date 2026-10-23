import { expect, test } from 'vitest';
import { initialInput, step, type InputAction, type InputEvent, type InputState } from '../../src/patches/input';

const SIZE = 4;
const down = (cell: number): InputEvent => ({ type: 'down', cell });
const move = (cell: number | null): InputEvent => ({ type: 'move', cell });
const up: InputEvent = { type: 'up' };
const cancel: InputEvent = { type: 'cancel' };

function run(events: InputEvent[]) {
  let state: InputState = initialInput;
  const actions: (InputAction | undefined)[] = [];
  for (const e of events) {
    const r = step(SIZE, state, e);
    state = r.state;
    actions.push(r.action);
  }
  return { state, actions };
}

test('tap', () => {
  const { state, actions } = run([down(5), up]);
  expect(actions).toEqual([undefined, { kind: 'tap', cell: 5 }]);
  expect(state.mode).toBe('idle');
});

test('drag previews then draws', () => {
  const { state, actions } = run([down(0), move(1), move(5), up]);
  expect(actions[1]).toEqual({ kind: 'preview', rect: { r: 0, c: 0, w: 2, h: 1 } });
  expect(actions[2]).toEqual({ kind: 'preview', rect: { r: 0, c: 0, w: 2, h: 2 } });
  expect(actions[3]).toEqual({ kind: 'draw', rect: { r: 0, c: 0, w: 2, h: 2 } });
  expect(state.mode).toBe('idle');
});

test('drag up-left normalizes', () => {
  const { actions } = run([down(10), move(5)]);
  expect(actions[1]).toEqual({ kind: 'preview', rect: { r: 1, c: 1, w: 2, h: 2 } });
});

test('moving within the start cell or the same cell again does nothing', () => {
  const r = run([down(0), move(0), move(1), move(1)]);
  expect(r.actions[1]).toBeUndefined();
  expect(r.actions[3]).toBeUndefined();
  expect(r.state.mode).toBe('drag');
});

test('re-entering the start cell keeps the drag', () => {
  const { state, actions } = run([down(0), move(1), move(0), up]);
  expect(actions[2]).toEqual({ kind: 'preview', rect: { r: 0, c: 0, w: 1, h: 1 } });
  expect(actions[3]).toEqual({ kind: 'draw', rect: { r: 0, c: 0, w: 1, h: 1 } });
  expect(state.mode).toBe('idle');
});

test('leaving the board cancels', () => {
  const { state, actions } = run([down(0), move(1), move(null), up]);
  expect(actions[2]).toEqual({ kind: 'preview', rect: null });
  expect(actions[3]).toBeUndefined();
  expect(state.mode).toBe('idle');
});

test('leaving the board while only pressed cancels the tap', () => {
  const { state, actions } = run([down(0), move(null), up]);
  expect(actions[1]).toEqual({ kind: 'preview', rect: null });
  expect(actions[2]).toBeUndefined();
  expect(state.mode).toBe('idle');
});

test('cancel drops the gesture', () => {
  const { state, actions } = run([down(0), move(1), cancel, up]);
  expect(actions[2]).toEqual({ kind: 'preview', rect: null });
  expect(actions[3]).toBeUndefined();
  expect(state.mode).toBe('idle');
});

test('cancel while only pressed has no action', () => {
  const { state, actions } = run([down(0), cancel, up]);
  expect(actions).toEqual([undefined, undefined, undefined]);
  expect(state.mode).toBe('idle');
});

test('events while idle are ignored', () => {
  const { state, actions } = run([move(3), up, cancel, move(null)]);
  expect(actions).toEqual([undefined, undefined, undefined, undefined]);
  expect(state).toEqual(initialInput);
});

test('a new gesture after a drag starts clean', () => {
  const { actions } = run([down(0), move(1), up, down(7), up]);
  expect(actions[4]).toEqual({ kind: 'tap', cell: 7 });
});
