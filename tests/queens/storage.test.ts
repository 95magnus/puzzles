// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFlag, setFlag } from '../../src/core/storage';
import { loadQueensDaily, saveQueensDaily, getQueensPreset, setQueensPreset } from '../../src/queens/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const queens = { date: '2026-10-22', cells: '0120', elapsedMs: 5000, solved: false };

test('queens daily save round-trips', () => {
  saveQueensDaily(queens);
  expect(loadQueensDaily('2026-10-22')).toEqual({ v: 1, ...queens });
});
test('loadQueensDaily returns null for another date or no save', () => {
  expect(loadQueensDaily('2026-10-22')).toBeNull();
  saveQueensDaily(queens);
  expect(loadQueensDaily('2026-10-23')).toBeNull();
});
test('loadQueensDaily returns null for corrupt or malformed saves', () => {
  const put = (o: unknown) => localStorage.setItem('queens:daily', typeof o === 'string' ? o : JSON.stringify(o));
  for (const bad of [
    '{nope',
    'null',
    { v: 2, ...queens },
    { v: 1, ...queens, cells: '0x' },
    { v: 1, ...queens, cells: 7 },
    { v: 1, ...queens, elapsedMs: -1 },
    { v: 1, ...queens, solved: 'yes' },
  ]) {
    put(bad);
    expect(loadQueensDaily('2026-10-22')).toBeNull();
  }
});
test('throwing storage: queens load/preset return null, saves do not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadQueensDaily('2026-10-22')).toBeNull();
  expect(getQueensPreset()).toBeNull();
  expect(() => saveQueensDaily(queens)).not.toThrow();
  expect(() => setQueensPreset('large')).not.toThrow();
});
test('queens preset round-trips; unknown value reads as null', () => {
  expect(getQueensPreset()).toBeNull();
  setQueensPreset('large');
  expect(getQueensPreset()).toBe('large');
  localStorage.setItem('queens:preset', 'giant');
  expect(getQueensPreset()).toBeNull();
});
test('queens-howto-seen flag round-trips', () => {
  expect(getFlag('queens-howto-seen')).toBe(false);
  setFlag('queens-howto-seen', true);
  expect(getFlag('queens-howto-seen')).toBe(true);
});
