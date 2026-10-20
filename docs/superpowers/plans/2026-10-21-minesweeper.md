# Mines (Minesweeper) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second puzzle page, `minesweeper.html`, with a daily one-shot 30×20/130 board (same for everyone by UTC date) and practice presets, classic mouse controls (left reveal, right flag, left+right chord), in the "Dusk" style.

**Architecture:** DOM-free modules under `src/minesweeper/` (`generate`, `game`, `input`) unit-tested with Vitest; a DOM grid renderer (`board`) feeds pointer events through the pure `input` state machine into `game`; `app` owns routing, HUD, end cards, how-to and persistence. Shared core (`rng`, `daily`, `storage`) is reused from Flow. Vite builds two pages.

**Tech Stack:** TypeScript, Vite 8 (multi-page via `build.rolldownOptions.input`), Vitest (+ jsdom), Playwright, `@fontsource-variable/inter`. No UI framework.

**Spec:** `docs/superpowers/specs/2026-10-21-minesweeper-design.md`

**Prerequisite:** branch `feat/mines-v1` is cut from `feat/flow-v1` after Flow's core (`rng`, `daily`, `storage`, Flow plan Tasks 1–5) is committed. Tasks 1–8 need nothing else from Flow. Task 9 runs only once Flow plan Tasks 7–8 (`src/ui/theme.css`, `src/ui/app.ts`) exist on the branch.

## Global Constraints

- No backend, no runtime network calls; `npm run build` emits static `dist/` containing both `index.html` and `minesweeper.html` (`base: './'`).
- "Today" = **UTC** date; daily number from `dailyNumber` in `src/core/daily.ts` (shared `LAUNCH_DATE`).
- Daily board: **30×20, 130 mines**. Daily seed: `seedFromString('mines-daily:' + isoDate)`. **One shot**: a lost or won daily reopens in its end state.
- Practice presets, exactly: `classic` 30×16/99 (label `Classic`), `expert` 30×20/130 (label `Expert+`, default), `huge` 50×30/320 (label `Huge`).
- Determinism: same `(spec, seed)` ⇒ identical `Board` in every browser. Never use `Math.random` in `generate`.
- Start cell + its in-bounds neighbours are mine-free; start is pre-revealed. Cell index = `r * cols + c`.
- No "?" marks. Right button cycles hidden ↔ flagged only.
- Number colours, index 1–8: `#4cb0ff #34e3a0 #ff5c7a #b48cff #ff9f45 #3fe0e6 #ff7ad9 #c9f05a`. Flag `#ffd447`. Exploded cell `#ff5c7a`.
- Cells: 2px gap, 4px radius, size `clamp(20px, fit-to-width, 32px)`. Hidden `rgba(255,255,255,.10)` + 1px top inset highlight; revealed `rgba(0,0,0,.25)`. Page never scrolls horizontally; the board panel scrolls if needed.
- Animations 150–250 ms ease-out (flood ripple total ≤ 300 ms); all disabled under `prefers-reduced-motion: reduce`.
- Every `localStorage` access goes through `src/core/storage.ts`, wrapped in try/catch.
- Copy strings, exactly: won title `Cleared ✦`; lost title `Boom.`; countdown `Next daily in hh:mm:ss`; buttons `Play practice`, `New board`, `Restart`; tabs `Daily`, `Practice`; game links `Flow`, `Mines`; subtitle format `#N · Wed Oct 21 · 30×20 · 130 mines`.

## Review Focus

1. **Mouse button released outside the browser window mid-press or mid-chord** (no `pointerup` arrives) — the next event with a different `buttons` set (or `pointercancel` / window `blur`) resets cleanly; no stuck preview, no phantom reveal. Test in Task 3 and Task 5.
2. **The UTC day rolls over while the page is open** (playing or finished) — the app loads the new daily rather than continuing yesterday's or showing a negative countdown. Test in Task 6.
3. **A saved daily that contradicts today's board** (generator change between deploys, hand-edited storage: `r` on a mine while `playing`, start cell hidden, wrong length) — the save is rejected and today starts fresh. Test in Task 2 (`restoreGame`).
4. **Chord released with the pointer off the board, or over a hidden cell** — nothing happens and input returns to idle after all buttons are up. Test in Task 3.
5. **Reload mid-daily after a long time away** — the timer resumes from saved `elapsedMs`, not from wall-clock time since the first visit. Test in Task 6.

