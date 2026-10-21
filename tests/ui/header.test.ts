// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createHeader } from '../../src/ui/header';

test('game header has wordmark home link, game name, both tabs and help', () => {
  const onHelp = vi.fn();
  const h = createHeader({ game: 'Mines', onHelp });
  expect(h.el.tagName).toBe('HEADER');
  expect(h.el.classList.contains('shell-header')).toBe(true);
  const home = h.el.querySelector<HTMLAnchorElement>('.wordmark')!;
  expect(home.textContent).toBe('puzzles');
  expect(home.getAttribute('href')).toBe('./index.html');
  const game = h.el.querySelector('.shell-game')!;
  expect(game.textContent).toBe('Mines');
  expect(game.getAttribute('aria-current')).toBe('page');
  expect(h.el.querySelector('nav.shell-tabs')!.getAttribute('aria-label')).toBe('Mode');
  expect(h.tabDaily!.getAttribute('href')).toBe('#/');
  expect(h.tabDaily!.textContent).toBe('Daily');
  expect(h.tabPractice!.getAttribute('href')).toBe('#/practice');
  expect(h.tabPractice!.textContent).toBe('Practice');
  expect(h.helpBtn!.getAttribute('aria-label')).toBe('How to play');
  expect(h.helpBtn!.dataset.action).toBe('howto');
  h.helpBtn!.click();
  expect(onHelp).toHaveBeenCalledTimes(1);
});

test('tabs:false and no onHelp render wordmark only', () => {
  const h = createHeader({ tabs: false });
  expect(h.tabDaily).toBeNull();
  expect(h.tabPractice).toBeNull();
  expect(h.helpBtn).toBeNull();
  expect(h.el.querySelector('nav')).toBeNull();
  expect(h.el.querySelector('button')).toBeNull();
  expect(h.el.querySelector('.shell-game')).toBeNull();
  expect(h.el.querySelector('.wordmark')!.textContent).toBe('puzzles');
});
