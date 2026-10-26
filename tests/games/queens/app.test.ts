// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadQueensDaily, saveQueensDaily, setQueensPreset } from '../../../src/games/queens/storage';
import { mountQueens, parseQueensRoute } from '../../../src/games/queens/app';
import { DAILY_PRESET, PRESETS, generatePuzzle, queensDailySeed } from '../../../src/games/queens/generate';
import type { Puzzle } from '../../../src/games/queens/types';

const DATE = '2026-10-22';
let root: HTMLElement;
let nowMs: number;
let unmount: (() => void) | undefined;

const now = () => new Date(nowMs);
const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
const dailyPuzzle = (): Puzzle => generatePuzzle(PRESETS[DAILY_PRESET].size, queensDailySeed(DATE));
const solutionCells = (p: Puzzle) => p.solution.map((c, r) => r * p.size + c);

function grid(): HTMLElement {
  return root.querySelector<HTMLElement>('.queens-grid')!;
}

/** 1 px per cell so a cell's centre is (c + .5, r + .5). */
function tapCell(p: Puzzle, cell: number) {
  const n = p.size;
  grid().getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: n, bottom: n, width: n, height: n, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const x = (cell % n) + 0.5;
  const y = Math.floor(cell / n) + 0.5;
  for (const type of ['pointerdown', 'pointerup']) {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
    grid().dispatchEvent(ev);
  }
}

async function queenAt(p: Puzzle, cell: number) {
  tapCell(p, cell);
  tapCell(p, cell);
  await vi.advanceTimersByTimeAsync(0);
}

async function solve(p: Puzzle) {
  for (const c of solutionCells(p)) await queenAt(p, c);
  await vi.advanceTimersByTimeAsync(500);
}

function mount(hash: string) {
  location.hash = hash;
  unmount = mountQueens(root, { now });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })),
  );
  localStorage.clear();
  localStorage.setItem('flow:flag:queens-howto-seen', '1');
  nowMs = Date.parse(`${DATE}T12:00:00Z`);
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  root.remove();
  document.querySelector('.modal')?.remove();
  location.hash = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('parseQueensRoute', () => {
  expect(parseQueensRoute('')).toEqual({ mode: 'daily' });
  expect(parseQueensRoute('#/practice')).toEqual({ mode: 'practice', preset: 'medium' });
  expect(parseQueensRoute('#/practice?preset=large&seed=5')).toEqual({ mode: 'practice', preset: 'large', seed: 5 });
  expect(parseQueensRoute('#/practice?preset=bogus&seed=abc')).toEqual({ mode: 'practice', preset: 'medium' });
  setQueensPreset('small');
  expect(parseQueensRoute('#/practice')).toEqual({ mode: 'practice', preset: 'small' });
});

test('daily shows number and size', () => {
  mount('#/');
  expect(text('.queens-sub')).toContain('#3');
  expect(text('.queens-sub')).toContain('8×8');
  expect(text('.queens-count')).toBe('0/8 ♛');
  expect(text('.queens-time')).toBe('00:00');
  expect(root.querySelector('.shell-game')!.textContent).toBe('Queens');
});

test('placing a queen updates the HUD and the save', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await queenAt(p, solutionCells(p)[0]);
  expect(text('.queens-count')).toBe('1/8 ♛');
  const save = loadQueensDaily(DATE)!;
  expect([...save.cells].filter((c) => c === '2')).toHaveLength(1);
  expect(save.solved).toBe(false);
});

test('undo button reverts and disables when history is empty', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
  expect(undoBtn.disabled).toBe(true);
  await queenAt(p, solutionCells(p)[0]);
  expect(undoBtn.disabled).toBe(false);
  undoBtn.click();
  undoBtn.click();
  expect(text('.queens-count')).toBe('0/8 ♛');
  expect(undoBtn.disabled).toBe(true);
  expect(loadQueensDaily(DATE)!.cells).toBe('0'.repeat(64));
});

test('solving shows the win card and locks the board', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await solve(p);
  expect(text('.end-card__title')).toBe('Crowned ♛');
  expect(text('.end-card__stat')).toBe('00:00');
  expect(text('.end-card .btn--primary')).toBe('Play practice');
  expect(root.querySelector('.queens-stage')!.classList.contains('is-dimmed')).toBe(false);
  const save = loadQueensDaily(DATE)!;
  expect(save.solved).toBe(true);
  tapCell(p, solutionCells(p)[0]);
  await vi.advanceTimersByTimeAsync(0);
  expect(loadQueensDaily(DATE)!.cells).toBe(save.cells);
  expect(text('.queens-count')).toBe('8/8 ♛');
});

test('daily restores from a save', () => {
  const p = dailyPuzzle();
  const q = solutionCells(p)[0];
  const cells = Array<string>(64).fill('0');
  cells[q] = '2';
  cells[q === 0 ? 1 : 0] = '1';
  saveQueensDaily({ date: DATE, cells: cells.join(''), elapsedMs: 65_000, solved: false });
  mount('#/');
  expect(text('.queens-count')).toBe('1/8 ♛');
  expect(text('.queens-time')).toBe('01:05');
  expect(root.querySelectorAll('.queens-cell.is-mark')).toHaveLength(1);
  expect(root.querySelectorAll('.queens-cell.is-queen')).toHaveLength(1);
});

