# Flow Daily Puzzle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static website with a daily 7×7 Flow puzzle (same for everyone, by UTC date) and an unlimited practice mode (5×5–9×9), mouse-first, in the "Dusk" visual style.

**Architecture:** Pure, DOM-free core modules (`rng`, `solver`, `generator`, `game`, `daily`, `storage`) under `src/core/`, unit-tested with Vitest. Puzzles are generated in a Web Worker from a seed (UTC date for daily, random for practice). The UI under `src/ui/` renders the board as SVG and wires pointer events into the `game` reducer-style functions.

**Tech Stack:** TypeScript 5, Vite 6, Vitest 3 (+ jsdom), Playwright, `@fontsource-variable/inter`. No UI framework.

**Spec:** `docs/superpowers/specs/2026-10-20-flow-daily-puzzle-design.md`

## Global Constraints

- No backend, no accounts, no network calls at runtime; `npm run build` emits a static `dist/` deployable to any static host (`base: './'`).
- "Today" = **UTC** date (`YYYY-MM-DD`). Daily number = days since `LAUNCH_DATE` + 1. `LAUNCH_DATE = '2026-10-20'`. Daily size = **7**.
- Practice sizes: **5, 6, 7, 8, 9**; default **7**.
- Determinism: same `(size, seed)` ⇒ identical `Puzzle` in every browser. Never use `Math.random` inside `generator`/`solver`.
- Uniqueness is defined over **non-self-touching** solutions (no path cell is orthogonally adjacent to a non-consecutive cell of the same path). The generator only emits non-self-touching paths; the game accepts **any** valid full solution as a win.
- Path palette (index = color id), exactly: `#ff5c7a #4cb0ff #34e3a0 #ffd447 #b48cff #ff9f45 #3fe0e6 #ff7ad9 #c9f05a`. Max 9 pairs.
- Background `#0e0c1a`; board fill `rgba(255,255,255,.06)`; grid lines `rgba(255,255,255,.08)`; text `#eef0f7`. Completed-pair cell tint 12%. Path glow: blur stdDeviation ≈ 3 at 56px cells (scale linearly), alpha 0.45.
- Font: Inter variable, self-hosted. Wordmark weight 800; UI 500–600; tabular numerals in HUD.
- Animations 150–250 ms ease-out; all disabled under `prefers-reduced-motion: reduce`.
- Every `localStorage` access goes through `src/core/storage.ts` and is wrapped in try/catch.
- Copy strings, exactly: hint `All connected — fill every cell!`; win title `Solved ✦`; countdown `Next daily in hh:mm:ss`; buttons `Undo`, `Reset`, `New puzzle`, `Play practice`, `Next puzzle`; tabs `Daily`, `Practice`.

## Review Focus

1. **Pointer leaves the board / window mid-drag, or the browser cancels the pointer** — the drag ends cleanly as if released; path stays as drawn; no "stuck" active drag. Test in Task 7.
2. **The UTC day rolls over while the page is open** — the solved card's countdown reaches 0 and the app loads the new daily instead of showing a negative timer. Test in Task 8.
3. **A saved daily from an older build no longer matches today's generated puzzle** (generator change between deploys) — saved paths are rejected and today starts fresh, never rendering illegal paths. Test in Task 4 (`restore`).
4. **Rapid "New puzzle" clicks / size switches** — a slow, stale worker response must never replace the newest requested puzzle. Test in Task 6.
5. **Ctrl+Z or Reset pressed while a drag is in progress** — ignored until the gesture ends; undo stack stays consistent. Test in Task 4.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, playwright.config.ts, index.html, .gitignore
src/
  main.ts                 entry: imports styles, mounts app
  core/
    types.ts              Cell, Pair, Puzzle
    rng.ts                seeded PRNG + seeding helpers
    solver.ts             countSolutions
    generator.ts          generate / generateWithSolution
    game.ts               GameState + pure actions
    daily.ts              UTC date, daily number, countdown
    storage.ts            daily save + flags (fail-safe)
  gen/
    generator.worker.ts   worker wrapper around generateWithSolution
    client.ts             requestPuzzle + latest-only guard + main-thread fallback
  ui/
    theme.css             tokens, base layout, components, motion
    palette.ts            colors + colorblind glyphs
    board.ts              SVG board renderer + pointer input
    hud.ts                stats/timer/controls bar
    winCard.ts            glass win card
    howto.ts              "?" modal + colorblind toggle
    app.ts                routing, screens, wiring, persistence
