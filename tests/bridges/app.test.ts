// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadBridgesDaily, saveBridgesDaily, setBridgesPreset } from '../../src/bridges/storage';
import { mountBridges, parseBridgesRoute } from '../../src/bridges/app';
import { DAILY_PRESET, PRESETS, bridgesDailySeed, generatePuzzle } from '../../src/bridges/generate';
import type { Puzzle } from '../../src/bridges/types';

const DATE = '2026-10-26';
const PX = 50; // stubbed pixels per cell
let root: HTMLElement;
let nowMs: number;
let unmount: (() => void) | undefined;

const now = () => new Date(nowMs);
const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
const dailyPuzzle = (): Puzzle => generatePuzzle(PRESETS[DAILY_PRESET].size, bridgesDailySeed(DATE));
const counts = () => [...root.querySelectorAll<SVGGElement>('.bridges-link')].map((l) => l.dataset.count).join('');
const islandSig = () =>
  [...root.querySelectorAll<SVGGElement>('.bridges-island')].map((g) => g.getAttribute('aria-label')).join('|') +
  root.querySelector('svg.bridges-svg')!.getAttribute('viewBox');

function pointer(type: string, x: number, y: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  root.querySelector('svg.bridges-svg')!.dispatchEvent(ev);
}

/** Centre of a cell in client pixels. */
function centre(p: Puzzle, cell: number): [number, number] {
  return [((cell % p.size) + 0.5) * PX, (Math.floor(cell / p.size) + 0.5) * PX];
}

/** Drag from one end of a link to the other: one `cycle`. */
async function gesture(p: Puzzle, link: number, times = 1) {
  const l = p.links[link];
  for (let k = 0; k < times; k++) {
    pointer('pointerdown', ...centre(p, p.islands[l.a].cell));
    pointer('pointermove', ...centre(p, p.islands[l.b].cell));
    pointer('pointerup', ...centre(p, p.islands[l.b].cell));
  }
  await vi.advanceTimersByTimeAsync(0);
}

async function solve(p: Puzzle) {
  for (let i = 0; i < p.links.length; i++) if (p.solution[i] > 0) await gesture(p, i, p.solution[i]);
  await vi.advanceTimersByTimeAsync(2000);
}

function mount(hash: string) {
  location.hash = hash;
  unmount = mountBridges(root, { now });
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
  localStorage.setItem('flow:flag:bridges-howto-seen', '1');
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

test('parseBridgesRoute', () => {
  expect(parseBridgesRoute('')).toEqual({ mode: 'daily' });
  expect(parseBridgesRoute('#/practice')).toEqual({ mode: 'practice', preset: 'medium' });
  expect(parseBridgesRoute('#/practice?preset=large&seed=5')).toEqual({ mode: 'practice', preset: 'large', seed: 5 });
  expect(parseBridgesRoute('#/practice?preset=bogus&seed=abc')).toEqual({ mode: 'practice', preset: 'medium' });
  setBridgesPreset('small');
  expect(parseBridgesRoute('#/practice')).toEqual({ mode: 'practice', preset: 'small' });
});

test('daily shows number and size', () => {
  mount('#/');
  const p = dailyPuzzle();
  expect(text('.bridges-sub')).toContain('#7');
  expect(text('.bridges-sub')).toContain('9×9');
  expect(text('.bridges-done')).toBe(`0/${p.islands.length}`);
  expect(text('.bridges-time')).toBe('00:00');
  expect(root.querySelector('.shell-game')!.textContent).toBe('Bridges');
  expect(root.querySelectorAll('.bridges-island')).toHaveLength(p.islands.length);
});

test('a gesture updates the HUD and the save', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const first = p.solution.findIndex((v) => v > 0);
  await gesture(p, first);
  expect(root.querySelector<SVGGElement>(`.bridges-link[data-link="${first}"]`)!.dataset.count).toBe('1');
  const save = loadBridgesDaily(DATE)!;
  expect(save.links[first]).toBe('1');
  expect(save.solved).toBe(false);
});

test('undo button reverts and disables when history is empty', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const first = p.solution.findIndex((v) => v > 0);
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
  expect(undoBtn.disabled).toBe(true);
  await gesture(p, first);
  expect(undoBtn.disabled).toBe(false);
  undoBtn.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(counts()).toBe('0'.repeat(p.links.length));
  expect(undoBtn.disabled).toBe(true);
  expect(loadBridgesDaily(DATE)!.links[first]).toBe('0');
});

test('solving shows the win card', async () => {
  mount('#/');
  const p = dailyPuzzle();
  await solve(p);
  expect(text('.end-card__title')).toBe('All connected');
  expect(text('.end-card .btn--primary')).toBe('Play practice');
  expect(text('.end-card__next')).toContain('Next daily in');
  expect(text('.bridges-done')).toBe(`${p.islands.length}/${p.islands.length}`);
  const save = loadBridgesDaily(DATE)!;
  expect(save.solved).toBe(true);
  expect(save.links).toBe(p.solution.join(''));
  await gesture(p, p.solution.findIndex((v) => v > 0));
  expect(loadBridgesDaily(DATE)!.links).toBe(save.links);
  expect(counts()).toBe(p.solution.join(''));
});

