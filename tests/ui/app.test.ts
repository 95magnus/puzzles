// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { generateWithSolution } from '../../src/core/generator';
import { mulberry32, seedFromDate } from '../../src/core/rng';
import { loadDaily, saveDaily } from '../../src/core/storage';
import type { Cell } from '../../src/core/types';

vi.mock('../../src/gen/client', async () => {
  const actual = await vi.importActual<typeof import('../../src/gen/client')>('../../src/gen/client');
  const { generate } = await import('../../src/core/generator');
  const { mulberry32: rng } = await import('../../src/core/rng');
  return {
    ...actual,
    requestPuzzle: vi.fn((size: number, seed: number) => Promise.resolve(generate(size, rng(seed)))),
  };
});

import { mountApp, parseRoute } from '../../src/ui/app';
import { createHud } from '../../src/ui/hud';
import { createWinCard } from '../../src/ui/winCard';

let root: HTMLElement;
let unmount: (() => void) | void;

const solutionFor = (date: string) => generateWithSolution(7, mulberry32(seedFromDate(date))).solution;
const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T | null;
const subtitle = () => $('[data-role="subtitle"]')?.textContent;
const hudText = () => $('.hud')?.textContent ?? '';
const winCard = () => $('.win')!;
const svg = () => $<SVGSVGElement>('.board-svg')!;

async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
}

function mount(nowIso: string | (() => Date)) {
  const now = typeof nowIso === 'string' ? () => new Date(nowIso) : nowIso;
  unmount = mountApp(root, { now });
}

/** Stub the board's geometry so pointer events map to cells (100px per cell). */
function prepBoard(size: number) {
  const s = svg();
  const ext = size * 100;
  s.getBoundingClientRect = () => ({ left: 0, top: 0, width: ext, height: ext, right: ext, bottom: ext, x: 0, y: 0 }) as DOMRect;
  s.setPointerCapture = vi.fn();
  s.releasePointerCapture = vi.fn();
  s.hasPointerCapture = vi.fn(() => true);
}

function fire(type: string, c: Cell) {
  const Ctor = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const ev = new Ctor(type, { bubbles: true, cancelable: true, clientX: c.c * 100 + 50, clientY: c.r * 100 + 50, button: 0 });
  if ((ev as PointerEvent).pointerId !== 1) Object.defineProperty(ev, 'pointerId', { value: 1 });
  if (!(ev as PointerEvent).pointerType) Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
  svg().dispatchEvent(ev);
}

function draw(path: Cell[]) {
  fire('pointerdown', path[0]);
  for (const c of path.slice(1)) fire('pointermove', c);
  fire('pointerup', path[path.length - 1]);
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '#/');
  // Reduced motion: celebrate() resolves immediately.
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  if (typeof unmount === 'function') unmount();
  unmount = undefined;
  root.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('parseRoute', () => {
  expect(parseRoute('')).toEqual({ mode: 'daily' });
  expect(parseRoute('#/')).toEqual({ mode: 'daily' });
  expect(parseRoute('#/practice')).toEqual({ mode: 'practice', size: 7 });
  expect(parseRoute('#/practice?size=5&seed=123')).toEqual({ mode: 'practice', size: 5, seed: 123 });
  expect(parseRoute('#/practice?size=42')).toEqual({ mode: 'practice', size: 9 });
  expect(parseRoute('#/practice?size=1')).toEqual({ mode: 'practice', size: 5 });
  expect(parseRoute('#/practice?size=abc&seed=x')).toEqual({ mode: 'practice', size: 7 });
  expect(parseRoute('#/nope')).toEqual({ mode: 'daily' });
});

test('renders header with wordmark, Daily/Practice tabs and a howto hook', async () => {
  mount('2026-10-21T10:00:00Z');
  await settle();
  expect($('.wordmark')?.textContent).toBe('flow');
  const tabs = [...root.querySelectorAll<HTMLAnchorElement>('.app-tabs a')];
  expect(tabs.map(t => [t.textContent, t.getAttribute('href')])).toEqual([['Daily', '#/'], ['Practice', '#/practice']]);
  expect(tabs[0].getAttribute('aria-current')).toBe('page');
  expect($('[data-action="howto"]')?.textContent).toBe('?');
});

test('daily subtitle shows number, date, and size', async () => {
  mount('2026-10-21T10:00:00Z');
  await settle();
  expect(subtitle()).toBe('#2 · Wed Oct 21 · 7×7');
  expect(svg().getAttribute('viewBox')).toBe('0 0 700 700');
  expect($('.board')!.classList.contains('board--loading')).toBe(false);
});