---

## File Structure

```
minesweeper.html                 second page entry
vite.config.ts                   + multi-page input
src/
  styles/tokens.css              Dusk tokens + shared .btn/.seg/.glass/body background
  core/storage.ts                + mines daily save, preset, flag name
  minesweeper/
    main.ts                      entry: imports font + css, mountMines()
    mines.css                    page layout, cells, cards, motion
    types.ts                     BoardSpec, Board, CellState, GameState, PresetId
    generate.ts                  PRESETS, DAILY_PRESET, minesDailySeed, generateBoard, neighbours
    game.ts                      newGame, reveal, toggleFlag, chord, encodeCells, restoreGame
    input.ts                     pure mouse/touch state machine
    board.ts                     DOM grid renderer + event wiring
    app.ts                       routing, HUD, timer, end cards, persistence
    howto.ts                     "?" modal
tests/
  minesweeper/*.test.ts
  e2e/mines.spec.ts
```

---

### Task 1: Types + board generation

**Files:**
- Create: `src/minesweeper/types.ts`, `src/minesweeper/generate.ts`
- Test: `tests/minesweeper/generate.test.ts`

**Interfaces:**
- Consumes: `Rng`, `mulberry32`, `seedFromString`, `randInt`, `shuffle` from `src/core/rng.ts`
- Produces (`types.ts`):
  ```ts
  type BoardSpec = { cols: number; rows: number; mines: number };
  type Board = { cols: number; rows: number; mines: Uint8Array; adj: Uint8Array; start: number };
  type CellState = 0 | 1 | 2;            // hidden | revealed | flagged
  type Status = 'playing' | 'won' | 'lost';
  type GameState = { board: Board; cells: Uint8Array; status: Status; revealed: number; flags: number; explodedAt: number /* -1 = none */ };
  type PresetId = 'classic' | 'expert' | 'huge';
  ```
- Produces (`generate.ts`): `PRESETS: Record<PresetId, BoardSpec & { label: string }>`; `DAILY_PRESET: PresetId = 'expert'`; `minesDailySeed(isoDate: string): number`; `neighbours(cols: number, rows: number, i: number): number[]` (in-bounds 8-neighbourhood, ascending order); `generateBoard(spec: BoardSpec, rng: Rng): Board`.

- [ ] **Step 1: Write failing tests**

```ts
const spec = PRESETS.expert;
test('presets match spec', () => {
  expect(PRESETS).toEqual({
    classic: { cols: 30, rows: 16, mines: 99, label: 'Classic' },
    expert: { cols: 30, rows: 20, mines: 130, label: 'Expert+' },
    huge: { cols: 50, rows: 30, mines: 320, label: 'Huge' },
  });
});
test('minesDailySeed differs from Flow seed', () =>
  expect(minesDailySeed('2026-10-21')).toBe(seedFromString('mines-daily:2026-10-21')));
test('neighbours handles corners and edges', () => {
  expect(neighbours(30, 20, 0)).toEqual([1, 30, 31]);
  expect(neighbours(30, 20, 31)).toHaveLength(8);
});
test('same seed gives identical board (snapshot per preset)', () => {
  for (const id of ['classic', 'expert', 'huge'] as const) {
    const a = generateBoard(PRESETS[id], mulberry32(42)), b = generateBoard(PRESETS[id], mulberry32(42));
    expect(a).toEqual(b);
    expect({ start: a.start, mines: Array.from(a.mines).join('') }).toMatchSnapshot();
  }
});
test('exact mine count, start neighbourhood mine-free, adj correct', () => {
  for (let seed = 0; seed < 200; seed++) {
    const b = generateBoard(spec, mulberry32(seed));
    expect(b.mines.reduce((s, m) => s + m, 0)).toBe(130);
    for (const j of [b.start, ...neighbours(30, 20, b.start)]) expect(b.mines[j]).toBe(0);
    expect(b.adj[b.start]).toBe(0);
    b.adj.forEach((n, i) => expect(n).toBe(neighbours(30, 20, i).filter(j => b.mines[j]).length));
  }
});
test('tight board: any start position keeps its neighbourhood clear', () => {
  for (let seed = 0; seed < 100; seed++) {   // 4×4/7: a centre start leaves exactly 7 candidates
    const b = generateBoard({ cols: 4, rows: 4, mines: 7 }, mulberry32(seed));
    expect(b.mines.reduce((s, m) => s + m, 0)).toBe(7);
    for (const j of [b.start, ...neighbours(4, 4, b.start)]) expect(b.mines[j]).toBe(0);
  }
});
test('throws when mines exceed placeable cells', () => {
  for (let seed = 0; seed < 20; seed++)      // 3×3 leaves at most 5 candidates for any start
    expect(() => generateBoard({ cols: 3, rows: 3, mines: 6 }, mulberry32(seed))).toThrow(RangeError);
});
```

