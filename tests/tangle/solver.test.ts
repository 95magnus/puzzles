import { expect, test } from 'vitest';
import { analyze, blockersOf, buildOcc, exitLine } from '../../src/tangle/solver';
import { lvl } from './helpers';

test('exitLine runs from the head to the edge', () => {
  const l = lvl(5, 5, [[[[2, 0], [2, 1]], 1]]);
  expect(exitLine(l, 0)).toEqual([12, 13, 14]);
});

test('buildOcc marks cells and respects alive', () => {
  const l = lvl(5, 5, [
    [[[0, 0], [0, 1]], 1],
    [[[3, 0], [3, 1]], 1],
  ]);
  expect(buildOcc(l)[0]).toBe(0);
  expect(buildOcc(l)[16]).toBe(1);
  const occ = buildOcc(l, Uint8Array.from([1, 0]));
  expect(occ[1]).toBe(0);
  expect(occ[15]).toBe(-1);
  expect(occ[16]).toBe(-1);
});

test('blockersOf lists distinct blockers nearest first', () => {
  const l = lvl(6, 6, [
    [[[2, 0], [2, 1]], 1],
    [[[1, 2], [2, 2], [3, 2]], 2],
    [[[2, 3], [2, 4]], 0],
  ]);
  expect(blockersOf(l, buildOcc(l), 0)).toEqual([1, 2]);
});

test('analyze: single free arrow', () => {
  const l = lvl(5, 5, [[[[0, 0], [0, 1]], 1]]);
  expect(analyze(l)).toEqual({ order: [0], initiallyFree: 1, depth: 1 });
});

test('analyze: two-arrow chain', () => {
  const l = lvl(5, 5, [
    [[[2, 0], [2, 1]], 1],
    [[[1, 3], [2, 3]], 2],
  ]);
  expect(analyze(l)).toEqual({ order: [1, 0], initiallyFree: 1, depth: 2 });
});

test('analyze: mutual block returns null', () => {
  const l = lvl(5, 5, [
    [[[2, 0], [2, 1]], 1],
    [[[3, 3], [2, 3]], 3],
  ]);
  expect(analyze(l)).toBeNull();
});
