// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getLoopPreset, loadLoopDaily, saveLoopDaily, setLoopPreset } from '../../../src/games/loop/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const loop = { date: '2026-10-25', edges: '0120', elapsedMs: 5000, solved: false };

test('loop daily save round-trips', () => {
  saveLoopDaily(loop);
  expect(loadLoopDaily('2026-10-25')).toEqual({ v: 1, ...loop });
});
test('loadLoopDaily returns null for another date or no save', () => {
  expect(loadLoopDaily('2026-10-25')).toBeNull();
  saveLoopDaily(loop);
  expect(loadLoopDaily('2026-10-26')).toBeNull();
});
test('loadLoopDaily returns null for corrupt or malformed saves', () => {
  const put = (o: unknown) => localStorage.setItem('loop:daily', typeof o === 'string' ? o : JSON.stringify(o));
  for (const bad of [
    '{nope',
    'null',
    { v: 2, ...loop },
    { v: 1, ...loop, edges: '01x' },
    { v: 1, ...loop, edges: 7 },
    { v: 1, ...loop, elapsedMs: -1 },
    { v: 1, ...loop, solved: 'yes' },
  ]) {
    put(bad);
    expect(loadLoopDaily('2026-10-25')).toBeNull();
  }
});
test('throwing storage: loop load/preset return null, saves do not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(loadLoopDaily('2026-10-25')).toBeNull();
  expect(getLoopPreset()).toBeNull();
  expect(() => saveLoopDaily(loop)).not.toThrow();
  expect(() => setLoopPreset('large')).not.toThrow();
});
test('loop preset round-trips; unknown value reads as null', () => {
  expect(getLoopPreset()).toBeNull();
  setLoopPreset('large');
  expect(getLoopPreset()).toBe('large');
  localStorage.setItem('loop:preset', 'giant');
  expect(getLoopPreset()).toBeNull();
});