- [ ] **Step 2: Run `npx vitest run tests/minesweeper/generate.test.ts`** — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** per Interfaces and spec §3: `start = randInt(rng, cols*rows)`; candidate list = all indices except start ∪ neighbours (ascending), `shuffle(rng, candidates)`, first `mines` become mines; throw `RangeError` if `mines > candidates.length`.
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(mines): add seeded board generation and presets"`

---

### Task 2: Game rules

**Files:**
- Create: `src/minesweeper/game.ts`
- Test: `tests/minesweeper/game.test.ts`

**Interfaces:**
- Consumes: types (Task 1), `neighbours` (Task 1)
- Produces — actions mutate `s` in place and return the indices whose `CellState` changed (empty array = no-op); all are no-ops when `s.status !== 'playing'`:
  ```ts
  newGame(board: Board): GameState                  // start revealed (with its flood)
  reveal(s: GameState, i: number): number[]
  toggleFlag(s: GameState, i: number): number[]
  chord(s: GameState, i: number): number[]
  encodeCells(s: GameState): string                 // one char per cell: 'h' | 'r' | 'f'
  restoreGame(board: Board, cells: string, status: Status): GameState | null
  ```
- Test helper (in the test file): `boardFrom(rows: string[], start: [r, c])` — builds a `Board` from ASCII (`*` = mine, `.` = safe), computing `adj`.

- [ ] **Step 1: Write failing tests**

```ts
test('newGame reveals the start flood');
test('flood reveal stops at numbers and skips flags');
test('flood on a near-empty Huge board does not overflow the stack', () => {
  // 50×30, 1 mine in a corner, start at the opposite corner: expect revealed === 1499 and status 'won'
});
test('toggleFlag cycles hidden <-> flagged, updates flags, ignores revealed cells');
test('reveal ignores revealed and flagged cells');
test('reveal on a mine loses, sets explodedAt, later actions are no-ops');
test('chord with matching flags reveals hidden unflagged neighbours');
test('chord is a no-op on mismatched flag count, hidden cells, and zeros');
test('chord with a wrong flag hits a mine and loses');
test('revealing the last safe cell wins and auto-flags remaining mines', () => {
  // expect status 'won', flags === mine count, every mine cell === 2
});
test('encodeCells/restoreGame round-trip for playing, won and lost games');
// Review Focus 3
test('restoreGame rejects inconsistent saves', () => {
  // null for: wrong length; char not in 'hrf'; start cell hidden; 'r' on a mine with status 'playing';
  // status 'lost' with zero or two revealed mines; status 'won' with a safe cell unrevealed;
  // status 'playing' with all safe cells revealed
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces and spec §4. Flood uses an explicit array stack. `restoreGame` recomputes `revealed`, `flags`, `explodedAt` from `cells`.
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(mines): add reveal/flag/chord rules, win/loss, save encoding"`

---

### Task 3: Input state machine

