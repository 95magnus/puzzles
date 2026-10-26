import { expect, test } from 'vitest';
import { mulberry32, seedFromString } from '../../src/core/rng';
import { PRESETS, DAILY_PRESET, generateBoard, minesDailySeed, neighbours } from '../../src/mines/generate';

const spec = PRESETS.expert;
const count = (a: Uint8Array) => a.reduce((s, m) => s + m, 0);

test('presets match spec', () => {
  expect(PRESETS).toEqual({
    classic: { cols: 30, rows: 16, mines: 99, label: 'Classic' },
    expert: { cols: 30, rows: 20, mines: 130, label: 'Expert+' },
    huge: { cols: 50, rows: 30, mines: 320, label: 'Huge' },
  });
  expect(DAILY_PRESET).toBe('expert');
});

test('minesDailySeed is namespaced away from Flow', () => {
  expect(minesDailySeed('2026-10-21')).toBe(seedFromString('mines-daily:2026-10-21'));
});

test('neighbours handles corners and edges', () => {
  expect(neighbours(30, 20, 0)).toEqual([1, 30, 31]);
  expect(neighbours(30, 20, 29)).toEqual([28, 58, 59]);
  expect(neighbours(30, 20, 599)).toEqual([568, 569, 598]);
  expect(neighbours(30, 20, 31)).toEqual([0, 1, 2, 30, 32, 60, 61, 62]);
});

test('same seed gives identical board (snapshot per preset)', () => {
  for (const id of ['classic', 'expert', 'huge'] as const) {
    const a = generateBoard(PRESETS[id], mulberry32(42));
    const b = generateBoard(PRESETS[id], mulberry32(42));
    expect(a).toEqual(b);
    expect({ id, start: a.start, mines: Array.from(a.mines).join('') }).toMatchSnapshot();
  }
});

test('different seeds give different boards', () => {
  expect(generateBoard(spec, mulberry32(1)).mines).not.toEqual(generateBoard(spec, mulberry32(2)).mines);
});

test('exact mine count, start neighbourhood mine-free, adj correct', () => {
  for (let seed = 0; seed < 200; seed++) {
    const b = generateBoard(spec, mulberry32(seed));
    expect(b.cols).toBe(30);
    expect(b.rows).toBe(20);
    expect(count(b.mines)).toBe(130);
    for (const j of [b.start, ...neighbours(30, 20, b.start)]) expect(b.mines[j]).toBe(0);
    expect(b.adj[b.start]).toBe(0);
    b.adj.forEach((n, i) => expect(n).toBe(neighbours(30, 20, i).filter((j) => b.mines[j]).length));
  }
});

test('tight board: any start position keeps its neighbourhood clear', () => {
  // 4×4/7: a centre start leaves exactly 7 candidates
  for (let seed = 0; seed < 100; seed++) {
    const b = generateBoard({ cols: 4, rows: 4, mines: 7 }, mulberry32(seed));
    expect(count(b.mines)).toBe(7);
    for (const j of [b.start, ...neighbours(4, 4, b.start)]) expect(b.mines[j]).toBe(0);
  }
});

test('an explicit start cell is used and kept mine-free', () => {
  for (const start of [0, 29, 300, 599]) {
    for (let seed = 0; seed < 20; seed++) {
      const b = generateBoard(spec, mulberry32(seed), start);
      expect(b.start).toBe(start);
      expect(count(b.mines)).toBe(130);
      for (const j of [start, ...neighbours(30, 20, start)]) expect(b.mines[j]).toBe(0);
    }
  }
  expect(generateBoard(spec, mulberry32(3), 77)).toEqual(generateBoard(spec, mulberry32(3), 77));
});

test('throws when mines exceed placeable cells', () => {
  // 3×3 leaves at most 5 candidates for any start
  for (let seed = 0; seed < 20; seed++) {
    expect(() => generateBoard({ cols: 3, rows: 3, mines: 6 }, mulberry32(seed))).toThrow(RangeError);
  }
});
