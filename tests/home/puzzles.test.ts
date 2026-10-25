// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest';
import { saveDaily, saveMinesDaily, savePatchesDaily, saveQueensDaily, saveTangleDaily, saveTangoDaily, type MinesStatus, type TangleStatus } from '../../src/core/storage';
import { PUZZLES, statusLabel } from '../../src/home/puzzles';
import { QUEENS_PREVIEW_REGIONS, flowPreview, minesPreview, patchesPreview, queensPreview, tanglePreview, tangoPreview } from '../../src/home/previews';
import { countSolutions } from '../../src/queens/solver';

const DATE = '2026-10-21';
const flow = PUZZLES.find(p => p.id === 'flow')!;
const mines = PUZZLES.find(p => p.id === 'mines')!;
const tangle = PUZZLES.find(p => p.id === 'tangle')!;
const queens = PUZZLES.find(p => p.id === 'queens')!;
const patches = PUZZLES.find(p => p.id === 'patches')!;
const tango = PUZZLES.find(p => p.id === 'tango')!;
const tangleSave = (status: TangleStatus, attempt: number, elapsedMs: number) =>
  saveTangleDaily({ date: DATE, removed: '010', lives: 2, elapsedMs, status, attempt });
const label = (p: typeof flow) => statusLabel(p, p.dailyStatus(DATE));
const minesSave = (status: MinesStatus, attempt: number, elapsedMs: number) =>
  saveMinesDaily({ date: DATE, cells: 'hrf', elapsedMs, status, attempt });

beforeEach(() => localStorage.clear());

test('registry lists Flow, Mines, Tangle, Queens, Patches then Tango with their pages', () => {
  expect(PUZZLES.map(p => [p.id, p.name, p.href])).toEqual([
    ['flow', 'Flow', './flow.html'],
    ['mines', 'Mines', './minesweeper.html'],
    ['tangle', 'Tangle', './tangle.html'],
    ['queens', 'Queens', './queens.html'],
    ['patches', 'Patches', './patches.html'],
    ['tango', 'Tango', './tango.html'],
  ]);
  expect(flow.tagline).toBe('Connect matching dots. Fill every cell.');
  expect(mines.tagline).toBe('Clear the board without hitting a mine.');
  expect(tangle.tagline).toBe("Tap arrows out of the knot. Don't crash.");
  expect(queens.tagline).toBe('One queen per row, column and colour.');
  expect(patches.tagline).toBe('Cut the grid into patches. One clue each.');
  expect(tango.tagline).toBe('Fill the grid with dots and rings.');
});

test('Flow: no save is Not started', () => {
  expect(flow.dailyStatus(DATE)).toEqual({ kind: 'new' });
  expect(label(flow)).toBe('Not started');
});

test('Flow: unsolved save is In progress with its time', () => {
  saveDaily({ date: DATE, paths: [], elapsedMs: 42_000, solved: false });
  expect(flow.dailyStatus(DATE).kind).toBe('playing');
  expect(label(flow)).toBe('In progress · 00:42');
});

test('Flow: solved save is Solved with its time', () => {
  saveDaily({ date: DATE, paths: [], elapsedMs: 83_000, solved: true });
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

test('Tango: no save is Not started', () => {
  expect(label(tango)).toBe('Not started');
});

test.each([
  [false, 42_000, 'playing', 'In progress · 00:42'],
  [true, 83_000, 'done', 'Solved · 01:23'],
] as const)('Tango: solved=%s', (solved, ms, kind, text) => {
  saveTangoDaily({ date: DATE, cells: '0120', elapsedMs: ms, solved });
  expect(tango.dailyStatus(DATE).kind).toBe(kind);
  expect(label(tango)).toBe(text);
});

test("yesterday's saves read as Not started", () => {
  saveDaily({ date: '2026-10-20', paths: [], elapsedMs: 83_000, solved: true });
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
  for (const svg of [flowPreview(), minesPreview(), tanglePreview(), queensPreview(), patchesPreview(), tangoPreview()]) {
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
  expect(tango.preview).toBe(tangoPreview);
});

test('the Queens preview layout has exactly one solution', () => {
  const rows = QUEENS_PREVIEW_REGIONS;
  const regions = new Uint8Array(rows.flat());
  expect(countSolutions({ size: rows.length, regions, solution: [] }, 10)).toBe(1);
});