test('restores saved daily progress for today and ignores yesterday', async () => {
  const today = '2026-10-21';
  const sol = solutionFor(today);
  const paths = sol.map((p, i) => (i === 0 ? p : []));
  saveDaily({ date: today, paths, elapsedMs: 65_000, solved: false });
  mount(today + 'T10:00:00Z');
  await settle();
  expect(hudText()).toContain(`Flows 1/${sol.length}`);
  expect(hudText()).toContain('01:05');
  unmount!();
  root.replaceChildren();

  saveDaily({ date: '2026-10-20', paths: solutionFor('2026-10-20'), elapsedMs: 5000, solved: true });
  mount(today + 'T10:00:00Z');
  await settle();
  expect(hudText()).toContain(`Flows 0/${sol.length}`);
  expect(hudText()).toContain('00:00');
  expect(winCard().hidden).toBe(true);
});

test('solved daily reopens in solved state without celebrating', async () => {
  const today = '2026-10-21';
  saveDaily({ date: today, paths: solutionFor(today), elapsedMs: 83_000, solved: true });
  mount(today + 'T10:00:00Z');
  await settle();
  expect(winCard().hidden).toBe(false);
  expect(winCard().textContent).toContain('Solved ✦');
  expect(winCard().textContent).toContain('01:23');
  expect(winCard().textContent).toContain('Next daily in 14:00:00');
  expect(winCard().querySelector('button')!.textContent).toBe('Play practice');
  expect($('.board')!.classList.contains('board--dim')).toBe(true);
  expect($('.board')!.classList.contains('board--locked')).toBe(true);
});

test('solving the daily by hand persists, celebrates and shows the win card', async () => {
  const today = '2026-10-21';
  mount(today + 'T10:00:00Z');
  await settle();
  prepBoard(7);
  const sol = solutionFor(today);
  sol.slice(0, -1).forEach(draw);
  expect(loadDaily(today)?.paths.filter(p => p.length).length).toBe(sol.length - 1);
  expect(winCard().hidden).toBe(true);
  draw(sol[sol.length - 1]);
  await settle();
  expect(loadDaily(today)?.solved).toBe(true);
  expect(winCard().hidden).toBe(false);
  expect($('.board')!.classList.contains('board--dim')).toBe(true);
});

test('timer starts on first move, ticks, and is persisted on gesture end', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  let t = Date.parse('2026-10-21T10:00:00Z');
  mount(() => new Date(t));
  await vi.advanceTimersByTimeAsync(0);
  t += 5000;
  await vi.advanceTimersByTimeAsync(5000);
  expect(hudText()).toContain('00:00'); // not started yet
  prepBoard(7);
  const sol = solutionFor('2026-10-21');
  fire('pointerdown', sol[0][0]);
  fire('pointermove', sol[0][1]);
  t += 3000;
  await vi.advanceTimersByTimeAsync(3000);
  expect(hudText()).toContain('00:03');
  fire('pointerup', sol[0][1]);
  expect(loadDaily('2026-10-21')?.elapsedMs).toBe(3000);
});

test('day rollover while solved loads the next daily', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  saveDaily({ date: '2026-10-20', paths: solutionFor('2026-10-20'), elapsedMs: 5000, solved: true });
  let t = Date.parse('2026-10-20T23:59:58Z');
  mount(() => new Date(t));
  await vi.advanceTimersByTimeAsync(0);
  expect(subtitle()).toBe('#1 · Tue Oct 20 · 7×7');
  expect(winCard().hidden).toBe(false);
  expect(winCard().textContent).toContain('Next daily in 00:00:02');
  t += 1000;
  await vi.advanceTimersByTimeAsync(1000);
  expect(winCard().textContent).toContain('Next daily in 00:00:01');
  t += 2000;
  await vi.advanceTimersByTimeAsync(2000);
  expect(subtitle()).toBe('#2 · Wed Oct 21 · 7×7');
  expect(winCard().hidden).toBe(true);
  expect($('.board')!.classList.contains('board--dim')).toBe(false);
  expect($('.board')!.classList.contains('board--locked')).toBe(false);
});

