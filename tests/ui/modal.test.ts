// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { isModalOpen, openModal } from '../../src/ui/modal';

let opener: HTMLButtonElement;
const backdrop = () => document.querySelector<HTMLElement>('.modal');
const key = (k: string, shiftKey = false) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));

function open(onClose = vi.fn()) {
  const p = document.createElement('p');
  p.textContent = 'Body text';
  const extra = document.createElement('button');
  extra.className = 'extra';
  extra.textContent = 'Extra';
  openModal({ title: 'How to play', body: [p, extra], returnFocus: opener, onClose });
  return onClose;
}

beforeEach(() => {
  opener = document.createElement('button');
  document.body.appendChild(opener);
});

afterEach(() => {
  document.querySelectorAll('.modal').forEach(d => d.remove());
  opener.remove();
});

test('renders title, body nodes and Got it; focuses Got it', () => {
  open();
  const dlg = backdrop()!.querySelector<HTMLElement>('.modal__panel[role="dialog"]')!;
  expect(dlg.getAttribute('aria-modal')).toBe('true');
  expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)!.textContent).toBe('How to play');
  expect(dlg.textContent).toContain('Body text');
  expect(dlg.querySelector('.modal__close')!.getAttribute('aria-label')).toBe('Close');
  expect(document.activeElement).toBe(dlg.querySelector('.modal__done'));
  expect(document.activeElement!.textContent).toBe('Got it');
  expect(isModalOpen()).toBe(true);
});

const closers: [string, () => void][] = [
  ['Esc', () => key('Escape')],
  ['✕', () => document.querySelector<HTMLElement>('.modal__close')!.click()],
  ['Got it', () => document.querySelector<HTMLElement>('.modal__done')!.click()],
  ['backdrop', () => backdrop()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))],
];

test.each(closers)('%s closes it and refocuses returnFocus', (_name, close) => {
  const onClose = open();
  close();
  expect(backdrop()).toBeNull();
  expect(isModalOpen()).toBe(false);
  expect(document.activeElement).toBe(opener);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('click inside the panel does not close', () => {
  open();
  document.querySelector<HTMLElement>('.modal__panel p')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(backdrop()).not.toBeNull();
});

test('Tab from last focusable wraps to first; Shift+Tab from first wraps to last', () => {
  open();
  const close = document.querySelector<HTMLElement>('.modal__close')!;
  const done = document.querySelector<HTMLElement>('.modal__done')!;
  done.focus();
  key('Tab');
  expect(document.activeElement).toBe(close);
  key('Tab', true);
  expect(document.activeElement).toBe(done);
});

test('opening a second modal closes the first', () => {
  const first = open();
  open();
  expect(document.querySelectorAll('.modal')).toHaveLength(1);
  expect(first).toHaveBeenCalledTimes(1);
});

test('returnFocus null closes without throwing', () => {
  openModal({ title: 'T', body: [], returnFocus: null });
  expect(() => key('Escape')).not.toThrow();
  expect(isModalOpen()).toBe(false);
});
