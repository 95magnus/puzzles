import { expect, test, type Page } from '@playwright/test';
import { DAILY_PRESET, PRESETS, generatePuzzle, sumsDailySeed } from '../../src/games/sums/generate';
import { lineCells } from '../../src/games/sums/solver';

const DATE = '2026-10-21';
const EASY = PRESETS.easy.size;
const PRACTICE_URL = '/sums.html#/practice?preset=easy&seed=11';
/** Longer than the 700 ms input pause after a mistake. */
const PAUSE_MS = 800;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow:flag:sums-howto-seen', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const cell = (page: Page, i: number) => page.locator(`button.sums-cell[data-cell="${i}"]`);
const target = (page: Page, line: number) => page.locator(`.sums-target[data-line="${line}"]`);

const practice = () => generatePuzzle(EASY, 11);
const indexes = (p: { solution: (0 | 1)[] }, kept: 0 | 1) =>
  p.solution.map((v, i) => (v === kept ? i : -1)).filter((i) => i >= 0);

async function openDaily(page: Page) {
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00Z`));
  await page.goto('/sums.html#/');
  await expect(page.locator('.sums-grid')).toBeVisible();
  const size = PRESETS[DAILY_PRESET].size;
  return generatePuzzle(size, sumsDailySeed(DATE));
}

test('solve a fixed practice board', async ({ page }) => {
  const p = practice();
  await page.goto(PRACTICE_URL);
  await expect(page.locator('button.sums-cell')).toHaveCount(EASY * EASY);
  for (const i of indexes(p, 0)) await cell(page, i).click();
  await expect(page.getByText('All lines add up')).toBeVisible();
  await expect(page.locator('.sums-lives')).toHaveText('♥♥♥');
});

test('a mistake costs a life and pauses input', async ({ page }) => {
  const p = practice();
  const kept = indexes(p, 1)[0];
  const other = indexes(p, 0)[0];
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.sums-lives')).toHaveText('♥♥♥');
  await cell(page, kept).click();
  await expect(page.locator('.sums-lives')).toHaveText('♥♥♡');
  await expect(cell(page, kept)).toHaveAttribute('data-state', 'locked');
  // Still inside the pause.
  await cell(page, other).click();
  await expect(cell(page, other)).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(PAUSE_MS);
  await cell(page, other).click();
  await expect(cell(page, other)).toHaveAttribute('data-state', 'struck');
});

test('three mistakes end the daily; Try again starts attempt 2', async ({ page }) => {
  const p = await openDaily(page);
  const kept = indexes(p, 1).slice(0, 3);
  expect(kept).toHaveLength(3);
  const hearts = ['♥♥♡', '♥♡♡', '♡♡♡'];
  for (const [k, i] of kept.entries()) {
    await cell(page, i).click();
    await expect(page.locator('.sums-lives')).toHaveText(hearts[k]);
    await page.waitForTimeout(PAUSE_MS);
  }
  await expect(page.getByText('Out of lives')).toBeVisible();

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.end-card')).toHaveCount(0);
  await expect(page.getByText('Attempt 2')).toBeVisible();
  await expect(page.locator('.sums-lives')).toHaveText('♥♥♥');
  const states = await page.locator('button.sums-cell').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.state));
  expect(states.every((s) => s === 'open')).toBe(true);
});

test('right-click marks a digit and a click leaves it marked', async ({ page }) => {
  const i = indexes(practice(), 0)[0];
  await page.goto(PRACTICE_URL);
  await cell(page, i).click({ button: 'right' });
  await expect(cell(page, i)).toHaveAttribute('data-state', 'marked');
  await cell(page, i).click();
  await expect(cell(page, i)).toHaveAttribute('data-state', 'marked');
  await expect(page.locator('.sums-lives')).toHaveText('♥♥♥');
});

const num = (page: Page, line: number) => target(page, line).locator('.sums-target__left');
const minus = (n: number) => (n < 0 ? `−${-n}` : String(n));

test('marking a solution digit lowers the row number by that digit', async ({ page }) => {
  const p = practice();
  await page.goto(PRACTICE_URL);
  const keep = lineCells(EASY)[0].filter((i) => p.solution[i] === 1);
  await expect(num(page, 0)).toHaveText(String(p.targets[0]));
  await cell(page, keep[0]).click({ button: 'right' });
  await expect(num(page, 0)).toHaveText(minus(p.targets[0] - p.digits[keep[0]]));
  await cell(page, keep[0]).click({ button: 'right' });
  await expect(num(page, 0)).toHaveText(String(p.targets[0]));
});

test('marking wrong digits until the number goes negative turns it red with a minus', async ({ page }) => {
  const p = practice();
  await page.goto(PRACTICE_URL);
  const row = lineCells(EASY)[0];
  let n = p.targets[0];
  for (const i of row) {
    if (n < 0) break;
    await cell(page, i).click({ button: 'right' });
    n -= p.digits[i];
  }
  expect(n).toBeLessThan(0);
  await expect(num(page, 0)).toHaveText(minus(n));
  await expect(target(page, 0)).toHaveClass(/is-over/);
});

test('zero is shown as 0 while a wrong digit is open, and striking never changes the number', async ({ page }) => {
  const p = practice();
  await page.goto(PRACTICE_URL);
  const row = lineCells(EASY)[0];
  const keep = row.filter((i) => p.solution[i] === 1);
  const wrong = row.filter((i) => p.solution[i] === 0);
  for (const i of keep) await cell(page, i).click({ button: 'right' });
  await expect(num(page, 0)).toHaveText('0');
  await expect(target(page, 0)).not.toHaveClass(/is-done/);
  await expect(target(page, 0)).not.toHaveClass(/is-over/);
  for (const i of wrong.slice(0, -1)) {
    await cell(page, i).click();
    await expect(num(page, 0)).toHaveText('0');
  }
  await cell(page, wrong[wrong.length - 1]).click();
  await expect(target(page, 0)).toHaveClass(/is-done/);
  await expect(num(page, 0)).toHaveText('✓');
});

test('striking every wrong digit in a row gives a check whatever the marks are', async ({ page }) => {
  const p = practice();
  await page.goto(PRACTICE_URL);
  const row = lineCells(EASY)[0];
  const keep = row.filter((i) => p.solution[i] === 1);
  const wrong = row.filter((i) => p.solution[i] === 0);
  await cell(page, keep[0]).click({ button: 'right' });
  const before = await num(page, 0).textContent();
  for (const i of wrong) {
    await cell(page, i).click();
  }
  await expect(target(page, 0)).toHaveClass(/is-done/);
  await expect(num(page, 0)).toHaveText('✓');
  expect(before).not.toBe('✓');
});

test('daily survives reload', async ({ page }) => {
  const p = await openDaily(page);
  const [struck, marked] = indexes(p, 0);
  const wrong = indexes(p, 1)[0];
  await cell(page, struck).click();
  await cell(page, marked).click({ button: 'right' });
  await cell(page, wrong).click();
  await expect(page.locator('.sums-lives')).toHaveText('♥♥♡');
  await expect(cell(page, struck)).toHaveAttribute('data-state', 'struck');
  await expect(cell(page, marked)).toHaveAttribute('data-state', 'marked');
  await expect(cell(page, wrong)).toHaveAttribute('data-state', 'locked');

  await page.reload();
  await expect(page.locator('.sums-grid')).toBeVisible();
  await expect(page.locator('.sums-lives')).toHaveText('♥♥♡');
  await expect(cell(page, struck)).toHaveAttribute('data-state', 'struck');
  await expect(cell(page, marked)).toHaveAttribute('data-state', 'marked');
  await expect(cell(page, wrong)).toHaveAttribute('data-state', 'locked');
});

test.describe('phone viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the Hard board fits without horizontal scroll and cells are not selectable', async ({ page }) => {
    await page.goto('/sums.html#/practice?preset=hard&seed=11');
    await expect(page.locator('button.sums-cell')).toHaveCount(81);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
    await expect(page.locator('.sums-cell').first()).toHaveCSS('user-select', 'none');
  });
});
