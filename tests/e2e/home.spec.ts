import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('flow:flag:howto-seen', '1');
    localStorage.setItem('flow:flag:mines-howto-seen', '1');
    localStorage.setItem('flow:flag:tangle-howto-seen', '1');
  });
});

test('lists puzzles and opens each daily', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Flow' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mines' })).toBeVisible();

  await page.locator('.puzzle-card[data-id="flow"]').getByRole('link', { name: 'Play daily' }).click();
  await expect(page).toHaveURL(/\/flow\.html#\/$/);
  await expect(page.getByRole('application', { name: 'Puzzle board' })).toBeVisible();

  await page.getByRole('link', { name: 'puzzles — all games' }).click();
  await page.locator('.puzzle-card[data-id="mines"]').getByRole('link', { name: 'Play daily' }).click();
  await expect(page).toHaveURL(/\/minesweeper\.html#\/$/);
  await expect(page.locator('.mines-cell').first()).toBeVisible();

  await page.getByRole('link', { name: 'puzzles — all games' }).click();
  await page.locator('.puzzle-card[data-id="tangle"]').getByRole('link', { name: 'Play daily' }).click();
  await expect(page).toHaveURL(/\/tangle\.html#\/$/);
  await expect(page.locator('svg.tangle-svg')).toBeVisible();
});

test('shows saved daily status', async ({ page }) => {
  await page.addInitScript(() => {
    const date = new Date().toISOString().slice(0, 10);
    localStorage.setItem('flow:daily', JSON.stringify({ v: 1, date, paths: [], elapsedMs: 83_000, solved: true }));
    localStorage.setItem(
      'mines:daily',
      JSON.stringify({ v: 1, date, cells: '', elapsedMs: 5_000, status: 'lost', attempt: 2 }),
    );
    localStorage.setItem(
      'tangle:daily',
      JSON.stringify({ v: 1, date, removed: '', lives: 0, elapsedMs: 5_000, status: 'lost', attempt: 2 }),
    );
  });
  await page.goto('/');
  await expect(page.locator('.puzzle-card[data-id="flow"] .status-pill')).toHaveText('Solved · 01:23');
  await expect(page.locator('.puzzle-card[data-id="mines"] .status-pill')).toHaveText('Boom · attempt 2');
  await expect(page.locator('.puzzle-card[data-id="tangle"] .status-pill')).toHaveText('Out of lives · attempt 2');
});

for (const path of ['/', '/flow.html', '/minesweeper.html', '/tangle.html']) {
  test(`no horizontal scroll at 320px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    await expect(page.locator('.shell-header')).toBeVisible();
    const { scrollW, clientW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(scrollW).toBeLessThanOrEqual(clientW);
    const box = (await page.locator('.shell-header').boundingBox())!;
    expect(box.height).toBeLessThan(72);
  });
}

for (const path of ['/flow.html', '/minesweeper.html', '/tangle.html']) {
  test(`home link stays a readable text link at 320px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    const home = page.getByRole('link', { name: 'puzzles — all games' });
    await expect(home).toBeVisible();
    const fontSize = await home.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    const box = (await home.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
  });
}

test('headers match across games', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const boxes = [];
  for (const path of ['/flow.html', '/minesweeper.html', '/tangle.html', '/']) {
    await page.goto(path);
    boxes.push((await page.locator('.shell-header').boundingBox())!);
  }
  const [flow, mines, tangle, home] = boxes;
  for (const other of [mines, tangle, home]) {
    expect(Math.abs(other.x - flow.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(other.width - flow.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(other.height - flow.height)).toBeLessThanOrEqual(1);
  }
});
