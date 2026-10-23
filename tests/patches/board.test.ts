// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPatchesBoard, type PatchesBoardHandle } from '../../src/patches/board';
import { newGame, place } from '../../src/patches/game';
import { PALETTE } from '../../src/ui/palette';
import type { Puzzle, Rect } from '../../src/patches/types';
import { UNIQUE4, pz } from './helpers';

type Action = { kind: 'tap'; cell: number } | { kind: 'draw'; rect: Rect };

let el: HTMLElement;
let board: PatchesBoardHandle;
let actions: Action[];

const grid = () => el.querySelector<HTMLElement>('.patches-grid')!;
const cell = (i: number) => el.querySelector<HTMLElement>(`.patches-cell[data-i="${i}"]`)!;
const tiles = () => [...el.querySelectorAll<HTMLElement>('.patches-tile')];
const preview = () => el.querySelector<HTMLElement>('.patches-preview')!;
const puzzle = (): Puzzle => pz(4, UNIQUE4);

function at(type: string, x: number, y: number, button = 0) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  grid().dispatchEvent(ev);
}

/** Centre of a cell on the stubbed 400x400 grid. */
const px = (i: number): [number, number] => [(i % 4) * 100 + 50, Math.floor(i / 4) * 100 + 50];

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  actions = [];
  board = createPatchesBoard(el, { onAction: (a) => actions.push(a) });
  grid().getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON() {} }) as DOMRect;
});

afterEach(() => {
  board.destroy();
  el.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('setGame renders size² cells and one clue element per clue', () => {
  const p = pz(4, [[0, 'square', 4], [3, 'tall'], [6, 'any', 2], [8, 'wide', 3]]);
  board.setGame(newGame(p));
  expect(el.querySelector('.patches-panel.glass > .patches-grid[role="grid"]')).not.toBeNull();
  expect(grid().style.getPropertyValue('--n')).toBe('4');
  expect(el.querySelectorAll('.patches-cell')).toHaveLength(16);
  const clues = [...el.querySelectorAll<HTMLElement>('.patches-clue')];
  expect(clues).toHaveLength(4);
  expect(clues.map((c) => c.dataset.shape)).toEqual(['square', 'tall', 'any', 'wide']);
  expect(clues[0].dataset.area).toBe('4');
  expect(clues[0].textContent).toBe('4');
  expect(clues[0].querySelector('svg')).not.toBeNull();
  expect(clues[1].dataset.area).toBeUndefined();
  expect(clues[1].textContent).toBe('');
  expect(clues[1].querySelector('svg')).not.toBeNull();
  expect(cell(0).querySelector('.patches-clue')).toBe(clues[0]);
  expect(cell(1).querySelector('.patches-clue')).toBeNull();
});

test('setGame twice replaces the board instead of stacking it', () => {
  board.setGame(newGame(puzzle()));
  board.setGame(newGame(puzzle()));
  expect(el.querySelectorAll('.patches-cell')).toHaveLength(16);
  expect(el.querySelectorAll('.patches-tiles')).toHaveLength(1);
  expect(el.querySelectorAll('.patches-preview')).toHaveLength(1);
});

test('aria-label names the cell, its clue and whether it is covered', () => {
  const s = newGame(puzzle());
  board.setGame(s);
  expect(cell(0).getAttribute('aria-label')).toBe('Row 1, column 1, clue square 4');
  expect(cell(5).getAttribute('aria-label')).toBe('Row 2, column 2');
  place(s, { r: 0, c: 0, w: 2, h: 2 });
  board.render();
  expect(cell(0).getAttribute('aria-label')).toBe('Row 1, column 1, clue square 4, covered');
  expect(cell(5).getAttribute('aria-label')).toBe('Row 2, column 2, covered');
  expect(cell(2).getAttribute('aria-label')).toBe('Row 1, column 3');
});

test('render draws tiles with clue colours', () => {
  const s = newGame(puzzle());
  board.setGame(s);
  expect(tiles()).toHaveLength(0);
  place(s, { r: 0, c: 0, w: 2, h: 2 });
  board.render();
  expect(tiles()).toHaveLength(1);
  const t = tiles()[0];
  expect(t.style.getPropertyValue('--col')).toBe(PALETTE[0]);
  expect(t.classList.contains('is-invalid')).toBe(false);
  expect(['--r', '--c', '--w', '--h'].map((k) => t.style.getPropertyValue(k))).toEqual(['0', '0', '2', '2']);
});

test('a rectangle without exactly one clue is grey and invalid; removing it removes the tile', () => {
  const s = newGame(puzzle());
  place(s, { r: 2, c: 3, w: 1, h: 1 }); // cell 11, no clue
  board.setGame(s);
  const t = tiles()[0];
  expect(PALETTE).not.toContain(t.style.getPropertyValue('--col'));
  expect(t.style.getPropertyValue('--col')).not.toBe('');
  expect(t.classList.contains('is-invalid')).toBe(true);
  s.rects.length = 0;
  board.render();
  expect(tiles()).toHaveLength(0);
});

test('tap maps to the right cell', () => {
  board.setGame(newGame(puzzle()));
  at('pointerdown', 150, 50);
  at('pointerup', 150, 50);
  expect(actions).toEqual([{ kind: 'tap', cell: 1 }]);
});

test('drag shows a preview with label and draws on release', () => {
  board.setGame(newGame(puzzle()));
  expect(preview().hidden).toBe(true);
  at('pointerdown', ...px(0));
  at('pointermove', ...px(5));
  expect(preview().hidden).toBe(false);
  expect(preview().querySelector('.patches-preview-label')!.textContent).toBe('2×2');
  expect(preview().classList.contains('is-invalid')).toBe(false);
  expect(actions).toEqual([]);
  at('pointerup', ...px(5));
  expect(actions).toEqual([{ kind: 'draw', rect: { r: 0, c: 0, w: 2, h: 2 } }]);
  expect(preview().hidden).toBe(true);
});

test('the preview label sits below the rectangle on row 0 and above it elsewhere', () => {
  board.setGame(newGame(puzzle()));
  at('pointerdown', ...px(0));
  at('pointermove', ...px(1));
  expect(preview().classList.contains('is-below')).toBe(true);
  at('pointerup', ...px(1));
  at('pointerdown', ...px(5));
  at('pointermove', ...px(6));
  expect(preview().classList.contains('is-below')).toBe(false);
});

test('invalid preview is flagged', () => {
  board.setGame(newGame(puzzle()));
  at('pointerdown', ...px(0));
  at('pointermove', ...px(1));
  expect(preview().hidden).toBe(false);
  expect(preview().classList.contains('is-invalid')).toBe(true);
});

test('leaving the board clears the preview and draws nothing', () => {
  board.setGame(newGame(puzzle()));
  at('pointerdown', ...px(0));
  at('pointermove', ...px(5));
  at('pointermove', 500, 500);
  expect(preview().hidden).toBe(true);
  at('pointerup', 500, 500);
  expect(actions).toEqual([]);
});

test('setInteractive(false) blocks input and clears a live preview', () => {
  board.setGame(newGame(puzzle()));
  at('pointerdown', ...px(0));
  at('pointermove', ...px(5));
  board.setInteractive(false);
  expect(preview().hidden).toBe(true);
  at('pointerup', ...px(5));
  at('pointerdown', 150, 50);
  at('pointerup', 150, 50);
  expect(actions).toEqual([]);
});

test('right and middle mouse buttons do nothing', () => {
  board.setGame(newGame(puzzle()));
  for (const b of [2, 1]) {
    at('pointerdown', 150, 50, b);
    at('pointerup', 150, 50, b);
  }
  expect(actions).toEqual([]);
});

function wonGame() {
  const s = newGame(puzzle());
  for (const x of s.puzzle.solution) place(s, { ...x });
  return s;
}

test('celebrate resolves immediately under reduced motion', async () => {
  vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q.includes('reduce') })));
  board.setGame(wonGame());
  let done = false;
  void board.celebrate().then(() => { done = true; });
  await Promise.resolve();
  await Promise.resolve();
  expect(done).toBe(true);
  expect(el.querySelector('.is-glow')).toBeNull();
});

