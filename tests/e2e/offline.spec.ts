import { expect, test, type Locator, type Page } from '@playwright/test';
import { PAGES } from '../../src/pages';

test.use({ serviceWorkers: 'allow' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('flow:flag:howto-seen', '1');
    localStorage.setItem('flow:flag:mines-howto-seen', '1');
    localStorage.setItem('flow:flag:tangle-howto-seen', '1');
    localStorage.setItem('flow:flag:queens-howto-seen', '1');
    localStorage.setItem('flow:flag:patches-howto-seen', '1');
    localStorage.setItem('flow:flag:balanced-howto-seen', '1');
    localStorage.setItem('flow:flag:bridges-howto-seen', '1');
  });
});

/** What shows that each page rendered. A new page fails to compile until it has one. */
const rendered: Record<keyof typeof PAGES, (page: Page) => Locator> = {
  home: (page) => page.getByRole('heading', { name: 'Flow' }),
  flow: (page) => page.getByRole('application', { name: 'Puzzle board' }),
  mines: (page) => page.locator('.mines-cell').first(),
  tangle: (page) => page.locator('svg.tangle-svg'),
  queens: (page) => page.locator('.queens-cell').first(),
  patches: (page) => page.locator('.patches-cell').first(),
  balanced: (page) => page.locator('.balanced-cell').first(),
  bridges: (page) => page.locator('svg.bridges-svg'),
};

test('works offline after one visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = names.length === 1 ? await (await caches.open(names[0])).keys() : [];
    return { names, urls: requests.map((r) => r.url) };
  });
  expect(cached.names).toHaveLength(1);
  expect(cached.names[0]).toMatch(/^puzzles-/);
  expect(cached.urls.some((u) => u.includes('generate.worker'))).toBe(true);
  expect(cached.urls.some((u) => u.endsWith('.woff2'))).toBe(true);
  expect(cached.urls.filter((u) => u.endsWith('/og.png') || u.endsWith('/sw.js'))).toEqual([]);

  await context.setOffline(true);

  for (const [id, file] of Object.entries(PAGES) as [keyof typeof PAGES, string][]) {
    await page.goto('/' + file);
    await expect(rendered[id](page), file).toBeVisible();
  }

  await page.goto('/?source=pwa');
  await expect(rendered.home(page)).toBeVisible();
  await page.goto('/queens.html#/practice');
  await expect(page.locator('.queens-cell').first()).toBeVisible();
});