test('practice route uses size + seed, size seg and New puzzle regenerate', async () => {
  history.replaceState(null, '', '#/practice?size=5&seed=123');
  mount('2026-10-21T10:00:00Z');
  await settle();
  expect(svg().getAttribute('viewBox')).toBe('0 0 500 500');
  expect(subtitle()).toBeUndefined();
  const sizes = [...root.querySelectorAll<HTMLButtonElement>('.sizes button')];
  expect(sizes.map(b => b.textContent)).toEqual(['5×5', '6×6', '7×7', '8×8', '9×9']);
  expect(sizes[0].getAttribute('aria-pressed')).toBe('true');
  expect($('[data-action="new"]')!.classList.contains('btn--primary')).toBe(true);
  expect(root.querySelector('.app-tabs a[href="#/practice"]')!.getAttribute('aria-current')).toBe('page');

  sizes[4].click();
  await settle();
  expect(svg().getAttribute('viewBox')).toBe('0 0 900 900');
  expect(root.querySelector('.sizes [aria-pressed="true"]')!.textContent).toBe('9×9');
  expect(location.hash).toBe('#/practice?size=9');
});

test('solving practice shows Next puzzle which loads a fresh board', async () => {
  history.replaceState(null, '', '#/practice?size=5&seed=123');
  mount('2026-10-21T10:00:00Z');
  await settle();
  prepBoard(5);
  generateWithSolution(5, mulberry32(123)).solution.forEach(draw);
  await settle();
  expect(winCard().hidden).toBe(false);
  const btn = winCard().querySelector('button')!;
  expect(btn.textContent).toBe('Next puzzle');
  expect(winCard().textContent).not.toContain('Next daily');
  btn.click();
  await settle();
  expect(winCard().hidden).toBe(true);
  expect($('.board')!.classList.contains('board--locked')).toBe(false);
  expect(hudText()).toContain('Fill 0%');
});

test('Reset confirms only after more than 3 moves; Ctrl+Z undoes', async () => {
  mount('2026-10-21T10:00:00Z');
  await settle();
  prepBoard(7);
  const sol = solutionFor('2026-10-21');
  const confirmSpy = vi.fn(() => false);
  vi.stubGlobal('confirm', confirmSpy);
  draw(sol[0]);
  expect(hudText()).toContain(`Flows 1/${sol.length}`);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  expect(hudText()).toContain(`Flows 0/${sol.length}`);
  draw(sol[0]);
  $<HTMLButtonElement>('[data-action="reset"]')!.click();
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(hudText()).toContain(`Flows 0/${sol.length}`);
  expect(loadDaily('2026-10-21')?.paths.every(p => p.length === 0)).toBe(true);

  sol.slice(0, 4).forEach(draw);
  $<HTMLButtonElement>('[data-action="reset"]')!.click();
  expect(confirmSpy).toHaveBeenCalledTimes(1);
  expect(hudText()).toContain(`Flows 4/${sol.length}`); // declined
  confirmSpy.mockReturnValue(true);
  $<HTMLButtonElement>('[data-action="undo"]')!.click();
  expect(hudText()).toContain(`Flows 3/${sol.length}`);
  $<HTMLButtonElement>('[data-action="reset"]')!.click();
  expect(hudText()).toContain(`Flows 0/${sol.length}`);
});

test('HUD shows flows, fill, mm:ss and the fill hint', () => {
  const hud = createHud(root);
  hud.update({ flowsDone: 2, flowsTotal: 6, fillPct: 41 }, 125_999, false);
  expect(root.querySelector('.hud')!.textContent).toMatch(/Flows 2\/6.*Fill 41%.*02:05/);
  expect(root.querySelector<HTMLElement>('.hud__hint')!.hidden).toBe(true);
  hud.update({ flowsDone: 6, flowsTotal: 6, fillPct: 88 }, 0, true);
  const hint = root.querySelector<HTMLElement>('.hud__hint')!;
  expect(hint.hidden).toBe(false);
  expect(hint.textContent).toBe('All connected — fill every cell!');
});

test('win card shows daily and practice variants and hides', () => {
  const card = createWinCard(root);
  const onPrimary = vi.fn();
  card.show({ timeMs: 61_000, mode: 'daily', countdownMs: 3_600_000, onPrimary });
  const el = root.querySelector<HTMLElement>('.win')!;
  expect(el.hidden).toBe(false);
  expect(el.textContent).toContain('01:01');
  expect(el.textContent).toContain('Next daily in 01:00:00');
  el.querySelector('button')!.click();
  expect(onPrimary).toHaveBeenCalledTimes(1);
  card.show({ timeMs: 5_000, mode: 'practice', onPrimary });
  expect(el.textContent).not.toContain('Next daily');
  expect(el.querySelector('button')!.textContent).toBe('Next puzzle');
  card.hide();
  expect(el.hidden).toBe(true);
});
