// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createLoopBoard, loopSvg, type LoopBoardHandle } from '../../../src/games/loop/board';
import { cycle, newGame, paint } from '../../../src/games/loop/game';
import { hEdge, vEdge } from '../../../src/games/loop/geometry';
import { fixture } from './helpers';

let host: HTMLElement;
let board: LoopBoardHandle;
let onCycle: ReturnType<typeof vi.fn<(edge: number) => void>>;
let onCross: ReturnType<typeof vi.fn<(edge: number) => void>>;
let onPaint: ReturnType<typeof vi.fn<(edges: number[], mode: string) => void>>;

const svg = () => host.querySelector<SVGSVGElement>('svg.loop-svg')!;
const edge = (i: number) => host.querySelector<SVGGElement>(`.loop-edge[data-edge="${i}"]`)!;

/** Pointer-like event at a client point. */
function at(type: string, x: number, y: number, button = 0, pointerId = 1): MouseEvent {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  Object.defineProperty(ev, 'pointerId', { value: pointerId });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  svg().dispatchEvent(ev);
  return ev;
}

/** Client pixels of dot (r, c): the 3x3 board spans 4 units of 100 px, with a half-unit margin. */
const dot = (r: number, c: number): [number, number] => [c * 100 + 50, r * 100 + 50];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onCycle = vi.fn();
  onCross = vi.fn();
  onPaint = vi.fn();
  board = createLoopBoard(host, { onCycle, onCross, onPaint });
});

afterEach(() => {
  board.destroy();
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount() {
  const s = newGame(fixture());
  board.setGame(s);
  svg().getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return s;
}

test('setGame renders every edge, the shown clues and the dots', () => {
  mount();
  expect(svg().getAttribute('viewBox')).toBe('-0.5 -0.5 4 4');
  expect(host.querySelectorAll('.loop-edge')).toHaveLength(2 * 3 * 4);
  expect(host.querySelectorAll('.loop-edge[data-state="empty"]')).toHaveLength(24);
  expect(host.querySelectorAll('text.loop-clue')).toHaveLength(4);
  expect(host.querySelectorAll('circle.loop-dot')).toHaveLength(16);
});

test('the svg disables touch scrolling inline', () => {
  mount();
  expect(svg().style.touchAction).toBe('none');
});

test('render shows line and cross states', () => {
  const s = mount();
  cycle(s, 0);
  cycle(s, 1);
  cycle(s, 1);
  board.render();
  expect(edge(0).dataset.state).toBe('line');
  expect(edge(1).dataset.state).toBe('cross');
  expect(edge(2).dataset.state).toBe('empty');
});

test('a matched clue is done, an over-full clue and a branching dot are bad', () => {
  const s = mount();
  // Cell 0 has clue 2: top and left make it done.
  cycle(s, hEdge(3, 0, 0));
  cycle(s, vEdge(3, 0, 0));
  board.render();
  expect(host.querySelector('.loop-clue[data-cell="0"]')!.classList.contains('is-done')).toBe(true);
  // A third side makes it over-full; three lines meet at dot 0? use dot (0,1): h(0,0), h(0,1), v(0,1).
  cycle(s, hEdge(3, 0, 1));
  cycle(s, vEdge(3, 0, 1));
  board.render();
  const c0 = host.querySelector('.loop-clue[data-cell="0"]')!;
  expect(c0.classList.contains('is-bad')).toBe(true);
  expect(host.querySelector('.loop-dot[data-dot="1"]')!.classList.contains('is-bad')).toBe(true);
  expect(host.querySelector('.loop-dot[data-dot="0"]')!.classList.contains('is-bad')).toBe(false);
});

test('a click near an edge midpoint cycles it', () => {
  mount();
  // Midpoint of h(0,0) is (0.5, 0) in dot units: client (100, 50).
  at('pointerdown', 100, 55);
  at('pointerup', 100, 55);
  expect(onCycle).toHaveBeenCalledTimes(1);
  expect(onCycle).toHaveBeenCalledWith(hEdge(3, 0, 0));
});

test('a drag across three dots paints two edges once', () => {
  mount();
  at('pointerdown', ...dot(0, 0));
  at('pointermove', ...dot(0, 1));
  at('pointermove', ...dot(0, 2));
  expect(edge(hEdge(3, 0, 0)).dataset.state).toBe('line'); // previewed
  at('pointerup', ...dot(0, 2));
  expect(onPaint).toHaveBeenCalledTimes(1);
  expect(onPaint).toHaveBeenCalledWith([hEdge(3, 0, 0), hEdge(3, 0, 1)], 'draw');
  expect(onCycle).not.toHaveBeenCalled();
  expect(edge(hEdge(3, 0, 0)).dataset.state).toBe('empty'); // preview cleared; the app re-renders
});

test('an erase drag previews the edges as empty', () => {
  const s = mount();
  paint(s, [0, 1], 'draw');
  board.render();
  at('pointerdown', ...dot(0, 0));
  at('pointermove', ...dot(0, 1));
  expect(edge(0).dataset.state).toBe('empty');
  expect(edge(1).dataset.state).toBe('line');
  at('pointerup', ...dot(0, 1));
  expect(onPaint).toHaveBeenCalledWith([0], 'erase');
});

test('right-click crosses the edge near the point and is default-prevented', () => {
  mount();
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 55 });
  svg().dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(onCross).toHaveBeenCalledWith(0);
});

