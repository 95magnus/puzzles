// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadSumsDaily, saveSumsDaily } from '../../../src/games/sums/storage';
import { mountSums, parseSumsRoute } from '../../../src/games/sums/app';
import { MISTAKE_PAUSE_MS } from '../../../src/games/sums/board';
import { DAILY_PRESET, PRESETS, generatePuzzle, sumsDailySeed } from '../../../src/games/sums/generate';
import type { Puzzle } from '../../../src/games/sums/types';

const DATE = '2026-11-02';
const TRACK = 50;
let root: HTMLElement;
let nowMs: number;
let unmount: (() => void) | undefined;

const now = () => new Date(nowMs);
const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
const daily = (): Puzzle => generatePuzzle(PRESETS[DAILY_PRESET].size, sumsDailySeed(DATE));
const grid = () => root.querySelector<HTMLElement>('.sums-grid')!;
const cellsOf = (p: Puzzle, want: 0 | 1) => p.solution.map((k, i) => (k === want ? i : -1)).filter((i) => i >= 0);

function stub(p: Puzzle): void {
  const w = (p.size + 1) * TRACK;
  grid().getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: w, right: w, bottom: w, x: 0, y: 0, toJSON() {} }) as DOMRect;
}
const centre = (p: Puzzle, i: number): [number, number] => [
  TRACK + (i % p.size) * TRACK + 25,
  TRACK + Math.floor(i / p.size) * TRACK + 25,
];

/** A left click on digit cell i, as the board's pointer handlers see it. */
function click(p: Puzzle, i: number): void {
  stub(p);
  const [x, y] = centre(p, i);
  for (const type of ['pointerdown', 'pointerup']) {
    const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
    grid().dispatchEvent(ev);
  }
}
function rightClick(p: Puzzle, i: number): void {
  stub(p);
  const [x, y] = centre(p, i);
  grid().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y }));
}

function mount(hash: string) {
  location.hash = hash;
  unmount = mountSums(root, { now });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })),
  );
  localStorage.clear();
  localStorage.setItem('flow:flag:sums-howto-seen', '1');
  nowMs = Date.parse(`${DATE}T12:00:00Z`);
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  root.remove();
  location.hash = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('parseSumsRoute', () => {
  expect(parseSumsRoute('')).toEqual({ mode: 'daily' });
  expect(parseSumsRoute('#/practice')).toEqual({ mode: 'practice', preset: 'medium' });
  expect(parseSumsRoute('#/practice?preset=hard&seed=5')).toEqual({ mode: 'practice', preset: 'hard', seed: 5 });
});

test('daily mounts a 7×7 grid with a subtitle', () => {
  mount('#/');
  expect(root.querySelectorAll('.sums-grid .sums-cell')).toHaveLength(49);
  expect(text('.sums-sub')).toContain('7×7');
  expect(text('.sums-lives')).toBe('♥♥♥');
  expect(text('.sums-left')).toBe(String(cellsOf(daily(), 0).length));
  expect(root.querySelector('.shell-game')!.textContent).toBe('Sums');
});

test('practice easy route shows 25 cells', () => {
  mount('#/practice?preset=easy&seed=3');
  expect(root.querySelectorAll('.sums-grid .sums-cell')).toHaveLength(25);
});

test('striking every non-solution digit wins and saves', async () => {
  mount('#/');
  const p = daily();
  for (const i of cellsOf(p, 0)) click(p, i);
  await vi.advanceTimersByTimeAsync(1000);
  expect(text('.end-card__title')).toBe('All lines add up');
  expect(text('.end-card__stat')).toContain('first try');
  expect(text('.sums-left')).toBe('0');
  expect(loadSumsDaily(DATE)!.status).toBe('won');
});

test('three mistakes show Out of lives; Try again starts attempt 2', async () => {
  mount('#/');
  const p = daily();
  for (const i of cellsOf(p, 1).slice(0, 3)) {
    click(p, i);
    await vi.advanceTimersByTimeAsync(MISTAKE_PAUSE_MS + 100);
  }
  expect(text('.sums-lives')).toBe('♡♡♡');
  expect(text('.end-card__title')).toBe('Out of lives');
  expect(text('.end-card__stat')).toMatch(/^0% struck · /);
  expect(loadSumsDaily(DATE)!.status).toBe('lost');
  [...root.querySelectorAll<HTMLButtonElement>('.end-card button')].find((x) => x.textContent === 'Try again')!.click();
  expect(root.querySelector('.end-card')).toBeNull();
  expect(text('.sums-lives')).toBe('♥♥♥');
  expect(text('.sums-attempt')).toBe('Attempt 2');
  expect(loadSumsDaily(DATE)).toMatchObject({ attempt: 2, lives: 3, status: 'playing', cells: '0'.repeat(49) });
});

test('reload restores strikes, marks, locks and lives', async () => {
  mount('#/');
  const p = daily();
  const s1 = cellsOf(p, 0)[0];
  const [k1, k2] = cellsOf(p, 1);
  click(p, s1);
  rightClick(p, k2);
  click(p, k1);
  await vi.advanceTimersByTimeAsync(MISTAKE_PAUSE_MS + 100);
  const save = loadSumsDaily(DATE)!;
  expect(save.cells[s1]).toBe('1');
  expect(save.cells[k2]).toBe('2');
  expect(save.cells[k1]).toBe('3');
  expect(save.lives).toBe(2);
  unmount!();
  unmount = undefined;
  mount('#/');
  expect(text('.sums-lives')).toBe('♥♥♡');
  expect(text('.sums-left')).toBe(String(cellsOf(p, 0).length - 1));
  const state = (i: number) => grid().querySelector<HTMLElement>(`[data-cell="${i}"]`)!.dataset.state;
  expect([state(s1), state(k2), state(k1)]).toEqual(['struck', 'marked', 'locked']);
});

test('a saved daily that strikes a solution cell is discarded', () => {
  const p = daily();
  const cells = Array.from({ length: 49 }, () => '0');
  cells[cellsOf(p, 1)[0]] = '1';
  saveSumsDaily({ date: DATE, cells: cells.join(''), lives: 1, elapsedMs: 9_000, status: 'playing', attempt: 4 });
  mount('#/');
  expect(text('.sums-lives')).toBe('♥♥♥');
  expect(text('.sums-attempt')).toBe('');
  expect(text('.sums-left')).toBe(String(cellsOf(p, 0).length));
});

test('how-to lists the four rules and a static grid', () => {
  localStorage.removeItem('flow:flag:sums-howto-seen');
  mount('#/');
  const modal = document.querySelector('.modal')!;
  expect([...modal.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
    'Strike out digits until every row and column adds up to its target.',
    'Strike a digit that belongs and you lose a life. You have 3.',
    'Long-press or right-click to mark a digit you want to keep. Marks are free.',
    'The small number under each target shows how much that line still has to lose.',
  ]);
  expect(modal.querySelectorAll('.sums-grid .sums-cell')).toHaveLength(9);
});
