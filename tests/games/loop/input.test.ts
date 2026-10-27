import { describe, expect, it } from 'vitest';
import { hEdge, vEdge } from '../../../src/games/loop/geometry';
import { DRAG_SLOP, dotAt, edgeNear, initialInput, nearestDot, step, walk } from '../../../src/games/loop/input';
import type { InputAction, InputEvent, InputState } from '../../../src/games/loop/input';
import type { Edge } from '../../../src/games/loop/types';

const N = 4;
const W = N + 1;
const dot = (r: number, c: number) => r * W + c;
const h = (r: number, c: number) => hEdge(N, r, c);
const v = (r: number, c: number) => vEdge(N, r, c);
const down = (x: number, y: number): InputEvent => ({ type: 'down', x, y });
const move = (x: number, y: number): InputEvent => ({ type: 'move', x, y });
const up: InputEvent = { type: 'up' };
const cancel: InputEvent = { type: 'cancel' };

function run(events: InputEvent[], lines: number[] = []): { state: InputState; actions: InputAction[][] } {
  const edgeState = (e: number): Edge => (lines.includes(e) ? 1 : 0);
  let state = initialInput;
  const actions: InputAction[][] = [];
  for (const e of events) {
    const r = step(N, edgeState, state, e);
    state = r.state;
    actions.push(r.actions);
  }
  return { state, actions };
}

describe('hit testing', () => {
  it('edgeNear picks the nearest midpoint within half a cell', () => {
    expect(edgeNear(N, 0.5, 0.1)).toBe(h(0, 0));
    expect(edgeNear(N, 0.1, 0.5)).toBe(v(0, 0));
    expect(edgeNear(N, -0.9, -0.9)).toBe(-1);
  });
  it('a tap above the top border edge still picks it', () => {
    expect(edgeNear(N, 0.5, -0.3)).toBe(h(0, 0));
  });
  it('a cell centre or a dot is ambiguous and picks no edge', () => {
    expect(edgeNear(N, 0.5, 0.5)).toBe(-1);
    expect(edgeNear(N, 1, 1)).toBe(-1);
  });
  it('dotAt needs the point within 0.35 of a dot', () => {
    expect(dotAt(N, 1.2, 2.1)).toBe(dot(2, 1));
    expect(dotAt(N, 1.5, 1.5)).toBe(-1);
  });
  it('nearestDot rounds and clamps to the grid', () => {
    expect(nearestDot(N, 1.4, 2.6)).toBe(dot(3, 1));
    expect(nearestDot(N, -0.4, 9)).toBe(dot(N, 0));
  });
  it('walk goes along the row, then down the column', () => {
    expect(walk(N, dot(0, 0), dot(1, 2))).toEqual([h(0, 0), h(0, 1), v(0, 2)]);
    expect(walk(N, dot(1, 2), dot(0, 0))).toEqual([h(1, 1), h(1, 0), v(0, 0)]);
    expect(walk(N, dot(2, 2), dot(2, 2))).toEqual([]);
  });
});

describe('tap', () => {
  it('down and up without crossing cycles the edge under the pointer', () => {
    const { actions, state } = run([down(0.5, 0.1), up]);
    expect(actions.flat()).toEqual([{ kind: 'cycle', edge: h(0, 0) }]);
    expect(state).toEqual(initialInput);
  });
  it('uses the last point and ignores a tap on nothing', () => {
    expect(run([down(0.5, 0.1), move(1.5, 0.2), up]).actions.flat()).toEqual([{ kind: 'cycle', edge: h(0, 1) }]);
    expect(run([down(-0.9, -0.9), up]).actions.flat()).toEqual([]);
  });
});

describe('drag', () => {
  it('a drift of 0.2 cell toward a dot is still a tap', () => {
    // edge midpoint (0.5, 0); drift to (0.3, 0) is within 0.35 of dot (0,0) but under DRAG_SLOP
    const { actions } = run([down(0.5, 0), move(0.3, 0), up]);
    expect(actions.flat()).toEqual([{ kind: 'cycle', edge: h(0, 0) }]);
    expect(actions.flat().some((a) => a.kind === 'paint')).toBe(false);
    expect(DRAG_SLOP).toBe(0.25);
  });
  it('a drag across dots still paints after moving past the slop', () => {
    const { actions } = run([down(0.5, 0), move(0.3, 0), move(0, 0), up]);
    expect(actions.flat().filter((a) => a.kind === 'paint')).toEqual([
      { kind: 'paint', edges: [h(0, 0)], mode: 'draw' },
    ]);
  });
  it('draws over unknown edges and commits on up', () => {
    const { actions } = run([down(0.05, 0), move(1, 0), move(2, 0), up]);
    expect(actions[2]).toEqual([{ kind: 'preview', edges: [h(0, 0), h(0, 1)], mode: 'draw' }]);
    expect(actions[3]).toEqual([{ kind: 'paint', edges: [h(0, 0), h(0, 1)], mode: 'draw' }]);
  });
  it('erases when the first crossed edge is a line', () => {
    const { actions } = run([down(0, 0), move(1, 0), move(2, 0), up], [h(0, 0)]);
    expect(actions[3]).toEqual([{ kind: 'paint', edges: [h(0, 0), h(0, 1)], mode: 'erase' }]);
  });
  it('walks dot by dot on a jump', () => {
    const { actions } = run([down(0, 0), move(2, 1), up]);
    expect(actions[2]).toEqual([{ kind: 'paint', edges: [h(0, 0), h(0, 1), v(0, 2)], mode: 'draw' }]);
  });
  it('reversal does not repeat edges', () => {
    const { actions } = run([down(0, 0), move(2, 0), move(1, 0), up]);
    expect(actions[3]).toEqual([{ kind: 'paint', edges: [h(0, 0), h(0, 1)], mode: 'draw' }]);
  });
  it('moves that stay off a new dot do nothing', () => {
    const { actions, state } = run([down(0, 0), move(0.5, 0.5)]);
    expect(actions[1]).toEqual([]);
    expect(state.mode).toBe('pressed');
  });
  it('cancel mid-drag paints what was crossed; cancel while pressed emits nothing', () => {
    expect(run([down(0, 0), move(1, 0), cancel]).actions[2]).toEqual([
      { kind: 'paint', edges: [h(0, 0)], mode: 'draw' },
    ]);
    const r = run([down(0, 0), cancel]);
    expect(r.actions[1]).toEqual([]);
    expect(r.state).toEqual(initialInput);
  });
  it('idle events do nothing', () => {
    expect(run([move(1, 1), up, cancel]).actions.flat()).toEqual([]);
  });
});
