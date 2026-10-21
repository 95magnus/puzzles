// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  loadDaily,
  saveDaily,
  getFlag,
  setFlag,
  loadMinesDaily,
  saveMinesDaily,
  getMinesPreset,
  setMinesPreset,
  loadTangleDaily,
  saveTangleDaily,
  getTanglePreset,
  setTanglePreset,
  loadQueensDaily,
  saveQueensDaily,
  getQueensPreset,
  setQueensPreset,
} from '../../src/core/storage';

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