**Files:**
- Create: `src/minesweeper/input.ts`
- Test: `tests/minesweeper/input.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type InputEvent =
    | { type: 'down' | 'move' | 'up'; pointer: 'mouse' | 'touch'; buttons: number; cell: number /* -1 = off board */ }
    | { type: 'longpress' }      // board fires this 350 ms after a touch down if no up/move-to-other-cell happened
    | { type: 'cancel' };        // pointercancel, lostpointercapture, window blur
  type InputAction = { kind: 'reveal' | 'flag' | 'chord' | 'tap'; cell: number }; // 'tap' = touch tap; app resolves to chord on revealed cells, else reveal
  type Preview = { cell: number; chord: boolean } | null;
  type InputState = { mode: 'idle' | 'left' | 'right' | 'chord' | 'waitAllUp' | 'touch'; cell: number; buttons: number; longFired: boolean };
  const initialInput: InputState;
  step(s: InputState, e: InputEvent): { state: InputState; action?: InputAction; preview: Preview };
  ```
- Mouse rules (spec §5): transitions are derived from the change in `buttons` (bit 1 = left, bit 2 = right) on **every** down/move/up, because a second button arrives as `move`. Right press from idle → `flag` immediately, mode `right`. Left release in mode `left` over a cell → `reveal`. Both bits set (any order, from `left` or `right`) → mode `chord`, preview chord. Any bit cleared in `chord` → `chord` action on current cell if `cell >= 0`, then `waitAllUp` (no actions, no preview) until `buttons === 0`. In `left`, the preview follows `cell`; `-1` → preview `null`, and release there → no action.
- Touch rules: `down` → mode `touch`; `longpress` → `flag`, `longFired = true`; `up` without `longFired` on the same cell → `tap`; move to another cell cancels.

- [ ] **Step 1: Write failing tests** (helper `run(events): { actions, lastPreview, state }` folds `step`)

```ts
test('left press previews, release reveals');
test('left drag moves the preview; release off board does nothing');
test('right press flags immediately; release does nothing');
test('left then right (right arrives as move) => chord preview, release either => one chord', () => {
  const r = run([down(1, 5), move(3, 5), up(2, 5), up(0, 5)]);
  expect(r.actions).toEqual([{ kind: 'chord', cell: 5 }]);
});
test('right then left => one flag (from the first right press) then chord, no reveal');
test('after a chord, re-pressing a button before all are up does nothing');
// Review Focus 4
test('chord released off board => no action, idle after all up');
// Review Focus 1
test('lost mouseup: next event with buttons 0 returns to idle without acting; cancel resets from any mode');
test('touch tap => tap; long press => flag and no tap on release; move to another cell cancels');
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `step` per rules above.
- [ ] **Step 4: Run** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(mines): add classic mouse/touch input state machine"`

---

### Task 4: Storage

**Files:**
- Modify: `src/core/storage.ts`
- Test: `tests/core/storage.test.ts` (extend)

**Interfaces:**
- Produces:
  ```ts
  type MinesDailySave = { v: 1; date: string; cells: string; elapsedMs: number; status: 'playing' | 'won' | 'lost' };
  loadMinesDaily(date: string): MinesDailySave | null   // key 'mines:daily'; null on missing/mismatch/corrupt/throw
  saveMinesDaily(save: Omit<MinesDailySave, 'v'>): void // never throws
  getMinesPreset(): 'classic' | 'expert' | 'huge' | null // key 'mines:preset'; null on unknown value/throw
  setMinesPreset(id: 'classic' | 'expert' | 'huge'): void
  ```
  `FlagName` gains `'mines-howto-seen'`.
- Shape validation only (string `cells` matching `/^[hrf]*$/`, number `elapsedMs >= 0`, known `status`); board consistency is `restoreGame`'s job.

- [ ] **Step 1: Write failing tests** mirroring the existing Flow ones: round-trip; other date → null; corrupt JSON, wrong `v`, bad `cells` chars, negative `elapsedMs`, unknown `status` → null; throwing storage → load null, save/setMinesPreset don't throw; preset round-trip and unknown value → null; `mines-howto-seen` flag round-trip.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** following the existing `loadDaily`/`saveDaily` pattern.
- [ ] **Step 4: Run `npm test`** — Expected: all pass (existing Flow storage tests unchanged).
- [ ] **Step 5: Commit** — `git commit -m "feat(core): add Mines daily save and preset storage"`

