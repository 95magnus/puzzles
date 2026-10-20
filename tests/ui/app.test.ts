// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { generateWithSolution } from '../../src/core/generator';
import { mulberry32, seedFromDate } from '../../src/core/rng';
import { loadDaily, saveDaily, setFlag } from '../../src/core/storage';
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
import { openModal } from '../../src/ui/modal';
import { createWinCard } from '../../src/ui/winCard';

let root: HTMLElement;
let unmount: (() => void) | void;

const solutionFor = (date: string) => generateWithSolution(7, mulberry32(seedFromDate(date))).solution;
const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T | null;
const subtitle = () => $('[data-role="subtitle"]')?.textContent;
const hudText = () => $('.hud')?.textContent ?? '';
const winCard = () => $('.end-card')!;
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
  // Close any how-to modal left open (it auto-opens on first visit).
  if (document.querySelector('.modal')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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
  expect($('.wordmark')?.textContent).toBe('puzzles');
  const tabs = [...root.querySelectorAll<HTMLAnchorElement>('.shell-tabs a')];
  expect(tabs.map(t => [t.textContent, t.getAttribute('href')])).toEqual([['Daily', '#/'], ['Practice', '#/practice?size=7']]);
  expect(tabs[0].getAttribute('aria-current')).toBe('page');
  expect($('[data-action="howto"]')?.textContent).toBe('?');
});

test('header links home to the dashboard and names the game', async () => {
  mount('2026-10-21T10:00:00Z');
  await settle();
  expect($<HTMLAnchorElement>('.shell-header .wordmark')?.getAttribute('href')).toBe('./index.html');
  expect($('.shell-game')?.textContent).toBe('Flow');
  expect($('.shell-game')?.getAttribute('aria-current')).toBe('page');
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

const newDailyBtn = () => $<HTMLButtonElement>('[data-action="new-daily"]');

test('day rollover while the daily is untouched switches to the new daily', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  let t = Date.parse('2026-10-20T23:59:58Z');
  mount(() => new Date(t));
  await vi.advanceTimersByTimeAsync(0);
  expect(subtitle()).toContain('#1 · Tue Oct 20');
  t += 3000;
  await vi.advanceTimersByTimeAsync(3000);
  expect(subtitle()).toContain('#2 · Wed Oct 21');
  expect(newDailyBtn()?.hidden ?? true).toBe(true);
});

test('day rollover mid-puzzle keeps it playable and offers "New daily available"', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  let t = Date.parse('2026-10-20T23:59:58Z');
  mount(() => new Date(t));
  await vi.advanceTimersByTimeAsync(0);
  prepBoard(7);
  const sol = solutionFor('2026-10-20');
  draw(sol[0]);
  t += 3000;
  await vi.advanceTimersByTimeAsync(3000);
  expect(subtitle()).toContain('#1 · Tue Oct 20');
  expect(hudText()).toContain(`Flows 1/${sol.length}`);
  const pill = newDailyBtn()!;
  expect(pill).not.toBeNull();
  expect(pill.hidden).toBe(false);
  expect(pill.textContent).toBe('New daily available');
  expect(pill.classList.contains('btn')).toBe(true);
  // Still playable; progress keeps saving under its own date.
  draw(sol[1]);
  expect(loadDaily('2026-10-20')?.paths.filter(p => p.length).length).toBe(2);
  expect(loadDaily('2026-10-21')).toBeNull();
  t += 5000;
  await vi.advanceTimersByTimeAsync(5000);
  expect(subtitle()).toContain('#1 · Tue Oct 20'); // not auto-replaced later either
  pill.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(subtitle()).toContain('#2 · Wed Oct 21');
  expect(newDailyBtn()!.hidden).toBe(true);
  expect(hudText()).toContain('Flows 0/');
});

test('solving a daily after rollover shows a sane win card that stays put', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  let t = Date.parse('2026-10-20T23:59:58Z');
  mount(() => new Date(t));
  await vi.advanceTimersByTimeAsync(0);
  prepBoard(7);
  const sol = solutionFor('2026-10-20');
  draw(sol[0]);
  t += 3000;
  await vi.advanceTimersByTimeAsync(3000);
  sol.slice(1).forEach(draw);
  await vi.advanceTimersByTimeAsync(0);
  expect(loadDaily('2026-10-20')?.solved).toBe(true);
  expect(winCard().hidden).toBe(false);
  expect(winCard().textContent).toContain('Next daily in 00:00:00');
  t += 2000;
  await vi.advanceTimersByTimeAsync(2000);
  expect(winCard().hidden).toBe(false);
  expect(subtitle()).toContain('#1 · Tue Oct 20');
  expect(winCard().textContent).not.toMatch(/-\d/);
  winCard().querySelector('button')!.click();
  expect(location.hash).toBe('#/practice?size=7');
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
  expect(root.querySelector('.shell-tabs a[href="#/practice?size=5"]')!.getAttribute('aria-current')).toBe('page');

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
  setFlag('howto-seen', true);
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

test('restored daily with ≥ 4 paths: Reset confirms, and Undo brings the paths back', async () => {
  const today = '2026-10-21';
  const sol = solutionFor(today);
  expect(sol.length).toBeGreaterThan(4);
  const paths = sol.map((p, i) => (i < 4 ? p : []));
  saveDaily({ date: today, paths, elapsedMs: 10_000, solved: false });
  mount(today + 'T10:00:00Z');
  await settle();
  expect(hudText()).toContain(`Flows 4/${sol.length}`);
  const confirmSpy = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmSpy);
  $<HTMLButtonElement>('[data-action="reset"]')!.click();
  expect(confirmSpy).toHaveBeenCalledTimes(1);
  expect(hudText()).toContain(`Flows 0/${sol.length}`);
  const undoBtn = $<HTMLButtonElement>('[data-action="undo"]')!;
  expect(undoBtn.disabled).toBe(false);
  undoBtn.click();
  expect(hudText()).toContain(`Flows 4/${sol.length}`);
  expect(loadDaily(today)?.paths.filter(p => p.length).length).toBe(4);
});

