// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { dailyStore, getFlag, presetStore, setFlag } from '../../src/core/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

type Save = { v: 1; date: string; n: number };
const store = dailyStore<Save>('test:daily', (o) => (Number.isInteger(o.n) ? { v: 1, date: o.date, n: o.n } : null));
const preset = presetStore<'a' | 'b'>('test:preset', ['a', 'b']);

test('dailyStore writes v 1 and reads back only the asked date', () => {
  store.save({ date: '2026-10-20', n: 3 });
  expect(JSON.parse(localStorage.getItem('test:daily')!)).toEqual({ v: 1, date: '2026-10-20', n: 3 });
  expect(store.load('2026-10-20')).toEqual({ v: 1, date: '2026-10-20', n: 3 });
  expect(store.load('2026-10-21')).toBeNull();
});
test('dailyStore rejects corrupt JSON, wrong v and what parse refuses', () => {
  for (const bad of ['{nope', 'null', '7', JSON.stringify({ v: 2, date: '2026-10-20', n: 3 }), JSON.stringify({ v: 1, date: '2026-10-20', n: 'x' })]) {
    localStorage.setItem('test:daily', bad);
    expect(store.load('2026-10-20')).toBeNull();
  }
});
test('presetStore round-trips; unknown value reads as null', () => {
  expect(preset.get()).toBeNull();
  preset.set('b');
  expect(preset.get()).toBe('b');
  localStorage.setItem('test:preset', 'c');
  expect(preset.get()).toBeNull();
});
test('storage that throws: loads and gets return null, saves and sets do not throw, getFlag false', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(store.load('2026-10-20')).toBeNull();
  expect(preset.get()).toBeNull();
  expect(() => store.save({ date: '2026-10-20', n: 3 })).not.toThrow();
  expect(() => preset.set('a')).not.toThrow();
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
