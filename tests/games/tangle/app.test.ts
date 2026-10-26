// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadTangleDaily, saveTangleDaily, setTanglePreset } from '../../../src/games/tangle/storage';
import { mountTangle, parseTangleRoute } from '../../../src/games/tangle/app';
import { BUMP_COOLDOWN_MS } from '../../../src/games/tangle/board';
import { buildOcc, blockersOf, analyze } from '../../../src/games/tangle/solver';
import { DAILY_PRESET, PRESETS, generateLevel, tangleDailySeed } from '../../../src/games/tangle/generate';
import type { Level } from '../../../src/games/tangle/types';

const DATE = '2026-10-21';
let root: HTMLElement;
let nowMs: number;
let unmount: (() => void) | undefined;

const now = () => new Date(nowMs);
const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';

const levels = new Map<string, Level>();
function level(preset: keyof typeof PRESETS, seed: number): Level {
  const key = `${preset}:${seed}`;
  if (!levels.has(key)) levels.set(key, generateLevel(PRESETS[preset], seed));
  return levels.get(key)!;
}
const dailyLevel = () => level(DAILY_PRESET, tangleDailySeed(DATE));

function svg(): SVGSVGElement {
  return root.querySelector<SVGSVGElement>('svg.tangle-svg')!;
}

/** 1 px per cell so a cell's centre is (c + .5, r + .5). */
function stubRect(l: Level) {
  svg().getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: l.cols, bottom: l.rows, width: l.cols, height: l.rows, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

function pointer(type: string, x: number, y: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'isPrimary', { value: true });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  svg().dispatchEvent(ev);
}

/** Taps the head of arrow `i` and lets the (reduced-motion) animation finish. */
async function tapArrow(l: Level, i: number) {
  stubRect(l);
  const cells = l.arrows[i].cells;
  const head = cells[cells.length - 1];
  const x = (head % l.cols) + 0.5;
  const y = Math.floor(head / l.cols) + 0.5;
  pointer('pointerdown', x, y);
  pointer('pointerup', x, y);
  await vi.advanceTimersByTimeAsync(BUMP_COOLDOWN_MS + 100);
}

function blockedArrow(l: Level): number {
  const occ = buildOcc(l);
  return l.arrows.findIndex((_, i) => blockersOf(l, occ, i).length > 0);
}

function mount(hash: string) {
  location.hash = hash;
  unmount = mountTangle(root, { now });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })),
  );
  localStorage.clear();
  localStorage.setItem('flow:flag:tangle-howto-seen', '1');
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

test('parseTangleRoute', () => {
  expect(parseTangleRoute('')).toEqual({ mode: 'daily' });
  expect(parseTangleRoute('#/practice')).toEqual({ mode: 'practice', preset: 'hard' });
  expect(parseTangleRoute('#/practice?preset=huge&seed=5')).toEqual({ mode: 'practice', preset: 'huge', seed: 5 });
  expect(parseTangleRoute('#/practice?preset=bogus&seed=abc')).toEqual({ mode: 'practice', preset: 'hard' });
  setTanglePreset('medium');
  expect(parseTangleRoute('#/practice')).toEqual({ mode: 'practice', preset: 'medium' });
});

test('daily shows number, size and arrow count', () => {
  mount('#/');
  const n = dailyLevel().arrows.length;
  expect(text('.tangle-sub')).toBe(`#2 · Wed Oct 21 · 40×40 · ${n} arrows`);
  expect(text('.tangle-left')).toBe(String(n));
  expect(text('.tangle-lives')).toBe('♥♥♥');
  expect(root.querySelector('.tangle-lives')!.getAttribute('aria-label')).toBe('3 of 3 lives left');
  expect(text('.tangle-time')).toBe('00:00');
  expect(text('.tangle-attempt')).toBe('');
  expect(root.querySelector('.shell-game')!.textContent).toBe('Tangle');
});

