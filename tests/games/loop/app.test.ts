// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadLoopDaily, saveLoopDaily } from '../../../src/games/loop/storage';
import { mountLoop, parseLoopRoute } from '../../../src/games/loop/app';
import { DAILY_PRESET, PRESETS, generatePuzzle, loopDailySeed } from '../../../src/games/loop/generate';
import { geometry } from '../../../src/games/loop/geometry';
import { clueCount } from '../../../src/games/loop/game';
import type { Puzzle } from '../../../src/games/loop/types';

const DATE = '2026-10-26';
const PX = 50; // stubbed pixels per cell
const MARGIN = 0.4;
let root: HTMLElement;
let nowMs: number;
let unmount: (() => void) | undefined;

const now = () => new Date(nowMs);
const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
const dailyPuzzle = (): Puzzle => generatePuzzle(PRESETS[DAILY_PRESET].size, loopDailySeed(DATE));
const states = () => [...root.querySelectorAll<SVGGElement>('.loop-edge')].map((g) => g.dataset.state);

function pointer(type: string, x: number, y: number, button = 0) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  root.querySelector('svg.loop-svg')!.dispatchEvent(ev);
}

/** Client pixels of an edge's midpoint, allowing for the board's margin. */
function mid(p: Puzzle, edge: number): [number, number] {
  const m = geometry(p.size).mid[edge];
  return [(m.x + MARGIN) * PX, (m.y + MARGIN) * PX];
}

/** A tap on an edge: one `cycle`. */
async function tap(p: Puzzle, edge: number) {
  pointer('pointerdown', ...mid(p, edge));
  pointer('pointerup', ...mid(p, edge));
  await vi.advanceTimersByTimeAsync(0);
}

async function solve(p: Puzzle) {
  for (let e = 0; e < p.solution.length; e++) if (p.solution[e] === 1) await tap(p, e);
  await vi.advanceTimersByTimeAsync(2000);
}

function mount(hash: string) {
  location.hash = hash;
  unmount = mountLoop(root, { now });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })),
  );
  // One cell is PX pixels on every board: the box follows the SVG's viewBox.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const n = Number(this.getAttribute('viewBox')?.split(' ')[2] ?? 0) * PX;
    return { left: 0, top: 0, width: n, height: n, right: n, bottom: n, x: 0, y: 0, toJSON() {} } as DOMRect;
  });
  localStorage.clear();
  localStorage.setItem('flow:flag:loop-howto-seen', '1');
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
  vi.restoreAllMocks();
  delete (window as { umami?: unknown }).umami;
});

test('parseLoopRoute', () => {
  expect(parseLoopRoute('')).toEqual({ mode: 'daily' });
  expect(parseLoopRoute('#/practice')).toEqual({ mode: 'practice', preset: 'medium' });
  expect(parseLoopRoute('#/practice?preset=large&seed=5')).toEqual({ mode: 'practice', preset: 'large', seed: 5 });
});

test('daily shows a 7×7 board, number and size', () => {
  mount('#/');
  const p = dailyPuzzle();
  expect(p.size).toBe(7);
  expect(root.querySelector('svg.loop-svg')!.getAttribute('viewBox')).toBe('-0.4 -0.4 7.8 7.8');
  expect(text('.loop-sub')).toContain('7×7');
  // An empty board already satisfies the 0 clues.
  expect(text('.loop-done')).toBe(`${p.clues.filter((n) => n === 0).length}/${clueCount(p)}`);
  expect(root.querySelector('.shell-game')!.textContent).toBe('Loop');
});

test('practice route shows the preset size', () => {
  mount('#/practice?preset=small&seed=3');
  expect(root.querySelector('svg.loop-svg')!.getAttribute('viewBox')).toBe('-0.4 -0.4 5.8 5.8');
});

test('solving through the board shows the win card and saves', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await solve(p);
  expect(text('.end-card__title')).toBe('Loop closed');
  const save = loadLoopDaily(DATE)!;
  expect(save.solved).toBe(true);
  expect(save.edges).toBe(p.solution.join(''));
});

test('a saved daily restores lines and crosses, and a tap saves', async () => {
  const p = dailyPuzzle();
  const first = p.solution.findIndex((v) => v === 1);
  const cross = p.solution.findIndex((v) => v === 0);
  const edges = p.solution.map((_, i) => (i === first ? '1' : i === cross ? '2' : '0')).join('');
  saveLoopDaily({ date: DATE, edges, elapsedMs: 65_000, solved: false });
  mount('#/');
  const s = states();
  expect(s[first]).toBe('line');
  expect(s[cross]).toBe('cross');
  expect(text('.loop-time')).toBe('01:05');
  await tap(p, first); // line -> cross
  expect(loadLoopDaily(DATE)!.edges[first]).toBe('2');
});

test('how-to lists the rules and a demo board', () => {
  localStorage.removeItem('flow:flag:loop-howto-seen');
  mount('#/');
  const modal = document.querySelector('.modal')!;
  expect([...modal.querySelectorAll('.loop-howto__body li')].map((li) => li.textContent)).toEqual([
    'Draw one closed loop along the dotted lines.',
    "Each number says how many of its cell's four sides the loop uses.",
    'The loop never branches or crosses itself.',
    'Tap an edge to cycle line, ✕ and empty. Drag across dots to draw or erase. Right-click places ✕.',
  ]);
  expect(modal.querySelectorAll('.loop-howto__body svg.loop-mini .loop-lines line')).toHaveLength(8);
});
