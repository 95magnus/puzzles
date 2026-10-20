// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest';
import { saveDaily, saveMinesDaily, type MinesStatus } from '../../src/core/storage';
import { PUZZLES, statusLabel } from '../../src/home/puzzles';
import { flowPreview, minesPreview } from '../../src/home/previews';

const DATE = '2026-10-21';
const flow = PUZZLES.find(p => p.id === 'flow')!;
const mines = PUZZLES.find(p => p.id === 'mines')!;
const label = (p: typeof flow) => statusLabel(p, p.dailyStatus(DATE));
const minesSave = (status: MinesStatus, attempt: number, elapsedMs: number) =>
  saveMinesDaily({ date: DATE, cells: 'hrf', elapsedMs, status, attempt });

beforeEach(() => localStorage.clear());

test('registry lists Flow then Mines with their pages', () => {
  expect(PUZZLES.map(p => [p.id, p.name, p.href])).toEqual([
    ['flow', 'Flow', './flow.html'],
    ['mines', 'Mines', './minesweeper.html'],
  ]);
  expect(flow.tagline).toBe('Connect matching dots. Fill every cell.');
  expect(mines.tagline).toBe('Clear the board without hitting a mine.');
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
  for (const svg of [flowPreview(), minesPreview()]) {
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(svg.classList.contains('puzzle-preview')).toBe(true);
  }
  expect(flow.preview).toBe(flowPreview);
  expect(mines.preview).toBe(minesPreview);
});
