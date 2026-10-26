// Renders the PNG icons and the link-preview image in public/ from public/favicon.svg.
// Run after changing the favicon: `npm run icons`. The PNGs are committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const favicon = readFileSync(new URL('public/favicon.svg', root), 'utf8');
const font = readFileSync(new URL('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', root));
const svgUrl = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;

/**
 * Square app icons. iOS fills transparency with black, so its icon is opaque; maskable icons keep
 * the logo inside the 80% safe zone on a full-bleed background.
 */
const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, inset: 0, opaque: true },
  { file: 'icon-192.png', size: 192, inset: 0, opaque: false },
  { file: 'icon-512.png', size: 512, inset: 0, opaque: false },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.12, opaque: true },
];

const iconHtml = (size, inset, opaque) => `
<body style="margin:0;background:${opaque ? '#0e0c1a' : 'transparent'}">
  <img src="${svgUrl}" style="display:block;width:${size * (1 - 2 * inset)}px;margin:${size * inset}px">
</body>`;

const ogHtml = `
<style>
  @font-face { font-family: Inter; src: url(data:font/woff2;base64,${font.toString('base64')}); font-weight: 100 900; }
  body {
    margin: 0; width: 1200px; height: 630px; display: flex; align-items: center; gap: 64px; padding: 0 96px;
    box-sizing: border-box; font-family: Inter; color: #eef0f7; background: #0e0c1a;
    background-image:
      radial-gradient(90% 60% at 0% 0%, rgba(109, 93, 252, 0.45), transparent 60%),
      radial-gradient(80% 55% at 100% 100%, rgba(255, 106, 168, 0.3), transparent 60%);
  }
  h1 { margin: 0; font-size: 112px; font-weight: 800; letter-spacing: -0.03em; }
  p { margin: 12px 0 0; font-size: 36px; color: rgba(238, 240, 247, 0.65); line-height: 1.35; }
</style>
<body>
  <img src="${svgUrl}" width="260" height="260">
  <div>
    <h1>Puzzles</h1>
    <p>Seven new logic puzzles every day.<br>Flow · Mines · Tangle · Queens<br>Patches · Balanced · Bridges</p>
  </div>
</body>`;

async function render(page, html, width, height, file, omitBackground = false) {
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(new URL(`public/${file}`, root), await page.screenshot({ type: 'png', omitBackground }));
  console.log(`public/${file}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, inset, opaque } of ICONS) {
  await render(page, iconHtml(size, inset, opaque), size, size, file, !opaque);
}
await render(page, ogHtml, 1200, 630, 'og.png');
await browser.close();
