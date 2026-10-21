# Queens — Region Logic Puzzle for the Puzzle Site: Design Spec

**Date:** 2026-10-22
**Status:** Draft for review

## 1. Purpose & scope

Add a fourth puzzle, **Queens**, to the puzzle site. An N×N board is split into N coloured regions. Place one queen in every row, every column and every region, with no two queens touching — not even diagonally. Every board has exactly one solution, so it can always be reasoned out without guessing.

Tagline: *One queen per row, column and colour.*

**In scope (v1)**
- **Daily mode:** one 8×8 board per UTC day, identical for every player. No lives; a daily is either in progress or solved.
- **Practice mode:** unlimited random boards; presets **Small** 7×7, **Medium** 8×8 (default, same as daily), **Large** 9×9.
- Tap a cell to cycle empty → ✕ → ♛ → empty. Drag across cells to paint ✕ marks (or erase them). **Undo** and **Clear** buttons.
- Rule breaks are shown live: queens that clash (same row, column or region, or touching) turn red.
- Separate page `queens.html`, sharing core modules, the site header, theme and dashboard with Flow, Mines and Tangle. Static site, no backend.

**Out of scope (v1)** — hints, auto-✕ around a placed queen, a logical-difficulty rating, stats/streaks, share button, keyboard play, sizes above 9 (the palette has 9 colours). The design must not block adding these later.

**Success criteria**
- A 9×9 board generates in < 100 ms on a laptop (main thread), so it appears instantly.
- Every generated board (all presets, daily) has exactly one solution — verified by the solver in tests and at generation time.
- Large (9×9) fits a 375 px-wide phone without scrolling.
- A drag never places or removes a queen.

## 2. Rules

**Board.** `size × size` cells, `size` regions. Every region is orthogonally connected. Cells are flat indices `r * size + c`.

**Goal.** Place exactly `size` queens so that each row, each column and each region holds exactly one, and no two queens are adjacent in any of the 8 directions.

**Marks.** A cell is empty, marked ✕ (a player note, no rule meaning), or a queen. Marks never affect winning.

**Conflicts.** A queen is in conflict when another queen shares its row, column or region, or touches it. Conflicts are shown, not blocked: the player may place a clashing queen.

**Win.** `size` queens on the board with no conflicts. Since the solution is unique, this is the solution. After a win, input is ignored.

## 3. Architecture

Stack as before: TypeScript + Vite, no UI framework. The board is a **DOM grid** (like Mines), not SVG — cells are squares with tinted backgrounds and region borders.

**Page structure:** new Vite entry `queens.html` (fifth input in `vite.config.ts`). Hash routes `#/` (daily) and `#/practice?preset=<id>&seed=<n>` (seed optional, used by e2e).

| Module | Responsibility | Depends on |
|---|---|---|
| `queens/types` | `Puzzle`, `GameState`, `PresetId`, `Move` | — |
| `queens/solver` | `countSolutions(puzzle, limit)`, `solve(puzzle)` — bitmask backtracking | `types` |
| `queens/generate` | `generatePuzzle(size, seed): Puzzle` — deterministic; `PRESETS`, `DAILY_PRESET`, `queensDailySeed(date)` | `core/rng`, `solver` |
| `queens/game` | Pure state: cycle, paint marks, undo, clear, conflicts, win, encode/restore. No DOM | `types` |
| `queens/input` | Pure pointer state machine: tap vs. drag-to-mark | — |
| `queens/board` | DOM grid renderer, region borders, conflict and win styling, pointer wiring | `game`, `input` |
| `queens/app` | Routing, daily number/date, HUD, timer, win card, Undo/Clear/New/Restart, how-to, storage | all above, `core/daily`, `core/storage`, `ui/header`, `ui/modal` |
| `queens/howto` | How-to modal with a small static example | `ui/modal` |
| `queens/main` | Page entry: fonts, `ui/theme.css`, `ui/shell.css`, `queens.css`, `mountQueens` | `app` |
| `core/storage` | Gains `loadQueensDaily` / `saveQueensDaily`, `getQueensPreset` / `setQueensPreset`, flag `queens-howto-seen` | — |
| `home/puzzles`, `home/previews` | New `PUZZLES` entry + `queensPreview()` SVG | `core/storage` |

The shared header needs no change (`createHeader({ game: 'Queens', onHelp })`).