test('exiting an arrow updates the HUD and the save', async () => {
  mount('#/');
  const l = dailyLevel();
  const first = analyze(l)!.order[0];
  await tapArrow(l, first);
  expect(text('.tangle-left')).toBe(String(l.arrows.length - 1));
  const save = loadTangleDaily(DATE)!;
  expect([...save.removed].filter((c) => c === '0')).toHaveLength(1);
  expect(save.removed[first]).toBe('0');
  expect(save.lives).toBe(3);
  expect(root.querySelector(`.tangle-arrow[data-a="${first}"]`)).toBeNull();
});

test('a bump costs a heart', async () => {
  mount('#/');
  const l = dailyLevel();
  await tapArrow(l, blockedArrow(l));
  expect(text('.tangle-lives')).toBe('♥♥♡');
  expect(text('.tangle-left')).toBe(String(l.arrows.length));
  expect(loadTangleDaily(DATE)!.lives).toBe(2);
});

test('three bumps show Out of lives; Try again starts attempt 2 with 3 lives', async () => {
  mount('#/');
  const l = dailyLevel();
  const b = blockedArrow(l);
  for (let k = 0; k < 3; k++) await tapArrow(l, b);
  expect(text('.tangle-lives')).toBe('♡♡♡');
  expect(text('.end-card__title')).toBe('Out of lives');
  expect(text('.end-card__stat')).toBe('0% cleared · 00:00');
  expect(root.querySelector('.tangle-stage')!.classList.contains('is-dimmed')).toBe(false);
  expect(root.querySelector('[data-action="practice"]')).not.toBeNull();
  expect(loadTangleDaily(DATE)!.status).toBe('lost');
  const retry = [...root.querySelectorAll<HTMLButtonElement>('.end-card button')].find((x) => x.textContent === 'Try again')!;
  retry.click();
  expect(root.querySelector('.end-card')).toBeNull();
  expect(text('.tangle-lives')).toBe('♥♥♥');
  expect(text('.tangle-attempt')).toBe('Attempt 2');
  const save = loadTangleDaily(DATE)!;
  expect(save).toMatchObject({ attempt: 2, lives: 3, status: 'playing' });
  expect(save.removed).toBe('1'.repeat(l.arrows.length));
});

test('clearing every arrow shows the win card', async () => {
  mount('#/practice?preset=medium&seed=7');
  const l = level('medium', 7);
  for (const i of analyze(l)!.order) await tapArrow(l, i);
  expect(text('.end-card__title')).toBe('Untangled ✦');
  expect(root.querySelector('.tangle-stage')!.classList.contains('is-dimmed')).toBe(true);
  expect(text('.end-card button')).toBe('New board');
});

test('daily restores from a save', () => {
  const l = dailyLevel();
  const removed = '0' + '1'.repeat(l.arrows.length - 1);
  saveTangleDaily({ date: DATE, removed, lives: 2, elapsedMs: 65_000, status: 'playing', attempt: 2 });
  mount('#/');
  expect(text('.tangle-left')).toBe(String(l.arrows.length - 1));
  expect(text('.tangle-lives')).toBe('♥♥♡');
  expect(text('.tangle-attempt')).toBe('Attempt 2');
  expect(text('.tangle-time')).toBe('01:05');
  expect(root.querySelector('.tangle-arrow[data-a="0"]')).toBeNull();
});

test('daily ignores a save whose length does not match', () => {
  const l = dailyLevel();
  saveTangleDaily({ date: DATE, removed: '0', lives: 1, elapsedMs: 9_000, status: 'playing', attempt: 4 });
  mount('#/');
  expect(text('.tangle-left')).toBe(String(l.arrows.length));
  expect(text('.tangle-lives')).toBe('♥♥♥');
  expect(text('.tangle-attempt')).toBe('');
  expect(text('.tangle-time')).toBe('00:00');
});

