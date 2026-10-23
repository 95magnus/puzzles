// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadPatchesDaily, savePatchesDaily, setPatchesPreset } from '../../src/core/storage';
import { mountPatches, parsePatchesRoute } from '../../src/patches/app';
import { encode, newGame, place } from '../../src/patches/game';
import { DAILY_PRESET, PRESETS, generatePuzzle, patchesDailySeed } from '../../src/patches/generate';
import type { Puzzle, Rect } from '../../src/patches/types';

const DATE = '2026-10-23';
let root: HTMLElement;
let nowMs: number;
let unmount: (() => void) | undefined;

const now = () => new Date(nowMs);
const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
const dailyPuzzle = (): Puzzle => generatePuzzle(PRESETS[DAILY_PRESET].size, patchesDailySeed(DATE));

function grid(): HTMLElement {
  return root.querySelector<HTMLElement>('.patches-grid')!;
}

function pointer(type: string, x: number, y: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  grid().dispatchEvent(ev);
}

/** Drag across `x` (a tap when it is one cell) on a grid stubbed to 1 px per cell, so a cell's centre is (c + .5, r + .5). */
async function drawRect(p: Puzzle, x: Rect) {
  const n = p.size;
  grid().getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: n, bottom: n, width: n, height: n, x: 0, y: 0, toJSON() {} }) as DOMRect;
  pointer('pointerdown', x.c + 0.5, x.r + 0.5);
  if (x.w * x.h > 1) pointer('pointermove', x.c + x.w - 0.5, x.r + x.h - 0.5);
  pointer('pointerup', x.c + x.w - 0.5, x.r + x.h - 0.5);
  await vi.advanceTimersByTimeAsync(0);
}

async function solve(p: Puzzle) {
  for (const x of p.solution) await drawRect(p, x);
  await vi.advanceTimersByTimeAsync(500);
}

function solvedText(p: Puzzle): string {
  const g = newGame(p);
  for (const x of p.solution) place(g, { ...x });
  return encode(g);
}

/** The clue layout on screen, to tell boards apart. */
const clueSig = () =>
  [...root.querySelectorAll<HTMLElement>('.patches-cell')]
    .map((c) => {
      const k = c.querySelector<HTMLElement>('.patches-clue');
      return k ? `${c.dataset.i}:${k.dataset.shape}:${k.dataset.area ?? ''}` : '';
    })
    .join('|');

function mount(hash: string) {
  location.hash = hash;
  unmount = mountPatches(root, { now });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })),
  );
  localStorage.clear();
  localStorage.setItem('flow:flag:patches-howto-seen', '1');
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

test('parsePatchesRoute', () => {
  expect(parsePatchesRoute('')).toEqual({ mode: 'daily' });
  expect(parsePatchesRoute('#/practice')).toEqual({ mode: 'practice', preset: 'medium' });
  expect(parsePatchesRoute('#/practice?preset=large&seed=5')).toEqual({ mode: 'practice', preset: 'large', seed: 5 });
  expect(parsePatchesRoute('#/practice?preset=bogus&seed=abc')).toEqual({ mode: 'practice', preset: 'medium' });
  setPatchesPreset('small');
  expect(parsePatchesRoute('#/practice')).toEqual({ mode: 'practice', preset: 'small' });
});

test('daily shows number and size', () => {
  mount('#/');
  expect(text('.patches-sub')).toContain('#4');
  expect(text('.patches-sub')).toContain('8×8');
  expect(text('.patches-cover')).toBe('0/64');
  expect(text('.patches-time')).toBe('00:00');
  expect(root.querySelector('.shell-game')!.textContent).toBe('Patches');
  expect(root.querySelectorAll('.patches-cell')).toHaveLength(64);
});

test('drawing a rect updates the HUD and the save', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const first = p.solution[0];
  await drawRect(p, first);
  expect(text('.patches-cover')).toBe(`${first.w * first.h}/64`);
  const save = loadPatchesDaily(DATE)!;
  expect(save.rects).not.toBe('');
  expect(save.rects).toBe(`${first.r},${first.c},${first.w},${first.h}`);
  expect(save.solved).toBe(false);
});

