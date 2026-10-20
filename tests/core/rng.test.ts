import { expect, test } from 'vitest';
import { mulberry32, seedFromDate, randInt, shuffle } from '../../src/core/rng';

test('mulberry32 is deterministic', () => {
  const a = mulberry32(42), b = mulberry32(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
test('values are in [0,1)', () => {
  const r = mulberry32(1);
  for (let i = 0; i < 1000; i++) { const x = r(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
});
test('seedFromDate is stable and date-sensitive', () => {
  expect(seedFromDate('2026-10-20')).toBe(seedFromDate('2026-10-20'));
  expect(seedFromDate('2026-10-20')).not.toBe(seedFromDate('2026-10-21'));
  expect(Number.isInteger(seedFromDate('2026-10-20'))).toBe(true);
});
test('randInt range and shuffle permutation', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 200; i++) expect(randInt(r, 5)).toBeLessThan(5);
  expect(shuffle(mulberry32(3), [1,2,3,4,5]).sort()).toEqual([1,2,3,4,5]);
});
