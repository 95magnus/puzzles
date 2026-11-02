// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getSumsPreset, loadSumsDaily, saveSumsDaily, setSumsPreset } from '../../../src/games/sums/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const sums = { date: '2026-11-02', cells: '0123', lives: 1, elapsedMs: 42_000, status: 'playing' as const, attempt: 1 };

test('sums daily save round-trips', () => {
  saveSumsDaily(sums);
  expect(loadSumsDaily('2026-11-02')).toEqual({ v: 1, ...sums });
});
test('loadSumsDaily returns null for another date or no save', () => {
  expect(loadSumsDaily('2026-11-02')).toBeNull();
  saveSumsDaily(sums);
  expect(loadSumsDaily('2026-11-03')).toBeNull();
});
test('loadSumsDaily returns null for corrupt or malformed saves', () => {
  const put = (o: unknown) => localStorage.setItem('sums:daily', typeof o === 'string' ? o : JSON.stringify(o));
  for (const bad of [
    '{nope',
    'null',
    { v: 2, ...sums },
    { v: 1, ...sums, cells: '014' },
    { v: 1, ...sums, cells: 7 },
    { v: 1, ...sums, lives: 4 },
    { v: 1, ...sums, lives: -1 },
    { v: 1, ...sums, lives: 1.5 },
    { v: 1, ...sums, elapsedMs: -1 },
    { v: 1, ...sums, status: 'gone' },
    { v: 1, ...sums, attempt: 0 },
    { v: 1, ...sums, attempt: 1.5 },
  ]) {
    put(bad);
    expect(loadSumsDaily('2026-11-02')).toBeNull();
  }
});
test('throwing storage: load/preset return null, saves do not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadSumsDaily('2026-11-02')).toBeNull();
  expect(getSumsPreset()).toBeNull();
  expect(() => saveSumsDaily(sums)).not.toThrow();
  expect(() => setSumsPreset('hard')).not.toThrow();
});
test('sums preset round-trips; unknown value reads as null', () => {
  expect(getSumsPreset()).toBeNull();
  setSumsPreset('hard');
  expect(getSumsPreset()).toBe('hard');
  localStorage.setItem('sums:preset', 'huge');
  expect(getSumsPreset()).toBeNull();
});
