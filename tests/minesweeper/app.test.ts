// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mulberry32 } from '../../src/core/rng';
import { saveMinesDaily, loadMinesDaily, setMinesPreset } from '../../src/core/storage';
import { mountMines, parseMinesRoute } from '../../src/minesweeper/app';
import { encodeCells, newGame, reveal } from '../../src/minesweeper/game';
import { PRESETS, generateBoard, minesDailySeed, neighbours } from '../../src/minesweeper/generate';
import type { Board } from '../../src/minesweeper/types';

let root: HTMLElement;
let nowMs: number;
let hovered: number;
let unmount: (() => void) | undefined;

const now = () => new Date(nowMs);
const cell = (i: number) => root.querySelector<HTMLElement>(`[data-i="${i}"]`)!;
const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';

function fire(type: string, buttons: number, i: number, pointerType = 'mouse') {
  hovered = i;
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, buttons, clientX: 1, clientY: 1 });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  root.querySelector('.mines-grid')!.dispatchEvent(ev);
}
const leftClick = (i: number) => { fire('pointerdown', 1, i); fire('pointerup', 0, i); };
const rightClick = (i: number) => { fire('pointerdown', 2, i); fire('pointerup', 0, i); };
const tap = (i: number) => { fire('pointerdown', 1, i, 'touch'); fire('pointerup', 0, i, 'touch'); };

function dailyBoard(date: string): Board {
  return generateBoard(PRESETS.expert, mulberry32(minesDailySeed(date)));
}
/** A hidden safe cell and a mine, given the opening. */
function targets(b: Board) {
  const g = newGame(b);
  const safe = [...g.cells.keys()].find((i) => g.cells[i] === 0 && !b.mines[i])!;
  const mine = [...b.mines.keys()].find((i) => b.mines[i] === 1)!;
  return { g, safe, mine };
}

function mount(hash: string) {
  location.hash = hash;
  unmount = mountMines(root, { now });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  localStorage.clear();
  localStorage.setItem('flow:flag:mines-howto-seen', '1');
  nowMs = Date.parse('2026-10-21T10:00:00Z');
  root = document.createElement('div');
  document.body.appendChild(root);
  hovered = -1;
  document.elementFromPoint = () => (hovered >= 0 ? cell(hovered) : document.body);
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  root.remove();
  vi.useRealTimers();
});

test('parseMinesRoute', () => {
  expect(parseMinesRoute('')).toEqual({ mode: 'daily' });
  expect(parseMinesRoute('#/')).toEqual({ mode: 'daily' });
  expect(parseMinesRoute('#/practice')).toEqual({ mode: 'practice', preset: 'expert' });
  expect(parseMinesRoute('#/practice?preset=huge&seed=123')).toEqual({ mode: 'practice', preset: 'huge', seed: 123 });
  expect(parseMinesRoute('#/practice?preset=nope')).toEqual({ mode: 'practice', preset: 'expert' });
  setMinesPreset('classic');
  expect(parseMinesRoute('#/practice')).toEqual({ mode: 'practice', preset: 'classic' });
});

test('header links to Flow and marks Mines current', () => {
  mount('#/');
  const flow = root.querySelector<HTMLAnchorElement>('a[href="./index.html"]')!;
  expect(flow.textContent).toBe('Flow');
  expect(root.querySelector('[aria-current="page"]')!.textContent).toBe('Mines');
});

test('daily subtitle', () => {
  mount('#/');
  expect(text('.mines-sub')).toBe('#2 · Wed Oct 21 · 30×20 · 130 mines');
  expect(text('.mines-left')).toBe('130');
  expect(text('.mines-time')).toBe('00:00');
});

test('daily board is the date-seeded board with its opening revealed', () => {
  mount('#/');
  const { g } = targets(dailyBoard('2026-10-21'));
  const shown = [...root.querySelectorAll('.mines-cell')].map((c) => (c.classList.contains('is-revealed') ? 'r' : 'h')).join('');
  expect(shown).toBe(encodeCells(g));
});

