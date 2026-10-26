// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFlag, setFlag } from '../../src/core/storage';
import { loadMinesDaily, saveMinesDaily, getMinesPreset, setMinesPreset } from '../../src/minesweeper/storage';
import { loadDaily } from '../../src/flow/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const mines = { date: '2026-10-21', cells: 'hrrf', elapsedMs: 65_000, status: 'playing' as const, attempt: 2 };

test('a mines save from before attempts existed reads as attempt 1', () => {
  const { attempt: _, ...old } = mines;
  localStorage.setItem('mines:daily', JSON.stringify({ v: 1, ...old }));
  expect(loadMinesDaily('2026-10-21')).toEqual({ v: 1, ...old, attempt: 1 });
});

test('mines daily save round-trips', () => {
  saveMinesDaily(mines);
  expect(loadMinesDaily('2026-10-21')).toEqual({ v: 1, ...mines });
});
test('loadMinesDaily returns null for another date or no save', () => {
  expect(loadMinesDaily('2026-10-21')).toBeNull();
  saveMinesDaily(mines);
  expect(loadMinesDaily('2026-10-22')).toBeNull();
});
test('mines daily save is independent of the Flow daily save', () => {
  saveMinesDaily(mines);
  expect(loadDaily('2026-10-21')).toBeNull();
});
test('loadMinesDaily returns null for corrupt or malformed saves', () => {
  const put = (o: unknown) => localStorage.setItem('mines:daily', typeof o === 'string' ? o : JSON.stringify(o));
  for (const bad of [
    '{nope',
    'null',
    { v: 2, ...mines },
    { v: 1, ...mines, cells: 'hrx' },
    { v: 1, ...mines, cells: 7 },
    { v: 1, ...mines, elapsedMs: -1 },
    { v: 1, ...mines, elapsedMs: 'x' },
    { v: 1, ...mines, status: 'paused' },
    { v: 1, ...mines, attempt: 0 },
    { v: 1, ...mines, attempt: 1.5 },
    { v: 1, ...mines, attempt: '2' },
  ]) {
    put(bad);
    expect(loadMinesDaily('2026-10-21')).toBeNull();
  }
});
test('throwing storage: mines load/preset return null, saves do not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadMinesDaily('2026-10-21')).toBeNull();
  expect(getMinesPreset()).toBeNull();
  expect(() => saveMinesDaily(mines)).not.toThrow();
  expect(() => setMinesPreset('huge')).not.toThrow();
});
test('mines preset round-trips; unknown value reads as null', () => {
  expect(getMinesPreset()).toBeNull();
  setMinesPreset('huge');
  expect(getMinesPreset()).toBe('huge');
  localStorage.setItem('mines:preset', 'giant');
  expect(getMinesPreset()).toBeNull();
});
test('mines-howto-seen flag round-trips', () => {
  expect(getFlag('mines-howto-seen')).toBe(false);
  setFlag('mines-howto-seen', true);
  expect(getFlag('mines-howto-seen')).toBe(true);
});
