import { expect, test, type Page } from '@playwright/test';
import { mulberry32 } from '../../src/core/rng';
import { chord, newGame, reveal, toggleFlag } from '../../src/games/mines/game';
import { PRESETS, generateBoard, minesDailySeed, neighbours } from '../../src/games/mines/generate';

async function center(page: Page, i: number) {
  const box = (await page.locator(`[data-i="${i}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function leftClick(page: Page, i: number) {
  const { x, y } = await center(page, i);
  await page.mouse.click(x, y);
}

async function rightClick(page: Page, i: number) {
  const { x, y } = await center(page, i);
  await page.mouse.click(x, y, { button: 'right' });
}

/** Hold left, add right, release right then left: the classic two-button chord. */
async function chordClick(page: Page, i: number) {
  const { x, y } = await center(page, i);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.down({ button: 'right' });
  await expect(page.locator('.is-pressed').first()).toBeVisible();
  await page.mouse.up({ button: 'right' });
  await page.mouse.up({ button: 'left' });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('flow:flag:mines-howto-seen', '1'));
});

test('win a fixed practice board with real clicks, flags and a chord', async ({ page }) => {
  await page.goto('/mines.html#/practice?preset=classic&seed=123');
  await expect(page.locator('.is-revealed')).toHaveCount(0);
  // The first click generates the board around itself.
  await leftClick(page, 240);
  const b = generateBoard(PRESETS.classic, mulberry32(123), 240);
  const g = newGame(b);
  await expect(page.locator('.is-revealed')).toHaveCount(g.revealed);
  const nb = (i: number) => neighbours(b.cols, b.rows, i);

  // Chord on a revealed number that still has hidden safe neighbours.
  const n = [...g.cells.keys()].find(
    (i) => g.cells[i] === 1 && b.adj[i] > 0 && nb(i).some((j) => g.cells[j] === 0 && !b.mines[j]),
  )!;
  for (const j of nb(n)) {
    if (b.mines[j]) {
      await rightClick(page, j);
      toggleFlag(g, j);
      await expect(page.locator(`[data-i="${j}"]`)).toHaveClass(/is-flagged/);
    }
  }
  chord(g, n);
  await chordClick(page, n);
  for (const j of nb(n)) {
    if (!b.mines[j]) await expect(page.locator(`[data-i="${j}"]`)).toHaveClass(/is-revealed/);
  }

  // Reveal everything else the mirror still shows hidden.
  for (let i = 0; i < g.cells.length; i++) {
    if (g.cells[i] === 0 && !b.mines[i]) {
      reveal(g, i);
      await leftClick(page, i);
    }
  }
  await expect(page.getByText('Cleared ✦')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New board' }).first()).toBeVisible();
});

test('hitting a mine shows Boom. centred over the board, with mines revealed', async ({ page }) => {
  await page.goto('/mines.html#/practice?preset=classic&seed=123');
  await leftClick(page, 240);
  const b = generateBoard(PRESETS.classic, mulberry32(123), 240);
  const mine = [...b.mines.keys()].find((i) => b.mines[i] === 1)!;
  await leftClick(page, mine);
  await expect(page.getByRole('heading', { name: 'Boom.' })).toBeVisible();
  await expect(page.locator(`[data-i="${mine}"]`)).toHaveClass(/is-exploded/);
  await expect(page.locator('.is-mine')).toHaveCount(99);
  // Measure after the slide-in animation settles.
  await page.getByRole('dialog').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const card = (await page.getByRole('dialog').boundingBox())!;
  const panel = (await page.locator('.mines-panel').boundingBox())!;
  expect(Math.abs(card.x + card.width / 2 - (panel.x + panel.width / 2))).toBeLessThan(2);
  expect(Math.abs(card.y + card.height / 2 - (panel.y + panel.height / 2))).toBeLessThan(2);
});

test('daily: reload mid-game restores progress; reload after loss reopens the card', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  await page.goto('/mines.html#/');
  await expect(page.locator('.mines-sub')).toHaveText('#2 · Wed Oct 21 · 30×20 · 130 mines');
  const b = generateBoard(PRESETS.expert, mulberry32(minesDailySeed('2026-10-21')));
  const g = newGame(b);
  const safe = [...g.cells.keys()].find((i) => g.cells[i] === 0 && !b.mines[i])!;
  const mine = [...b.mines.keys()].find((i) => b.mines[i] === 1)!;

  await leftClick(page, safe);
  await expect(page.locator(`[data-i="${safe}"]`)).toHaveClass(/is-revealed/);
  await page.reload();
  await expect(page.locator(`[data-i="${safe}"]`)).toHaveClass(/is-revealed/);

  await leftClick(page, mine);
  await expect(page.getByRole('heading', { name: 'Boom.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Boom.' })).toBeVisible();
  await expect(page.locator('.mines-board--locked')).toHaveCount(1);

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.mines-attempt')).toHaveText('Attempt 2');
  await expect(page.locator(`[data-i="${safe}"]`)).toHaveClass(/is-hidden/);
  await page.reload();
  await expect(page.locator('.mines-attempt')).toHaveText('Attempt 2');
});