test('undo button reverts and disables when history is empty', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
  expect(undoBtn.disabled).toBe(true);
  await drawRect(p, p.solution[0]);
  expect(undoBtn.disabled).toBe(false);
  undoBtn.click();
  expect(text('.patches-cover')).toBe('0/64');
  expect(undoBtn.disabled).toBe(true);
  expect(root.querySelectorAll('.patches-tile')).toHaveLength(0);
  expect(loadPatchesDaily(DATE)!.rects).toBe('');
});

test('solving shows the win card and locks the board', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await solve(p);
  expect(text('.end-card__title')).toBe('Patched up');
  expect(text('.end-card__stat')).toBe('00:00');
  expect(text('.end-card .btn--primary')).toBe('Play practice');
  expect(text('.end-card__next')).toContain('Next daily in');
  expect(root.querySelector('.patches-stage')!.classList.contains('is-dimmed')).toBe(false);
  const save = loadPatchesDaily(DATE)!;
  expect(save.solved).toBe(true);
  const tiles = root.querySelectorAll('.patches-tile').length;
  const { r, c } = p.solution[0];
  await drawRect(p, { r, c, w: 1, h: 1 }); // a tap on a placed tile would remove it if the board were live
  expect(root.querySelectorAll('.patches-tile')).toHaveLength(tiles);
  expect(loadPatchesDaily(DATE)!.rects).toBe(save.rects);
  expect(text('.patches-cover')).toBe('64/64');
});

test('daily restores from a save', () => {
  const p = dailyPuzzle();
  const x = p.solution[0];
  savePatchesDaily({ date: DATE, rects: `${x.r},${x.c},${x.w},${x.h}`, elapsedMs: 65_000, solved: false });
  mount('#/');
  expect(text('.patches-cover')).toBe(`${x.w * x.h}/64`);
  expect(text('.patches-time')).toBe('01:05');
  expect(root.querySelectorAll('.patches-tile')).toHaveLength(1);
});

test('a solved save reopens with the card', () => {
  const p = dailyPuzzle();
  savePatchesDaily({ date: DATE, rects: solvedText(p), elapsedMs: 9_000, solved: true });
  mount('#/');
  expect(text('.end-card__title')).toBe('Patched up');
  expect(text('.end-card__stat')).toBe('00:09');
  expect(text('.patches-cover')).toBe('64/64');
});

test('daily ignores a save with overlapping rects', () => {
  savePatchesDaily({ date: DATE, rects: '0,0,2,2;1,1,2,2', elapsedMs: 9_000, solved: false });
  mount('#/');
  expect(text('.patches-cover')).toBe('0/64');
  expect(text('.patches-time')).toBe('00:00');
  expect(root.querySelectorAll('.patches-tile')).toHaveLength(0);
});

test('persist never overwrites a solved save from another tab', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const done = solvedText(p);
  savePatchesDaily({ date: DATE, rects: done, elapsedMs: 5_000, solved: true });
  await drawRect(p, p.solution[0]);
  const save = loadPatchesDaily(DATE)!;
  expect(save.solved).toBe(true);
  expect(save.rects).toBe(done);
  expect(text('.end-card__title')).toBe('Patched up');
});

test('a solved save that does not fit the puzzle is overwritten by the player progress', async () => {
  savePatchesDaily({ date: DATE, rects: '0,0,2,2;1,1,2,2', elapsedMs: 9_000, solved: true });
  mount('#/');
  expect(text('.end-card__title')).toBe('');
  const p = dailyPuzzle();
  const x = p.solution[0];
  await drawRect(p, x);
  expect(text('.patches-cover')).toBe(`${x.w * x.h}/64`);
  const save = loadPatchesDaily(DATE)!;
  expect(save.rects).toBe(`${x.r},${x.c},${x.w},${x.h}`);
  expect(save.solved).toBe(false);
});

