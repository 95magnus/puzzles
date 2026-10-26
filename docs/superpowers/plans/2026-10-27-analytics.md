# Better Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `day`/`restored` to play events, `moves`/`undo`/`clear` counts to `puzzle_end`, and an `error` event on every page.

**Architecture:** All counting and error reporting lives in `src/core/analytics.ts`. The shared shell (`src/ui/puzzleApp.ts`) wires it for six games generically; Flow (`src/games/flow/app.ts`) wires it by hand. Each page's `main.ts` installs the error listeners.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom), Umami.

**Spec:** `docs/superpowers/specs/2026-10-27-analytics-design.md`

## Global Constraints

- Analytics never throws into a game; everything goes through `track`.
- No new dependencies; no change to save shapes or localStorage keys.
- `src/sw/` stays untouched and imports nothing from the rest of `src/`.
- Error `message` is trimmed and cut to 120 characters; at most 3 `error` sends per page load; each distinct message once.
- Counted actions are exactly `undo` and `clear`; Restart / New board are not counted.
- Conventional commits, scoped (`feat(analytics): ...`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit locally only; never push.

## Review Focus

- A restored daily that was already won or lost: must still send no `puzzle_start`/`puzzle_end` (pinned in Task 3).
- A confirm dialog that is cancelled: must not count `clear` (pinned in Task 3).
- Mines' first click replaces a paused board via `ctx.replace`: that board reports `restored: 0` even on the daily (pinned in Task 3).
- An error thrown inside `umami.track` while reporting an error: must not loop or throw (pinned in Task 2).
- Flow's mid-drag moves: one gesture is one move, and `puzzle_start` still fires once (pinned in Task 4).

---

### Task 1: Tracker counts

**Files:**
- Modify: `src/core/analytics.ts`
- Test: `tests/core/analytics.test.ts`

**Interfaces:**
- Produces:
  - `export const COUNTED_ACTIONS = ['undo', 'clear'] as const;`
  - `createPlayTracker(game: string, counted?: readonly string[]): PlayTracker`
  - `PlayTracker.action(name: string): void` (alongside the existing `begin`, `move`, `end`)

- [ ] **Step 1: Write the failing tests** in `tests/core/analytics.test.ts`. Update the existing `puzzle_end` expectation to include `moves: 2`, then add:

```ts
test('puzzle_end carries moves and zero-filled counted actions, reset per board', () => {
  const spy = vi.fn();
  w.umami = { track: spy };
  const play = createPlayTracker('queens', COUNTED_ACTIONS);
  play.action('undo'); // no board yet
  play.begin({ mode: 'daily', day: '2026-10-27', restored: 0 });
  play.move();
  play.move();
  play.action('undo');
  play.action('hint'); // not counted
  play.move();
  play.end('won', 10_000);
  expect(spy).toHaveBeenLastCalledWith('puzzle_end', {
    game: 'queens', mode: 'daily', day: '2026-10-27', restored: 0, result: 'won', seconds: 10, moves: 3, undo: 1, clear: 0,
  });
  play.action('clear'); // after end
  play.begin({ mode: 'daily', day: '2026-10-27', restored: 1 });
  play.move();
  play.end('lost', 0);
  expect(spy).toHaveBeenLastCalledWith('puzzle_end', expect.objectContaining({ restored: 1, moves: 1, undo: 0, clear: 0 }));
});

test('a tracker without counted actions reports only moves', () => {
  const spy = vi.fn();
  w.umami = { track: spy };
  const play = createPlayTracker('tangle');
  play.begin({ mode: 'practice', preset: 'small' });
  play.move();
  play.action('undo');
  play.end('won', 0);
  expect(spy).toHaveBeenLastCalledWith('puzzle_end', { game: 'tangle', mode: 'practice', preset: 'small', result: 'won', seconds: 0, moves: 1 });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/core/analytics.test.ts`
Expected: FAIL (`COUNTED_ACTIONS` not exported / `moves` missing).

- [ ] **Step 3: Implement** in `src/core/analytics.ts`: `begin` resets a move count and a `Record<string, number>` seeded with `0` for each `counted` name; `move` increments moves when a board is active (and still reports `puzzle_start` on the first call); `action` increments only names already in the record and only while a board is active; `end` spreads the counts after `result`/`seconds`/`moves`. Update the `PlayTracker` doc comments to match.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/core/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/analytics.ts tests/core/analytics.test.ts
git commit -m "feat(analytics): count moves, undos and clears per board"
```

### Task 2: Error event

**Files:**
- Modify: `src/core/analytics.ts`, `src/home/main.ts`, `src/games/{flow,mines,tangle,queens,patches,balanced,bridges}/main.ts`, `CLAUDE.md`
- Test: `tests/core/analytics.test.ts`

**Interfaces:**
- Produces: `export function trackErrors(page: string): void`

- [ ] **Step 1: Write the failing tests.** `trackErrors` installs once per module, so these tests call it once in a `beforeAll` (`trackErrors('home')`) and reset its sent-state between tests through a test-only export `export function resetErrorsForTest(): void` (clears the dedupe set and the counter). Dispatch with `window.dispatchEvent(new ErrorEvent('error', { message, filename, lineno }))` and, for rejections, a plain `Event('unhandledrejection')` with `reason` defined on it via `Object.defineProperty` (jsdom has no `PromiseRejectionEvent`).

```ts
test('an uncaught error sends page, message and file:line', () => {
  window.dispatchEvent(new ErrorEvent('error', { message: 'Boom', filename: 'https://puzzles.solhaug.dev/assets/app-3fa1.js', lineno: 42 }));
  expect(spy).toHaveBeenCalledWith('error', { page: 'home', message: 'Boom', where: 'app-3fa1.js:42' });
});
test('cuts the message to 120 characters', /* message 'x'.repeat(200) → 'x'.repeat(120) */);
test('skips "Script error." and empty messages', /* no call */);
test('sends each distinct message once and at most 3 per page', /* 'a','a','b','c','d' → 3 calls: a, b, c */);
test('an unhandled rejection sends its reason', /* reason new Error('nope') → message 'nope', where ''; reason 'str' → message 'str' */);
test('calling trackErrors again adds no second listener', /* trackErrors('home') again, one error → exactly one call */);
test('a throwing tracker does not throw out of the listener', /* umami.track throws; dispatch does not throw */);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/core/analytics.test.ts`
Expected: FAIL (`trackErrors` not exported).

- [ ] **Step 3: Implement `trackErrors(page)` and `resetErrorsForTest()`** in `src/core/analytics.ts` per spec §3: a module-level `installed` flag, a `Set` of sent messages and a cap of 3. `where` is `filename.split('/').pop()` + `:` + `lineno` when `filename` is non-empty, else `''`. Mark `resetErrorsForTest` with a `/** Tests only. */` comment.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/core/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the pages.** In each of the 8 `main.ts` files, import `trackErrors` and call it with the page id from `src/pages.ts` (`'home'`, `'flow'`, `'mines'`, ...) before the `mount*` call. In `CLAUDE.md` "Adding a puzzle", add a step: "Call `trackErrors('<game>')` in `src/games/<game>/main.ts` before mounting."

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/analytics.ts tests/core/analytics.test.ts src/home/main.ts src/games/*/main.ts CLAUDE.md
git commit -m "feat(analytics): report uncaught errors on every page"
```

### Task 3: Shell wiring

**Files:**
- Modify: `src/ui/puzzleApp.ts` (`createPlayTracker` call near line 217, `setGame` ~322, `loadDaily` ~397, `renderControls` ~364)
- Test: `tests/ui/puzzleApp.test.ts`, `tests/games/balanced/app.test.ts`, `tests/games/bridges/app.test.ts`

**Interfaces:**
- Consumes: `COUNTED_ACTIONS`, `createPlayTracker(game, counted)`, `PlayTracker.action` (Task 1)

- [ ] **Step 1: Write the failing tests** in `tests/ui/puzzleApp.test.ts`. Add an `undo` control to the fake game's `controls` (`{ action: 'undo', label: 'Undo', run: act((g) => g.moves--) }`) and adjust any existing assertion that lists the control buttons. Stub `window.umami = { track }` in these tests and delete it in `afterEach`.

```ts
test('the daily reports its day and whether it was restored', /*
  mount('#/'); click('move') → puzzle_start { game:'queens', mode:'daily', day: DATE, restored: 0 };
  unmount; mount('#/') again; click('move') → puzzle_start with restored: 1 */);
test('puzzle_end counts moves, undos and confirmed clears', /*
  click move, move, undo, clear → confirm via modalButton('confirm'), win
  → puzzle_end matches { moves: 5, undo: 1, clear: 1 } */);
test('a cancelled clear is not counted', /* click move, clear → cancel, win → clear: 0 */);
test('a restored finished daily reports nothing', /* save a won daily, mount → no puzzle_start/puzzle_end */);
test('a board from ctx.replace reports restored: 0', /* restore a daily, run a control whose run calls ctx.replace(newGame), move → restored: 0 */);
test('practice reports restored: 0 and no day', /* '#/practice' → { mode:'practice', preset:'small', restored: 0 } */);
```

Check the cancel/confirm button `data-action` names in `src/ui/confirm.ts` before writing them.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/ui/puzzleApp.test.ts`
Expected: FAIL (no `day`/`restored`/counts).

- [ ] **Step 3: Implement** per spec §4:
  - Create the tracker after `mountBoard`: `createPlayTracker(id, COUNTED_ACTIONS.filter((a) => board.controls?.some((c) => c.action === a)))`.
  - `setGame(g: G, fromMs: number, restored = false)`; begin props are `{ mode: 'daily', day: dailyDate, restored: restored ? 1 : 0 }` or `{ mode: 'practice', preset: route.preset, restored: 0 }`.
  - `loadDaily` passes `restored !== null`; every other caller keeps the default.
  - `renderControls`: call `play.action(c.action)` immediately before both `c.run(g, ctx)` calls.

- [ ] **Step 4: Update the game tests.** In `tests/games/balanced/app.test.ts` and `tests/games/bridges/app.test.ts`, the expected `puzzle_start` props gain `restored: 0`.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/ui tests/games`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/puzzleApp.ts tests/ui/puzzleApp.test.ts tests/games/balanced/app.test.ts tests/games/bridges/app.test.ts
git commit -m "feat(ui): report daily date, restores and control counts from the puzzle shell"
```

### Task 4: Flow wiring

**Files:**
- Modify: `src/games/flow/app.ts` (`createPlayTracker` call, `load` ~236–256, `onChange` ~286, `doUndo`/`doClear` ~310–330)
- Test: `tests/games/flow/app.test.ts`

**Interfaces:**
- Consumes: `COUNTED_ACTIONS`, `createPlayTracker(game, counted)`, `PlayTracker.action` (Task 1)

- [ ] **Step 1: Write the failing tests** in `tests/games/flow/app.test.ts`, stubbing `window.umami = { track }` (deleted in `afterEach`) and using the existing `mount`, `settle`, `prepBoard`, `draw`, `fire` and `solutionFor` helpers:

```ts
test('a drag is one move and starts the play once', /*
  mount daily; settle; prepBoard(7); draw(sol[0]) (several cells); draw(sol[1])
  → exactly one puzzle_start { game:'flow', mode:'daily', day:'<date>', restored: 0 };
  solve the rest → puzzle_end has moves === number of draw() calls, undo: 0, clear: 0 */);
test('a restored daily reports restored: 1', /* saveFlowDaily with one path, mount, draw a path → restored: 1 */);
test('undo and confirmed clear are counted', /* draw, Ctrl+Z (or Undo button), draw, Clear → confirm, solve → undo: 1, clear: 1 */);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/games/flow/app.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** per spec §5:
  - `createPlayTracker('flow', COUNTED_ACTIONS)`.
  - In the load path, keep a `restored` boolean (true when `save && restored` loaded a state). Begin props: `{ mode: 'daily', day: session.date, restored: 1|0 }` or `{ mode: 'practice', size: session.size, restored: 0 }`.
  - `onChange`: keep `startClock()` on every non-loading change; call `play.move()` only when `kind === 'gesture-end'`.
  - `doUndo`: call `play.action('undo')` only when `undo(game)` returns a different state (apply already skips no-ops). `doClear`'s `onConfirm`: `play.action('clear')` before `apply(reset(g!))`, inside the existing guard.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/games/flow/app.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/flow/app.ts tests/games/flow/app.test.ts
git commit -m "feat(flow): report daily date, restores, gestures and control counts"
```

### Task 5: Full verification

- [ ] **Step 1:** `npm test` → all pass.
- [ ] **Step 2:** `npm run lint` → no warnings.
- [ ] **Step 3:** `npm run build` → succeeds (also checks `sw.js` has no imports).
- [ ] **Step 4:** `npm run e2e` → all pass.