---

### Task 5: Page scaffold, tokens and board renderer

**Files:**
- Create: `minesweeper.html`, `src/styles/tokens.css`, `src/minesweeper/main.ts`, `src/minesweeper/mines.css`, `src/minesweeper/board.ts`
- Modify: `vite.config.ts`
- Test: `tests/minesweeper/board.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `GameState`, game actions (Task 2), `step`/`initialInput`/`InputAction` (Task 3), `neighbours` (Task 1)
- Produces (`board.ts`):
  ```ts
  createBoard(el: HTMLElement, opts: { onAction: (a: InputAction) => void }): BoardHandle
  type BoardHandle = {
    setGame(s: GameState): void;              // full render (new board / restore)
    update(changed: number[], origin?: number): void; // diff-update; ripple from origin if given
    setInteractive(on: boolean): void;
    destroy(): void;
  }
  ```
- `tokens.css`: CSS custom properties from the Flow spec §5 (`--bg --board --grid-line --text --text-2 --radius-board: 18px --space: 8px --dur: 200ms --ease: cubic-bezier(.2,.8,.2,1)`), body background (two radial glows over `--bg`, `background-attachment: fixed`), `.btn`, `.btn--primary`, `.seg`, `.glass`. Task 9 makes Flow import it.
- `vite.config.ts`: `build.rolldownOptions.input = { main: 'index.html', mines: 'minesweeper.html' }` (resolve with `fileURLToPath(new URL(..., import.meta.url))`).
- Rendering: one `<div class="cell">` per index in a CSS grid (`grid-template-columns: repeat(cols, var(--cell))`); state via classes `is-hidden | is-revealed | is-flagged | is-pressed | is-exploded | is-wrong-flag | n1…n8`. After loss, mines render revealed and wrong flags get `is-wrong-flag`. `--cell` = `clamp(20px, (panel inner width − (cols−1)·2px) / cols, 32px)`, recomputed on `ResizeObserver`; panel `overflow-x: auto`.
- Events: `pointerdown/move/up/cancel` + `lostpointercapture` on the grid and `blur` on `window` → `InputEvent` (`cell` from `elementFromPoint` → `data-i`, `-1` off-grid; `buttons` from the event; `pointer` from `pointerType`). Touch: start a 350 ms timer on down, send `longpress` when it fires. `contextmenu` prevented on the panel. Preview applied as `is-pressed` classes (chord: cell + hidden, unflagged neighbours).
- Ripple: when `origin` is given, each changed cell gets `transition-delay` proportional to its distance from `origin`, capped at 300 ms total; none under reduced motion.
- Motion in `mines.css`: `is-exploded` plays one glow pulse (200 ms); `.end-card` slides up on show (250 ms). Both off under reduced motion.

- [ ] **Step 1: Write failing tests** (stub `elementFromPoint`, `setPointerCapture`, `ResizeObserver`)

```ts
test('renders cols*rows cells with number, flag and hidden classes');
test('update() touches only the changed cells'); // spy on classList of an unchanged cell
test('left press shows is-pressed; release calls onAction reveal');
test('both buttons show chord preview on cell + hidden unflagged neighbours only');
test('contextmenu is prevented on the board');
// Review Focus 1
test('window blur while pressed clears is-pressed and sends no action');
test('setInteractive(false) ignores input');
test('after loss: exploded cell, all mines shown, wrong flags marked');
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `board.ts`, `tokens.css`, `mines.css`; `minesweeper.html` (`<title>Mines</title>`, `<div id="app">`, module script `/src/minesweeper/main.ts`); `main.ts` imports `@fontsource-variable/inter`, `../styles/tokens.css`, `./mines.css` (mounting comes in Task 6 — for now render a practice `expert` board directly so the page is clickable).
- [ ] **Step 4: Run tests; then `npm run dev`, open `/minesweeper.html`** — Expected: tests pass; board renders; left/right/chord work by hand; Expert+ fits at 1280×720 without scrolling; Huge scrolls inside the panel only.
- [ ] **Step 5: Commit** — `git commit -m "feat(mines): add page entry, shared tokens, DOM board renderer"`

