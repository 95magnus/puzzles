import { expect, test, type Page } from '@playwright/test';
import { DAILY_PRESET, PRESETS, generateLevel, tangleDailySeed } from '../../src/games/tangle/generate';
import { analyze, blockersOf, buildOcc } from '../../src/games/tangle/solver';
import type { Level } from '../../src/games/tangle/types';

const DATE = '2026-10-21';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow:flag:tangle-howto-seen', '1'));
  // Instant exits: winning the medium board needs hundreds of taps.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/** Taps the head cell of arrow `i`. */
async function tapHead(page: Page, level: Level, i: number) {
  const cells = level.arrows[i].cells;
  const head = cells[cells.length - 1];
  const c = head % level.cols;
  const r = Math.floor(head / level.cols);
  const svg = page.locator('svg.tangle-svg');
  await svg.scrollIntoViewIfNeeded();
  const box = (await svg.boundingBox())!;
  await page.mouse.click(box.x + ((c + 0.5) * box.width) / level.cols, box.y + ((r + 0.5) * box.height) / level.rows);
}

/** Arrows that have at least one blocker on the untouched board, in index order. */
function blockedArrows(level: Level): number[] {
  const occ = buildOcc(level);
  return level.arrows.map((_, i) => i).filter((i) => blockersOf(level, occ, i).length > 0);
}

const practice = () => generateLevel(PRESETS.medium, 11);
const PRACTICE_URL = '/tangle.html#/practice?preset=medium&seed=11';

async function openDaily(page: Page) {
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
  await page.goto('/tangle.html#/');
  await expect(page.locator('svg.tangle-svg')).toBeVisible();
  return generateLevel(PRESETS[DAILY_PRESET], tangleDailySeed(DATE));
}

test('win a fixed practice board by tapping arrows in solver order', async ({ page }) => {
  const level = practice();
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.tangle-arrow')).toHaveCount(level.arrows.length);
  for (const i of analyze(level)!.order) {
    await tapHead(page, level, i);
    await expect(page.locator(`.tangle-arrow[data-a="${i}"]`)).toHaveCount(0);
  }
  await expect(page.getByText('Untangled ✦')).toBeVisible();
  await expect(page.locator('.tangle-lives')).toHaveText('♥♥♥');
});

test('a bump costs a heart and leaves the arrow in place', async ({ page }) => {
  const level = practice();
  const i = blockedArrows(level)[0];
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.tangle-lives')).toHaveText('♥♥♥');
  await tapHead(page, level, i);
  await expect(page.locator('.tangle-lives')).toHaveText('♥♥♡');
  await expect(page.locator(`.tangle-arrow[data-a="${i}"]`)).toHaveCount(1);
});

test('three bumps end the daily; Try again starts attempt 2 with full lives', async ({ page }) => {
  const level = await openDaily(page);
  const blocked = blockedArrows(level).slice(0, 3);
  expect(blocked).toHaveLength(3);
  const hearts = ['♥♥♡', '♥♡♡', '♡♡♡'];
  for (const [k, i] of blocked.entries()) {
    await tapHead(page, level, i);
    // Losing a life stuns the board; wait for the HUD and the cooldown so the next tap is not dropped.
    await expect(page.locator('.tangle-lives')).toHaveText(hearts[k]);
    await expect(page.locator('.tangle-board--stunned')).toHaveCount(0);
  }
  await expect(page.getByText('Out of lives')).toBeVisible();
  await expect(page.locator('.tangle-lives')).toHaveText('♡♡♡');

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.end-card')).toHaveCount(0);
  await expect(page.locator('.tangle-attempt')).toHaveText('Attempt 2');
  await expect(page.locator('.tangle-lives')).toHaveText('♥♥♥');
});

test('reload mid-daily restores progress', async ({ page }) => {
  const level = await openDaily(page);
  const [a, b] = analyze(level)!.order;
  await tapHead(page, level, a);
  await expect(page.locator(`.tangle-arrow[data-a="${a}"]`)).toHaveCount(0);
  await tapHead(page, level, b);
  await expect(page.locator(`.tangle-arrow[data-a="${b}"]`)).toHaveCount(0);
  const expected = String(level.arrows.length - 2);
  await expect(page.locator('.tangle-left')).toHaveText(expected);

  await page.reload();
  await expect(page.locator('svg.tangle-svg')).toBeVisible();
  await expect(page.locator(`.tangle-arrow[data-a="${a}"]`)).toHaveCount(0);
  await expect(page.locator(`.tangle-arrow[data-a="${b}"]`)).toHaveCount(0);
  await expect(page.locator('.tangle-left')).toHaveText(expected);
  await expect(page.locator('.tangle-arrow')).toHaveCount(level.arrows.length - 2);
});
