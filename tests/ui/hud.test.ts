// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { createHud, formatClock, renderLives } from '../../src/ui/hud';

test('formatClock shows mm:ss, rounding down to whole seconds', () => {
  expect(formatClock(0)).toBe('00:00');
  expect(formatClock(59_999)).toBe('00:59');
  expect(formatClock(61_000)).toBe('01:01');
});

test('formatClock keeps counting minutes past an hour', () => {
  expect(formatClock((61 * 60 + 5) * 1000)).toBe('61:05');
});

test('formatClock never goes negative', () => {
  expect(formatClock(-5000)).toBe('00:00');
});

test('createHud shows flows, fill and time, and toggles the hint', () => {
  const root = document.createElement('div');
  const hud = createHud(root);
  const values = () => [...root.querySelectorAll('.hud__value')].map((v) => v.textContent);
  const hint = root.querySelector<HTMLElement>('.hud__hint')!;

  hud.update({ flowsDone: 2, flowsTotal: 6, fillPct: 40 }, 75_000, false);
  expect(values()).toEqual(['2/6', '40%', '01:15']);
  expect(hint.hidden).toBe(true);

  hud.update({ flowsDone: 6, flowsTotal: 6, fillPct: 97 }, 80_000, true);
  expect(values()).toEqual(['6/6', '97%', '01:20']);
  expect(hint.hidden).toBe(false);
});

test('renderLives draws one heart per life and labels the count', () => {
  const el = document.createElement('div');
  renderLives(el, 2, 3);
  expect(el.textContent).toBe('♥♥♡');
  const hearts = el.querySelectorAll('.hud-life');
  expect(hearts).toHaveLength(3);
  expect(hearts[2]!.classList.contains('is-lost')).toBe(true);
  expect(hearts[1]!.classList.contains('is-lost')).toBe(false);
  expect(el.getAttribute('aria-label')).toBe('2 of 3 lives left');
  expect(el.title).toBe('2 of 3 lives left');
});

test('renderLives replaces the previous hearts', () => {
  const el = document.createElement('div');
  renderLives(el, 2, 3);
  renderLives(el, 0, 3);
  expect(el.querySelectorAll('.hud-life')).toHaveLength(3);
  expect(el.textContent).toBe('♡♡♡');
  expect(el.getAttribute('aria-label')).toBe('0 of 3 lives left');
});
