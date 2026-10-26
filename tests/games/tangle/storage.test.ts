// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFlag, setFlag } from '../../../src/core/storage';
import { loadTangleDaily, saveTangleDaily, getTanglePreset, setTanglePreset } from '../../../src/games/tangle/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const tangle = { date: '2026-10-21', removed: '0110', lives: 2, elapsedMs: 42_000, status: 'playing' as const, attempt: 1 };

test('tangle daily save round-trips', () => {
  saveTangleDaily(tangle);
  expect(loadTangleDaily('2026-10-21')).toEqual({ v: 1, ...tangle });
});
test('loadTangleDaily returns null for another date or no save', () => {
  expect(loadTangleDaily('2026-10-21')).toBeNull();
  saveTangleDaily(tangle);
  expect(loadTangleDaily('2026-10-22')).toBeNull();
});
test('loadTangleDaily returns null for corrupt or malformed saves', () => {
  const put = (o: unknown) => localStorage.setItem('tangle:daily', typeof o === 'string' ? o : JSON.stringify(o));
  for (const bad of [
    '{nope',
    'null',
    { v: 2, ...tangle },
    { v: 1, ...tangle, removed: 'x1' },
    { v: 1, ...tangle, removed: 7 },
    { v: 1, ...tangle, lives: 5 },
    { v: 1, ...tangle, lives: -1 },
    { v: 1, ...tangle, lives: 1.5 },
    { v: 1, ...tangle, elapsedMs: -1 },
    { v: 1, ...tangle, status: 'paused' },
    { v: 1, ...tangle, attempt: 0 },
    { v: 1, ...tangle, attempt: 1.5 },
  ]) {
    put(bad);
    expect(loadTangleDaily('2026-10-21')).toBeNull();
  }
});
test('throwing storage: tangle load/preset return null, saves do not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadTangleDaily('2026-10-21')).toBeNull();
  expect(getTanglePreset()).toBeNull();
  expect(() => saveTangleDaily(tangle)).not.toThrow();
  expect(() => setTanglePreset('huge')).not.toThrow();
});
test('tangle preset round-trips; unknown value reads as null', () => {
  expect(getTanglePreset()).toBeNull();
  setTanglePreset('huge');
  expect(getTanglePreset()).toBe('huge');
  localStorage.setItem('tangle:preset', 'giant');
  expect(getTanglePreset()).toBeNull();
});
test('tangle-howto-seen flag round-trips', () => {
  expect(getFlag('tangle-howto-seen')).toBe(false);
  setFlag('tangle-howto-seen', true);
  expect(getFlag('tangle-howto-seen')).toBe(true);
});