tests/
  core/*.test.ts, gen/*.test.ts, ui/*.test.ts
  e2e/flow.spec.ts
```

---

### Task 1: Project scaffold + seeded RNG

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.ts`, `src/core/types.ts`, `src/core/rng.ts`
- Test: `tests/core/rng.test.ts`

**Interfaces:**
- Produces (`types.ts`): `type Cell = { r: number; c: number }`, `type Pair = { color: number; a: Cell; b: Cell }`, `type Puzzle = { size: number; pairs: Pair[] }`
- Produces (`rng.ts`): `type Rng = () => number` (uniform in [0,1)); `mulberry32(seed: number): Rng`; `seedFromString(s: string): number` (32-bit FNV-1a); `seedFromDate(isoDate: string): number` = `seedFromString('flow-daily:' + isoDate)`; `randomSeed(): number` (uses `crypto.getRandomValues`); `randInt(rng: Rng, n: number): number` in `[0, n)`; `shuffle<T>(rng: Rng, arr: T[]): T[]` (in-place Fisher–Yates, returns arr).

- [ ] **Step 1: Init repo and tooling**

```bash
git init
npm init -y
npm i -D typescript vite vitest jsdom @playwright/test
npm i @fontsource-variable/inter
```
`package.json` scripts: `dev: vite`, `build: tsc --noEmit && vite build`, `test: vitest run`, `e2e: playwright test`. `"type": "module"`. `tsconfig`: `strict: true`, `target/lib: ES2022 + DOM + WebWorker`, `moduleResolution: bundler`, `noEmit`. `vite.config.ts`: `base: './'`, `worker: { format: 'es' }`, `test: { include: ['tests/**/*.test.ts'] }`. `.gitignore`: `node_modules`, `dist`, `.superpowers/`, `test-results`, `playwright-report`. `index.html`: `<div id="app"></div>` + `<script type="module" src="/src/main.ts">`, title `flow`. `main.ts` may be empty for now.

- [ ] **Step 2: Write failing tests** in `tests/core/rng.test.ts`

```ts
test('mulberry32 is deterministic', () => {
  const a = mulberry32(42), b = mulberry32(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
test('values are in [0,1)', () => {
  const r = mulberry32(1);
  for (let i = 0; i < 1000; i++) { const x = r(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
});
test('seedFromDate is stable and date-sensitive', () => {
  expect(seedFromDate('2026-10-20')).toBe(seedFromDate('2026-10-20'));
  expect(seedFromDate('2026-10-20')).not.toBe(seedFromDate('2026-10-21'));
  expect(Number.isInteger(seedFromDate('2026-10-20'))).toBe(true);
});
test('randInt range and shuffle permutation', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 200; i++) expect(randInt(r, 5)).toBeLessThan(5);
  expect(shuffle(mulberry32(3), [1,2,3,4,5]).sort()).toEqual([1,2,3,4,5]);
});
```

- [ ] **Step 3: Run `npx vitest run tests/core/rng.test.ts`** — Expected: FAIL (module not found).
- [ ] **Step 4: Implement `src/core/types.ts` and `src/core/rng.ts`** per Interfaces.
- [ ] **Step 5: Run `npx vitest run tests/core/rng.test.ts`** — Expected: 4 passed. Also `npm run build` succeeds.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: scaffold Vite+TS project; add seeded rng"`

---

### Task 2: Solver (`countSolutions`)

**Files:**
- Create: `src/core/solver.ts`
- Test: `tests/core/solver.test.ts`, `tests/fixtures.ts`

**Interfaces:**
- Consumes: `Puzzle`, `Cell` from `types.ts`
- Produces: `countSolutions(puzzle: Puzzle, limit = 2): number` — number of complete, non-self-touching solutions, capped at `limit`.

- [ ] **Step 1: Write failing tests** with hand-made fixtures (define them in the test file as `Puzzle` literals):