test('celebrate pulses tiles in reading order, 30 ms apart', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  board.setGame(wonGame());
  const order = tiles()
    .map((t) => ({ t, r: +t.style.getPropertyValue('--r'), c: +t.style.getPropertyValue('--c') }))
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map((x) => x.t);
  let done = false;
  void board.celebrate().then(() => { done = true; });
  await vi.advanceTimersByTimeAsync(0);
  expect(order.map((t) => t.classList.contains('is-glow'))).toEqual([true, false, false, false, false]);
  await vi.advanceTimersByTimeAsync(30);
  expect(order.map((t) => t.classList.contains('is-glow'))).toEqual([true, true, false, false, false]);
  await vi.advanceTimersByTimeAsync(120);
  expect(order.every((t) => t.classList.contains('is-glow'))).toBe(true);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(done).toBe(true);
});

test('celebrate with no tiles resolves at once', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  board.setGame(newGame(puzzle()));
  let done = false;
  void board.celebrate().then(() => { done = true; });
  await vi.advanceTimersByTimeAsync(0);
  expect(done).toBe(true);
});

test('celebrate settles when setGame or destroy interrupts the wave', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  board.setGame(wonGame());
  let done = 0;
  void board.celebrate().then(() => { done++; });
  await vi.advanceTimersByTimeAsync(50);
  expect(done).toBe(0);
  board.setGame(newGame(puzzle()));
  await vi.advanceTimersByTimeAsync(0);
  expect(done).toBe(1);
  expect(el.querySelector('.is-glow')).toBeNull();
  board.setGame(wonGame());
  void board.celebrate().then(() => { done++; });
  board.destroy();
  await vi.advanceTimersByTimeAsync(0);
  expect(done).toBe(2);
});
