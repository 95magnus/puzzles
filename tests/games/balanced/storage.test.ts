// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFlag, setFlag } from '../../../src/core/storage';
import { loadBalancedDaily, saveBalancedDaily, getBalancedPreset, setBalancedPreset } from '../../../src/games/balanced/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const balanced = { date: '2026-10-25', cells: '0120', elapsedMs: 5000, solved: false };

test('balanced daily save round-trips', () => {
  saveBalancedDaily(balanced);
  expect(loadBalancedDaily('2026-10-25')).toEqual({ v: 1, ...balanced });
});
test('loadBalancedDaily returns null for another date or no save', () => {
  expect(loadBalancedDaily('2026-10-25')).toBeNull();
  saveBalancedDaily(balanced);
  expect(loadBalancedDaily('2026-10-26')).toBeNull();
});
test('loadBalancedDaily returns null for corrupt or malformed saves', () => {
  const put = (o: unknown) => localStorage.setItem('balanced:daily', typeof o === 'string' ? o : JSON.stringify(o));
  for (const bad of [
    '{nope',
    'null',
    { v: 2, ...balanced },
    { v: 1, ...balanced, cells: '01x' },
    { v: 1, ...balanced, cells: 7 },
    { v: 1, ...balanced, elapsedMs: -1 },
    { v: 1, ...balanced, solved: 'yes' },
  ]) {
    put(bad);
    expect(loadBalancedDaily('2026-10-25')).toBeNull();
  }
});
test('throwing storage: balanced load/preset return null, saves do not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadBalancedDaily('2026-10-25')).toBeNull();
  expect(getBalancedPreset()).toBeNull();
  expect(() => saveBalancedDaily(balanced)).not.toThrow();
  expect(() => setBalancedPreset('large')).not.toThrow();
});
test('balanced preset round-trips; unknown value reads as null', () => {
  expect(getBalancedPreset()).toBeNull();
  setBalancedPreset('large');
  expect(getBalancedPreset()).toBe('large');
  localStorage.setItem('balanced:preset', 'giant');
  expect(getBalancedPreset()).toBeNull();
});
test('balanced-howto-seen flag round-trips', () => {
  expect(getFlag('balanced-howto-seen')).toBe(false);
  setFlag('balanced-howto-seen', true);
  expect(getFlag('balanced-howto-seen')).toBe(true);
});