```ts
test('2x2 with one pair along each row has exactly one solution', () => {
  // A A / B B  — pairs: A (0,0)-(0,1), B (1,0)-(1,1)
  expect(countSolutions(P2x2_rows)).toBe(1);
});
test('unsolvable: crossing pairs', () => {
  // 2x2 with A (0,0)-(1,1), B (0,1)-(1,0)
  expect(countSolutions(P2x2_cross)).toBe(0);
});
test('cannot fill every cell -> 0', () => {
  // 3x3, single pair (0,0)-(0,2): any path leaves cells empty or self-touches
  expect(countSolutions(P3x3_single_top)).toBe(0);
});
test('ambiguous puzzle returns limit', () => {
  // 4x4, A (0,0)-(1,2), B (0,3)-(1,1), C (2,1)-(2,2)
  expect(countSolutions(P4x4_ambiguous, 2)).toBe(2);
});
test('known unique 5x5 fixture', () => {
  expect(countSolutions(P5x5_unique)).toBe(1);
});
```
`P5x5_unique` (verified unique by brute force under the non-self-touching rule) — solution paths, pairs are each path's first/last cell, `a` = row-major-smaller endpoint:
- path 0: `(0,1),(0,0),(1,0),(2,0),(2,1),(3,1)`
- path 1: `(1,1),(1,2),(0,2),(0,3),(0,4),(1,4),(2,4),(3,4),(4,4)`
- path 2: `(1,3),(2,3),(3,3),(4,3)`
- path 3: `(2,2),(3,2),(4,2),(4,1),(4,0),(3,0)`

Export this from `tests/fixtures.ts` as both `P5x5_unique: Puzzle` and `P5x5_solution: Cell[][]` (later tasks reuse them).

- [ ] **Step 2: Run `npx vitest run tests/core/solver.test.ts`** — Expected: FAIL.

- [ ] **Step 3: Implement `countSolutions` in `src/core/solver.ts`**

Algorithm (backtracking DFS over a mutable `Int8Array` grid, `-1` = empty):
```
state: owner[cell], head[color] (current tip, grown from pair.a), done[color]
search():
  if all colors done: return (no empty cells) ? 1 : 0
  propagate forced moves (loop until fixpoint):
    - a head adjacent to its own target b  -> connect it (mark done)
    - a head with exactly 1 legal move     -> take it
    - a head with 0 legal moves            -> dead (return 0)
  prune (return 0 if any):
    - an empty cell with < 2 "open" neighbours (empty, or a head/target of an unfinished color),
      except it may have 1 if that neighbour is a head or target
    - BFS over empty cells: each unfinished color's head and target must touch the same empty component
      (or be adjacent to each other)
    - every empty component must be touched by both head and target of at least one unfinished color
  pick the unfinished color whose head has the fewest legal moves; for each move: apply, recurse, undo
  sum results, stop early when sum >= limit
legal move: orthogonal, in bounds, empty, and the new cell is not adjacent to any non-previous cell
            of the same color (non-self-touching), except the color's own target b
```
Undo by recording changes on a stack; no array copies per node.

- [ ] **Step 4: Run tests** — Expected: 5 passed.
- [ ] **Step 5: Commit** — `git add src/core/solver.ts tests && git commit -m "feat(core): add Flow solution counter with pruning"`

---

### Task 3: Generator

**Files:**
- Create: `src/core/generator.ts`
- Test: `tests/core/generator.test.ts`

**Interfaces:**
- Consumes: `Rng`, `mulberry32`, `shuffle`, `randInt` (Task 1); `countSolutions` (Task 2)
- Produces:
  - `targetPairs(size: number): number` = `Math.min(size + 1, 9)`
  - `generateWithSolution(size: number, rng: Rng): { puzzle: Puzzle; solution: Cell[][] }` — `solution[color]` runs from `pairs[color].a` to `.b`
  - `generate(size: number, rng: Rng): Puzzle` = `generateWithSolution(...).puzzle`

- [ ] **Step 1: Write failing tests**

