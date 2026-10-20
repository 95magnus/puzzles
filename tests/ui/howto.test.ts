// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFlag } from '../../src/core/storage';

vi.mock('../../src/gen/client', async () => {
  const actual = await vi.importActual<typeof import('../../src/gen/client')>('../../src/gen/client');
  const { generate } = await import('../../src/core/generator');
  const { mulberry32: rng } = await import('../../src/core/rng');
  return { ...actual, requestPuzzle: vi.fn((size: number, seed: number) => Promise.resolve(generate(size, rng(seed)))) };
});

import { mountApp } from '../../src/ui/app';

let root: HTMLElement;
let unmount: (() => void) | void;
const dialog = () => document.querySelector<HTMLElement>('.modal [role="dialog"]');
const qBtn = () => root.querySelector<HTMLButtonElement>('[data-action="howto"]')!;
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
};
const mount = () => {
  unmount = mountApp(root, { now: () => new Date('2026-10-21T10:00:00Z') });
};

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '#/');
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  if (typeof unmount === 'function') unmount();
  unmount = undefined;
  root.remove();
  document.querySelectorAll('.modal').forEach(d => d.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('auto-opens on first visit and sets howto-seen', async () => {
  mount();
  await settle();
  const d = dialog()!;
  expect(d).not.toBeNull();
  expect(d.getAttribute('aria-modal')).toBe('true');
  const title = document.getElementById(d.getAttribute('aria-labelledby')!)!;
  expect(title.textContent).toBe('How to play');
  expect(d.textContent).toContain('Drag from a dot to its match.');
  expect(d.textContent).toContain("Paths can't cross.");
  expect(d.textContent).toContain('Fill every cell to win.');
  expect(d.querySelectorAll('svg.howto-demo').length).toBe(3);
  expect(localStorage.getItem('flow:flag:howto-seen')).toBe('1');
});

test('does not auto-open when howto-seen is set', async () => {
  localStorage.setItem('flow:flag:howto-seen', '1');
  mount();
  await settle();
  expect(dialog()).toBeNull();
  qBtn().click();
  expect(dialog()).not.toBeNull();
});

test('Esc closes and focus returns to the ? button; backdrop and ✕ also close', async () => {
  localStorage.setItem('flow:flag:howto-seen', '1');
  mount();
  await settle();
  qBtn().focus();
  qBtn().click();
  expect(dialog()!.contains(document.activeElement)).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(qBtn());

  qBtn().click();
  document.querySelector<HTMLElement>('.modal__close')!.click();
  expect(dialog()).toBeNull();
  qBtn().click();
  document.querySelector<HTMLElement>('.modal')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(qBtn());
});

test('Tab is trapped inside the dialog', async () => {
  localStorage.setItem('flow:flag:howto-seen', '1');
  mount();
  await settle();
  qBtn().click();
  const f = [...dialog()!.querySelectorAll<HTMLElement>('button')];
  f[f.length - 1].focus();
  const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(f[0]);
});

test('colorblind toggle persists and applies to the board', async () => {
  localStorage.setItem('flow:flag:howto-seen', '1');
  mount();
  await settle();
  qBtn().click();
  const sw = dialog()!.querySelector<HTMLElement>('[role="switch"]')!;
  expect(sw.getAttribute('aria-checked')).toBe('false');
  expect(dialog()!.textContent).toContain('Colorblind mode');
  sw.click();
  expect(sw.getAttribute('aria-checked')).toBe('true');
  expect(getFlag('colorblind')).toBe(true);
  expect(root.querySelector('.board-svg')!.classList.contains('board-svg--colorblind')).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  qBtn().click();
  expect(dialog()!.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
});

test('colorblind flag is applied on mount', async () => {
  localStorage.setItem('flow:flag:howto-seen', '1');
  localStorage.setItem('flow:flag:colorblind', '1');
  mount();
  await settle();
  qBtn().click();
  expect(dialog()!.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true');
});
