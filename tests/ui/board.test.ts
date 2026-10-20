// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cellFromPoint, createBoard, type BoardHandle } from '../../src/ui/board';
import { GLYPHS } from '../../src/ui/palette';
import { newGame, restore, type GameState } from '../../src/core/game';
import { P5x5_solution, P5x5_unique } from '../fixtures';

// 5x5 board laid out at 0,0 with 100px cells: center of (r,c) = (c*100+50, r*100+50)
const RECT = { left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500, x: 0, y: 0 };
const at = (r: number, c: number) => ({ clientX: c * 100 + 50, clientY: r * 100 + 50 });

let el: HTMLElement;
let board: BoardHandle;
let onChange: ReturnType<typeof vi.fn<(s: GameState, kind: 'move' | 'gesture-end') => void>>;
let rafQueue: FrameRequestCallback[];

function svg(): SVGSVGElement {
  return el.querySelector('svg')!;
}

function fire(type: string, init: { clientX?: number; clientY?: number; pointerId?: number; button?: number } = {}) {
  const opts = { bubbles: true, cancelable: true, clientX: 0, clientY: 0, button: 0, ...init };
  const Ctor = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const ev = type === 'contextmenu' ? new MouseEvent(type, opts) : new Ctor(type, opts);
  if (!('pointerId' in ev) || (ev as PointerEvent).pointerId !== (init.pointerId ?? 1)) {
    Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 1 });
  }
  if (!('pointerType' in ev) || !(ev as PointerEvent).pointerType) {
    Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  }
  svg().dispatchEvent(ev);
  return ev;
}

function flushFrames() {
  const q = rafQueue;
  rafQueue = [];
  q.forEach(cb => cb(performance.now()));
}

function lastCall() {
  const calls = onChange.mock.calls;
  return calls[calls.length - 1];
}

function withPaths(paths: { r: number; c: number }[][]): GameState {
  const s = restore(P5x5_unique, paths);
  if (!s) throw new Error('bad fixture paths');
  return s;
}

beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  el = document.createElement('div');
  document.body.appendChild(el);
  onChange = vi.fn();
  board = createBoard(el, { onChange });
  board.setState(newGame(P5x5_unique));
  const s = svg();
  s.getBoundingClientRect = () => RECT as DOMRect;
  s.setPointerCapture = vi.fn();
  s.releasePointerCapture = vi.fn();
  s.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => {
  board.destroy();
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('cellFromPoint maps points, including scaled rects', () => {
  const rect = { left: 100, top: 50, width: 350, height: 350 };
  expect(cellFromPoint(101, 51, rect, 7)).toEqual({ r: 0, c: 0 });
  expect(cellFromPoint(449, 399, rect, 7)).toEqual({ r: 6, c: 6 });
  expect(cellFromPoint(99, 60, rect, 7)).toBeNull();
  expect(cellFromPoint(200, 400, rect, 7)).toBeNull();
  // scaled (CSS transform / zoom): same relative position, different pixel size
  expect(cellFromPoint(100 + 175, 50 + 175, { left: 100, top: 50, width: 350, height: 350 }, 7)).toEqual({ r: 3, c: 3 });
  expect(cellFromPoint(10 + 70, 10 + 70, { left: 10, top: 10, width: 140, height: 140 }, 7)).toEqual({ r: 3, c: 3 });
});

test('renders one circle per endpoint and one polyline per non-empty path', () => {
  expect(svg().querySelectorAll('circle')).toHaveLength(P5x5_unique.pairs.length * 2);
  expect(svg().querySelectorAll('polyline')).toHaveLength(0);

  board.setState(withPaths([P5x5_solution[0], [], P5x5_solution[2].slice(0, 2), []]));
  expect(svg().querySelectorAll('circle')).toHaveLength(8);
  const lines = svg().querySelectorAll('polyline');
  expect(lines).toHaveLength(2);
  // coordinates are cell centers in viewBox units
  expect(lines[0].getAttribute('points')!.trim().split(/\s+/)).toHaveLength(P5x5_solution[0].length);
});

test('completed pairs tint their cells at 12%', () => {
  board.setState(withPaths([P5x5_solution[0], [], P5x5_solution[2].slice(0, 2), []]));
  const tints = svg().querySelectorAll('.board-tint rect');
  expect(tints).toHaveLength(P5x5_solution[0].length);
  tints.forEach(t => expect(t.getAttribute('fill-opacity')).toBe('0.12'));
});

test('colorblind mode renders glyph text on every dot', () => {
  expect(svg().querySelectorAll('text')).toHaveLength(0);
  board.setColorblind(true);
  const texts = [...svg().querySelectorAll('text')];
  expect(texts).toHaveLength(8);
  const glyphs = texts.map(t => t.textContent!.replace('︎', ''));
  P5x5_unique.pairs.forEach((p, k) => {
    expect(glyphs.filter(g => g === GLYPHS[p.color])).toHaveLength(2);
    expect(k).toBe(p.color);
  });
  board.setColorblind(false);
  expect(svg().querySelectorAll('text')).toHaveLength(0);
});

test('drag from a dot extends the path, captures the pointer, and renders on the next frame', () => {
  fire('pointerdown', at(0, 1));
  expect(svg().setPointerCapture).toHaveBeenCalledWith(1);
  expect(lastCall()[1]).toBe('move');
  expect(lastCall()[0].active).toBe(0);
  fire('pointermove', at(0, 0));
  fire('pointermove', at(2, 0)); // jump: interpolated by game.pointerMove
  expect(lastCall()[0].paths[0]).toEqual([{ r: 0, c: 1 }, { r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }]);
  expect(svg().querySelectorAll('polyline')).toHaveLength(0); // coalesced: not yet rendered
  flushFrames();
  expect(svg().querySelectorAll('polyline')).toHaveLength(1);
  fire('pointerup', at(2, 0));
  expect(lastCall()[1]).toBe('gesture-end');
  expect(lastCall()[0].active).toBeNull();
  expect(lastCall()[0].moves).toBe(1);
});

// Review Focus 1
test.each(['pointercancel', 'lostpointercapture'])('%s ends the gesture', type => {
  fire('pointerdown', at(0, 1));
  fire('pointermove', at(0, 0));
  fire(type, at(0, 0));
  const [s, kind] = lastCall();
  expect(kind).toBe('gesture-end');
  expect(s.active).toBeNull();
  expect(s.paths[0]).toEqual([{ r: 0, c: 1 }, { r: 0, c: 0 }]);
  const n = onChange.mock.calls.length;
  fire('pointermove', at(1, 0)); // no stuck drag
  fire('pointerup', at(1, 0)); // a later up/lostpointercapture does not end twice
  fire('lostpointercapture', at(1, 0));
  expect(onChange.mock.calls.length).toBe(n);
});

test('window blur mid-drag ends the gesture', () => {
  fire('pointerdown', at(0, 1));
  window.dispatchEvent(new Event('blur'));
  expect(lastCall()[1]).toBe('gesture-end');
  expect(lastCall()[0].active).toBeNull();
});

test('a second pointer does not hijack an active drag', () => {
  fire('pointerdown', at(0, 1));
  fire('pointermove', { ...at(0, 0), pointerId: 2 });
  fire('pointerup', { ...at(0, 0), pointerId: 2 });
  expect(lastCall()[0].active).toBe(0);
  expect(lastCall()[0].paths[0]).toEqual([{ r: 0, c: 1 }]);
});

test('right button does not start a drag', () => {
  fire('pointerdown', { ...at(0, 1), button: 2 });
  expect(onChange).not.toHaveBeenCalled();
});

test('contextmenu on a path cell clears that path and is prevented', () => {
  board.setState(withPaths([P5x5_solution[0], P5x5_solution[1].slice(0, 3), [], []]));
  const ev = fire('contextmenu', at(1, 0));
  expect(ev.defaultPrevented).toBe(true);
  const [s, kind] = lastCall();
  expect(kind).toBe('gesture-end');
  expect(s.paths[0]).toEqual([]);
  expect(s.paths[1]).toHaveLength(3);
});

test('contextmenu on an empty cell is prevented but changes nothing', () => {
  const ev = fire('contextmenu', at(2, 2 + 2));
  expect(ev.defaultPrevented).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});

test('setInteractive(false) ignores pointer input', () => {
  board.setState(withPaths([P5x5_solution[0], [], [], []]));
  board.setInteractive(false);
  fire('pointerdown', at(1, 1));
  fire('pointermove', at(1, 2));
  fire('pointerup', at(1, 2));
  const ev = fire('contextmenu', at(1, 0));
  expect(ev.defaultPrevented).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  board.setInteractive(true);
  fire('pointerdown', at(1, 1));
  expect(onChange).toHaveBeenCalled();
});

test('completing a pair pulses its dots for 200 ms', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  board.setState(withPaths([P5x5_solution[0].slice(0, 5), [], [], []]));
  fire('pointerdown', at(2, 1));
  fire('pointermove', at(3, 1));
  flushFrames();
  const pulsing = svg().querySelectorAll('circle.board-dot--pulse');
  expect(pulsing).toHaveLength(2);
  vi.advanceTimersByTime(200);
  expect(svg().querySelectorAll('circle.board-dot--pulse')).toHaveLength(0);
});

test('celebrate resolves within 600 ms', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  board.setState(withPaths(P5x5_solution));
  let done = false;
  const p = board.celebrate().then(() => (done = true));
  expect(svg().querySelectorAll('polyline.board-path--ripple').length).toBe(4);
  await vi.advanceTimersByTimeAsync(600);
  await p;
  expect(done).toBe(true);
  expect(svg().querySelectorAll('polyline.board-path--ripple').length).toBe(0);
});

test('celebrate resolves immediately under reduced motion', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q }));
  board.setState(withPaths(P5x5_solution));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let done = false;
  board.celebrate().then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  expect(done).toBe(true);
});

test('destroy removes the svg and stops listening', () => {
  const s = svg();
  board.destroy();
  expect(el.querySelector('svg')).toBeNull();
  s.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 150, clientY: 50 }));
  expect(onChange).not.toHaveBeenCalled();
});
