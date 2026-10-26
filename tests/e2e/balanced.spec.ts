import { expect, test, type Page } from '@playwright/test';
import { DAILY_PRESET, PRESETS, generatePuzzle, balancedDailySeed } from '../../src/balanced/generate';
import type { Puzzle, Sym } from '../../src/balanced/types';

const SIZE = PRESETS.small.size;
const PRACTICE_URL = '/balanced.html#/practice?preset=small&seed=11';
const practice = () => generatePuzzle(SIZE, 11);
const openCells = (p: Puzzle) => p.givens.flatMap((v, i) => (v === 0 ? [i] : []));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow:flag:balanced-howto-seen', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const cell = (page: Page, i: number) => page.locator(`.balanced-cell[data-i="${i}"]`);

/** Tap an empty cell until it shows `sym` (1 tap for a dot, 2 for a ring). */
async function tapTo(page: Page, i: number, sym: Sym) {
  for (let k = 0; k < sym; k++) await cell(page, i).click();
  await expect(cell(page, i)).toHaveAttribute('data-sym', String(sym));
}

test('solve a fixed practice board', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.balanced-cell')).toHaveCount(SIZE * SIZE);
  const p = practice();
  for (const i of openCells(p)) await tapTo(page, i, p.solution[i]);
  await expect(page.getByText('Balanced ●○')).toBeVisible();
});

test('three in a row shows red', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.balanced-cell')).toHaveCount(SIZE * SIZE);
  const open = new Set(openCells(practice()));
  // The first three horizontally consecutive non-given cells in one row.
  let start = -1;
  for (let i = 0; i < SIZE * SIZE && start < 0; i++) {
    if (i % SIZE <= SIZE - 3 && open.has(i) && open.has(i + 1) && open.has(i + 2)) start = i;
  }
  expect(start).toBeGreaterThanOrEqual(0);
  for (const i of [start, start + 1, start + 2]) await tapTo(page, i, 1);
  await expect(page.locator('.balanced-cell.is-triple')).toHaveCount(3);
});

test('Undo and Clear', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const p = practice();
  const [a, b] = openCells(p);
  const givens = p.givens.filter((v) => v !== 0).length;
  const total = SIZE * SIZE;
  await tapTo(page, a, 1);
  await tapTo(page, b, 1);
  await expect(page.locator('.balanced-filled')).toHaveText(`${givens + 2}/${total}`);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.balanced-filled')).toHaveText(`${givens + 1}/${total}`);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('dialog', { name: 'Clear the board?' })).toBeVisible();
  await page.locator('.modal [data-action="confirm"]').click();
  await expect(page.locator('.balanced-filled')).toHaveText(`${givens}/${total}`);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.balanced-filled')).toHaveText(`${givens + 1}/${total}`);
  await expect(cell(page, a)).toHaveAttribute('data-sym', '1');
});

test('reload mid-daily restores progress', async ({ page }) => {
  await page.goto('/balanced.html#/');
  const date = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const p = generatePuzzle(PRESETS[DAILY_PRESET].size, balancedDailySeed(date));
  const [a, b] = openCells(p);
  await tapTo(page, a, 1);
  await tapTo(page, b, 2);
  await page.reload();
  await expect(cell(page, a)).toHaveAttribute('data-sym', '1');
  await expect(cell(page, b)).toHaveAttribute('data-sym', '2');
});
