# Offline Support: Design Spec

**Date:** 2026-10-26
**Status:** Draft for review

## 1. Purpose & scope

The site is installable (`public/manifest.webmanifest`, `display: standalone`) but has no service worker, so the installed app shows an error without a connection. Every puzzle is generated in the browser from the date and saves live in localStorage, so nothing stops it working offline except the files themselves. Add a **service worker that precaches the whole built site**, so after one online visit the dashboard and every puzzle (daily and practice) load and play with no connection.

**In scope**
- A hand-written service worker (`src/sw/`) and a small build-only Vite plugin (`build/offline.ts`) that gives it the build's file list and a version.
- Automatic registration on every page, with no per-page code.
- Updates that reach players on their next launch after a deploy.

**Out of scope**: an offline indicator, an "update available" banner, periodic `registration.update()` calls, runtime caching of anything outside the build (`og.png`, the Umami script), a service worker in `npm run dev`, `vite-plugin-pwa`/Workbox, changes to the manifest or to localStorage saves.

**Success criteria**
- After one online visit to any page, in airplane mode: the dashboard and all 7 puzzles load, and their daily and practice boards are playable.
- A new deploy reaches a returning player without them clearing anything: a refresh or relaunch shows the new version one load later; a hard refresh shows it immediately.
- No new runtime or dev dependencies.
- Existing unit and e2e tests pass unchanged apart from the Playwright config.

## 2. Pieces

| File | Role |
|---|---|
| `src/sw/sw.ts` | The service worker: `install`, `activate`, `fetch` handlers. |
| `src/sw/routes.ts` | Pure URL → cache-key mapping, unit-tested. |
| `build/offline.ts` | Vite plugin: emits `sw.js`, injects the precache list and version, adds the registration script to every page. |

`src/sw/` imports nothing outside itself, so `sw.js` builds as one self-contained classic script. The plugin fails the build if the `sw.js` chunk has any `import`s, which would mean it shares a chunk with the pages and can't run as a classic worker.

`vite.config.ts` adds `offline()` to `plugins`. `tsconfig.json` adds `build` to `include` (the `WebWorker` lib is already there).

## 3. Build: `build/offline.ts`

```ts
offline(): Plugin            // apply: 'build', enforce: 'post'
precacheManifest(files: { name: string; content: string | Uint8Array }[]): { paths: string[]; version: string }
```

1. **`buildStart`**: `this.emitFile({ type: 'chunk', id: 'src/sw/sw.ts', fileName: 'sw.js' })`. The name has no hash: the service worker's URL must stay the same across deploys.
2. **`generateBundle`** (after Vite has emitted the HTML pages): pass every bundle file (HTML, JS, CSS, the Flow `generate.worker` chunk, the Inter `.woff2` subsets) plus every file in `public/` to `precacheManifest`. It drops `sw.js` and `og.png`, sorts the rest by name and returns the paths (relative, e.g. `flow.html`, `assets/flow-BgdQv8NK.js`) and `version`, the first 12 hex chars of a SHA-256 over every name and content in order. Any change to any file therefore gives a new version. The plugin replaces the `__PRECACHE__` and `__VERSION__` placeholders in the `sw.js` code with the JSON-encoded values.
3. **`transformIndexHtml`**: inject into every page's `<head>`:
   ```html
   <script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});</script>
   ```
   Registration failures (private mode, blocked storage) are ignored, like analytics. New puzzles get this automatically, so the "Adding a puzzle" checklist doesn't change.

The plugin applies to builds only, so `npm run dev` and Vitest never see a service worker.

## 4. Runtime: `src/sw/sw.ts`

`sw.ts` declares `__PRECACHE__: string[]` and `__VERSION__: string`. The cache is named `puzzles-<version>`. Paths resolve against `self.registration.scope`.

**Install.** `fillCache` (`src/sw/install.ts`) fetches every precache path as `<path>?v=<version>` with `cache: 'reload'`, so neither the HTTP cache (GitHub Pages sends `max-age=600`) nor a CDN edge still serving the previous deploy can put an old `flow.html` next to new bundles, and stores each under its clean URL. A non-OK or redirected response (which can't answer a navigation) fails the install, and nothing is stored until every file has arrived. If any fetch fails, the install fails as a whole; the browser discards the new worker, keeps the old one and retries on the next navigation, so a cache is never half-updated. Then `self.skipWaiting()`.

**Activate.** Delete every cache whose name starts with `puzzles-` and isn't the current one. No `clients.claim()`: the precache already holds everything a first-visit page needs.

**Fetch.** Ignore anything that isn't a same-origin `GET` (Umami and other origins pass through untouched). Otherwise `cacheKey(url, scope)`:

```ts
cacheKey(url: URL, scope: URL, precache: readonly string[]): string | null
```

- Paths outside `scope` → `null`.
- The path relative to `scope`; empty or ending in `/` → append `index.html`.
- No file extension in the last segment (`/flow`, which GitHub Pages also serves) → append `.html`.
- Query and hash are ignored.
- The result if it is in `precache`, else `null`.

A key → `caches.match` in the current cache, falling back to `fetch(request)` on a miss. `null` → `fetch(request)`, i.e. normal network behaviour.

**Updates.** The browser checks `sw.js` on each navigation, bypassing the HTTP cache. After a deploy the first load is served by the old worker from its cache while the new worker installs in the background, skips waiting and activates; the next load gets the new version. A hard refresh bypasses the service worker and always loads from the network. Pages already open keep running the code they loaded. localStorage saves are never touched.

**Known edge case.** A page left open across a deploy that later requests a file it never loaded (e.g. an unused font subset) gets a cache miss, because the old cache is gone. Online, the network serves it; offline, that request fails. Accepted rather than keeping old caches.

## 5. Testing

**Unit (Vitest)**
- `tests/sw/routes.test.ts`: `cacheKey` for `/`, `/index.html`, `/flow`, `/flow.html`, `/flow.html?x=1#/practice`, a hashed asset, a path not in the precache, a path outside the scope, and a scope under a sub-path (`/puzzles/`).
- `tests/build/offline.test.ts`: `precacheManifest` sorts paths, keeps the version stable for the same input regardless of order, changes it when one file's content changes, and leaves out `sw.js` and `og.png`.

**E2E (Playwright)**
- `playwright.config.ts` sets `serviceWorkers: 'block'` in `use`, so the existing specs run exactly as today.
- New `tests/e2e/offline.spec.ts` with `test.use({ serviceWorkers: 'allow' })` and the same `*-howto-seen` flags as `home.spec.ts`:
  1. Visit `/`, wait for `navigator.serviceWorker.ready`.
  2. `context.setOffline(true)`.
  3. For every page in `PAGES`: `goto` it and assert its header and board render; for one puzzle, also open `#/practice` and assert a board renders.

## 6. Docs

- **README**: under the puzzles intro, one line that the site works offline after the first visit; add `src/sw/` and `build/offline.ts` to the project layout.
- **CLAUDE.md**, new "Offline" section: the service worker is cache-first, so `vite preview` on port 4173 shows the previous build on the first load after a rebuild (hard refresh, or DevTools → Application → "Update on reload"); `src/sw/` must not import from the rest of `src/`; e2e specs block service workers except `offline.spec.ts`.
