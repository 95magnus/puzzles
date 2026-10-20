// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from 'vitest';
import { getFlag, setFlag } from '../../src/core/storage';
import { mountMines } from '../../src/minesweeper/app';
import { openMinesHowto } from '../../src/minesweeper/howto';

let root: HTMLElement;
let unmount: (() => void) | undefined;

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const key = (k: string, shift = false) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true }));

beforeEach(() => {
  localStorage.clear();
  location.hash = '#/practice?preset=classic&seed=1';
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  document.querySelectorAll('.modal').forEach(d => d.remove());
  root.remove();
});

test('auto-opens on first Mines visit and sets mines-howto-seen', () => {
  unmount = mountMines(root);
  expect(dialog()).not.toBeNull();
  expect(dialog()!.textContent).toContain('Right click — flag a tile');
  expect(getFlag('mines-howto-seen')).toBe(true);
});

test('does not auto-open when mines-howto-seen is set', () => {
  setFlag('mines-howto-seen', true);
  unmount = mountMines(root);
  expect(dialog()).toBeNull();
});

test('? opens it; Esc closes and returns focus to ?', () => {
  setFlag('mines-howto-seen', true);
  unmount = mountMines(root);
  const help = root.querySelector<HTMLButtonElement>('.mines-help')!;
  help.focus();
  help.click();
  expect(dialog()).not.toBeNull();
  expect(dialog()!.contains(document.activeElement)).toBe(true);
  key('Escape');
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(help);
});

test('lists mouse and touch controls; ✕ and backdrop close it', () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  openMinesHowto(opener);
  const t = dialog()!.textContent!;
  expect(t).toContain('Left click — reveal a tile');
  expect(t).toContain('Left + right — reveal all unflagged tiles around a number whose flags match it');
  expect(t).toContain('Tap — reveal · Long-press — flag · Tap a number — reveal around it');
  document.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
  expect(dialog()).toBeNull();
  openMinesHowto(opener);
  const backdrop = document.querySelector<HTMLElement>('.modal')!;
  backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(dialog()).toBeNull();
  opener.remove();
});

test('Tab is trapped inside the dialog', () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  openMinesHowto(opener);
  const focusables = dialog()!.querySelectorAll<HTMLElement>('button');
  const last = focusables[focusables.length - 1];
  last.focus();
  key('Tab');
  expect(document.activeElement).toBe(focusables[0]);
  key('Tab', true);
  expect(document.activeElement).toBe(last);
  key('Escape');
  opener.remove();
});

test('body contains the three controls, the chord demo and the touch line', () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  openMinesHowto(opener);
  const panel = document.querySelector<HTMLElement>('.modal .modal__panel')!;
  expect(panel.querySelectorAll('.mines-howto__body li')).toHaveLength(3);
  expect(panel.querySelector('svg.mines-howto__demo')).not.toBeNull();
  expect(panel.textContent).toContain('Long-press');
  expect(panel.querySelector('.modal__title')!.textContent).toBe('How to play');
  key('Escape');
  opener.remove();
});
