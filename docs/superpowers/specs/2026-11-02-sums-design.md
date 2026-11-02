# Sums — Number-Striking Puzzle for the Puzzle Site: Design Spec

**Date:** 2026-11-02
**Status:** Draft for review

## 1. Purpose & scope

Add a ninth puzzle, **Sums**. A square grid of digits 1–9 has a target number beside every row and above every column. The player strikes out digits until the digits left in each row and column add up to that line's target. Striking a digit that belongs in the answer costs one of 3 lives. Every board has exactly one solution **and can be solved by deduction alone** (§5), so a lost life is always the player's mistake, never a forced guess.

Tagline: *Strike out digits until every line adds up.*

**In scope (v1)**
- **Daily mode:** one 7×7 board per UTC day, identical for every player. 3 lives per attempt. Losing all 3 shows "Out of lives"; **Try again** replays the same board from the start with 3 fresh lives as the next attempt (attempts counted, as in Mines and Tangle; a win is final).
- **Practice mode:** unlimited random boards; presets **Easy** 5×5, **Medium** 7×7 (default, same as daily), **Hard** 9×9. Losing all lives ends that board.
- Input: tap/click a digit to strike it; long-press/right-click toggles a free "keep" mark.
- Each target shows how much its line still has to lose (§7).
- Separate page `sums.html`, sharing core modules, the `puzzleApp` shell, header, theme, analytics and dashboard with the other eight puzzles. Static site, no backend.

**Out of scope (v1)** — undo (strikes are final), hints, stats/streaks, share button, keyboard play, difficulty grading beyond grid size. The design must not block adding these later.

**Success criteria**
- A 9×9 board generates in < 100 ms typically on a laptop (main thread).
- Every generated board (all presets, daily) is fully solved by `deduce` (§5), which implies a unique solution — verified in tests and at generation time.
- Hard (9×9) fits a 375 px-wide phone without scrolling, so no `bestOnComputer`.
- A tap during the post-mistake pause never costs a life.

## 2. Rules

**Board.** `size × size` cells (5–9), each holding a digit 1–9. Each row has a target to its left, each column a target above it.

**Solution.** A subset of cells, the **kept** cells. Each target equals the sum of the kept digits in its line. Every row and every column keeps at least one digit.

**Cell states.**
- *open* — untouched.
- *struck* — removed by the player; it no longer counts toward any sum.
- *marked* — open, with the player's free "keep" note. Counts like open for every rule.
- *locked* — a kept digit the player tried to strike. Shown circled; it stays on the board.

**Tap** on an open cell:
- not in the solution → *struck*.
- in the solution → *locked*, the player loses a life, the cell flashes red, and the whole board ignores taps for 700 ms (as in Tangle).

Taps on struck, marked or locked cells are ignored.

**Long-press / right-click** toggles open ↔ marked. Free; ignored on struck and locked cells.

**Win:** every non-solution digit is struck. **Loss:** lives reach 0. After either, all input is ignored.

Because only non-solution digits can ever be struck, a line's remaining sum never drops below its target.

## 3. Architecture