test('a solving gesture cut short by a route change never shows the old win over the new puzzle', async () => {
  // Full motion so the celebration is async and outlives load()'s synchronous part.
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  const today = '2026-10-21';
  mount(today + 'T10:00:00Z');
  await settle();
  prepBoard(7);
  const sol = solutionFor(today);
  sol.slice(0, -1).forEach(draw);
  const last = sol[sol.length - 1];
  fire('pointerdown', last[0]);
  for (const c of last.slice(1)) fire('pointermove', c); // completes the puzzle, but no pointerup yet
  history.replaceState(null, '', '#/practice?size=5&seed=123');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
  await new Promise(r => setTimeout(r, 900)); // longer than any celebration
  expect(svg().getAttribute('viewBox')).toBe('0 0 500 500');
  expect(winCard().hidden).toBe(true);
  expect($('.board')!.classList.contains('board--dim')).toBe(false);
  expect($('.board')!.classList.contains('board--locked')).toBe(false);
  // The finished gesture was still saved against the old daily.
  expect(loadDaily(today)?.paths.every(p => p.length > 0)).toBe(true);
});

test('Ctrl/Cmd+Z is ignored while the how-to modal is open', async () => {
  setFlag('howto-seen', true);
  mount('2026-10-21T10:00:00Z');
  await settle();
  expect($('.modal')).toBeNull();
  expect(document.querySelector('.modal')).toBeNull();
  prepBoard(7);
  const sol = solutionFor('2026-10-21');
  draw(sol[0]);
  expect(hudText()).toContain(`Flows 1/${sol.length}`);
  $<HTMLButtonElement>('[data-action="howto"]')!.click();
  expect(document.querySelector('.modal')).not.toBeNull();
  for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ...mod, bubbles: true }));
  }
  expect(hudText()).toContain(`Flows 1/${sol.length}`);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.modal')).toBeNull();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  expect(hudText()).toContain(`Flows 0/${sol.length}`);
});

test('game shortcuts are ignored while any shared modal is open', async () => {
  setFlag('howto-seen', true);
  mount('2026-10-21T10:00:00Z');
  await settle();
  prepBoard(7);
  const sol = solutionFor('2026-10-21');
  draw(sol[0]);
  openModal({ title: 'Other', body: [], returnFocus: null });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(hudText()).toContain(`Flows 1/${sol.length}`);
});

test('re-selecting the active Practice tab keeps the current puzzle', async () => {
  history.replaceState(null, '', '#/practice?size=5&seed=123');
  mount('2026-10-21T10:00:00Z');
  await settle();
  const tab = () => root.querySelector<HTMLAnchorElement>('.shell-tabs a:last-child')!;
  expect(tab().getAttribute('href')).toBe('#/practice?size=5');
  root.querySelectorAll<HTMLButtonElement>('.sizes button')[1].click(); // 6×6
  await settle();
  expect(location.hash).toBe('#/practice?size=6');
  expect(tab().getAttribute('href')).toBe('#/practice?size=6');
  prepBoard(6);
  const board = $('.board')!;
  const before = svg().innerHTML;
  // Navigating to the route we are already on (e.g. the tab, or a bare #/practice?size=6) is a no-op.
  history.replaceState(null, '', tab().getAttribute('href')!);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
  expect(board.classList.contains('board--loading')).toBe(false);
  expect(svg().innerHTML).toBe(before);
  // A different size still loads.
  history.replaceState(null, '', '#/practice?size=8');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
  expect(svg().getAttribute('viewBox')).toBe('0 0 800 800');
  expect(tab().getAttribute('href')).toBe('#/practice?size=8');
});

test("daily win card's Play practice opens the last practice size", async () => {
  const today = '2026-10-21';
  history.replaceState(null, '', '#/practice?size=9');
  mount(today + 'T10:00:00Z');
  await settle();
  saveDaily({ date: today, paths: solutionFor(today), elapsedMs: 1000, solved: true });
  history.replaceState(null, '', '#/');
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
  expect(winCard().hidden).toBe(false);
  winCard().querySelector('button')!.click();
  expect(location.hash).toBe('#/practice?size=9');
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
  const el = root.querySelector<HTMLElement>('.end-card')!;
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

test('win card uses the shared end-card structure', () => {
  const card = createWinCard(root);
  card.show({ timeMs: 83_000, mode: 'daily', countdownMs: 60_000, onPrimary: () => {} });
  const el = root.querySelector<HTMLElement>(':scope > .end-card.glass')!;
  expect(el.getAttribute('role')).toBe('dialog');
  expect(el.querySelector('.end-card__title')!.textContent).toBe('Solved ✦');
  expect(el.querySelector('.end-card__stat')!.textContent).toBe('01:23');
  expect(el.querySelector('.end-card__next')!.textContent).toBe('Next daily in 00:01:00');
  expect(el.querySelectorAll('.end-card__actions > .btn--primary')).toHaveLength(1);
});

test('HUD values and labels use the shared HUD typography classes', () => {
  createHud(root).update({ flowsDone: 1, flowsTotal: 6, fillPct: 10 }, 0, false);
  expect(root.querySelectorAll('.hud__value.hud-value')).toHaveLength(3);
  expect(root.querySelectorAll('.hud__label.hud-label')).toHaveLength(2);
});