```ts
const SIZES = [5, 6, 7, 8, 9];
test.each(SIZES)('size %i: deterministic for a fixed seed', (n) => {
  expect(generate(n, mulberry32(123))).toEqual(generate(n, mulberry32(123)));
});
test.each(SIZES)('size %i: solution covers grid, matches pairs, is unique', (n) => {
  for (let s = 0; s < 20; s++) {
    const { puzzle, solution } = generateWithSolution(n, mulberry32(s));
    expect(solution.flat()).toHaveLength(n * n);
    expect(new Set(solution.flat().map(c => c.r * n + c.c)).size).toBe(n * n);
    puzzle.pairs.forEach((p, i) => { expect(solution[i][0]).toEqual(p.a); expect(solution[i].at(-1)).toEqual(p.b); });
    expect(puzzle.pairs.length).toBeLessThanOrEqual(9);
    expect(countSolutions(puzzle)).toBe(1);
  }
});
test('daily snapshot stays stable', () => {
  expect(generate(7, mulberry32(seedFromDate('2026-10-20')))).toMatchSnapshot();
});
test.each(SIZES)('size %i: p95 generation time < 500ms, always terminates', (n) => {
  const times: number[] = [];
  for (let s = 0; s < 1000; s++) { const t = performance.now(); generate(n, mulberry32(s)); times.push(performance.now() - t); }
  times.sort((a, b) => a - b);
  expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(500);
}, 600_000);
```
Put the 1000-seed timing test behind `describe.skipIf(!process.env.SLOW)` and add script `test:slow: SLOW=1 vitest run tests/core/generator.test.ts` (use `cross-env` if needed on Windows).

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** in `src/core/generator.ts`

```
fillPaths(size, rng, target, minLen): Cell[][] | null
  paths = one single-cell path per cell
  while paths.length > target:
    candidates = paths of minimal length, shuffled
    for P in candidates: for each endpoint u of P, for each neighbour v (shuffled) that is an endpoint of Q != P:
      merged = orient(P, ends at u) ++ orient(Q, starts at v)
      if nonSelfTouching(merged): replace P,Q with merged; continue outer loop
    return null                       // stuck
  return all lengths >= minLen ? paths : null

generateWithSolution(size, rng):
  target = targetPairs(size); minLen = 3; fails = 0
  loop:
    paths = fillPaths(size, rng, target, minLen)
    if paths: order paths by first endpoint row-major (a = row-major-smaller endpoint);
              puzzle = pairs with color = index
              if countSolutions(puzzle, 2) === 1: return { puzzle, solution: paths }
    if ++fails >= 200: fails = 0; if target < 9 then target++ else minLen = 2
```
`nonSelfTouching(path)`: no two cells at index distance ≥ 2 are orthogonally adjacent.

- [ ] **Step 4: Run** — Expected: all non-slow tests pass; snapshot file written. Then `npm run test:slow` — Expected: pass (records p95).
- [ ] **Step 5: Commit** — `git add src/core/generator.ts tests/core && git commit -m "feat(core): add deterministic unique-solution Flow generator"`

---

### Task 4: Game state

**Files:**
- Create: `src/core/game.ts`
- Test: `tests/core/game.test.ts`