test('a solved save reopens with the card', () => {
  const p = dailyPuzzle();
  const cells = Array<string>(64).fill('0');
  for (const c of solutionCells(p)) cells[c] = '2';
  saveQueensDaily({ date: DATE, cells: cells.join(''), elapsedMs: 9_000, solved: true });
  mount('#/');
  expect(text('.end-card__title')).toBe('Crowned ♛');
  expect(text('.end-card__stat')).toBe('00:09');
});

test('daily ignores a save whose length does not match', () => {
  saveQueensDaily({ date: DATE, cells: '2', elapsedMs: 9_000, solved: false });
  mount('#/');
  expect(text('.queens-count')).toBe('0/8 ♛');
  expect(text('.queens-time')).toBe('00:00');
});

test('persist never overwrites a solved save from another tab', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const cells = Array<string>(64).fill('0');
  for (const c of solutionCells(p)) cells[c] = '2';
  const done = cells.join('');
  saveQueensDaily({ date: DATE, cells: done, elapsedMs: 5_000, solved: true });
  await queenAt(p, solutionCells(p)[0]);
  const save = loadQueensDaily(DATE)!;
  expect(save.solved).toBe(true);
  expect(save.cells).toBe(done);
  expect(text('.end-card__title')).toBe('Crowned ♛');
});

test('practice seed route is deterministic; Clear empties; New board changes the puzzle', async () => {
  mount('#/practice?preset=small&seed=7');
  const p = generatePuzzle(PRESETS.small.size, 7);
  expect(root.querySelectorAll('.queens-cell')).toHaveLength(49);
  expect(root.querySelector('[data-preset="small"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('[data-action="new"]')).not.toBeNull();
  const regionsOf = () =>
    [...root.querySelectorAll<HTMLElement>('.queens-cell')].map((c) => c.style.getPropertyValue('--c')).join();
  const first = regionsOf();
  await queenAt(p, solutionCells(p)[0]);
  expect(text('.queens-count')).toBe('1/7 ♛');
  const clr = root.querySelector<HTMLButtonElement>('[data-action="clear"]')!;
  clr.click();
  expect(document.querySelector('.modal')?.textContent).toContain('Clear the board?');
  document.querySelector<HTMLButtonElement>('.modal [data-action="cancel"]')!.click();
  expect(document.querySelector('.modal')).toBeNull();
  expect(text('.queens-count')).toBe('1/7 ♛'); // Cancel keeps the board
  clr.click();
  document.querySelector<HTMLButtonElement>('.modal [data-action="confirm"]')!.click();
  expect(text('.queens-count')).toBe('0/7 ♛');
  expect(clr.disabled).toBe(true); // nothing left to clear
  expect(loadQueensDaily(DATE)).toBeNull();
  root.querySelector<HTMLButtonElement>('[data-action="new"]')!.click();
  expect(regionsOf()).not.toBe(first);
});

test('how-to opens on the first visit only', () => {
  localStorage.removeItem('flow:flag:queens-howto-seen');
  mount('#/');
  const modal = document.querySelector('.modal')!;
  expect(modal.textContent).toContain('How to play');
  expect([...modal.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
    'Place one ♛ in every row, every column and every colour.',
    "Queens can't touch — not even diagonally.",
    'Tap once for ✕, twice for ♛. Drag to mark many cells.',
    'Clashing queens turn red.',
  ]);
  expect(modal.querySelector('svg.queens-howto__demo')).not.toBeNull();
  modal.querySelector<HTMLButtonElement>('button')!.click();
  unmount!();
  unmount = undefined;
  mount('#/');
  expect(document.querySelector('.modal')).toBeNull();
});

test('pagehide without a change leaves another tab save alone; after a move the move is saved', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const cells = solutionCells(p);
  const other = '0'.repeat(p.size * p.size).split('');
  other[cells[1]] = '2';
  saveQueensDaily({ date: DATE, cells: other.join(''), elapsedMs: 5000, solved: false });
  window.dispatchEvent(new Event('pagehide'));
  expect(loadQueensDaily(DATE)!.cells).toBe(other.join(''));
  expect(loadQueensDaily(DATE)!.elapsedMs).toBe(5000);
  await queenAt(p, cells[0]);
  window.dispatchEvent(new Event('pagehide'));
  expect(loadQueensDaily(DATE)!.cells).not.toBe(other.join(''));
});

test('pagehide keeps the clock running since the last move', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await queenAt(p, solutionCells(p)[0]);
  nowMs += 90_000;
  window.dispatchEvent(new Event('pagehide'));
  expect(loadQueensDaily(DATE)!.elapsedMs).toBe(90_000);
});

test('pagehide keeps the clock of a daily opened without a move', () => {
  saveQueensDaily({ date: DATE, cells: '0'.repeat(64), elapsedMs: 5000, solved: false });
  mount('#/');
  nowMs += 30_000;
  window.dispatchEvent(new Event('pagehide'));
  expect(loadQueensDaily(DATE)!.elapsedMs).toBe(35_000);
});

test('leaving the daily keeps the clock running since the last move', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await queenAt(p, solutionCells(p)[0]);
  nowMs += 60_000;
  location.hash = '#/practice';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(loadQueensDaily(DATE)!.elapsedMs).toBe(60_000);
});
