// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getFlag, setFlag } from '../../src/core/storage';
import { loadPatchesDaily, savePatchesDaily, getPatchesPreset, setPatchesPreset } from '../../src/patches/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const patches = { date: '2026-10-23', rects: '0,0,2,1;1,0,1,2', elapsedMs: 5000, solved: false };

test('patches daily save round-trips', () => {
  savePatchesDaily(patches);
  expect(loadPatchesDaily('2026-10-23')).toEqual({ v: 1, ...patches });
});
test('patches daily save round-trips an empty rects string', () => {
  savePatchesDaily({ ...patches, rects: '' });
  expect(loadPatchesDaily('2026-10-23')).toEqual({ v: 1, ...patches, rects: '' });
});
test('loadPatchesDaily returns null for another date or no save', () => {
  expect(loadPatchesDaily('2026-10-23')).toBeNull();
  savePatchesDaily(patches);
  expect(loadPatchesDaily('2026-10-24')).toBeNull();
});
test('loadPatchesDaily returns null for corrupt or malformed saves', () => {
  const put = (o: unknown) => localStorage.setItem('patches:daily', typeof o === 'string' ? o : JSON.stringify(o));
  for (const bad of [
    '{nope',
    'null',
    { v: 2, ...patches },
    { v: 1, ...patches, rects: '0,0,x,1' },
    { v: 1, ...patches, rects: 7 },
    { v: 1, ...patches, elapsedMs: -1 },
    { v: 1, ...patches, solved: 'yes' },
  ]) {
    put(bad);
    expect(loadPatchesDaily('2026-10-23')).toBeNull();
  }
});
test('throwing storage: patches load/preset return null, saves do not throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadPatchesDaily('2026-10-23')).toBeNull();
  expect(getPatchesPreset()).toBeNull();
  expect(() => savePatchesDaily(patches)).not.toThrow();
  expect(() => setPatchesPreset('large')).not.toThrow();
});
test('patches preset round-trips; unknown value reads as null', () => {
  expect(getPatchesPreset()).toBeNull();
  setPatchesPreset('large');
  expect(getPatchesPreset()).toBe('large');
  localStorage.setItem('patches:preset', 'giant');
  expect(getPatchesPreset()).toBeNull();
});
test('patches-howto-seen flag round-trips', () => {
  expect(getFlag('patches-howto-seen')).toBe(false);
  setFlag('patches-howto-seen', true);
  expect(getFlag('patches-howto-seen')).toBe(true);
});
