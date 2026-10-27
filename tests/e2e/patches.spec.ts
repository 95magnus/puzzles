import { expect, test, type Page } from '@playwright/test';
import { DAILY_PRESET, PRESETS, generatePuzzle, patchesDailySeed } from '../../src/games/patches/generate';
import type { Rect } from '../../src/games/patches/types';

const SIZE = PRESETS.small.size;
const PRACTICE_URL = '/patches.html#/practice?preset=small&seed=11';
const practice = () => generatePuzzle(SIZE, 11);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow:flag:patches-howto-seen', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const cell = (page: Page, i: number) => page.locator(`.patches-cell[data-i="${i}"]`);

async function cellCenter(page: Page, i: number) {
  const box = (await cell(page, i).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag from the top-left cell to the bottom-right cell of the rect. */
async function drawRect(page: Page, size: number, rect: Rect) {
  const from = await cellCenter(page, rect.r * size + rect.c);
  const to = await cellCenter(page, (rect.r + rect.h - 1) * size + (rect.c + rect.w - 1));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

test('solve a fixed practice board', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.patches-cell')).toHaveCount(SIZE * SIZE);
  const { solution } = practice();
  for (const [n, rect] of solution.entries()) {
    await drawRect(page, SIZE, rect);
    await expect(page.locator('.patches-tile')).toHaveCount(n + 1);
  }
  await expect(page.getByText('Patched up')).toBeVisible();
});

test('a rect over two clues is invalid', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.patches-cell')).toHaveCount(SIZE * SIZE);
  const [clueA, clueB] = practice().clues;
  const a = { r: Math.floor(clueA.cell / SIZE), c: clueA.cell % SIZE };
  const b = { r: Math.floor(clueB.cell / SIZE), c: clueB.cell % SIZE };
  const r0 = Math.min(a.r, b.r);
  const c0 = Math.min(a.c, b.c);
  const bounds: Rect = {
    r: r0,
    c: c0,
    h: Math.max(a.r, b.r) - r0 + 1,
    w: Math.max(a.c, b.c) - c0 + 1,
  };
  await drawRect(page, SIZE, bounds);
  await expect(page.locator('.patches-tile')).toHaveCount(1);
  await expect(page.locator('.patches-tile.is-invalid')).toHaveCount(1);
});

test('drawing over a rect leaves it in place', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.patches-cell')).toHaveCount(SIZE * SIZE);
  const first = practice().solution[0];
  await drawRect(page, SIZE, first);
  await expect(page.locator('.patches-tile')).toHaveCount(1);
  const originalBox = await page.locator('.patches-tile').boundingBox();

  // A strictly larger rect that overlaps the first one.
  const larger: Rect = {
    r: first.r,
    c: first.c,
    h: Math.min(SIZE - first.r, first.h + 1),
    w: Math.min(SIZE - first.c, first.w + 1),
  };
  expect(larger.h * larger.w).toBeGreaterThan(first.h * first.w);
  await drawRect(page, SIZE, larger);
  await expect(page.locator('.patches-tile')).toHaveCount(1);
  expect(await page.locator('.patches-tile').boundingBox()).toEqual(originalBox);
  await expect(page.locator('.patches-preview')).toBeHidden();
});

test('reload mid-daily restores progress', async ({ page }) => {
  const date = new Date().toISOString().slice(0, 10);
  const size = PRESETS[DAILY_PRESET].size;
  const { solution } = generatePuzzle(size, patchesDailySeed(date));

  await page.goto('/patches.html#/');
  await expect(page.locator('.patches-cell')).toHaveCount(size * size);
  await drawRect(page, size, solution[0]);
  await expect(page.locator('.patches-tile')).toHaveCount(1);
  await drawRect(page, size, solution[1]);
  await expect(page.locator('.patches-tile')).toHaveCount(2);
  const cover = await page.locator('.patches-cover').textContent();

  await page.reload();
  await expect(page.locator('.patches-cell')).toHaveCount(size * size);
  await expect(page.locator('.patches-tile')).toHaveCount(2);
  await expect(page.locator('.patches-cover')).toHaveText(cover!);
});
