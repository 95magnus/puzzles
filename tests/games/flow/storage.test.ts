// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadFlowDaily, saveFlowDaily } from '../../../src/games/flow/storage';

const save = { date: '2026-10-20', paths: [[{ r: 0, c: 0 }, { r: 0, c: 1 }]], elapsedMs: 1234, solved: false };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('daily save round-trips', () => {
  saveFlowDaily(save);
  expect(loadFlowDaily('2026-10-20')).toEqual({ v: 1, ...save });
});
test('loadFlowDaily returns null for another date', () => {
  saveFlowDaily(save);
  expect(loadFlowDaily('2026-10-21')).toBeNull();
});
test('loadFlowDaily returns null for corrupt JSON or wrong v', () => {
  localStorage.setItem('flow:daily', '{nope');
  expect(loadFlowDaily('2026-10-20')).toBeNull();
  localStorage.setItem('flow:daily', JSON.stringify({ v: 2, ...save }));
  expect(loadFlowDaily('2026-10-20')).toBeNull();
  localStorage.setItem('flow:daily', JSON.stringify({ v: 1, ...save, paths: [[{ r: 'x', c: 0 }]] }));
  expect(loadFlowDaily('2026-10-20')).toBeNull();
  localStorage.setItem('flow:daily', JSON.stringify({ v: 1, ...save, solved: 'no' }));
  expect(loadFlowDaily('2026-10-20')).toBeNull();
  localStorage.setItem('flow:daily', 'null');
  expect(loadFlowDaily('2026-10-20')).toBeNull();
});
test('storage that throws: load returns null, save does not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadFlowDaily('2026-10-20')).toBeNull();
  expect(() => saveFlowDaily(save)).not.toThrow();
});