test('daily progress is saved after an action and restored on remount', () => {
  mount('#/');
  const { safe, mine } = targets(dailyBoard('2026-10-21'));
  rightClick(mine);
  leftClick(safe);
  const save = loadMinesDaily('2026-10-21')!;
  expect(save.status).toBe('playing');
  expect(save.cells[mine]).toBe('f');
  expect(save.cells[safe]).toBe('r');
  unmount!();
  root.textContent = '';
  mount('#/');
  expect(cell(safe).classList.contains('is-revealed')).toBe(true);
  expect(cell(mine).classList.contains('is-flagged')).toBe(true);
  expect(text('.mines-left')).toBe('129');
});

test('timer runs from the board appearing and stops on loss', () => {
  mount('#/');
  nowMs += 5_000;
  vi.advanceTimersByTime(5_000);
  expect(text('.mines-time')).toBe('00:05');
  leftClick(targets(dailyBoard('2026-10-21')).mine);
  nowMs += 5_000;
  vi.advanceTimersByTime(5_000);
  expect(text('.mines-time')).toBe('00:05');
});

test('a lost daily shows Boom. and reopens on it, non-interactive', () => {
  mount('#/');
  const { mine, safe } = targets(dailyBoard('2026-10-21'));
  leftClick(mine);
  expect(text('.mines-card h2')).toBe('Boom.');
  expect(text('.mines-card')).toContain('Next daily in 14:00:00');
  expect(root.querySelector('.mines-card .btn--primary')!.textContent).toBe('Play practice');
  unmount!();
  root.textContent = '';
  mount('#/');
  expect(text('.mines-card h2')).toBe('Boom.');
  expect(root.querySelector('.mines-board--locked')).not.toBeNull();
  leftClick(safe);
  expect(cell(safe).classList.contains('is-hidden')).toBe(true);
});

test('loss card reports % cleared', () => {
  mount('#/');
  const b = dailyBoard('2026-10-21');
  const { g, mine } = targets(b);
  leftClick(mine);
  const pct = Math.round((g.revealed / (600 - 130)) * 100);
  expect(text('.mines-card')).toContain(`${pct}% cleared`);
});

test('winning shows Cleared ✦ with the time and dims the board', () => {
  location.hash = '#/practice?preset=classic&seed=7';
  unmount = mountMines(root, { now });
  const b = generateBoard(PRESETS.classic, mulberry32(7));
  const g = newGame(b);
  nowMs += 61_000;
  vi.advanceTimersByTime(61_000);
  for (let i = 0; i < g.cells.length; i++) {
    if (g.cells[i] === 0 && !b.mines[i]) {
      reveal(g, i);
      if (!cell(i).classList.contains('is-revealed')) leftClick(i);
    }
  }
  expect(text('.mines-card h2')).toBe('Cleared ✦');
  expect(text('.mines-card')).toContain('01:01');
  expect(root.querySelector('.mines-card .btn--primary')!.textContent).toBe('New board');
  expect(root.querySelector('.mines-stage.is-dimmed')).not.toBeNull();
});

test('tap on a revealed number chords, on a hidden cell reveals', () => {
  mount('#/practice?preset=expert&seed=11');
  const b = generateBoard(PRESETS.expert, mulberry32(11));
  const g = newGame(b);
  const n = [...g.cells.keys()].find(
    (i) => g.cells[i] === 1 && b.adj[i] > 0 && neighbours(30, 20, i).some((j) => g.cells[j] === 0 && !b.mines[j]),
  )!;
  for (const j of neighbours(30, 20, n)) if (b.mines[j]) rightClick(j);
  tap(n);
  for (const j of neighbours(30, 20, n)) {
    if (!b.mines[j]) expect(cell(j).classList.contains('is-revealed')).toBe(true);
  }
  const { safe } = targets(b);
  tap(safe);
  expect(cell(safe).classList.contains('is-revealed') || text('.mines-card h2') !== '').toBe(true);
});

