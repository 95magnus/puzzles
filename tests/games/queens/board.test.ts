// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createQueensBoard, regionEdges, type QueensBoardHandle } from '../../../src/games/queens/board';
import { cycle, newGame } from '../../../src/games/queens/game';
import type { InputAction } from '../../../src/games/queens/input';
import { PALETTE } from '../../../src/ui/palette';
import { UNIQUE4, pz } from './helpers';

let el: HTMLElement;
let board: QueensBoardHandle;
let actions: InputAction[];

const cell = (i: number) => el.querySelector<HTMLElement>(`[data-i="${i}"]`)!;
const grid = () => el.querySelector<HTMLElement>('.queens-grid')!;

function at(type: string, x: number, y: number, button = 0) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  grid().dispatchEvent(ev);
}

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  actions = [];
  board = createQueensBoard(el, { onAction: (a) => actions.push(a) });
  grid().getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
});

afterEach(() => {
  board.destroy();
  el.remove();
});

test('regionEdges marks region and board borders', () => {
  const p = pz(UNIQUE4);
  expect(regionEdges(p, 0)).toEqual({ t: true, r: true, b: false, l: true });
  expect(regionEdges(p, 5)).toEqual({ t: true, r: false, b: true, l: true });
});

test('setGame renders size² cells with palette and edge classes', () => {
  const p = pz(UNIQUE4);
  board.setGame(newGame(p));
  expect(el.querySelectorAll('.queens-cell')).toHaveLength(16);
  expect(grid().style.getPropertyValue('--n')).toBe('4');
  expect(cell(0).style.getPropertyValue('--c')).toBe(PALETTE[1]);
  expect(cell(1).style.getPropertyValue('--c')).toBe(PALETTE[0]);
  expect(cell(0).classList.contains('e-t')).toBe(true);
  expect(cell(0).classList.contains('e-b')).toBe(false);
});

test('update applies mark, queen and conflict classes', () => {
  const s = newGame(pz(UNIQUE4));
  cycle(s, 0); cycle(s, 0); // queen
  cycle(s, 3); cycle(s, 3); // queen, same row
  cycle(s, 5); // mark
  board.setGame(s);
  expect(cell(5).classList.contains('is-mark')).toBe(true);
  for (const i of [0, 3]) {
    expect(cell(i).classList.contains('is-queen')).toBe(true);
    expect(cell(i).classList.contains('is-conflict')).toBe(true);
  }
  cycle(s, 3); // queen -> empty
  board.update([3]);
  expect(cell(3).classList.contains('is-queen')).toBe(false);
  expect(cell(0).classList.contains('is-conflict')).toBe(false);
});

test('tap maps to the right cell', () => {
  board.setGame(newGame(pz(UNIQUE4)));
  at('pointerdown', 150, 50);
  at('pointerup', 150, 50);
  expect(actions).toEqual([{ kind: 'tap', cell: 1 }]);
});

test('drag emits paint actions', () => {
  board.setGame(newGame(pz(UNIQUE4)));
  at('pointerdown', 50, 50);
  at('pointermove', 150, 50);
  at('pointermove', 250, 50);
  at('pointerup', 250, 50);
  expect(actions).toHaveLength(2);
  expect(actions.every((a) => a.kind === 'paint')).toBe(true);
  expect((actions[0] as { gesture: number }).gesture).toBe((actions[1] as { gesture: number }).gesture);
});

test('setInteractive(false) blocks input', () => {
  board.setGame(newGame(pz(UNIQUE4)));
  board.setInteractive(false);
  at('pointerdown', 150, 50);
  at('pointerup', 150, 50);
  expect(actions).toEqual([]);
});

test('aria-label reflects the state', () => {
  const s = newGame(pz(UNIQUE4));
  board.setGame(s);
  expect(cell(5).getAttribute('aria-label')).toBe('Row 2, column 2, empty');
  cycle(s, 5);
  board.update([5]);
  expect(cell(5).getAttribute('aria-label')).toBe('Row 2, column 2, marked');
  cycle(s, 5);
  board.update([5]);
  expect(cell(5).getAttribute('aria-label')).toBe('Row 2, column 2, queen');
});

test('board-edge cells carry outer classes for the thicker border', () => {
  board.setGame(newGame(pz(UNIQUE4)));
  expect(['o-t', 'o-l'].every((c) => cell(0).classList.contains(c))).toBe(true);
  expect(['o-r', 'o-b'].some((c) => cell(0).classList.contains(c))).toBe(false);
  expect(['o-b', 'o-r'].every((c) => cell(15).classList.contains(c))).toBe(true);
  expect(['o-t', 'o-l', 'o-r', 'o-b'].some((c) => cell(5).classList.contains(c))).toBe(false);
});

function solved() {
  const s = newGame(pz(UNIQUE4));
  s.puzzle.solution.forEach((col, r) => { cycle(s, r * 4 + col); cycle(s, r * 4 + col); });
  return s;
}

test('celebrate resolves immediately under reduced motion', async () => {
  vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q.includes('reduce') })));
  board.setGame(solved());
  let done = false;
  void board.celebrate().then(() => { done = true; });
  await Promise.resolve();
  await Promise.resolve();
  expect(done).toBe(true);
  vi.unstubAllGlobals();
});

test('celebrate settles when setGame or destroy interrupts the wave', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  board.setGame(solved());
  let done = 0;
  void board.celebrate().then(() => { done++; });
  await vi.advanceTimersByTimeAsync(50);
  expect(done).toBe(0);
  board.setGame(newGame(pz(UNIQUE4)));
  await vi.advanceTimersByTimeAsync(0);
  expect(done).toBe(1);
  void board.celebrate().then(() => { done++; });
  board.destroy();
  await vi.advanceTimersByTimeAsync(0);
  expect(done).toBe(2);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('right and middle mouse buttons do nothing', () => {
  board.setGame(newGame(pz(UNIQUE4)));
  for (const b of [2, 1]) {
    at('pointerdown', 150, 50, b);
    at('pointerup', 150, 50, b);
  }
  expect(actions).toEqual([]);
});

test('conflicting queens are announced and the label refreshes', () => {
  const s = newGame(pz(UNIQUE4));
  cycle(s, 0); cycle(s, 0);
  cycle(s, 3); cycle(s, 3); // same row
  board.setGame(s);
  expect(cell(0).getAttribute('aria-label')).toMatch(/queen, in conflict$/);
  expect(cell(3).getAttribute('aria-label')).toMatch(/queen, in conflict$/);
  cycle(s, 3); // queen -> empty
  board.update([3]);
  expect(cell(0).getAttribute('aria-label')).toMatch(/queen$/);
});
