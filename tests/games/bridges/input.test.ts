import { describe, expect, it } from 'vitest';
import { initialInput, islandAt, linkNear, step } from '../../../src/games/bridges/input';
import type { InputAction, InputEvent, InputState } from '../../../src/games/bridges/input';
import { CROSS } from './helpers';

function run(events: InputEvent[]): { state: InputState; actions: InputAction[][] } {
  let state = initialInput;
  const actions: InputAction[][] = [];
  for (const e of events) {
    const r = step(CROSS, state, e);
    state = r.state;
    actions.push(r.actions);
  }
  return { state, actions };
}
const down = (x: number, y: number): InputEvent => ({ type: 'down', x, y });
const move = (x: number, y: number): InputEvent => ({ type: 'move', x, y });
const up: InputEvent = { type: 'up' };
const cancel: InputEvent = { type: 'cancel' };
const flat = (a: InputAction[][]) => a.flat();

describe('islandAt and linkNear', () => {
  it('finds islands and links', () => {
    expect(islandAt(CROSS, 0.5, 0.5)).toBe(0);
    expect(islandAt(CROSS, 1.5, 0.5)).toBe(-1);
    expect(linkNear(CROSS, 1.5, 0.5)).toBe(0);
    expect(linkNear(CROSS, 2.5, 1.5)).toBe(3);
    expect(linkNear(CROSS, 3.5, 2.5)).toBe(5);
    expect(linkNear(CROSS, 1.5, 1.5)).toBe(-1);
    expect(linkNear(CROSS, 0.5, 0.5)).toBe(-1);
  });
});

describe('step', () => {
  it('a tap on a gap cycles', () => {
    expect(flat(run([down(1.5, 0.5), up]).actions)).toEqual([{ kind: 'cycle', link: 0 }]);
  });

  it('a tap off every link does nothing', () => {
    expect(flat(run([down(1.5, 1.5), up]).actions)).toEqual([]);
    expect(flat(run([down(2.5, 0.5), up]).actions)).toEqual([]);
  });

  it('a drag from an island snaps to a direction', () => {
    const r = run([down(2.5, 0.5), move(2.6, 1.1), up]);
    expect(r.actions[1]).toEqual([{ kind: 'preview', link: 3 }]);
    expect(r.actions[2]).toEqual([{ kind: 'cycle', link: 3 }, { kind: 'preview', link: -1 }]);
    expect(r.state.mode).toBe('idle');
    expect(run([down(0.5, 2.5), move(1.2, 2.4)]).actions[1]).toEqual([{ kind: 'preview', link: 5 }]);
  });

  it('dragging back, off-board and cancel add nothing', () => {
    const back = run([down(2.5, 0.5), move(2.6, 1.1), move(2.5, 0.7), up]);
    expect(back.actions[2]).toEqual([{ kind: 'preview', link: -1 }]);
    expect(back.actions[3]).toEqual([]);
    const off = run([down(2.5, 0.5), move(2.5, -0.5), up]);
    expect(flat(off.actions)).toEqual([]);
    const cancelled = run([down(2.5, 0.5), move(2.6, 1.1), cancel]);
    expect(cancelled.actions[2]).toEqual([{ kind: 'preview', link: -1 }]);
    expect(cancelled.state.mode).toBe('idle');
  });

  it('a press that slides off a gap is not a tap', () => {
    expect(flat(run([down(1.5, 0.5), move(1.5, 1.2), up]).actions)).toEqual([]);
  });

  it('ignores moves and ups while idle and previews only on change', () => {
    expect(flat(run([move(1, 1), up]).actions)).toEqual([]);
    const r = run([down(2.5, 0.5), move(2.6, 1.1), move(2.6, 1.3)]);
    expect(r.actions[2]).toEqual([]);
  });

  it('a second down clears a live preview', () => {
    const r = run([down(2.5, 0.5), move(2.6, 1.1), down(0.5, 0.5)]);
    expect(r.actions[2]).toEqual([{ kind: 'preview', link: -1 }]);
    expect(r.state.mode).toBe('pressed');
  });

  it('a tap near an island edge cycles the link on that side', () => {
    expect(flat(run([down(0.85, 0.5), up]).actions)).toEqual([{ kind: 'cycle', link: 0 }]);
    expect(flat(run([down(0.5, 0.85), up]).actions)).toEqual([{ kind: 'cycle', link: 1 }]);
    expect(flat(run([down(2.2, 0.5), up]).actions)).toEqual([{ kind: 'cycle', link: 0 }]);
  });

  it('a tap near an island centre or an edge with no link does nothing', () => {
    expect(flat(run([down(0.6, 0.55), up]).actions)).toEqual([]);
    expect(flat(run([down(0.15, 0.5), up]).actions)).toEqual([]);
    expect(flat(run([down(2.5, 0.15), up]).actions)).toEqual([]);
  });

  it('a drag from water next to an island drags from that island', () => {
    const right = run([down(1.2, 0.5), move(1.8, 0.5), up]);
    expect(right.actions[1]).toEqual([{ kind: 'preview', link: 0 }]);
    expect(right.actions[2]).toEqual([{ kind: 'cycle', link: 0 }, { kind: 'preview', link: -1 }]);
    expect(run([down(2.5, 1.2), move(2.5, 1.8)]).actions[1]).toEqual([{ kind: 'preview', link: 3 }]);
    expect(run([down(1.2, 0.5), move(1.2, 1.1)]).actions[1]).toEqual([{ kind: 'preview', link: 1 }]);
  });

  it('a water drag that comes back to where it started adds nothing', () => {
    const r = run([down(1.2, 0.5), move(1.8, 0.5), move(1.3, 0.5), up]);
    expect(r.actions[2]).toEqual([{ kind: 'preview', link: -1 }]);
    expect(r.actions[3]).toEqual([]);
  });

  it('cancel while pressed or idle, and a water drag then up, do nothing', () => {
    expect(flat(run([cancel]).actions)).toEqual([]);
    expect(flat(run([down(1.5, 0.5), cancel]).actions)).toEqual([]);
    expect(flat(run([down(1.5, 1.5), move(1.5, 2.2), up]).actions)).toEqual([]);
  });
});