---

### Task 6: App — routing, HUD, end cards, persistence

**Files:**
- Create: `src/minesweeper/app.ts`; Modify: `src/minesweeper/main.ts` (call `mountMines(document.getElementById('app')!)`)
- Test: `tests/minesweeper/app.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: Tasks 1–5; `utcDateString`, `dailyNumber`, `formatDailyLabel`, `formatCountdown`, `msUntilNextUtcMidnight` from `src/core/daily.ts`
- Produces:
  ```ts
  parseMinesRoute(hash: string): { mode: 'daily' } | { mode: 'practice'; preset: PresetId; seed?: number }
  mountMines(root: HTMLElement, deps?: { now?: () => Date }): void
  ```
  `''`/`'#/'` → daily; `'#/practice'` → `getMinesPreset() ?? 'expert'`; `'#/practice?preset=huge&seed=123'` → explicit (unknown preset → `expert`; seed used by e2e).

Behaviour (spec §5, §7, §8):
- Header: wordmark, links `Flow` (`./index.html`) · `Mines` (current, highlighted); `.seg` `Daily` / `Practice`; `?` button (wired in Task 7).
- Daily: subtitle `#N · Wed Oct 21 · 30×20 · 130 mines`; board `generateBoard(PRESETS.expert, mulberry32(minesDailySeed(today)))`; restore via `restoreGame` from `loadMinesDaily(today)`, else `newGame`. Save `encodeCells` + `elapsedMs` + `status` after every action that changed cells and on `pagehide`.
- Practice: `.seg` of the three preset labels (`setMinesPreset` on change); buttons `New board` (primary, new random seed) and `Restart` (`newGame` on the same `Board`).
- `onAction` mapping: `tap` → `chord` if cell revealed else `reveal`; pass the action's cell as ripple `origin`.
- HUD: mines left (`mines − flags`, may be negative) and timer `mm:ss`. Timer runs from board shown (daily: from saved `elapsedMs`) until won/lost; ticks every second.
- Won: board dims; glass card `Cleared ✦`, time, daily → `Next daily in hh:mm:ss` + `Play practice`; practice → `New board`.
- Lost: board not dimmed; card below board: `Boom.`, `% cleared` (= revealed safe cells ÷ total safe, rounded), time, daily → countdown + `Play practice`; practice → `New board`. Board non-interactive.
- Every second, if `utcDateString(now())` differs from the loaded daily date and the route is daily, load the new daily.

- [ ] **Step 1: Write failing tests**

```ts
test('parseMinesRoute', () => {
  expect(parseMinesRoute('')).toEqual({ mode: 'daily' });
  expect(parseMinesRoute('#/practice?preset=huge&seed=123')).toEqual({ mode: 'practice', preset: 'huge', seed: 123 });
  expect(parseMinesRoute('#/practice?preset=nope')).toEqual({ mode: 'practice', preset: 'expert' });
});
test('daily subtitle', ...); // now = 2026-10-21T10:00Z → '#2 · Wed Oct 21 · 30×20 · 130 mines'
test('daily progress is saved after an action and restored on remount');
test('a lost daily reopens on the Boom. card, non-interactive');
test('tap on a revealed number chords, on a hidden cell reveals');
test('Restart replays the same board; New board changes it');
// Review Focus 5
test('timer resumes from saved elapsedMs, not wall-clock', () => {
  // save elapsedMs 65_000; mount with now 3 hours later; expect HUD '01:05'
});
// Review Focus 2
test('UTC rollover loads the next daily', () => {
  vi.useFakeTimers();
  // mount at 2026-10-21T23:59:58Z (lost save), advance clock 3 s → subtitle '#3 · Thu Oct 22 · …', card hidden
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `app.ts` per Interfaces/Behaviour.
- [ ] **Step 4: Run `npm test`; then `npm run dev`** — Expected: tests pass; daily and practice play by hand; reload mid-daily restores; losing shows the card and reload keeps it.
- [ ] **Step 5: Commit** — `git commit -m "feat(mines): add app with daily/practice, HUD, end cards, persistence"`

---

### Task 7: How-to modal

**Files:**
- Create: `src/minesweeper/howto.ts`; Modify: `src/minesweeper/app.ts`
- Test: `tests/minesweeper/howto.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `getFlag`/`setFlag('mines-howto-seen')` (Task 4)
- Produces: `openMinesHowto(returnFocusTo: HTMLElement): void` — glass modal listing: `Left click — reveal a tile`, `Right click — flag a tile`, `Left + right — reveal all unflagged tiles around a number whose flags match it`, and touch: `Tap — reveal · Long-press — flag · Tap a number — reveal around it`; plus a small static SVG chord diagram. Closes on ✕, Esc or backdrop; focus trapped, returned on close.

