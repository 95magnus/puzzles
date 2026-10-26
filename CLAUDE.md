# CLAUDE.md

See [README.md](README.md) for what the project is, the scripts and the layout. This file is the non-obvious rest.

## Adding a puzzle

1. Add the page to `src/pages.ts`.
2. Add an entry to `PUZZLES` in `src/home/puzzles.ts`.
3. Create `<game>.html` at the project root. Copy the whole `<head>` from an existing page: description, Open Graph/Twitter tags, icons, manifest and the Umami script.
4. Add the game's `<game>-howto-seen` flag to the `beforeEach` in `tests/e2e/home.spec.ts`, or its how-to modal blocks the test.
5. Start with a design spec and plan in `docs/superpowers/specs/` and `docs/superpowers/plans/`, like the existing puzzles.

The page's `description`/`og:description` repeats the tagline from `puzzles.ts`. Change both together.

## Storage

- Every localStorage key starts with `flow:`, for every game (`flow:daily`, `flow:flag:<game>-howto-seen`, ...). It is a leftover from when the site was only Flow. Don't rename keys: players would lose their saves.
- Daily saves go through `dailyStore` in `src/core/storage.ts` and are stored as `{ v: 1, ... }`. Changing a save's shape means handling the old version.

## Code

- Reuse the shared helpers in `src/ui/` (`reducedMotion`, `modal`, `fit`, `grid`, `palette`, `puzzleApp`) instead of writing per-game copies.
- After changing `public/favicon.svg`, run `npm run icons` and commit the regenerated PNGs.
- Lint is Oxlint (`.oxlintrc.json`), not ESLint: typescript-eslint doesn't support TypeScript 7, and Oxlint's type-aware mode does. Handlers a board calls and doesn't await return `void`; start the async work with `void changed(...)`.

## Offline

- `src/sw/` must not import from the rest of `src/`: the build fails if `sw.js` shares a chunk with the pages.
- The service worker is cache-first, so `vite preview` on port 4173 shows the previous build on the first load after a rebuild. Hard refresh, or tick "Update on reload" in DevTools → Application.
- E2E specs block service workers, except `tests/e2e/offline.spec.ts`.

## Testing

- `npm run e2e` rebuilds into `dist/` and serves it on port 4173.
- The slow Flow generator timing tests only run with `SLOW=1` (`npm run test:slow`).
- Node 24, locally and in CI (`engines` in `package.json`).

## Git

- Conventional commits scoped by game or area: `feat(bridges): ...`, `fix(ui): ...`, `test(e2e): ...`, `docs: ...`.
- Never push or open pull requests. Commit locally only.