test('Restart replays the same board; New board changes it', () => {
  mount('#/practice?preset=classic&seed=5');
  const opening = () => [...root.querySelectorAll('.mines-cell')].map((c) => (c.classList.contains('is-revealed') ? 'r' : 'h')).join('');
  const first = opening();
  const b = generateBoard(PRESETS.classic, mulberry32(5));
  const { safe } = targets(b);
  leftClick(safe);
  expect(opening()).not.toBe(first);
  root.querySelector<HTMLButtonElement>('[data-action="restart"]')!.click();
  expect(opening()).toBe(first);
  root.querySelector<HTMLButtonElement>('[data-action="new"]')!.click();
  expect(opening()).not.toBe(first);
});

test('practice preset switch changes the board size and is remembered', () => {
  mount('#/practice');
  expect(root.querySelectorAll('.mines-cell')).toHaveLength(600);
  root.querySelector<HTMLButtonElement>('[data-preset="huge"]')!.click();
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(root.querySelectorAll('.mines-cell')).toHaveLength(1500);
  expect(parseMinesRoute('#/practice')).toEqual({ mode: 'practice', preset: 'huge' });
});

// Review Focus 5
test('timer resumes from saved elapsedMs, not wall-clock', () => {
  const b = dailyBoard('2026-10-21');
  saveMinesDaily({ date: '2026-10-21', cells: encodeCells(newGame(b)), elapsedMs: 65_000, status: 'playing' });
  nowMs += 3 * 3_600_000;
  mount('#/');
  expect(text('.mines-time')).toBe('01:05');
});

test('a save that does not fit today\'s board is ignored', () => {
  saveMinesDaily({ date: '2026-10-21', cells: 'h'.repeat(600), elapsedMs: 9_000, status: 'playing' });
  mount('#/');
  expect(text('.mines-time')).toBe('00:00');
  expect(root.querySelectorAll('.is-revealed').length).toBeGreaterThan(0);
});

test('leaving the daily for practice and back keeps the elapsed time', () => {
  mount('#/');
  nowMs += 5_000;
  vi.advanceTimersByTime(5_000);
  location.hash = '#/practice';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  nowMs += 60_000;
  location.hash = '#/';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(text('.mines-time')).toBe('00:05');
});

test('time away in the back/forward cache is not counted', () => {
  mount('#/');
  nowMs += 5_000;
  vi.advanceTimersByTime(5_000);
  window.dispatchEvent(new Event('pagehide'));
  nowMs += 600_000;
  const show = new Event('pageshow') as PageTransitionEvent;
  Object.defineProperty(show, 'persisted', { value: true });
  window.dispatchEvent(show);
  vi.advanceTimersByTime(1_000);
  expect(text('.mines-time')).toBe('00:05');
});

test('a finished daily save is never overwritten by a stale playing tab', () => {
  mount('#/');
  const { safe, mine } = targets(dailyBoard('2026-10-21'));
  // Another tab lost today's daily.
  const g = newGame(dailyBoard('2026-10-21'));
  reveal(g, mine);
  saveMinesDaily({ date: '2026-10-21', cells: encodeCells(g), elapsedMs: 9_000, status: 'lost' });
  leftClick(safe);
  window.dispatchEvent(new Event('pagehide'));
  expect(loadMinesDaily('2026-10-21')!.status).toBe('lost');
  expect(text('.mines-card h2')).toBe('Boom.');
});

// Review Focus 2
test('UTC rollover loads the next daily', () => {
  nowMs = Date.parse('2026-10-21T23:59:58Z');
  const { mine } = targets(dailyBoard('2026-10-21'));
  mount('#/');
  leftClick(mine);
  expect(text('.mines-card h2')).toBe('Boom.');
  nowMs += 3_000;
  vi.advanceTimersByTime(3_000);
  expect(text('.mines-sub')).toBe('#3 · Thu Oct 22 · 30×20 · 130 mines');
  expect(root.querySelector('.mines-card')).toBeNull();
  expect(root.querySelector('.mines-board--locked')).toBeNull();
});
