// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadTangoDaily, saveTangoDaily, setTangoPreset } from '../../src/core/storage';
import { mountTango, parseTangoRoute } from '../../src/tango/app';
import { DAILY_PRESET, PRESETS, generatePuzzle, tangoDailySeed } from '../../src/tango/generate';
import type { Puzzle } from '../../src/tango/types';

const DATE = '2026-10-25';
let root: HTMLElement;
let nowMs: number;
let unmount: (() => void) | undefined;

const now = () => new Date(nowMs);
const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
const dailyPuzzle = (): Puzzle => generatePuzzle(PRESETS[DAILY_PRESET].size, tangoDailySeed(DATE));
const cell = (i: number) => root.querySelector<HTMLButtonElement>(`.tango-cell[data-i="${i}"]`)!;
const firstOpen = (p: Puzzle) => p.givens.findIndex((v) => v === 0);
const givenCount = (p: Puzzle) => p.givens.filter((v) => v !== 0).length;

async function tap(i: number, times = 1) {
  for (let k = 0; k < times; k++) cell(i).click();
  await vi.advanceTimersByTimeAsync(0);
}

async function solve(p: Puzzle) {
  for (let i = 0; i < p.solution.length; i++) if (p.givens[i] === 0) await tap(i, p.solution[i]);
  await vi.advanceTimersByTimeAsync(500);
}

/** The givens on screen, to tell boards apart. */
const givenSig = () =>
  [...root.querySelectorAll<HTMLElement>('.tango-cell')].map((c) => (c.classList.contains('is-given') ? c.dataset.sym : '.')).join('');

function mount(hash: string) {
  location.hash = hash;
  unmount = mountTango(root, { now });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })),
  );
  localStorage.clear();
  localStorage.setItem('flow:flag:tango-howto-seen', '1');
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
  delete (window as { umami?: unknown }).umami;
});

test('parseTangoRoute', () => {
  expect(parseTangoRoute('')).toEqual({ mode: 'daily' });
  expect(parseTangoRoute('#/practice')).toEqual({ mode: 'practice', preset: 'medium' });
  expect(parseTangoRoute('#/practice?preset=large&seed=5')).toEqual({ mode: 'practice', preset: 'large', seed: 5 });
  expect(parseTangoRoute('#/practice?preset=bogus&seed=abc')).toEqual({ mode: 'practice', preset: 'medium' });
  setTangoPreset('small');
  expect(parseTangoRoute('#/practice')).toEqual({ mode: 'practice', preset: 'small' });
});

test('daily shows number and size', () => {
  mount('#/');
  const p = dailyPuzzle();
  expect(text('.tango-sub')).toContain('#6');
  expect(text('.tango-sub')).toContain('8×8');
  expect(text('.tango-filled')).toBe(`${givenCount(p)}/64`);
  expect(text('.tango-time')).toBe('00:00');
  expect(root.querySelector('.shell-game')!.textContent).toBe('Tango');
  expect(root.querySelectorAll('.tango-cell')).toHaveLength(64);
});

test('tapping updates the HUD and the save', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const i = firstOpen(p);
  await tap(i);
  expect(text('.tango-filled')).toBe(`${givenCount(p) + 1}/64`);
  const save = loadTangoDaily(DATE)!;
  expect(save.cells[i]).toBe('1');
  expect(save.solved).toBe(false);
});

test('right-click places a moon and right-clicking it again empties the cell', async () => {
  mount('#/');
  const i = firstOpen(dailyPuzzle());
  const rightClick = () => cell(i).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  rightClick();
  await vi.advanceTimersByTimeAsync(0);
  expect(cell(i).dataset.sym).toBe('2');
  expect(loadTangoDaily(DATE)!.cells[i]).toBe('2');
  rightClick();
  await vi.advanceTimersByTimeAsync(0);
  expect(cell(i).dataset.sym).toBe('0');
});

test('undo button reverts and disables when history is empty', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
  expect(undoBtn.disabled).toBe(true);
  await tap(firstOpen(p));
  expect(undoBtn.disabled).toBe(false);
  undoBtn.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(text('.tango-filled')).toBe(`${givenCount(p)}/64`);
  expect(undoBtn.disabled).toBe(true);
  expect(loadTangoDaily(DATE)!.cells[firstOpen(p)]).toBe('0');
});

test('solving shows the win card and locks the board', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await solve(p);
  expect(text('.end-card__title')).toBe('Balanced ☀☾');
  expect(text('.end-card .btn--primary')).toBe('Play practice');
  expect(text('.end-card__next')).toContain('Next daily in');
  const save = loadTangoDaily(DATE)!;
  expect(save.solved).toBe(true);
  await tap(firstOpen(p));
  expect(loadTangoDaily(DATE)!.cells).toBe(save.cells);
  expect(text('.tango-filled')).toBe('64/64');
});

test('daily restores from a save', () => {
  const p = dailyPuzzle();
  const cells = p.givens.slice();
  cells[firstOpen(p)] = 2;
  saveTangoDaily({ date: DATE, cells: cells.join(''), elapsedMs: 65_000, solved: false });
  mount('#/');
  expect(text('.tango-filled')).toBe(`${givenCount(p) + 1}/64`);
  expect(text('.tango-time')).toBe('01:05');
  expect(cell(firstOpen(p)).dataset.sym).toBe('2');
});

