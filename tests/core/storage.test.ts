// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadDaily, saveDaily, getFlag, setFlag } from '../../src/core/storage';

const save = { date: '2026-10-20', paths: [[{ r: 0, c: 0 }, { r: 0, c: 1 }]], elapsedMs: 1234, solved: false };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('daily save round-trips', () => {
  saveDaily(save);
  expect(loadDaily('2026-10-20')).toEqual({ v: 1, ...save });
});
test('loadDaily returns null for another date', () => {
  saveDaily(save);
  expect(loadDaily('2026-10-21')).toBeNull();
});
test('loadDaily returns null for corrupt JSON or wrong v', () => {
  localStorage.setItem('flow:daily', '{nope');
  expect(loadDaily('2026-10-20')).toBeNull();
  localStorage.setItem('flow:daily', JSON.stringify({ v: 2, ...save }));
  expect(loadDaily('2026-10-20')).toBeNull();
  localStorage.setItem('flow:daily', JSON.stringify({ v: 1, ...save, paths: [[{ r: 'x', c: 0 }]] }));
  expect(loadDaily('2026-10-20')).toBeNull();
  localStorage.setItem('flow:daily', JSON.stringify({ v: 1, ...save, solved: 'no' }));
  expect(loadDaily('2026-10-20')).toBeNull();
  localStorage.setItem('flow:daily', 'null');
  expect(loadDaily('2026-10-20')).toBeNull();
});
test('storage that throws: load returns null, save/setFlag do not throw, getFlag false', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadDaily('2026-10-20')).toBeNull();
  expect(() => saveDaily(save)).not.toThrow();
  expect(() => setFlag('colorblind', true)).not.toThrow();
  expect(getFlag('colorblind')).toBe(false);
});
test('flags round-trip and default false', () => {
  expect(getFlag('howto-seen')).toBe(false);
  setFlag('howto-seen', true);
  expect(getFlag('howto-seen')).toBe(true);
  setFlag('howto-seen', false);
  expect(getFlag('howto-seen')).toBe(false);
});
