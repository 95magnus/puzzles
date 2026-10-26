// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createBridgesBoard, type BridgesBoardHandle } from '../../src/bridges/board';
import { cycle, newGame } from '../../src/bridges/game';
import { CROSS } from './helpers';

let host: HTMLElement;
let board: BridgesBoardHandle;
let onCycle: ReturnType<typeof vi.fn<(link: number) => void>>;
let onRemove: ReturnType<typeof vi.fn<(link: number) => void>>;

const svg = () => host.querySelector<SVGSVGElement>('svg.bridges-svg')!;
const link = (i: number) => host.querySelector<SVGGElement>(`.bridges-link[data-link="${i}"]`)!;
const island = (i: number) => host.querySelector<SVGGElement>(`.bridges-island[data-island="${i}"]`)!;

/** Pointer-like event at a client point; the stubbed SVG box makes one cell 50 px. */
function at(type: string, x: number, y: number, button = 0, pointerId = 1): MouseEvent {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  Object.defineProperty(ev, 'pointerId', { value: pointerId });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  svg().dispatchEvent(ev);
  return ev;
}

/** Centre of cell (r, c) in client pixels. */
const px = (r: number, c: number): [number, number] => [c * 50 + 25, r * 50 + 25];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onCycle = vi.fn();
  onRemove = vi.fn();
  board = createBridgesBoard(host, { onCycle, onRemove });
});

afterEach(() => {
  board.destroy();
  host.remove();
  vi.useRealTimers();
});

function mount() {
  const s = newGame(CROSS);
  board.setGame(s);
  svg().getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 250, height: 250, right: 250, bottom: 250, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return s;
}

test('setGame renders the panel, islands, links and dots', () => {
  mount();
  expect(host.querySelector('.bridges-panel.glass > svg.bridges-svg')).not.toBeNull();
  expect(svg().getAttribute('viewBox')).toBe('0 0 5 5');
  expect([...svg().children].map((c) => c.getAttribute('class'))).toEqual([
    'bridges-dots',
    'bridges-links',
    'bridges-preview',
    'bridges-islands',
  ]);
  expect(host.querySelectorAll('.bridges-island')).toHaveLength(6);
  expect(host.querySelectorAll('.bridges-link[data-count="0"]')).toHaveLength(6);
  expect(host.querySelectorAll('.bridges-dots circle')).toHaveLength(25 - 6);
  expect(island(5).querySelector('text')!.textContent).toBe('1');
  expect(island(1).getAttribute('aria-label')).toBe('Island, 3, 0 of 3 bridges');
});

test('render draws bridge counts and island states', () => {
  const s = mount();
  cycle(s, 3);
  board.render();
  expect(link(3).dataset.count).toBe('1');
  expect(link(3).querySelectorAll('line')).toHaveLength(1);
  expect(island(5).classList.contains('is-done')).toBe(true);
  cycle(s, 0);
  cycle(s, 0);
  cycle(s, 1);
  board.render();
  expect(link(0).querySelectorAll('line')).toHaveLength(2);
  expect(island(0).classList.contains('is-over')).toBe(true);
  expect(island(0).getAttribute('aria-label')).toBe('Island, 2, 3 of 2 bridges');
});

test('a tap on a gap cycles its link', () => {
  mount();
  at('pointerdown', ...px(0, 1));
  at('pointerup', ...px(0, 1));
  expect(onCycle).toHaveBeenCalledWith(0);
  expect(onCycle).toHaveBeenCalledTimes(1);
});

test('a drag from an island previews then cycles the link', () => {
  mount();
  const preview = host.querySelector<SVGLineElement>('.bridges-preview')!;
  at('pointerdown', ...px(0, 2)); // island 1
  at('pointermove', ...px(2, 2)); // down towards island 5
  expect(preview.style.display).not.toBe('none');
  at('pointerup', ...px(2, 2));
  expect(onCycle).toHaveBeenCalledWith(3);
  expect(preview.style.display).toBe('none');
});

test('right-click removes the link near the point and suppresses the menu', () => {
  mount();
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 75, clientY: 25 });
  svg().dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(onRemove).toHaveBeenCalledWith(0);
});

test('a long-press that opens the context menu removes without also cycling', () => {
  mount();
  at('pointerdown', ...px(0, 1));
  svg().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 75, clientY: 25 }));
  at('pointerup', ...px(0, 1));
  expect(onRemove).toHaveBeenCalledTimes(1);
  expect(onCycle).not.toHaveBeenCalled();
});

test('setInteractive(false) blocks taps and right-clicks', () => {
  mount();
  board.setInteractive(false);
  at('pointerdown', ...px(0, 1));
  at('pointerup', ...px(0, 1));
  svg().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 75, clientY: 25 }));
  expect(onCycle).not.toHaveBeenCalled();
  expect(onRemove).not.toHaveBeenCalled();
});

test('a second pointer is ignored during a gesture', () => {
  mount();
  at('pointerdown', ...px(0, 1), 0, 1);
  at('pointerdown', ...px(0, 3), 0, 2);
  at('pointerup', ...px(0, 3), 0, 2);
  at('pointerup', ...px(0, 1), 0, 1);
  expect(onCycle.mock.calls).toEqual([[0]]);
});

test('flashBlocked marks links for 300 ms', () => {
  vi.useFakeTimers();
  mount();
  board.flashBlocked([3]);
  expect(link(3).classList.contains('is-blocked')).toBe(true);
  vi.advanceTimersByTime(300);
  expect(link(3).classList.contains('is-blocked')).toBe(false);
});