test('persist never overwrites a later attempt from another tab', async () => {
  mount('#/');
  const l = dailyLevel();
  const all = '1'.repeat(l.arrows.length);
  saveTangleDaily({ date: DATE, removed: all, lives: 3, elapsedMs: 0, status: 'playing', attempt: 3 });
  await tapArrow(l, analyze(l)!.order[0]);
  const save = loadTangleDaily(DATE)!;
  expect(save.attempt).toBe(3);
  expect(save.removed).toBe(all);
  expect(text('.tangle-attempt')).toBe('Attempt 3');
});

test('persist never overwrites a won save from another tab', async () => {
  mount('#/');
  const l = dailyLevel();
  const b = blockedArrow(l);
  for (let k = 0; k < 2; k++) await tapArrow(l, b);
  // Another tab wins this attempt; our next bump is the last life.
  saveTangleDaily({ date: DATE, removed: '0'.repeat(l.arrows.length), lives: 3, elapsedMs: 5_000, status: 'won', attempt: 1 });
  await tapArrow(l, b);
  expect(loadTangleDaily(DATE)!.status).toBe('won');
  expect(text('.end-card__title')).toBe('Untangled ✦');
});

test('a finished lost daily reopens with Out of lives and Try again', () => {
  const l = dailyLevel();
  saveTangleDaily({ date: DATE, removed: '1'.repeat(l.arrows.length), lives: 0, elapsedMs: 9_000, status: 'lost', attempt: 1 });
  mount('#/');
  expect(text('.end-card__title')).toBe('Out of lives');
  expect([...root.querySelectorAll('.end-card button')].some((x) => x.textContent === 'Try again')).toBe(true);
});

test('a finished won daily reopens with the win card', () => {
  const l = dailyLevel();
  saveTangleDaily({ date: DATE, removed: '0'.repeat(l.arrows.length), lives: 3, elapsedMs: 9_000, status: 'won', attempt: 1 });
  mount('#/');
  expect(text('.end-card__title')).toBe('Untangled ✦');
});

test('practice seed route is deterministic and Restart restores all arrows', async () => {
  mount('#/practice?preset=medium&seed=7');
  const l = level('medium', 7);
  expect(root.querySelectorAll('.tangle-arrow')).toHaveLength(l.arrows.length);
  expect(text('.tangle-left')).toBe(String(l.arrows.length));
  expect(root.querySelector('[data-preset="medium"]')!.getAttribute('aria-pressed')).toBe('true');
  await tapArrow(l, blockedArrow(l));
  await tapArrow(l, analyze(l)!.order[0]);
  expect(text('.tangle-left')).toBe(String(l.arrows.length - 1));
  expect(text('.tangle-lives')).toBe('♥♥♡');
  root.querySelector<HTMLButtonElement>('[data-action="restart"]')!.click();
  expect(document.querySelector('.modal')?.textContent).toContain('Restart this board?');
  document.querySelector<HTMLButtonElement>('.modal [data-action="confirm"]')!.click();
  expect(root.querySelectorAll('.tangle-arrow')).toHaveLength(l.arrows.length);
  expect(text('.tangle-left')).toBe(String(l.arrows.length));
  expect(text('.tangle-lives')).toBe('♥♥♥');
  expect(loadTangleDaily(DATE)).toBeNull();
});

test('how-to opens on the first visit only', () => {
  localStorage.removeItem('flow:flag:tangle-howto-seen');
  mount('#/');
  const modal = document.querySelector('.modal')!;
  expect(modal.textContent).toContain('How to play');
  expect([...modal.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
    'Tap an arrow to slide it out of the board.',
    "It can't turn — it travels the way its head points.",
    'If another arrow is in the way it bumps back and you lose a ♥.',
    'You have 3 lives. Clear every arrow to win.',
  ]);
  expect(modal.querySelector('svg.tangle-howto__demo')).not.toBeNull();
  modal.querySelector<HTMLButtonElement>('button')!.click();
  unmount!();
  unmount = undefined;
  mount('#/');
  expect(document.querySelector('.modal')).toBeNull();
});
