import { expect, test, type Page } from '@playwright/test';
import { PRESETS, generatePuzzle } from '../../src/games/loop/generate';
import { geometry, hEdge } from '../../src/games/loop/geometry';

const SIZE = PRESETS.small.size;
const PRACTICE_URL = '/loop.html#/practice?preset=small&seed=11';
const MARGIN = 0.4; // the board's viewBox margin, in cells

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow:flag:loop-howto-seen', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const edge = (page: Page, e: number) => page.locator(`g.loop-edge[data-edge="${e}"]`);

/** Page coordinates of a point in dot units (dot `(r, c)` is at x = c, y = r). */
async function pagePoint(page: Page, size: number, x: number, y: number) {
  const box = (await page.locator('svg.loop-svg').boundingBox())!;
  const span = size + 2 * MARGIN;
  return {
    x: box.x + ((x + MARGIN) * box.width) / span,
    y: box.y + ((y + MARGIN) * box.height) / span,
  };
}

async function edgePoint(page: Page, size: number, e: number) {
  const m = geometry(size).mid[e];
  return pagePoint(page, size, m.x, m.y);
}

async function tapEdge(page: Page, size: number, e: number) {
  const { x, y } = await edgePoint(page, size, e);
  await page.mouse.click(x, y);
}

async function dragDots(page: Page, size: number, dots: [number, number][]) {
  const pts = [];
  for (const [r, c] of dots) pts.push(await pagePoint(page, size, c, r));
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 8 });
  await page.mouse.up();
}

const states = async (page: Page, size: number) => {
  const n = geometry(size).edgeCount;
  const out: (string | null)[] = [];
  for (let e = 0; e < n; e++) out.push(await edge(page, e).getAttribute('data-state'));
  return out;
};

const count = async (page: Page, size: number, state: string) =>
  (await states(page, size)).filter((s) => s === state).length;

test('solve a fixed practice board', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const p = generatePuzzle(SIZE, 11);
  await expect(page.locator('g.loop-edge')).toHaveCount(geometry(SIZE).edgeCount);
  await expect(page.locator('text.loop-clue')).not.toHaveCount(0);
  for (let e = 0; e < p.solution.length; e++) {
    if (p.solution[e] === 1) await tapEdge(page, SIZE, e);
  }
  await expect(page.getByText('Loop closed')).toBeVisible();
});

test('drag draws and erases', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const row: [number, number][] = [[2, 1], [2, 2], [2, 3]];
  await dragDots(page, SIZE, row);
  await expect(edge(page, hEdge(SIZE, 2, 1))).toHaveAttribute('data-state', 'line');
  await expect(edge(page, hEdge(SIZE, 2, 2))).toHaveAttribute('data-state', 'line');
  expect(await count(page, SIZE, 'line')).toBe(2);
  // A second drag that starts on a line erases.
  await dragDots(page, SIZE, [[2, 3], [2, 2], [2, 1]]);
  await expect(edge(page, hEdge(SIZE, 2, 1))).toHaveAttribute('data-state', 'empty');
  await expect(edge(page, hEdge(SIZE, 2, 2))).toHaveAttribute('data-state', 'empty');
  expect(await count(page, SIZE, 'line')).toBe(0);
});

test('right-click places a cross', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const e = hEdge(SIZE, 2, 2);
  const { x, y } = await edgePoint(page, SIZE, e);
  await page.mouse.click(x, y, { button: 'right' });
  await expect(edge(page, e)).toHaveAttribute('data-state', 'cross');
  await page.mouse.click(x, y, { button: 'right' });
  await expect(edge(page, e)).toHaveAttribute('data-state', 'empty');
});

test('undo and clear', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  await dragDots(page, SIZE, [[1, 1], [1, 2], [1, 3]]);
  await expect.poll(() => count(page, SIZE, 'line')).toBe(2);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => count(page, SIZE, 'line')).toBe(0);
  await dragDots(page, SIZE, [[1, 1], [1, 2], [1, 3]]);
  await expect.poll(() => count(page, SIZE, 'line')).toBe(2);
  await page.locator('[data-action="clear"]').click();
  await page.locator('.modal [data-action="confirm"]').click();
  await expect.poll(() => count(page, SIZE, 'line')).toBe(0);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(() => count(page, SIZE, 'line')).toBe(2);
});

test('daily survives reload', async ({ page }) => {
  await page.goto('/loop.html#/');
  const size = PRESETS.medium.size;
  await expect(page.locator('g.loop-edge')).toHaveCount(geometry(size).edgeCount);
  await tapEdge(page, size, hEdge(size, 3, 3)); // line
  const crossed = hEdge(size, 5, 5);
  const { x, y } = await edgePoint(page, size, crossed);
  await page.mouse.click(x, y, { button: 'right' }); // cross
  await expect(edge(page, hEdge(size, 3, 3))).toHaveAttribute('data-state', 'line');
  await expect(edge(page, crossed)).toHaveAttribute('data-state', 'cross');
  await page.reload();
  await expect(page.locator('g.loop-edge')).toHaveCount(geometry(size).edgeCount);
  await expect(edge(page, hEdge(size, 3, 3))).toHaveAttribute('data-state', 'line');
  await expect(edge(page, crossed)).toHaveAttribute('data-state', 'cross');
});