test('right-click away from any edge only suppresses the menu', () => {
  mount();
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 0, clientY: 0 });
  svg().dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(onCross).not.toHaveBeenCalled();
});

test('setInteractive(false) ignores input', () => {
  mount();
  board.setInteractive(false);
  at('pointerdown', 100, 55);
  at('pointerup', 100, 55);
  at('pointerdown', ...dot(0, 0));
  at('pointermove', ...dot(0, 1));
  at('pointerup', ...dot(0, 1));
  svg().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 100, clientY: 55 }));
  expect(onCycle).not.toHaveBeenCalled();
  expect(onPaint).not.toHaveBeenCalled();
  expect(onCross).not.toHaveBeenCalled();
});

test('a second pointerdown during a drag is ignored and the first drag commits', () => {
  mount();
  at('pointerdown', ...dot(0, 0), 0, 1);
  at('pointermove', ...dot(0, 1), 0, 1);
  at('pointerdown', ...dot(2, 2), 0, 2);
  at('pointermove', ...dot(2, 3), 0, 2);
  at('pointerup', ...dot(2, 3), 0, 2);
  at('pointermove', ...dot(0, 2), 0, 1);
  at('pointerup', ...dot(0, 2), 0, 1);
  expect(onPaint).toHaveBeenCalledTimes(1);
  expect(onPaint).toHaveBeenCalledWith([hEdge(3, 0, 0), hEdge(3, 0, 1)], 'draw');
});

test('pointercancel mid-drag paints the edges so far', () => {
  mount();
  at('pointerdown', ...dot(0, 0));
  at('pointermove', ...dot(0, 1));
  at('pointercancel', ...dot(0, 1));
  expect(onPaint).toHaveBeenCalledTimes(1);
  expect(onPaint).toHaveBeenCalledWith([hEdge(3, 0, 0)], 'draw');
});

test('celebrate glows the loop in order and resolves after 600 ms', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const s = mount();
  for (let e = 0; e < s.puzzle.solution.length; e++) if (s.puzzle.solution[e]) cycle(s, e);
  board.render();
  let done = false;
  const p = board.celebrate().then(() => (done = true));
  await vi.advanceTimersByTimeAsync(0);
  expect(host.querySelectorAll('.loop-edge.is-glow')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(599);
  expect(done).toBe(false);
  expect(host.querySelectorAll('.loop-edge.is-glow')).toHaveLength(8);
  await vi.advanceTimersByTimeAsync(1);
  await p;
  expect(done).toBe(true);
});

test('celebrate resolves at once under reduced motion', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const s = mount();
  cycle(s, 0);
  await board.celebrate();
  expect(host.querySelectorAll('.loop-edge.is-glow')).toHaveLength(0);
});

test('loopSvg draws a static board', () => {
  const p = fixture();
  const lines = p.solution.flatMap((v, e) => (v ? [e] : []));
  const el = loopSvg(p.size, p.clues, lines);
  expect(el.querySelectorAll('.loop-lines line')).toHaveLength(8);
  expect(el.querySelectorAll('text.loop-clue')).toHaveLength(4);
  expect(el.querySelectorAll('circle.loop-dot')).toHaveLength(16);
  expect(el.getAttribute('aria-hidden')).toBe('true');
});