**Interfaces:**
- Consumes: `Puzzle`, `Cell`
- Produces (all pure; return a new state or the same object when nothing changed):
  ```ts
  type GameState = { puzzle: Puzzle; paths: Cell[][]; undo: Cell[][][]; active: number | null; moves: number };
  newGame(puzzle: Puzzle): GameState
  pointerDown(s: GameState, cell: Cell): GameState
  pointerMove(s: GameState, cell: Cell): GameState
  pointerUp(s: GameState): GameState
  clearPath(s: GameState, color: number): GameState
  undo(s: GameState): GameState
  reset(s: GameState): GameState
  isPairComplete(s: GameState, color: number): boolean
  stats(s: GameState): { flowsDone: number; flowsTotal: number; fillPct: number }   // fillPct integer 0–100
  isSolved(s: GameState): boolean
  needsFillHint(s: GameState): boolean   // all pairs complete but not all cells filled
  restore(puzzle: Puzzle, paths: Cell[][]): GameState | null
  ```
  `paths[color]` starts at whichever endpoint the player started from. `moves` counts gestures that changed state (used by Reset's confirm threshold of > 3).

- [ ] **Step 1: Write failing tests** (use `P5x5_unique` / `P5x5_solution` from `tests/fixtures.ts`, written in Task 2)

```ts
test('press dot starts path; drag extends orthogonally');
test('fast jump fills intermediate cells: down on dot (4,4), move to (1,4) gives 4 cells');
test('diagonal jump steps along larger-delta axis first, never diagonally');
test('drag back over own path backtracks');
test('drag into another color path cuts it at the crossing cell (prefix kept)');
test("drag into another color's dot is blocked; path unchanged");
test('reaching matching dot completes pair; further moves ignored');
test('press mid-path truncates to that cell and continues from it');
test('press dot of a color with an existing path clears and restarts it');
test('pressing an empty cell does nothing (active stays null)');
test('undo reverts one whole gesture; gesture with no change adds no undo entry');
test('clearPath removes a path and is undoable');
test('isSolved only when all pairs complete AND all cells filled');
test('needsFillHint true when all complete but cells empty');
test('stats reports flowsDone/flowsTotal and integer fillPct');
// Review Focus 5
test('undo and reset are ignored while active !== null', () => {
  let s = pointerDown(newGame(P), P.pairs[0].a);
  s = pointerMove(s, { r: 0, c: 1 });
  expect(undo(s)).toBe(s);
  expect(reset(s)).toBe(s);
});
// Review Focus 3
test('restore rejects paths that do not match the puzzle', () => {
  expect(restore(P, [[{ r: 4, c: 4 }, { r: 4, c: 3 }]])).toBeNull();          // not starting at an endpoint
  expect(restore(P, [[P.pairs[0].a, { r: 2, c: 2 }]])).toBeNull();          // non-adjacent step
  expect(restore(P, [[P.pairs[0].a], [P.pairs[0].a]])).toBeNull();          // overlapping cells
  expect(restore(P, 'garbage' as any)).toBeNull();
  expect(restore(P, validPartialPaths)?.paths).toEqual(validPartialPaths);
});
```
Fill each test body with concrete cells from the fixture.

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement `src/core/game.ts`** per Interfaces. Undo snapshot is pushed on `pointerDown` and dropped on `pointerUp` if `paths` is unchanged.
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(core): add pure Flow game state and actions"`

---

### Task 5: Daily calendar + storage

**Files:**
- Create: `src/core/daily.ts`, `src/core/storage.ts`
- Test: `tests/core/daily.test.ts`, `tests/core/storage.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Produces (`daily.ts`): `LAUNCH_DATE = '2026-10-20'`; `DAILY_SIZE = 7`; `utcDateString(now: Date): string`; `dailyNumber(isoDate: string): number`; `msUntilNextUtcMidnight(now: Date): number`; `formatDailyLabel(isoDate: string): string` → `'Tue Oct 20'` (UTC, `en-US`); `formatCountdown(ms: number): string` → `'hh:mm:ss'`, clamped at `'00:00:00'`.
- Produces (`storage.ts`):
  ```ts
  type DailySave = { v: 1; date: string; paths: Cell[][]; elapsedMs: number; solved: boolean };
  loadDaily(date: string): DailySave | null      // key 'flow:daily'; null on missing/mismatch/corrupt/throw
  saveDaily(save: Omit<DailySave, 'v'>): void    // never throws
  getFlag(name: 'howto-seen' | 'colorblind'): boolean   // key 'flow:flag:' + name
  setFlag(name: 'howto-seen' | 'colorblind', value: boolean): void
  ```

- [ ] **Step 1: Write failing tests**

```ts
test('utcDateString uses UTC', () => expect(utcDateString(new Date('2026-10-20T23:30:00-05:00'))).toBe('2026-10-21'));
test('dailyNumber', () => { expect(dailyNumber('2026-10-20')).toBe(1); expect(dailyNumber('2026-10-21')).toBe(2); });
test('msUntilNextUtcMidnight', () => expect(msUntilNextUtcMidnight(new Date('2026-10-20T23:59:59.000Z'))).toBe(1000));
test('formatDailyLabel', () => expect(formatDailyLabel('2026-10-20')).toBe('Tue Oct 20'));
test('formatCountdown', () => { expect(formatCountdown(3_723_000)).toBe('01:02:03'); expect(formatCountdown(-5)).toBe('00:00:00'); });

test('daily save round-trips');
test('loadDaily returns null for another date');
test('loadDaily returns null for corrupt JSON or wrong v');
test('storage that throws: load returns null, save/setFlag do not throw, getFlag false', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  // assertions as named
});
test('flags round-trip and default false');
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** both modules per Interfaces.
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(core): add UTC daily calendar and fail-safe storage"`