test('daily restores from a save', () => {
  const p = dailyPuzzle();
  const first = p.solution.findIndex((v) => v > 0);
  const links = p.links.map((_, i) => (i === first ? '2' : '0')).join('');
  saveBridgesDaily({ date: DATE, links, elapsedMs: 65_000, solved: false });
  mount('#/');
  expect(counts()).toBe(links);
  expect(text('.bridges-time')).toBe('01:05');
});

test('a solved save reopens with the card', () => {
  const p = dailyPuzzle();
  saveBridgesDaily({ date: DATE, links: p.solution.join(''), elapsedMs: 9_000, solved: true });
  mount('#/');
  expect(text('.end-card__title')).toBe('All connected');
  expect(text('.end-card__stat')).toBe('00:09');
});

test('daily ignores a corrupt save', () => {
  const p = dailyPuzzle();
  saveBridgesDaily({ date: DATE, links: '1'.repeat(p.links.length + 1), elapsedMs: 9_000, solved: false });
  mount('#/');
  expect(counts()).toBe('0'.repeat(p.links.length));
  expect(text('.bridges-time')).toBe('00:00');
});

test('persist never overwrites a solved save from another tab', async () => {
  mount('#/');
  const p = dailyPuzzle();
  const done = p.solution.join('');
  saveBridgesDaily({ date: DATE, links: done, elapsedMs: 5_000, solved: true });
  await gesture(p, p.solution.findIndex((v) => v === 0));
  const save = loadBridgesDaily(DATE)!;
  expect(save.solved).toBe(true);
  expect(save.links).toBe(done);
  expect(text('.end-card__title')).toBe('All connected');
});

test('practice seed route is deterministic; Clear empties; New board changes the puzzle', async () => {
  mount('#/practice?preset=small&seed=7');
  const p = generatePuzzle(PRESETS.small.size, 7);
  expect(root.querySelector('svg.bridges-svg')!.getAttribute('viewBox')).toBe('0 0 7 7');
  expect(root.querySelectorAll('.bridges-island')).toHaveLength(p.islands.length);
  expect(root.querySelector('[data-preset="small"]')!.getAttribute('aria-pressed')).toBe('true');
  const first = islandSig();
  const clr = root.querySelector<HTMLButtonElement>('[data-action="clear"]')!;
  expect(clr.disabled).toBe(true);
  await gesture(p, 0);
  expect(clr.disabled).toBe(false);
  clr.click();
  document.querySelector<HTMLButtonElement>('.modal [data-action="confirm"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(counts()).toBe('0'.repeat(p.links.length));
  root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(counts()[0]).toBe('1');
  expect(loadBridgesDaily(DATE)).toBeNull();
  root.querySelector<HTMLButtonElement>('[data-action="new"]')!.click();
  expect(islandSig()).not.toBe(first);
});

test('reports puzzle_start once and puzzle_end on win', async () => {
  const track = vi.fn();
  (window as { umami?: unknown }).umami = { track };
  mount('#/practice?preset=small&seed=7');
  const p = generatePuzzle(PRESETS.small.size, 7);
  await gesture(p, 0);
  await gesture(p, 0);
  expect(track.mock.calls.filter(([e]) => e === 'puzzle_start')).toEqual([
    ['puzzle_start', { game: 'bridges', mode: 'practice', preset: 'small' }],
  ]);
  await gesture(p, 0); // back to none
  await solve(p);
  const ends = track.mock.calls.filter(([e]) => e === 'puzzle_end');
  expect(ends).toHaveLength(1);
  expect(ends[0][1]).toMatchObject({ game: 'bridges', result: 'won' });
});

test('how-to opens on the first visit only', () => {
  localStorage.removeItem('flow:flag:bridges-howto-seen');
  mount('#/');
  const modal = document.querySelector('.modal')!;
  expect(modal.textContent).toContain('How to play');
  expect([...modal.querySelectorAll('.bridges-howto__body li')].map((li) => li.textContent)).toEqual([
    'Connect the islands with bridges.',
    'Each number says how many bridges touch that island.',
    'Bridges run straight, never cross, and at most two join the same pair.',
    'All islands must join into one network.',
    'Drag from an island or tap the gap to add a bridge. Right-click removes one.',
  ]);
  expect(modal.querySelectorAll('.bridges-howto__demo .bridges-howto__island')).toHaveLength(5);
  modal.querySelector<HTMLButtonElement>('button')!.click();
  unmount!();
  unmount = undefined;
  mount('#/');
  expect(document.querySelector('.modal')).toBeNull();
});