test('practice seed route is deterministic; Clear empties the board; New board changes the puzzle', async () => {
  mount('#/practice?preset=small&seed=7');
  const p = generatePuzzle(PRESETS.small.size, 7);
  expect(root.querySelectorAll('.patches-cell')).toHaveLength(36);
  expect(root.querySelector('[data-preset="small"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('[data-action="new"]')).not.toBeNull();
  expect(clueSig()).toBe(
    Array.from({ length: 36 }, (_, i) => {
      const k = p.clues.find((c) => c.cell === i);
      return k ? `${i}:${k.shape}:${k.area ?? ''}` : '';
    }).join('|'),
  );
  const first = clueSig();
  const x = p.solution[0];
  const clr = root.querySelector<HTMLButtonElement>('[data-action="clear"]')!;
  expect(clr.disabled).toBe(true); // nothing to clear yet
  await drawRect(p, x);
  expect(text('.patches-cover')).toBe(`${x.w * x.h}/36`);
  expect(clr.disabled).toBe(false);
  clr.click();
  expect(text('.patches-cover')).toBe('0/36');
  expect(clr.disabled).toBe(true);
  root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click(); // undo the Clear: enabled again
  expect(text('.patches-cover')).toBe(`${x.w * x.h}/36`);
  expect(clr.disabled).toBe(false);
  clr.click();
  expect(loadPatchesDaily(DATE)).toBeNull();
  root.querySelector<HTMLButtonElement>('[data-action="new"]')!.click();
  expect(clueSig()).not.toBe(first);
});

test('how-to opens on the first visit only', () => {
  localStorage.removeItem('flow:flag:patches-howto-seen');
  mount('#/');
  const modal = document.querySelector('.modal')!;
  expect(modal.textContent).toContain('How to play');
  expect([...modal.querySelectorAll('.patches-howto__body li')].map((li) => li.textContent)).toEqual([
    'Split the grid into rectangles. Every cell belongs to one.',
    'Each rectangle holds exactly one clue: its shape, and its size in cells.',
    'Drag to draw a rectangle. Tap one to remove it.',
    'Broken rectangles turn red.',
  ]);
  expect(modal.querySelector('svg.patches-howto__demo')).not.toBeNull();
  // The legend explains each clue with the board's own icon, including the dotted "any shape" box.
  const legend = [...modal.querySelectorAll('.patches-howto__legend li')];
  expect(legend.map((li) => li.textContent)).toEqual([
    '4A square of 4 cells',
    '3Wider than tall, 3 cells',
    '3Taller than wide, 3 cells',
    '4Dotted: any shape, 4 cells',
    'No number: any size',
  ]);
  expect(legend.map((li) => li.querySelector<HTMLElement>('.patches-clue')!.dataset.shape)).toEqual(['square', 'wide', 'tall', 'any', 'tall']);
  expect(legend[3].querySelector('rect')!.getAttribute('stroke-dasharray')).not.toBeNull();
  modal.querySelector<HTMLButtonElement>('button')!.click();
  unmount!();
  unmount = undefined;
  mount('#/');
  expect(document.querySelector('.modal')).toBeNull();
});

test('pagehide without a change leaves another tab save alone; after a move the move is saved', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const [a, b] = p.solution;
  const other = `${b.r},${b.c},${b.w},${b.h}`;
  savePatchesDaily({ date: DATE, rects: other, elapsedMs: 5000, solved: false });
  window.dispatchEvent(new Event('pagehide'));
  expect(loadPatchesDaily(DATE)!.rects).toBe(other);
  expect(loadPatchesDaily(DATE)!.elapsedMs).toBe(5000);
  await drawRect(p, a);
  window.dispatchEvent(new Event('pagehide'));
  expect(loadPatchesDaily(DATE)!.rects).not.toBe(other);
});

test('pagehide keeps the clock running since the last move', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await drawRect(p, p.solution[0]);
  nowMs += 90_000;
  window.dispatchEvent(new Event('pagehide'));
  expect(loadPatchesDaily(DATE)!.elapsedMs).toBe(90_000);
});

test('pagehide keeps the clock of a daily opened without a move', () => {
  savePatchesDaily({ date: DATE, rects: '', elapsedMs: 5000, solved: false });
  mount('#/');
  nowMs += 30_000;
  window.dispatchEvent(new Event('pagehide'));
  expect(loadPatchesDaily(DATE)!.elapsedMs).toBe(35_000);
});

test('leaving the daily keeps the clock running since the last move', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await drawRect(p, p.solution[0]);
  nowMs += 60_000;
  location.hash = '#/practice';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(loadPatchesDaily(DATE)!.elapsedMs).toBe(60_000);
});