---

### Task 6: Worker + generation client

**Files:**
- Create: `src/gen/generator.worker.ts`, `src/gen/client.ts`
- Test: `tests/gen/client.test.ts`

**Interfaces:**
- Consumes: `generateWithSolution`, `mulberry32` (Tasks 1, 3)
- Worker message protocol: in `{ id: number; size: number; seed: number }`, out `{ id: number; puzzle: Puzzle }`.
- Produces (`client.ts`):
  - `requestPuzzle(size: number, seed: number): Promise<Puzzle>` — uses a lazily created module worker (`new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' })`); if `Worker` is undefined, construction throws, or the worker emits `error`, falls back to generating on the main thread (and stays on fallback for the session).
  - `latestOnly<A extends unknown[], R>(fn: (...a: A) => Promise<R>): (...a: A) => Promise<R | typeof STALE>` and exported `STALE` symbol — resolves to `STALE` if a newer call started before this one resolved.

- [ ] **Step 1: Write failing tests**

```ts
test('falls back to main thread when Worker is unavailable', async () => {
  vi.stubGlobal('Worker', undefined);
  const p = await requestPuzzle(5, 99);
  expect(p).toEqual(generate(5, mulberry32(99)));
});
// Review Focus 4
test('latestOnly marks earlier slow calls as STALE', async () => {
  const slowThenFast = latestOnly((ms: number, v: string) => new Promise<string>(r => setTimeout(() => r(v), ms)));
  const first = slowThenFast(50, 'old'), second = slowThenFast(1, 'new');
  expect(await second).toBe('new');
  expect(await first).toBe(STALE);
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** worker and client per Interfaces.
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(gen): run generator in a worker with fallback and stale-guard"`

---

### Task 7: Theme + palette + SVG board

**Files:**
- Create: `src/ui/theme.css`, `src/ui/palette.ts`, `src/ui/board.ts`; Modify: `src/main.ts` (import `@fontsource-variable/inter` and `theme.css`)
- Test: `tests/ui/palette.test.ts`, `tests/ui/board.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `GameState` and actions from `game.ts`
- Produces (`palette.ts`): `PALETTE: readonly string[]` (the 9 colors, in order); `GLYPHS: readonly string[]` (9 distinct single characters, e.g. `● ▲ ■ ◆ ★ ✚ ⬟ ⬢ ✖`); `BOARD_BG_EFFECTIVE = '#1d1b28'` (board fill composited over bg); `contrastRatio(hexA: string, hexB: string): number` (WCAG).
- Produces (`board.ts`):
  - `cellFromPoint(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, size: number): Cell | null`
  - `createBoard(el: HTMLElement, opts: { onChange: (s: GameState, kind: 'move' | 'gesture-end') => void }): BoardHandle`
  - `type BoardHandle = { setState(s: GameState): void; setColorblind(on: boolean): void; setInteractive(on: boolean): void; celebrate(): Promise<void>; destroy(): void }`
- CSS tokens on `:root`: `--bg --board --grid-line --text --text-2 --radius-board: 18px --space: 8px --dur: 200ms --ease: cubic-bezier(.2,.8,.2,1)`, plus `.btn`, `.btn--primary`, `.seg` (segmented control), `.glass` classes; body background = the two radial glows from the spec over `--bg`, `background-attachment: fixed`.

- [ ] **Step 1: Write failing tests**

```ts
test('every palette color has >= 3:1 contrast on the board', () =>
  PALETTE.forEach(c => expect(contrastRatio(c, BOARD_BG_EFFECTIVE)).toBeGreaterThanOrEqual(3)));
test('9 colors and 9 distinct glyphs', () => { expect(PALETTE).toHaveLength(9); expect(new Set(GLYPHS).size).toBe(9); });

