// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { fitCell, reducedMotion, watchSize } from '../../src/ui/fit';

afterEach(() => vi.unstubAllGlobals());

test('fitCell fits the smaller of width and height, clamped to [min, max]', () => {
  const b = { min: 12, max: 28 };
  expect(fitCell(40, 40, 1200, 520, b)).toBe(13);
  expect(fitCell(40, 40, 535, 2000, b)).toBe(13);
  expect(fitCell(40, 40, 100, 100, b)).toBe(12);
  expect(fitCell(10, 10, 5000, 5000, b)).toBe(28);
});

test('fitCell leaves room for the gaps between cells', () => {
  // 10 cells + 9 gaps of 2px in 218px: (218 - 18) / 10 = 20
  expect(fitCell(10, 10, 218, 1000, { min: 1, max: 99, gap: 2 })).toBe(20);
  expect(fitCell(10, 10, 218, 1000, { min: 1, max: 99 })).toBe(21);
});

test('reducedMotion follows the media query and survives a throwing matchMedia', () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
  expect(reducedMotion()).toBe(true);
  vi.stubGlobal('matchMedia', () => { throw new Error('no'); });
  expect(reducedMotion()).toBe(false);
});

test('watchSize re-fits on window resize until stopped', () => {
  const fit = vi.fn();
  const stop = watchSize(document.createElement('div'), fit);
  window.dispatchEvent(new Event('resize'));
  expect(fit).toHaveBeenCalledTimes(1);
  stop();
  window.dispatchEvent(new Event('resize'));
  expect(fit).toHaveBeenCalledTimes(1);
});
