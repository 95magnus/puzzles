import { expect, test, type Page } from '@playwright/test';
import { DAILY_PRESET, PRESETS, bridgesDailySeed, generatePuzzle } from '../../src/bridges/generate';
import type { Puzzle } from '../../src/bridges/types';

const SIZE = PRESETS.small.size;
const PRACTICE_URL = '/bridges.html#/practice?preset=small&seed=11';
const practice = () => generatePuzzle(SIZE, 11);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow:flag:bridges-howto-seen', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const link = (page: Page, i: number) => page.locator(`g.bridges-link[data-link="${i}"]`);
const island = (page: Page, i: number) => page.locator(`g.bridges-island[data-island="${i}"]`);

async function cellPoint(page: Page, size: number, cellIndex: number) {
  const box = (await page.locator('svg.bridges-svg').boundingBox())!;
  const r = Math.floor(cellIndex / size);
  const c = cellIndex % size;
  return { x: box.x + ((c + 0.5) * box.width) / size, y: box.y + ((r + 0.5) * box.height) / size };
}

/** Page coordinates of the middle cell of a link's gap. */
async function gapPoint(page: Page, p: Puzzle, l: number) {
  const inner = p.links[l].inner;
  return cellPoint(page, p.size, inner[Math.floor(inner.length / 2)]);
}

const islandPoint = (page: Page, p: Puzzle, i: number) => cellPoint(page, p.size, p.islands[i].cell);

async function tapLink(page: Page, p: Puzzle, l: number) {
  const { x, y } = await gapPoint(page, p, l);
  await page.mouse.click(x, y);
}

async function counts(page: Page, n: number) {
  const out: (string | null)[] = [];
  for (let i = 0; i < n; i++) out.push(await link(page, i).getAttribute('data-count'));
  return out;
}

test('solve a fixed practice board', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const p = practice();
  await expect(page.locator('g.bridges-island')).toHaveCount(p.islands.length);
  for (let l = 0; l < p.links.length; l++) {
    for (let k = 0; k < p.solution[l]; k++) await tapLink(page, p, l);
    await expect(link(page, l)).toHaveAttribute('data-count', String(p.solution[l]));
  }
  await expect(page.getByText('All connected')).toBeVisible();
});

test('drag adds a bridge', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const p = practice();
  const l = p.islandLinks[0][0];
  const other = p.links[l].a === 0 ? p.links[l].b : p.links[l].a;
  const from = await islandPoint(page, p, 0);
  const to = await islandPoint(page, p, other);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect(link(page, l)).toHaveAttribute('data-count', '1');
});

test('overloading an island shows red', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const p = practice();
  const i = p.islands.findIndex((isl, k) => isl.n < 2 * p.islandLinks[k].length);
  expect(i).toBeGreaterThanOrEqual(0);
  const n = p.islands[i].n;
  let total = 0;
  for (const l of p.islandLinks[i]) {
    for (let k = 0; k < 2 && total <= n; k++) {
      await tapLink(page, p, l);
      total++;
    }
    if (total > n) break;
  }
  expect(total).toBeGreaterThan(n);
  await expect(island(page, i)).toHaveClass(/is-over/);
});

test('Undo and Clear', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const p = practice();
  const n = p.links.length;
  await tapLink(page, p, 0);
  await tapLink(page, p, 1);
  const nonZero = async () => (await counts(page, n)).filter((c) => c !== '0').length;
  await expect.poll(nonZero).toBe(2);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(nonZero).toBe(1);
  await page.locator('[data-action="clear"]').click();
  await expect.poll(nonZero).toBe(0);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(nonZero).toBe(1);
});

test('reload mid-daily restores progress', async ({ page }) => {
  await page.goto('/bridges.html#/');
  const date = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const p = generatePuzzle(PRESETS[DAILY_PRESET].size, bridgesDailySeed(date));
  await expect(page.locator('g.bridges-island')).toHaveCount(p.islands.length);
  await tapLink(page, p, 0);
  await tapLink(page, p, 1);
  await tapLink(page, p, 1);
  const before = await counts(page, p.links.length);
  expect(before.filter((c) => c !== '0').length).toBe(2);
  await page.reload();
  await expect(page.locator('g.bridges-island')).toHaveCount(p.islands.length);
  expect(await counts(page, p.links.length)).toEqual(before);
});