test('cellFromPoint maps points, including scaled rects', () => {
  const rect = { left: 100, top: 50, width: 350, height: 350 };
  expect(cellFromPoint(101, 51, rect, 7)).toEqual({ r: 0, c: 0 });
  expect(cellFromPoint(449, 399, rect, 7)).toEqual({ r: 6, c: 6 });
  expect(cellFromPoint(99, 60, rect, 7)).toBeNull();
});
test('renders one circle per endpoint and one polyline per non-empty path');
test('colorblind mode renders glyph text on every dot');
// Review Focus 1
test('pointercancel and lostpointercapture end the gesture', () => {
  // dispatch pointerdown on a dot, pointermove, then pointercancel:
  // expect onChange last called with kind 'gesture-end' and state.active === null
});
test('contextmenu on a path cell clears that path and is prevented');
test('setInteractive(false) ignores pointer input');
```
(jsdom lacks `setPointerCapture` and `getBoundingClientRect` layout — stub them in the test.)

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `palette.ts`, `theme.css`, `board.ts`. Board SVG layers bottom→top: board rect, completed-pair cell tints (12%), grid lines, path polylines (`stroke-width` = 0.36 × cell, round caps/joins, glow filter), endpoint circles (r = 0.29 × cell, glow filter), glyph text (colorblind), hover/active-cell outline. Use `setPointerCapture` on `pointerdown`; compute cell from live `getBoundingClientRect()` on every move; coalesce renders with `requestAnimationFrame`. Cursor `pointer` over dots and path ends. Completion pulse: CSS class on the dot for 200 ms when `isPairComplete` flips to true. `celebrate()`: staggered opacity/scale ripple of path polylines ordered by distance from the last-moved cell, resolves after ≤ 600 ms (immediately under reduced motion).
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(ui): add Dusk theme, palette, and interactive SVG board"`

---

### Task 8: App shell — routing, HUD, win card, persistence

**Files:**
- Create: `src/ui/hud.ts`, `src/ui/winCard.ts`, `src/ui/app.ts`; Modify: `src/main.ts` (call `mountApp(document.getElementById('app')!)`)
- Test: `tests/ui/app.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces:
  - `parseRoute(hash: string): { mode: 'daily' } | { mode: 'practice'; size: number; seed?: number }` — `''`/`'#/'` → daily; `'#/practice'` → size 7; `'#/practice?size=5&seed=123'` → explicit (size clamped to 5–9; seed used for tests/e2e).
  - `mountApp(root: HTMLElement, deps?: { now?: () => Date }): void`
  - `createHud(el)`: `{ update(stats, elapsedMs, hint: boolean): void }`; `createWinCard(el)`: `{ show(opts: { timeMs: number; mode: 'daily' | 'practice'; countdownMs?: number; onPrimary: () => void }): void; hide(): void }`

Behaviour:
- Header: wordmark `flow`, `.seg` tabs `Daily` / `Practice` (links to `#/` and `#/practice`), `?` button (wired in Task 9).
- Daily: subtitle `#N · Tue Oct 20 · 7×7`; seed `seedFromDate(today)`; on load `restore(puzzle, loadDaily(today)?.paths)`; if `solved`, show solved state immediately. On every `gesture-end`, `saveDaily`. Timer starts on first move, ticks every second, stops on solve; daily elapsed persisted.
- Practice: `.seg` sizes 5×5…9×9; `New puzzle` (primary); seed from route or `randomSeed()`; all requests via `latestOnly(requestPuzzle)`, ignore `STALE`.
- While generating: board container shows shimmer class; board non-interactive.
- `Reset` asks `confirm()` only when `state.moves > 3`. `Ctrl/Cmd+Z` → `undo`.
- On solve: `board.celebrate()`, dim board, show win card (`Solved ✦`, `mm:ss`, daily: `Next daily in hh:mm:ss` + `Play practice`; practice: `Next puzzle`).
- Countdown updates every second; when `utcDateString(now())` differs from the loaded daily date, reload the daily.

- [ ] **Step 1: Write failing tests**

