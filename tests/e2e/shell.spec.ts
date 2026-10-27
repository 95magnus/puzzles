import { expect, test, type Page } from '@playwright/test';

const GAMES = ['flow', 'mines', 'tangle', 'queens', 'patches', 'balanced', 'bridges', 'loop'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('flow:flag:howto-seen', '1');
    localStorage.setItem('flow:flag:mines-howto-seen', '1');
    localStorage.setItem('flow:flag:tangle-howto-seen', '1');
    localStorage.setItem('flow:flag:queens-howto-seen', '1');
    localStorage.setItem('flow:flag:patches-howto-seen', '1');
    localStorage.setItem('flow:flag:balanced-howto-seen', '1');
    localStorage.setItem('flow:flag:bridges-howto-seen', '1');
    localStorage.setItem('flow:flag:loop-howto-seen', '1');
  });
});

test.describe('mode tabs', () => {
  // Reduced motion drops the colour transition, so we read the settled colours.
  test.use({ reducedMotion: 'reduce' });

  test('active tab stays readable under the cursor', async ({ page }) => {
    await page.goto('/bridges.html#/');
    const practice = page.locator('.shell-tabs').getByRole('link', { name: 'Practice' });
    // The click leaves the cursor on the tab it just made active.
    await practice.click();
    await expect(practice).toHaveClass(/is-active/);
    await practice.hover();

    const { color, background } = await practice.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });
    expect(color).not.toBe(background);
  });
});

test.describe('best-on-a-computer note', () => {
  const note = (page: Page) => page.getByRole('note').filter({ hasText: 'best played on a computer' });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    for (const game of ['mines', 'tangle']) {
      test(`${game} shows it until dismissed`, async ({ page }) => {
        await page.goto(`/${game}.html#/`);
        await expect(note(page)).toBeVisible();
        await note(page).getByRole('button', { name: 'Dismiss' }).click();
        await expect(note(page)).toHaveCount(0);
        await page.reload();
        await expect(page.locator('.shell-game')).toBeVisible();
        await expect(note(page)).toHaveCount(0);
      });
    }

    for (const game of ['queens', 'patches', 'balanced', 'bridges', 'loop']) {
      test(`${game} fits, so it has none`, async ({ page }) => {
        await page.goto(`/${game}.html#/`);
        await expect(page.locator('.shell-game')).toBeVisible();
        await expect(note(page)).toHaveCount(0);
      });
    }
  });

  test('desktops never see it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/mines.html#/');
    await expect(page.locator('.shell-game')).toBeVisible();
    await expect(note(page)).toBeHidden();
  });
});

test.describe('on a 320px phone', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const game of GAMES) {
    test(`${game} shows its name beside the mode tabs`, async ({ page }) => {
      await page.goto(`/${game}.html#/`);
      await expect(page.locator('.shell-game')).toBeVisible();
      await expect(page.getByRole('link', { name: 'puzzles — all games' })).toBeVisible();

      const fit = await page.evaluate(() => {
        const name = document.querySelector('.shell-game')!;
        const tabs = document.querySelector('.shell-tabs')!;
        return {
          truncated: name.scrollWidth > name.clientWidth,
          gap: tabs.getBoundingClientRect().left - name.getBoundingClientRect().right,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(fit.truncated).toBe(false);
      expect(fit.gap).toBeGreaterThanOrEqual(0);
      expect(fit.pageOverflow).toBeLessThanOrEqual(0);
    });
  }
});
