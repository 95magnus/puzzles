// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFlag, setFlag } from '../../../src/core/storage';
import { loadBridgesDaily, saveBridgesDaily, getBridgesPreset, setBridgesPreset } from '../../../src/games/bridges/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const bridges = { date: '2026-10-25', links: '0120', elapsedMs: 5000, solved: false };

test('bridges daily save round-trips', () => {
  saveBridgesDaily(bridges);
  expect(loadBridgesDaily('2026-10-25')).toEqual({ v: 1, ...bridges });
});
test('loadBridgesDaily returns null for another date or no save', () => {
  expect(loadBridgesDaily('2026-10-25')).toBeNull();
  saveBridgesDaily(bridges);
  expect(loadBridgesDaily('2026-10-26')).toBeNull();
});
test('loadBridgesDaily returns null for corrupt or malformed saves', () => {
  const put = (o: unknown) => localStorage.setItem('bridges:daily', typeof o === 'string' ? o : JSON.stringify(o));
  for (const bad of [
    '{nope',
    'null',
    { v: 2, ...bridges },
    { v: 1, ...bridges, links: '01x' },
    { v: 1, ...bridges, links: 7 },
    { v: 1, ...bridges, elapsedMs: -1 },
    { v: 1, ...bridges, solved: 'yes' },
  ]) {
    put(bad);
    expect(loadBridgesDaily('2026-10-25')).toBeNull();
  }
});
test('throwing storage: bridges load/preset return null, saves do not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadBridgesDaily('2026-10-25')).toBeNull();
  expect(getBridgesPreset()).toBeNull();
  expect(() => saveBridgesDaily(bridges)).not.toThrow();
  expect(() => setBridgesPreset('large')).not.toThrow();
});
test('bridges preset round-trips; unknown value reads as null', () => {
  expect(getBridgesPreset()).toBeNull();
  setBridgesPreset('large');
  expect(getBridgesPreset()).toBe('large');
  localStorage.setItem('bridges:preset', 'giant');
  expect(getBridgesPreset()).toBeNull();
});
test('bridges-howto-seen flag round-trips', () => {
  expect(getFlag('bridges-howto-seen')).toBe(false);
  setFlag('bridges-howto-seen', true);
  expect(getFlag('bridges-howto-seen')).toBe(true);
});