```ts
test('parseRoute', () => {
  expect(parseRoute('')).toEqual({ mode: 'daily' });
  expect(parseRoute('#/practice')).toEqual({ mode: 'practice', size: 7 });
  expect(parseRoute('#/practice?size=5&seed=123')).toEqual({ mode: 'practice', size: 5, seed: 123 });
  expect(parseRoute('#/practice?size=42')).toEqual({ mode: 'practice', size: 9 });
});
test('daily subtitle shows number, date, and size', async () => {
  // mountApp with now = 2026-10-21T10:00Z -> '#2 · Wed Oct 21 · 7×7'
});
test('restores saved daily progress for today and ignores yesterday');
// Review Focus 2
test('day rollover while solved loads the next daily', async () => {
  vi.useFakeTimers();
  // mount with a solved save for 2026-10-20, now = 23:59:58Z; advance now and timers by 3s
  // expect subtitle '#2 · Wed Oct 21 · 7×7' and win card hidden
});
```
Make `requestPuzzle` synchronous-in-tests by `vi.mock('../../src/gen/client', ...)` delegating to `generate`.

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `hud.ts`, `winCard.ts`, `app.ts` per Interfaces/Behaviour; layout per spec §6 (board width `min(90vw, 520px)`, single column, header one row ≥ 320 px).
- [ ] **Step 4: Run `npm test`** — Expected: all pass. Run `npm run dev`, open the URL, solve a practice 5×5 by hand; confirm dark Dusk look matches the approved mockup.
- [ ] **Step 5: Commit** — `git commit -m "feat(ui): add app shell with daily/practice modes, HUD, win card"`

---

### Task 9: How-to modal + colorblind mode

**Files:**
- Create: `src/ui/howto.ts`; Modify: `src/ui/app.ts` (wire `?` button, first-visit auto-open)
- Test: `tests/ui/howto.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `getFlag`/`setFlag` (Task 5), `BoardHandle.setColorblind` (Task 7)
- Produces: `openHowto(opts: { colorblind: boolean; onColorblindChange: (on: boolean) => void }): void` — glass modal, 3 steps: 1) "Drag from a dot to its match." 2) "Paths can't cross." 3) "Fill every cell to win." Each step with a tiny looping SVG demo (static under reduced motion). Contains a `Colorblind mode` toggle. Closes on ✕, Esc, or backdrop click; focus is trapped while open and returned to `?` on close.

- [ ] **Step 1: Write failing tests**

```ts
test('auto-opens on first visit and sets howto-seen', ...);
test('does not auto-open when howto-seen is set', ...);
test('Esc closes and focus returns to the ? button', ...);
test('colorblind toggle persists and calls onColorblindChange(true)', ...);
```
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `howto.ts` and wire into `app.ts`; apply `getFlag('colorblind')` to the board on mount.
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(ui): add how-to modal and colorblind mode"`

---

### Task 10: End-to-end tests + production build

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/flow.spec.ts`; Modify: `vite.config.ts` (exclude `tests/e2e` from Vitest), `package.json` (`e2e` script)
- Test: `tests/e2e/flow.spec.ts`

**Interfaces:**
- Consumes: `generateWithSolution`, `mulberry32`, `seedFromDate` (imported directly from `src/` in the spec), route `#/practice?size=5&seed=123` (Task 8).

`playwright.config.ts`: `webServer: { command: 'npm run build && npx vite preview --port 4173', port: 4173 }`, `use.baseURL: 'http://localhost:4173'`, Chromium only.

- [ ] **Step 1: Write e2e tests**

```ts
test('solve a fixed practice puzzle by mouse drag shows win card', async ({ page }) => {
  const { solution } = generateWithSolution(5, mulberry32(123));
  await page.goto('/#/practice?size=5&seed=123');
  // for each path: mouse.move to first cell center, mouse.down, move through each cell center (steps: 4), mouse.up
  await expect(page.getByText('Solved ✦')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next puzzle' })).toBeVisible();
});
test('daily progress survives reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  // draw part of the first daily path (solution from generateWithSolution(7, mulberry32(seedFromDate('2026-10-21'))))
  // reload; expect HUD 'Fill' > 0% and the same polyline present
});
test('right-click clears a path', ...);
```
- [ ] **Step 2: Run `npx playwright install chromium && npm run e2e`** — Expected: 3 passed.
- [ ] **Step 3: Run `npm run build`** — Expected: success; `dist/` contains `index.html`, hashed JS incl. a separate worker chunk, and Inter font files; open `dist/index.html` via `npx vite preview` and verify no console errors.
- [ ] **Step 4: Commit** — `git commit -m "test: add Playwright e2e for solving, persistence, and right-click"`
