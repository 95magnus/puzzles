// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { saveFlowDaily } from '../../src/games/flow/storage';
import { mountHome } from '../../src/home/home';
import { PUZZLES } from '../../src/home/puzzles';

let root: HTMLElement;
let unmount: (() => void) | undefined;
const text = (sel: string) => root.querySelector(sel)?.textContent ?? '';
const pill = (id: string) => root.querySelector<HTMLElement>(`.puzzle-card[data-id="${id}"] .status-pill`)!;

beforeEach(() => {
  localStorage.clear();
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  root.remove();
  vi.useRealTimers();
});

test('renders one card per PUZZLES entry with links', () => {
  unmount = mountHome(root, { now: () => new Date('2026-10-21T10:00:00Z') });
  const cards = root.querySelectorAll('.puzzle-card');
  expect(cards).toHaveLength(PUZZLES.length);
  const flow = root.querySelector('.puzzle-card[data-id="flow"]')!;
  expect(flow.querySelector('h2')!.textContent).toBe('Flow');
  expect(flow.textContent).toContain('Connect matching dots. Fill every cell.');
  const links = [...flow.querySelectorAll<HTMLAnchorElement>('a.btn')].map(a => [a.textContent, a.getAttribute('href')]);
  expect(links).toEqual([['Play daily', './flow.html#/'], ['Practice', './flow.html#/practice']]);
  expect(flow.querySelector('svg.puzzle-preview')).not.toBeNull();
  expect(pill('flow').dataset.status).toBe('new');
  expect(pill('flow').textContent).toBe('Not started');
  expect(root.querySelector('.shell-header .wordmark')!.textContent).toBe('puzzles');
  expect(root.querySelector('.shell-header nav')).toBeNull();
});

test('intro shows daily number and date', () => {
  unmount = mountHome(root, { now: () => new Date('2026-10-21T10:00:00Z') });
  expect(text('.home-intro')).toBe('Daily #2 · Wed Oct 21');
  expect(text('.home-next')).toBe('Next daily in 14:00:00');
});

test('storage event re-renders pills', () => {
  unmount = mountHome(root, { now: () => new Date('2026-10-21T10:00:00Z') });
  saveFlowDaily({ date: '2026-10-21', paths: [], elapsedMs: 83_000, solved: true });
  window.dispatchEvent(new StorageEvent('storage'));
  expect(pill('flow').dataset.status).toBe('done');
  expect(pill('flow').textContent).toBe('Solved · 01:23');
});

test('becoming visible re-renders pills', () => {
  unmount = mountHome(root, { now: () => new Date('2026-10-21T10:00:00Z') });
  saveFlowDaily({ date: '2026-10-21', paths: [], elapsedMs: 1_000, solved: false });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(pill('flow').dataset.status).toBe('playing');
});

test('rolls over at UTC midnight', () => {
  vi.useFakeTimers();
  let t = new Date('2026-10-21T23:59:59.500Z').getTime();
  saveFlowDaily({ date: '2026-10-21', paths: [], elapsedMs: 83_000, solved: true });
  unmount = mountHome(root, { now: () => new Date(t) });
  expect(text('.home-intro')).toBe('Daily #2 · Wed Oct 21');
  expect(pill('flow').dataset.status).toBe('done');
  t += 1_000;
  vi.advanceTimersByTime(1_000);
  expect(text('.home-intro')).toBe('Daily #3 · Thu Oct 22');
  expect(pill('flow').textContent).toBe('Not started');
});

test('countdown ticks every second', () => {
  vi.useFakeTimers();
  let t = new Date('2026-10-21T10:00:00Z').getTime();
  unmount = mountHome(root, { now: () => new Date(t) });
  t += 1_000;
  vi.advanceTimersByTime(1_000);
  expect(text('.home-next')).toBe('Next daily in 13:59:59');
});

test('a throwing preview leaves the card without one', () => {
  const spy = vi.spyOn(PUZZLES[0], 'preview').mockImplementation(() => {
    throw new Error('broken');
  });
  unmount = mountHome(root, { now: () => new Date('2026-10-21T10:00:00Z') });
  expect(root.querySelector('.puzzle-card[data-id="flow"] svg')).toBeNull();
  expect(root.querySelector('.puzzle-card[data-id="flow"] h2')!.textContent).toBe('Flow');
  spy.mockRestore();
});

test('unmount stops the interval and listeners', () => {
  vi.useFakeTimers();
  unmount = mountHome(root, { now: () => new Date('2026-10-21T10:00:00Z') });
  unmount();
  unmount = undefined;
  expect(vi.getTimerCount()).toBe(0);
  expect(() => window.dispatchEvent(new StorageEvent('storage'))).not.toThrow();
});