**Core types**
```ts
type Puzzle = {
  size: number;
  regions: Uint8Array;      // cell → region id 0..size-1; region id = PALETTE index
  solution: number[];       // per row, the column of its queen
};
type Mark = 0 | 1 | 2;      // empty, ✕, queen
type GameState = {
  puzzle: Puzzle;
  cells: Uint8Array;        // Mark per cell
  history: Move[];          // for undo
  status: 'playing' | 'won';
};
type Move = { cells: number[]; before: Mark[]; gesture?: number }; // one tap, one Clear or one whole drag
```

**Data flow:** date seed or random seed → `generatePuzzle` → `newGame` → `board` renders → tap/drag → `game` action → `board` re-renders changed cells → `app` updates HUD, win card, storage.

## 4. Puzzle generation (`generate`)

**Presets**

| Preset | Size |
|---|---|
| `small` | 7×7 |
| `medium` (default, daily) | 8×8 |
| `large` | 9×9 |

Daily seed: `seedFromString('queens-daily:' + isoDate)`, preset `medium`.

**Attempt** (repeat with a fresh draw from the same seeded RNG until accepted):
1. **Queens.** A seeded random permutation `col[r]` with `|col[r] − col[r+1]| ≥ 2` for every r (random-order backtracking).
2. **Regions.** Each queen seeds its own region (region id = row of the queen, then the ids are shuffled so colours don't track rows). Grow: repeatedly pick a region, favouring the smallest (weight `1 / size²` of the region), and give it one random unassigned orthogonal neighbour; until every cell is assigned. A region with no free neighbour is skipped for that step.
3. **Shape filter.** Reject if more than one region has size 1.
4. **Uniqueness.** Accept iff `countSolutions(puzzle, 2) === 1`.

`generatePuzzle` tries at most 2000 attempts and throws if none is accepted (unreachable in practice; the tests prove every preset generates for 50 seeds). Deterministic per `(size, seed)`, so the daily is identical everywhere.

**Performance.** The solver runs row by row with bitmasks for used columns and used regions plus the previous row's queen column for the touch rule; one call is well under 1 ms at 9×9. Target < 100 ms for `large`. If the target is missed, add a repair step (move one disputed cell into a neighbouring region and recount) before anything else.

## 5. Solver (`solver`)

- `countSolutions(puzzle, limit)`: number of valid placements, stopping at `limit`. Ignores `puzzle.solution`.
- `solve(puzzle)`: the first valid placement as `number[]` (column per row) or `null`. Used by tests and the e2e helper.

## 6. Game rules (`game`)

- `newGame(puzzle)`: all cells empty, `status 'playing'`, empty history.
- `cycle(s, cell)`: empty → ✕ → queen → empty; pushes one `Move`; then checks for a win. Returns the changed cells (`[]` when ignored).
- `paint(s, cells, to, gesture)`: set every listed cell that is not a queen to `to` (`0` or `1`); cells already equal are skipped. If the last `Move` carries the same `gesture` id the changes are appended to it, otherwise a new `Move` tagged with `gesture` is pushed — so a whole drag undoes at once. Nothing is pushed if nothing changed. Queens are never touched. Returns the changed cells.
- `undo(s)`: revert the last `Move`; ignored when history is empty or the game is won.
- `clear(s)`: set every cell to empty as one `Move` (undoable).
- `conflicts(s): Set<number>`: cells of queens in conflict (§2).
- `queenCount(s)`.
- `encode(s)`: one char per cell, `'0' | '1' | '2'`. `restore(puzzle, cells)`: validates length and characters; history starts empty; status derived (won if the cells are a win).
- All actions are ignored once `status === 'won'`.

## 7. Input (`input`)

Pure state machine fed pointer events with the cell under the pointer:
- `down(cell)` → pressed on `cell`.
- `enter(cell)` while pressed, different cell → becomes a **drag**. The drag's paint value is set by the start cell: start cell empty → paint ✕; start cell ✕ → erase ✕; start cell queen → paint ✕. The start cell is painted too (unless it is a queen).
- `up` → if still not a drag: **tap** on the start cell (cycle). If a drag: end it; the whole drag is one `Move`.
- `cancel` → drop the gesture; a drag already painted stays (one `Move`).

Every `down` starts a new gesture id (a counter in the input state). Paint actions carry it, and `game.paint` merges by it, so each drag is one history entry even when its first cells changed nothing.

## 8. Visual design

Reuses the "Dusk" theme (background glows, glass board panel, Inter) from `ui/theme.css`.

- **Cells:** square, background = region colour (`PALETTE[region]`) mixed toward the board background at ~35 % strength so glyphs stay readable; 1 px hairline grid between all cells; **3 px dark border** where two neighbouring cells are in different regions, and around the board edge. The borders carry the regions on their own, so colour is not required (colorblind safe).
- **✕:** small, muted (opacity ≈ .45).
- **Queen:** ♛ glyph, near-white, ~62 % of the cell.
- **Conflict:** queen turns `#ff5c7a` and its cell gets a faint diagonal stripe.
- **Win:** a short glow wave across the queens (row by row, 40 ms apart), then the win card slides up. Disabled under `prefers-reduced-motion`.
- **Sizing:** cell size `clamp(32px, fit-to-panel, 56px)`; 9×9 at 32 px plus borders fits 375 px wide with the 16 px page gutter.

## 9. Screens

Header (shared): `puzzles · Queens`, Daily / Practice tabs, "?".

1. **Daily (playing):** subtitle `#N · Thu Oct 22 · 8×8`; board; HUD below: queens placed `Q/N ♛`, timer mm:ss; buttons **Undo** and **Clear**.
2. **Daily (solved):** board stays visible (no dim); card "Crowned ♛", time, "Next daily in hh:mm:ss", primary **Play practice**.
3. **Practice:** preset switch (Small · Medium · Large) replaces the subtitle; buttons **Undo**, **Clear**, **New board** (primary). Win card offers **New board**.
4. **How-to ("?"):** modal: one queen in each row, column and colour; queens can't touch, not even diagonally; tap once for ✕, twice for ♛; drag to mark many cells. A small static 4×4-style illustration of a solved region board. Opens automatically on the first visit.
5. **Dashboard card:** name, tagline, `queensPreview()` SVG (a tiny coloured 5×5 board with queens), daily status: "Not started", "In progress · mm:ss", "Solved · mm:ss".

The timer starts when the board appears and stops on win. Daily number uses `dailyNumber` from `core/daily`.

## 10. Persistence

- **Daily** save under key `queens:daily`: `{ v: 1, date, cells: string /* one char per cell, 0 empty, 1 ✕, 2 queen */, elapsedMs, solved }`. The puzzle is never stored; it is regenerated from the date seed. Undo history is not stored.
- Written after every change and on `pagehide`. A tab never overwrites a solved save (another tab finished first → reload from storage instead).
- On load: restore if `date` is today and `cells.length === size²`; a solved daily reopens solved with its card. Other dates, wrong versions, wrong lengths or invalid characters → discard silently.
- **Practice:** not persisted. Only the preset (`queens:preset`) and the how-to flag are remembered.
- All storage access wrapped in try/catch; the game works without storage.

## 11. Error handling

- `localStorage` unavailable / quota exceeded: play continues without persistence or first-visit flag.
- Corrupt or stale save: discarded silently.
- `generatePuzzle` throws only when no attempt is accepted (§4) or `size` is outside 4–9.

## 12. Testing

**Unit (Vitest)**
- `solver`: hand-built 4×4 / 5×5 fixtures — a unique board counts 1, a board with two solutions counts 2 (stops at the limit), an impossible board counts 0; `solve` returns a valid placement; the touch rule is enforced (a placement with diagonal neighbours is not counted).
- `generate`: deterministic per `(size, seed)` (snapshot per preset); every region connected and non-empty; exactly `size` regions; at most one size-1 region; `countSolutions === 1` and `solution` is that solution, seeds 1..50 per preset; daily for a fixed date is stable; time budget for `large`; throws for size 3 and 10.
- `game`: cycle order; paint skips queens and no-ops; one undo reverts a whole drag; undo of clear; conflicts for row, column, region and diagonal touch; win detection; actions ignored after win; encode/restore round trip and rejection of bad input.
- `input`: tap; drag paints from an empty start; drag erases from a ✕ start; re-entering the start cell keeps the drag; cancel.
- `storage`: round trip, date mismatch, corrupt data, bad characters, throwing storage.
- `home/puzzles`: Queens entry and its status labels.

**E2E (Playwright)** — `#/practice?preset=small&seed=<n>`:
- Tapping each solution cell twice reaches the win card "Crowned ♛".
- Placing two queens in one row shows both as conflicting.
- Dragging across a row paints ✕ on every empty cell; Undo removes them all.
- Reload mid-daily restores queens and marks.
- The dashboard shows the Queens card and its status.

## 13. Delivery notes

- Work goes on a feature branch `feat/queens` cut from `main`. Never pushed.

## 14. Future (not v1)

Hints, optional auto-✕ around a queen, logic-only difficulty grading (rate by which deduction rules a human solver needs), sizes 10–11 with extra colours, stats/streaks + share, keyboard play.