test('a solved save reopens with the card', () => {
  const p = dailyPuzzle();
  saveTangoDaily({ date: DATE, cells: p.solution.join(''), elapsedMs: 9_000, solved: true });
  mount('#/');
  expect(text('.end-card__title')).toBe('Balanced ☀☾');
  expect(text('.end-card__stat')).toBe('00:09');
});

test('daily ignores a save that contradicts the givens', () => {
  const p = dailyPuzzle();
  const g = p.givens.findIndex((v) => v !== 0);
  const cells = p.solution.slice();
  cells[g] = cells[g] === 1 ? 2 : 1;
  saveTangoDaily({ date: DATE, cells: cells.join(''), elapsedMs: 9_000, solved: false });
  mount('#/');
  expect(text('.tango-filled')).toBe(`${givenCount(p)}/64`);
  expect(text('.tango-time')).toBe('00:00');
});

test('persist never overwrites a solved save from another tab', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const done = p.solution.join('');
  saveTangoDaily({ date: DATE, cells: done, elapsedMs: 5_000, solved: true });
  await tap(firstOpen(p));
  const save = loadTangoDaily(DATE)!;
  expect(save.solved).toBe(true);
  expect(save.cells).toBe(done);
  expect(text('.end-card__title')).toBe('Balanced ☀☾');
});

test('practice seed route is deterministic; Clear empties non-givens; New board changes the puzzle', async () => {
  mount('#/practice?preset=small&seed=7');
  const p = generatePuzzle(PRESETS.small.size, 7);
  expect(root.querySelectorAll('.tango-cell')).toHaveLength(36);
  expect(root.querySelector('[data-preset="small"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(givenSig()).toBe(p.givens.map((v) => (v === 0 ? '.' : String(v))).join(''));
  const first = givenSig();
  const clr = root.querySelector<HTMLButtonElement>('[data-action="clear"]')!;
  expect(clr.disabled).toBe(true);
  await tap(firstOpen(p));
  expect(clr.disabled).toBe(false);
  clr.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(text('.tango-filled')).toBe(`${givenCount(p)}/36`);
  root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(text('.tango-filled')).toBe(`${givenCount(p) + 1}/36`);
  expect(loadTangoDaily(DATE)).toBeNull();
  root.querySelector<HTMLButtonElement>('[data-action="new"]')!.click();
  expect(givenSig()).not.toBe(first);
});

test('reports puzzle_start once and puzzle_end on win', async () => {
  const track = vi.fn();
  (window as { umami?: unknown }).umami = { track };
  mount('#/practice?preset=small&seed=7');
  const p = generatePuzzle(PRESETS.small.size, 7);
  const open = p.givens.flatMap((v, i) => (v === 0 ? [i] : []));
  await tap(open[0]);
  await tap(open[1]);
  expect(track.mock.calls.filter(([e]) => e === 'puzzle_start')).toEqual([
    ['puzzle_start', { game: 'tango', mode: 'practice', preset: 'small' }],
  ]);
  await tap(open[0], 2);
  await tap(open[1], 2); // back to empty
  await solve(p);
  const ends = track.mock.calls.filter(([e]) => e === 'puzzle_end');
  expect(ends).toHaveLength(1);
  expect(ends[0][1]).toMatchObject({ game: 'tango', result: 'won' });
});

test('pagehide without a change leaves another tab save alone; after a move the move is saved', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const open = p.givens.flatMap((v, i) => (v === 0 ? [i] : []));
  const cells = p.givens.slice();
  cells[open[1]] = 1;
  const other = cells.join('');
  saveTangoDaily({ date: DATE, cells: other, elapsedMs: 5000, solved: false });
  window.dispatchEvent(new Event('pagehide'));
  expect(loadTangoDaily(DATE)!.cells).toBe(other);
  expect(loadTangoDaily(DATE)!.elapsedMs).toBe(5000);
  await tap(open[0]);
  window.dispatchEvent(new Event('pagehide'));
  expect(loadTangoDaily(DATE)!.cells).not.toBe(other);
});

test('pagehide keeps the clock running since the last move', async () => {
  mount('#/');
  await tap(firstOpen(dailyPuzzle()));
  nowMs += 90_000;
  window.dispatchEvent(new Event('pagehide'));
  expect(loadTangoDaily(DATE)!.elapsedMs).toBe(90_000);
});

test('how-to opens on the first visit only', () => {
  localStorage.removeItem('flow:flag:tango-howto-seen');
  mount('#/');
  const modal = document.querySelector('.modal')!;
  expect(modal.textContent).toContain('How to play');
  expect([...modal.querySelectorAll('.tango-howto__body li')].map((li) => li.textContent)).toEqual([
    'Fill every cell with a ☀ or a ☾.',
    'Each row and column has the same number of each.',
    'No more than two of the same next to each other.',
    '= means the two cells match. × means they differ.',
    'Tap a cell to cycle ☀, ☾, empty. Right-click places a ☾.',
    'Broken rules turn red.',
  ]);
  expect(modal.querySelectorAll('.tango-howto__demo .tango-cell')).toHaveLength(16);
  expect(modal.querySelectorAll('.tango-howto__demo .tango-edge')).toHaveLength(2);
  modal.querySelector<HTMLButtonElement>('button')!.click();
  unmount!();
  unmount = undefined;
  mount('#/');
  expect(document.querySelector('.modal')).toBeNull();
});
