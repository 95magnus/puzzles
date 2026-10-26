import { expect, test } from 'vitest';
import { initialInput, step, type InputAction, type InputEvent, type InputState } from '../../../src/games/queens/input';
import type { Mark } from '../../../src/games/queens/types';

const down = (cell: number, mark: Mark): InputEvent => ({ type: 'down', cell, mark });
const move = (cell: number | null): InputEvent => ({ type: 'move', cell });
const up: InputEvent = { type: 'up' };

function run(events: InputEvent[]) {
  let state: InputState = initialInput;
  const actions: (InputAction | undefined)[] = [];
  for (const e of events) {
    const r = step(state, e);
    state = r.state;
    actions.push(r.action);
  }
  return { state, actions };
}

test('tap', () => {
  expect(run([down(3, 0), up]).actions).toEqual([undefined, { kind: 'tap', cell: 3 }]);
});

test('drag paints ✕ from an empty start', () => {
  const { state, actions } = run([down(3, 0), move(4), move(5), up]);
  const g = actions[1]!.kind === 'paint' ? (actions[1] as { gesture: number }).gesture : -1;
  expect(actions[1]).toEqual({ kind: 'paint', cells: [3, 4], to: 1, gesture: g });
  expect(actions[2]).toEqual({ kind: 'paint', cells: [5], to: 1, gesture: g });
  expect(actions[3]).toBeUndefined();
  expect(state.mode).toBe('idle');
});

test('drag erases from a ✕ start', () => {
  const a = run([down(3, 1), move(4)]).actions[1];
  expect(a).toMatchObject({ kind: 'paint', to: 0 });
});

test('drag from a queen paints ✕', () => {
  const a = run([down(3, 2), move(4)]).actions[1];
  expect(a).toMatchObject({ kind: 'paint', cells: [3, 4], to: 1 });
});

test('re-entering the start cell keeps the drag', () => {
  const { state, actions } = run([down(3, 0), move(4), move(3)]);
  expect(actions[2]).toMatchObject({ kind: 'paint', cells: [3] });
  expect(state.mode).toBe('drag');
});

test('move off the board is ignored; up ends the drag without a tap', () => {
  const r1 = run([down(3, 0), move(null)]);
  expect(r1.actions[1]).toBeUndefined();
  expect(r1.state.mode).toBe('pressed');
  const r2 = run([down(3, 0), move(null), move(4), move(null), up]);
  expect(r2.actions[2]).toMatchObject({ kind: 'paint' });
  expect(r2.actions[3]).toBeUndefined();
  expect(r2.actions[4]).toBeUndefined();
  expect(r2.state.mode).toBe('idle');
});

test('each gesture gets a new id', () => {
  let s = step(initialInput, down(1, 0)).state;
  const g1 = s.gesture;
  s = step(s, up).state;
  s = step(s, down(1, 0)).state;
  expect(s.gesture).not.toBe(g1);
});

test('cancel drops the gesture', () => {
  const r = run([down(3, 0), move(4), { type: 'cancel' }, up]);
  expect(r.actions[2]).toBeUndefined();
  expect(r.actions[3]).toBeUndefined();
  expect(r.state.mode).toBe('idle');
});