- [ ] **Step 1: Write failing tests**: auto-opens on first Mines visit and sets `mines-howto-seen`; not when set; Esc closes and returns focus to `?`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** and wire the `?` button and first-visit auto-open in `app.ts`.
- [ ] **Step 4: Run** — Expected: pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(mines): add how-to modal"`

---

### Task 8: End-to-end tests + production build

**Files:**
- Create: `tests/e2e/mines.spec.ts`; Create or modify: `playwright.config.ts` (same config as Flow plan Task 10: `npm run build && npx vite preview --port 4173`, Chromium)
- Test: `tests/e2e/mines.spec.ts`

**Interfaces:**
- Consumes: `generateBoard`, `PRESETS`, `minesDailySeed`, `newGame`, `reveal` (imported from `src/` in the spec), route `#/practice?preset=classic&seed=123` (Task 6). Cells are located by `[data-i="<index>"]`.

> Spec §10 names a dev-only `?seed=` hook; this plan uses the practice route's `seed` param instead (it works on the production preview, matching Flow). Update spec §10 when this task lands.

- [ ] **Step 1: Write e2e tests**

```ts
test('win a fixed practice board with real clicks, flags and a chord', async ({ page }) => {
  // board = generateBoard(PRESETS.classic, mulberry32(123)); mirror state with newGame
  // flag every mine adjacent to some revealed number via right-click; use one chord
  // (mouse.down({button:'left'}); mouse.down({button:'right'}); mouse.up({button:'right'}); mouse.up({button:'left'}))
  // on a number whose flags match; then left-click every remaining hidden safe cell (skip ones the mirror shows revealed)
  await expect(page.getByText('Cleared ✦')).toBeVisible();
});
test('hitting a mine shows Boom. with mines revealed');
test('daily: reload mid-game restores progress; reload after loss reopens the card', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  // reveal one safe cell, reload, assert it is still revealed; click a mine, reload, assert 'Boom.'
});
```

- [ ] **Step 2: Run `npm run e2e`** — Expected: 3 passed (plus any Flow e2e).
- [ ] **Step 3: Run `npm run build`** — Expected: success; `dist/` contains `index.html` and `minesweeper.html`; `npx vite preview`, open `/minesweeper.html`, no console errors.
- [ ] **Step 4: Edit spec §10** to describe the `#/practice?preset=…&seed=…` route instead of `?seed=`.
- [ ] **Step 5: Commit** — `git commit -m "test(mines): add Playwright e2e and verify multi-page build"`

---

### Task 9: Flow integration (shared tokens + game links)

**Run only once Flow plan Tasks 7–8 are on the branch.**

**Files:**
- Modify: `src/ui/theme.css` (remove the token/shared-class definitions now in `src/styles/tokens.css`; `@import '../styles/tokens.css'`), `src/ui/app.ts` (header gains `Flow` (current) · `Mines` (`./minesweeper.html`) links matching the Mines header)
- Test: `tests/ui/app.test.ts` (extend)

- [ ] **Step 1: Write failing test**: Flow header contains a `Mines` link with `href` `./minesweeper.html` and `Flow` marked current (`aria-current="page"`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; diff computed styles by eye on both pages — Flow must look unchanged.
- [ ] **Step 4: Run `npm test && npm run e2e`** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "feat: share Dusk tokens and cross-link Flow and Mines"`
