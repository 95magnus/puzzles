// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest';
import { saveFlowDaily } from '../../src/games/flow/storage';
import { saveMinesDaily } from '../../src/games/mines/storage';
import { savePatchesDaily } from '../../src/games/patches/storage';
import { saveQueensDaily } from '../../src/games/queens/storage';
import { saveTangleDaily } from '../../src/games/tangle/storage';
import { saveBalancedDaily } from '../../src/games/balanced/storage';
import { saveBridgesDaily } from '../../src/games/bridges/storage';
import { saveLoopDaily } from '../../src/games/loop/storage';
import type { Status as MinesStatus } from '../../src/games/mines/types';
import type { Status as TangleStatus } from '../../src/games/tangle/types';
import { PUZZLES, statusLabel } from '../../src/home/puzzles';
import { QUEENS_PREVIEW_REGIONS, flowPreview, minesPreview, patchesPreview, queensPreview, tanglePreview, balancedPreview, bridgesPreview, loopPreview } from '../../src/home/previews';
import { countSolutions } from '../../src/games/queens/solver';
import { PAGES } from '../../src/pages';

const DATE = '2026-10-21';
const flow = PUZZLES.find(p => p.id === 'flow')!;
const mines = PUZZLES.find(p => p.id === 'mines')!;
const tangle = PUZZLES.find(p => p.id === 'tangle')!;
const queens = PUZZLES.find(p => p.id === 'queens')!;
const patches = PUZZLES.find(p => p.id === 'patches')!;
const balanced = PUZZLES.find(p => p.id === 'balanced')!;
const bridges = PUZZLES.find(p => p.id === 'bridges')!;
const loop = PUZZLES.find(p => p.id === 'loop')!;
const tangleSave = (status: TangleStatus, attempt: number, elapsedMs: number) =>
  saveTangleDaily({ date: DATE, removed: '010', lives: 2, elapsedMs, status, attempt });
const label = (p: typeof flow) => statusLabel(p, p.dailyStatus(DATE));
const minesSave = (status: MinesStatus, attempt: number, elapsedMs: number) =>
  saveMinesDaily({ date: DATE, cells: 'hrf', elapsedMs, status, attempt });

beforeEach(() => localStorage.clear());

test('every page in src/pages.ts but the dashboard has an entry', () => {
  expect(PUZZLES.map(p => p.id).sort()).toEqual(Object.keys(PAGES).filter(k => k !== 'home').sort());
});

test('registry lists Flow, Mines, Tangle, Queens, Patches, Balanced, Bridges then Loop with their pages', () => {
  expect(PUZZLES.map(p => [p.id, p.name, p.href])).toEqual([
    ['flow', 'Flow', './flow.html'],
    ['mines', 'Mines', './mines.html'],
    ['tangle', 'Tangle', './tangle.html'],
    ['queens', 'Queens', './queens.html'],
    ['patches', 'Patches', './patches.html'],
    ['balanced', 'Balanced', './balanced.html'],
    ['bridges', 'Bridges', './bridges.html'],
    ['loop', 'Loop', './loop.html'],
  ]);
  expect(flow.tagline).toBe('Connect matching dots. Fill every cell.');
  expect(mines.tagline).toBe('Clear the board without hitting a mine.');
  expect(tangle.tagline).toBe("Tap arrows out of the knot. Don't crash.");
  expect(queens.tagline).toBe('One queen per row, column and colour.');
  expect(patches.tagline).toBe('Cut the grid into patches. One clue each.');
  expect(balanced.tagline).toBe('Fill the grid with dots and rings.');
  expect(bridges.tagline).toBe('Connect every island. Match every number.');
  expect(loop.tagline).toBe('Draw one loop. Every number counts its sides.');
});

test('Flow: no save is Not started', () => {
  expect(flow.dailyStatus(DATE)).toEqual({ kind: 'new' });
  expect(label(flow)).toBe('Not started');
});

test('Flow: unsolved save is In progress with its time', () => {
  saveFlowDaily({ date: DATE, paths: [], elapsedMs: 42_000, solved: false });
  expect(flow.dailyStatus(DATE).kind).toBe('playing');
  expect(label(flow)).toBe('In progress · 00:42');
});

test('Flow: solved save is Solved with its time', () => {
  saveFlowDaily({ date: DATE, paths: [], elapsedMs: 83_000, solved: true });
  expect(flow.dailyStatus(DATE).kind).toBe('done');
  expect(label(flow)).toBe('Solved · 01:23');
});

test.each([
  ['playing', 1, 42_000, 'playing', 'In progress · 00:42'],
  ['playing', 2, 42_000, 'playing', 'In progress · 00:42 · attempt 2'],
  ['won', 1, 83_000, 'done', 'Cleared · 01:23'],
  ['won', 2, 83_000, 'done', 'Cleared · 01:23 · attempt 2'],
  ['lost', 2, 5_000, 'lost', 'Boom · attempt 2'],
  ['lost', 1, 5_000, 'lost', 'Boom · attempt 1'],
] as const)('Mines: %s on attempt %i', (status, attempt, ms, kind, text) => {
  minesSave(status, attempt, ms);
  expect(mines.dailyStatus(DATE).kind).toBe(kind);
  expect(label(mines)).toBe(text);
});

