import { expect, test, type Page } from '@playwright/test';
import { generatePuzzle } from '../../src/games/queens/generate';

const SIZE = 7;
const PRACTICE_URL = '/queens.html#/practice?preset=small&seed=11';
const solution = () => generatePuzzle(SIZE, 11).solution;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow:flag:queens-howto-seen', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const cell = (page: Page, i: number) => page.locator(`.queens-cell[data-i="${i}"]`);

async function clickCell(page: Page, i: number) {
  const box = (await cell(page, i).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Two taps: empty -> mark -> queen. */
async function placeQueen(page: Page, i: number) {
  await clickCell(page, i);
  await expect(cell(page, i)).toHaveClass(/is-mark/);
  await clickCell(page, i);
  await expect(cell(page, i)).toHaveClass(/is-queen/);
}

test('solve a fixed practice board', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  await expect(page.locator('.queens-cell')).toHaveCount(SIZE * SIZE);
  for (const [r, c] of solution().entries()) await placeQueen(page, r * SIZE + c);
  await expect(page.getByText('Crowned ♛')).toBeVisible();
});

test('clashing queens turn red', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  await placeQueen(page, 0);
  await placeQueen(page, 1);
  await expect(cell(page, 0)).toHaveClass(/is-conflict/);
  await expect(cell(page, 1)).toHaveClass(/is-conflict/);
  // Cycle the second queen back to empty: queen -> empty.
  await clickCell(page, 1);
  await expect(cell(page, 1)).not.toHaveClass(/is-queen/);
  await expect(page.locator('.is-conflict')).toHaveCount(0);
});

test('drag marks a row and Undo removes it', async ({ page }) => {
  await page.goto(PRACTICE_URL);
  const centre = async (i: number) => {
    const b = (await cell(page, i).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const first = await centre(0);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let i = 1; i < SIZE; i++) {
    const p = await centre(i);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  await page.mouse.up();
  await expect(page.locator('.queens-cell.is-mark')).toHaveCount(SIZE);
  for (let i = 0; i < SIZE; i++) await expect(cell(page, i)).toHaveClass(/is-mark/);

  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('.queens-cell.is-mark')).toHaveCount(0);
});

test('reload mid-daily restores progress', async ({ page }) => {
  await page.goto('/queens.html#/');
  await expect(page.locator('.queens-cell').first()).toBeVisible();
  const n = (await page.locator('.queens-cell').count());
  const size = Math.round(Math.sqrt(n));
  await placeQueen(page, 0);
  await placeQueen(page, size + 2);
  await clickCell(page, 2 * size + 5);
  await expect(cell(page, 2 * size + 5)).toHaveClass(/is-mark/);
  const state = () => page.locator('.queens-cell').evaluateAll((els) => els.map((e) => e.className));
  const before = await state();

  await page.reload();
  await expect(page.locator('.queens-cell').first()).toBeVisible();
  expect(await state()).toEqual(before);
  await expect(cell(page, 0)).toHaveClass(/is-queen/);
  await expect(cell(page, size + 2)).toHaveClass(/is-queen/);
  await expect(cell(page, 2 * size + 5)).toHaveClass(/is-mark/);
});
