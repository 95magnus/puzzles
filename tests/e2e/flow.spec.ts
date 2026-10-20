import { expect, test, type Page } from '@playwright/test';
import { generateWithSolution } from '../../src/core/generator';
import { mulberry32, seedFromDate } from '../../src/core/rng';
import type { Cell } from '../../src/core/types';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('flow:flag:howto-seen', '1');
    } catch {
      /* ignore */
    }
  });
});

async function center(page: Page, size: number, cell: Cell) {
  const box = await page.getByRole('application', { name: 'Puzzle board' }).boundingBox();
  if (!box) throw new Error('board not visible');
  return {
    x: box.x + ((cell.c + 0.5) / size) * box.width,
    y: box.y + ((cell.r + 0.5) / size) * box.height,
  };
}

async function drawPath(page: Page, size: number, path: Cell[], upAtEnd = true) {
  const first = await center(page, size, path[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const cell of path.slice(1)) {
    const p = await center(page, size, cell);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  if (upAtEnd) await page.mouse.up();
}

test('solve a fixed practice puzzle by mouse drag shows win card', async ({ page }) => {
  const { solution } = generateWithSolution(5, mulberry32(123));
  await page.goto('/#/practice?size=5&seed=123');
  await expect(page.getByRole('application', { name: 'Puzzle board' })).toBeVisible();
  await expect(page.locator('.board-dot').first()).toBeVisible();
  for (const path of solution) await drawPath(page, 5, path);
  await expect(page.getByText('Solved ✦')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next puzzle' })).toBeVisible();
});

test('daily progress survives reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  const { solution } = generateWithSolution(7, mulberry32(seedFromDate('2026-10-21')));
  await page.goto('/');
  await expect(page.locator('.board-dot').first()).toBeVisible();
  await drawPath(page, 7, solution[0]);
  const polylines = page.locator('polyline.board-path');
  await expect(polylines).toHaveCount(1);
  const points = await polylines.first().getAttribute('points');
  const fill = page.locator('.hud__row, .hud').getByText(/Fill\s*[1-9]\d*%/).first();
  await expect(fill).toBeVisible();

  await page.reload();
  await expect(polylines).toHaveCount(1);
  expect(await polylines.first().getAttribute('points')).toBe(points);
  await expect(page.getByText(/Fill\s*[1-9]\d*%/).first()).toBeVisible();
});

test('right-click clears a path', async ({ page }) => {
  const { solution } = generateWithSolution(5, mulberry32(123));
  await page.goto('/#/practice?size=5&seed=123');
  await expect(page.locator('.board-dot').first()).toBeVisible();
  await drawPath(page, 5, solution[0]);
  const polylines = page.locator('polyline.board-path');
  await expect(polylines).toHaveCount(1);
  const mid = await center(page, 5, solution[0][1]);
  await page.mouse.click(mid.x, mid.y, { button: 'right' });
  await expect(polylines).toHaveCount(0);
});