test('Tangle: no save is Not started', () => {
  expect(label(tangle)).toBe('Not started');
});

test.each([
  ['playing', 1, 42_000, 'playing', 'In progress · 00:42'],
  ['won', 1, 83_000, 'done', 'Cleared · 01:23'],
  ['won', 2, 83_000, 'done', 'Cleared · 01:23 · attempt 2'],
  ['lost', 2, 5_000, 'lost', 'Out of lives · attempt 2'],
] as const)('Tangle: %s on attempt %i', (status, attempt, ms, kind, text) => {
  tangleSave(status, attempt, ms);
  expect(tangle.dailyStatus(DATE).kind).toBe(kind);
  expect(label(tangle)).toBe(text);
});

test('Queens: no save is Not started', () => {
  expect(label(queens)).toBe('Not started');
});

test.each([
  [false, 42_000, 'playing', 'In progress · 00:42'],
  [true, 83_000, 'done', 'Solved · 01:23'],
] as const)('Queens: solved=%s', (solved, ms, kind, text) => {
  saveQueensDaily({ date: DATE, cells: '0000', elapsedMs: ms, solved });
  expect(queens.dailyStatus(DATE).kind).toBe(kind);
  expect(label(queens)).toBe(text);
});

test('Patches: no save is Not started', () => {
  expect(label(patches)).toBe('Not started');
});

test.each([
  [false, 42_000, 'playing', 'In progress · 00:42'],
  [true, 83_000, 'done', 'Solved · 01:23'],
] as const)('Patches: solved=%s', (solved, ms, kind, text) => {
  savePatchesDaily({ date: DATE, rects: '0,0,2,2', elapsedMs: ms, solved });
  expect(patches.dailyStatus(DATE).kind).toBe(kind);
  expect(label(patches)).toBe(text);
});

test('Balanced: no save is Not started', () => {
  expect(label(balanced)).toBe('Not started');
});

test.each([
  [false, 42_000, 'playing', 'In progress · 00:42'],
  [true, 83_000, 'done', 'Solved · 01:23'],
] as const)('Balanced: solved=%s', (solved, ms, kind, text) => {
  saveBalancedDaily({ date: DATE, cells: '0120', elapsedMs: ms, solved });
  expect(balanced.dailyStatus(DATE).kind).toBe(kind);
  expect(label(balanced)).toBe(text);
});

test('Bridges: no save is Not started', () => {
  expect(label(bridges)).toBe('Not started');
});

test.each([
  [false, 42_000, 'playing', 'In progress · 00:42'],
  [true, 83_000, 'done', 'Solved · 01:23'],
] as const)('Bridges: solved=%s', (solved, ms, kind, text) => {
  saveBridgesDaily({ date: DATE, links: '', elapsedMs: ms, solved });
  expect(bridges.dailyStatus(DATE).kind).toBe(kind);
  expect(label(bridges)).toBe(text);
});

test('Loop: no save is Not started', () => {
  expect(label(loop)).toBe('Not started');
});

test.each([
  [false, 42_000, 'playing', 'In progress · 00:42'],
  [true, 83_000, 'done', 'Solved · 01:23'],
] as const)('Loop: solved=%s', (solved, ms, kind, text) => {
  saveLoopDaily({ date: DATE, edges: '', elapsedMs: ms, solved });
  expect(loop.dailyStatus(DATE).kind).toBe(kind);
  expect(label(loop)).toBe(text);
});

test("yesterday's saves read as Not started", () => {
  saveFlowDaily({ date: '2026-10-20', paths: [], elapsedMs: 83_000, solved: true });
  saveMinesDaily({ date: '2026-10-20', cells: '', elapsedMs: 1, status: 'won', attempt: 1 });
  expect(label(flow)).toBe('Not started');
  expect(label(mines)).toBe('Not started');
});

test('junk saves read as Not started', () => {
  localStorage.setItem('flow:daily', '{not json');
  localStorage.setItem('mines:daily', '{not json');
  expect(label(flow)).toBe('Not started');
  expect(label(mines)).toBe('Not started');
});

test('previews are decorative SVGs', () => {
  for (const svg of [flowPreview(), minesPreview(), tanglePreview(), queensPreview(), patchesPreview(), balancedPreview(), bridgesPreview(), loopPreview()]) {
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(svg.classList.contains('puzzle-preview')).toBe(true);
  }
  expect(flow.preview).toBe(flowPreview);
  expect(mines.preview).toBe(minesPreview);
  expect(tangle.preview).toBe(tanglePreview);
  expect(queens.preview).toBe(queensPreview);
  expect(patches.preview).toBe(patchesPreview);
  expect(balanced.preview).toBe(balancedPreview);
  expect(bridges.preview).toBe(bridgesPreview);
  expect(loop.preview).toBe(loopPreview);
});

test('the Queens preview layout has exactly one solution', () => {
  const rows = QUEENS_PREVIEW_REGIONS;
  const regions = new Uint8Array(rows.flat());
  expect(countSolutions({ size: rows.length, regions, solution: [] }, 10)).toBe(1);
});