Stack as before: TypeScript + Vite, no UI framework. Generation runs on the main thread. The board is a **DOM grid** of buttons (digits sit in cells, unlike Loop's edges), sized with `ui/fit`. The page runs on the shared `ui/puzzleApp` shell with `attempts: true`, like Tangle.

**Page structure:** new Vite entry `sums.html` and `sums: 'sums.html'` in `src/pages.ts`. Hash routes `#/` (daily) and `#/practice?preset=<id>&seed=<n>` (seed optional, used by e2e).

**Indexing.** Cells `r * size + c`. Lines `0..size-1` are rows, `size..2*size-1` are columns.

| Module | Responsibility | Depends on |
|---|---|---|
| `sums/types` | `Puzzle`, `Cell`, `GameState`, `PresetId` | — |
| `sums/solver` | `lineCells(size)`; `deduce(puzzle)` — line-subset fixpoint plus one-step trials (§5); `countSolutions(puzzle, limit)` — backtracking, tests only | `types` |
| `sums/generate` | `generatePuzzle(size, seed): Puzzle` — deterministic; `PRESETS`, `DAILY_PRESET`, `sumsDailySeed(date)` | `core/rng`, `solver` |
| `sums/game` | Pure state: `strike`, `toggleMark`, lives, `remaining(line)`, win/loss, encode/restore. No DOM | `types`, `solver` (`lineCells`) |
| `sums/board` | DOM grid: targets with remaining counts, cells, tap / long-press / right-click, mistake flash and input pause | `game`, `ui/fit`, `ui/grid` |
| `sums/app` | `PuzzleGame` definition for `mountPuzzleApp`: presets, specs, save hooks, board, HUD stats, end card | all above, `ui/puzzleApp` |
| `sums/howto` | How-to modal with a small static example | `ui/modal` |
| `sums/storage` | `loadSumsDaily` / `saveSumsDaily` via `dailyStore`, `getSumsPreset` / `setSumsPreset` via `presetStore` | `core/storage` |
| `sums/main` | Page entry: `trackErrors('sums')`, fonts, `ui/theme.css`, `ui/shell.css`, `sums.css`, mount | `app` |
| `home/puzzles`, `home/previews` | New `PUZZLES` entry + `sumsPreview()` SVG | `sums/storage` |
| `ui/hud` | Gains `renderLives(el, n, max)`, moved out of `tangle/app`; Tangle and Sums both use it | — |

**Core types**
```ts
type Puzzle = {
  size: number;                        // cells per side, 5..9
  digits: number[];                    // per cell, 1..9
  targets: number[];                   // per line: rows then columns
  solution: (0 | 1)[];                 // per cell, 1 = kept
};
type Cell = 0 | 1 | 2 | 3;             // 0 open, 1 struck, 2 marked, 3 locked
type GameState = {
  puzzle: Puzzle;
  cells: Cell[];
  lives: number;                       // 3 → 0
  status: 'playing' | 'won' | 'lost';
  left: number;                        // non-solution digits not yet struck
};
```

**Data flow:** date seed or random seed → `generatePuzzle` → `newGame` → `board` renders → tap / long-press → `game.strike` / `toggleMark` → `board` redraws the cell and its two targets (flash + pause on a mistake) → `ctx.changed` (shell saves, updates the HUD, ends the game on a win or loss).

## 4. Puzzle generation (`generate`)

**Presets**

| Preset | Grid | Label |
|---|---|---|
| `easy` | 5×5 | Easy |
| `medium` (default, daily) | 7×7 | Medium |
| `hard` | 9×9 | Hard |

Daily seed: `sumsDailySeed(date) = seedFromString('sums-daily:' + isoDate)`, preset `medium`.

**Attempt** (repeat with fresh draws from the same seeded RNG until accepted):
1. **Digits.** Each cell gets a uniform random digit 1–9.
2. **Keep mask.** Each cell is kept with probability 0.55. Reject the attempt if any row or column keeps no cell or keeps every cell. A line that keeps every cell gives nothing to strike, which is legal but dull.
3. **Targets.** Each line's target is the sum of its kept digits.
4. **Check.** Accept if `deduce` returns exactly the mask; otherwise discard.

`generatePuzzle` tries at most 2000 attempts and throws if none is accepted (unreachable in practice; the tests prove every preset generates for 30 seeds). Deterministic per `(size, seed)`. `size` must be 5–9.

The acceptance rate per preset is measured during implementation. If 9×9 can't meet the < 100 ms budget, the fallback is a **repair step** instead of a fresh draw: when `deduce` stalls, change the digit of one undecided cell (re-drawn from the RNG, so still deterministic), recompute targets and retry, up to 20 repairs per attempt.

## 5. Solver (`solver`)

`deduce(puzzle)` works on a state per cell: unknown, keep or strike. Apply the line rule to every row and column until a full pass changes nothing:

- **Line.** List every keep/strike assignment of the line's unknown cells whose kept sum plus the already-kept digits equals the target (at most 2⁹ = 512 subsets per line). No assignment → contradiction. A cell kept in every assignment becomes keep; a cell struck in every assignment becomes strike.

When a pass changes nothing and unknowns remain, **one-step trial**: for each unknown cell, copy the state, set it to keep and run the line rule to its fixpoint; on a contradiction, set the cell to strike in the real state. Then the same with strike (contradiction → keep). After the first cell that changes this way, go back to the line rule. Trials never nest. Stop when neither the line rule nor a full trial sweep changes anything.

Returns `(0 | 1)[]` when no unknowns remain; otherwise `null` (stalled or contradictory). Every step is sound, so a full result is the unique solution. The line rule covers the reasoning players use: a digit larger than the target must go, a line whose digits sum to just its target keeps everything, and a digit that every possible combination needs must stay.

**`countSolutions(puzzle, limit)`:** plain backtracking over cells in row order with per-line sum pruning, stopping at `limit`. Used only by tests to cross-check `deduce`.

## 6. Game rules (`game`)

- `newGame(puzzle)`: every cell open, 3 lives, `playing`, `left` = number of non-solution cells.
- `strike(s, cell)`: on an open cell, either struck (`left - 1`, win at 0) or locked (`lives - 1`, loss at 0). Returns `'struck' | 'mistake' | 'ignored'` so the board knows what to animate. Ignored on non-open cells and after the game ends.
- `toggleMark(s, cell)`: open ↔ marked; ignored otherwise and after the game ends.
- `remaining(s, line)`: sum of the line's digits that are not struck, minus its target. Always ≥ 0; 0 means the line is done.
- `encode(s)`: one char per cell, `0`–`3`. `restore(puzzle, str, lives)`: rejects wrong length, bad characters, a struck solution cell, a locked non-solution cell, lives outside 0–3, or a lock count that doesn't match `3 − lives`. Otherwise returns the game with its status recomputed.

## 7. Board (`board`)

**Layout.** A `(size + 1) × (size + 1)` grid: empty corner, column targets across the top, row targets down the left, digit cells in the rest. Cell size `clamp(30px, fit-to-panel, 56px)`. 9×9 is 10 tracks, so it fits 375 px at about 32 px per cell.

**Targets.** The target number, with a small second line under it showing `remaining`:
- `> 0`: amber `−n`.
- `0`: the target and a check mark turn green (`#5dcaa5`).

The remaining count is a visual cue only; winning is decided by §2.

**Cells.**
- Open: digit on a light tile; hover lightens it.
- Struck: digit fades to ~18 % with a strike-through. Fade 200 ms; none under `prefers-reduced-motion`.
- Marked: dashed ring inside the tile.
- Locked: solid violet (`#7f77dd`) ring; on the mistake it flashes red (`#ff5c7a`) for 500 ms.

**Input** (pointer events, one active pointer):
- **Tap / click** → `strike`.
- **Long-press** (touch, 350 ms, same timing as Mines) or **right-click** (`contextmenu`, default prevented) → `toggleMark`. A long-press doesn't also fire a tap.
- After a mistake the board ignores input for 700 ms and dims slightly, so a panicked follow-up tap can't cost another life.
- Cells are `<button>`s with `aria-label` "Row r, column c, digit d" plus state (struck / marked / kept).

**Win:** the remaining open and marked digits pulse once (about 400 ms), then the win card slides up. Under `prefers-reduced-motion` the card appears at once.

## 8. Screens

Header (shared): `puzzles · Sums`, Daily / Practice tabs, "?".

1. **Daily (playing):** subtitle `#N · Nov 2 · 7×7`; board; HUD: lives (shared `renderLives`), digits left to strike (`left`), timer mm:ss, and "Attempt n" from the shell when n > 1. No Undo or Clear: strikes are final.
2. **Daily (solved):** board stays visible; card "All lines add up", time, "Next daily in hh:mm:ss", primary **Play practice**.
3. **Daily (out of lives):** card "Out of lives", primary **Try again** (shell's `retryDaily`).
4. **Practice:** preset switch (Easy · Medium · Hard) replaces the subtitle; button **New board**. Win and loss cards offer **New board**.
5. **How-to ("?"):** modal: strike digits until every row and column adds up to its target; striking a digit that belongs costs a life (3 per board); long-press or right-click marks a digit to keep, free; the small number under each target shows how much that line still has to lose. A small static 3×3 example, half solved. Opens automatically on the first visit (flag `sums-howto-seen`).
6. **Dashboard card:** name "Sums", tagline, `sumsPreview()` SVG (a 4×4 grid with targets and a few struck digits), daily status "Not started", "In progress · mm:ss", "Solved · mm:ss" (`doneWord: 'Solved'`), "Out of lives · attempt n" (`lostWord: 'Out of lives'`); attempts > 1 shown as in Tangle.

`sums.html` copies the whole `<head>` of an existing page (description and `og:description` repeat the tagline, Open Graph/Twitter tags, icons, manifest, Umami). Play events and counted actions go through the shell's play tracker as in the other puzzles.

## 9. Persistence

- **Daily** save via `dailyStore('sums:daily')` (stored under `flow:sums:daily`): `{ v: 1, date, cells: string /* game.encode */, lives, elapsedMs, status, attempt }`. The puzzle is never stored; it is regenerated from the date seed. Marks are stored.
- Saving, `pagehide`, "a finished save wins over an unfinished tab" (`supersedes` / `ownsSave`), retry and discarding other dates, wrong versions or data `restore` rejects are the shell's existing behaviour, wired as in Tangle.
- **Practice:** not persisted. Only the preset (`sums:preset`) and the how-to flag are remembered.
- All storage access is wrapped by `core/storage`; the game works without storage.

## 10. Error handling

- `localStorage` unavailable / quota exceeded: play continues without persistence or first-visit flag.
- Corrupt or stale save: discarded silently.
- `generatePuzzle` throws only when no attempt is accepted (§4) or `size` is outside 5–9; uncaught errors reach Umami through `trackErrors`.

## 11. Testing

**Unit (Vitest)**
- `solver`: hand-built fixtures — a digit above its line's target is struck; a line whose digits sum to its target keeps all; a forced keep from every combination; a board that needs a trial is solved; a board with two solutions stalls (`null`); a contradictory board returns `null`. `countSolutions` counts 1 / 2 (stops at limit) / 0 on the same fixtures.
- `generate`: deterministic per `(size, seed)` (snapshot per preset); every line keeps at least one and strikes at least one digit; targets equal the kept sums; `deduce` returns exactly `solution` for seeds 1..30 per preset; brute-force `countSolutions(…, 2) === 1` on Easy boards for seeds 1..10 only under `SLOW=1`; daily for a fixed date is stable; time budget for `hard`; throws for sizes 4 and 10.
- `game`: strike of a non-solution cell; mistake locks and costs a life; loss at 0 lives; win when `left` hits 0; marks toggle and block taps; struck/locked/after-end inputs ignored; `remaining` before and after strikes; encode/restore round trip including marks and locks; rejection of each bad case in §6.
- `storage`: round trip, date mismatch, corrupt data, bad characters, throwing storage.
- `ui/hud`: `renderLives` output and label (moved from Tangle, Tangle's tests still pass).
- `home/puzzles`: Sums entry and its status labels, including a lost attempt.

**E2E (Playwright)** — `#/practice?preset=easy&seed=<n>`:
- Striking every non-solution digit reaches the win card.
- Tapping a solution digit loses a life and locks it; a second tap within 700 ms does nothing.
- Three mistakes on the daily show "Out of lives"; **Try again** gives a fresh board with "Attempt 2".
- Right-click marks a digit and a tap on it is ignored.
- A target's remaining count drops as its digits are struck and turns into a check at 0.
- Reload mid-daily restores strikes, marks, locks and lives.
- `home.spec.ts`: `sums-howto-seen` added to the `beforeEach`; `/sums.html` added to its page lists; the dashboard shows the Sums card and its status.

## 12. Delivery notes

- Work goes on a feature branch `feat/sums` cut from `main`. Conventional commits scoped `sums` (`feat(sums): …`); the `renderLives` move is `refactor(ui): …`. Never pushed.
- README's puzzle table gains a Sums row.

## 13. Future (not v1)

- Hints (reveal one forced cell), stats/streaks, share button.
- Keyboard play.
- Difficulty grading by how many trial steps `deduce` needs, for a harder preset.
- A shared long-press helper in `ui/` if a third game needs one (Mines and Sums each have their own for now).
