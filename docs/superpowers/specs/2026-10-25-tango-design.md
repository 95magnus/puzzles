# Tango — Sun & Moon Binary Puzzle for the Puzzle Site: Design Spec

**Date:** 2026-10-25
**Status:** Draft for review

## 1. Purpose & scope

Add a sixth puzzle, **Tango**, modelled on LinkedIn's Tango (a Takuzu / binary-puzzle variant). An N×N grid (N even) must be filled with suns ☀ and moons ☾ so that every row and column is balanced, no three of a kind touch in a line, and every `=` / `×` edge clue holds. Every board has exactly one solution **and can be solved by deduction alone** — no guessing is ever needed.

Tagline: *Fill the grid with suns and moons.*

**In scope (v1)**
- **Daily mode:** one 8×8 board per UTC day, identical for every player. No lives; a daily is either in progress or solved.
- **Practice mode:** unlimited random boards; presets **Small** 6×6, **Medium** 8×8 (default, same as daily), **Large** 10×10.
- Tap a non-given cell to cycle empty → ☀ → ☾ → empty. **Undo** and **Clear** buttons.
- Rule breaks are shown live (three in a row, unbalanced line, broken edge clue). The board is never compared with the solution.
- Separate page `tango.html`, sharing core modules, the site header, theme and dashboard with Flow, Mines, Tangle, Queens and Patches. Static site, no backend.

**Out of scope (v1)** — hints, a difficulty rating, stats/streaks, share button, keyboard play, drag-to-fill, the "no two identical rows/columns" rule (LinkedIn's Tango does not use it). The design must not block adding these later.

**Success criteria**
- A 10×10 board generates in < 100 ms typically on a laptop, so it appears effectively instantly.
- Every generated board (all presets, daily) is fully solved by the deduction solver (§5), which implies a unique solution — verified in tests and at generation time.
- Large (10×10) fits a 375 px-wide phone without scrolling.

## 2. Rules

**Board.** `size × size` cells, `size` even (4–10); cells are flat indices `r * size + c`. A cell holds `0` (empty), `1` (☀) or `2` (☾).

**Constraints.**
1. **Balance:** every row and every column holds exactly `size / 2` suns and `size / 2` moons.
2. **No three:** no three horizontally or vertically consecutive cells hold the same symbol.
3. **Edge clues:** an `=` between two orthogonally adjacent cells means they hold the same symbol; `×` means they differ.

**Givens.** Prefilled cells. They are locked: taps on them do nothing, Clear keeps them.

**Win.** Every cell filled and no violation (§6). Since the solution is unique, this is the solution. After a win, input is ignored.

## 3. Architecture

Stack as before: TypeScript + Vite, no UI framework. The board is a **DOM grid** (like Queens and Patches) with edge-clue badges absolutely positioned over the cell borders. Generation runs on the main thread.

**Page structure:** new Vite entry `tango.html` (seventh input in `vite.config.ts`). Hash routes `#/` (daily) and `#/practice?preset=<id>&seed=<n>` (seed optional, used by e2e).

| Module | Responsibility | Depends on |
|---|---|---|
| `tango/types` | `Sym`, `Edge`, `Puzzle`, `GameState`, `PresetId`, `Move`, `Violations` | — |
| `tango/lines` | Line geometry and patterns: `lineCells(size, i)` (lines `0..size-1` are rows, `size..2·size-1` columns), `lineEdges(puzzle, i)`, `linePatterns(n)` (all balanced no-three patterns of length `n`, cached) | `types` |
| `tango/solver` | `deduce(puzzle)` — line-wise fixpoint (§5); `countSolutions(puzzle, limit)` — plain backtracking, for tests only | `types`, `lines` |
| `tango/generate` | `generatePuzzle(size, seed): Puzzle` — deterministic; `PRESETS`, `DAILY_PRESET`, `tangoDailySeed(date)` | `core/rng`, `lines`, `solver` |
| `tango/game` | Pure state: cycle, undo, clear, violations, win, encode/restore. No DOM | `types`, `lines` |
| `tango/board` | DOM grid renderer, sun/moon glyphs, edge badges, violation and win styling, tap wiring | `game` |
| `tango/app` | Routing, daily number/date, HUD, timer, win card, Undo/Clear/New/Restart, how-to, storage | all above, `core/daily`, `core/storage`, `ui/header`, `ui/modal` |
| `tango/howto` | How-to modal with a small static example | `ui/modal` |
| `tango/main` | Page entry: fonts, `ui/theme.css`, `ui/shell.css`, `tango.css`, `mountTango` | `app` |
| `core/storage` | Gains `loadTangoDaily` / `saveTangoDaily`, `getTangoPreset` / `setTangoPreset`, flag `tango-howto-seen` | — |
| `home/puzzles`, `home/previews` | New `PUZZLES` entry + `tangoPreview()` SVG | `core/storage` |

The shared header needs no change (`createHeader({ game: 'Tango', onHelp })`). No separate `input` module: the only gesture is a tap, handled in `board` with a plain `click` listener.

**Core types**
```ts
type Sym = 0 | 1 | 2;                    // empty, sun, moon
type Edge = { a: number; b: number; kind: 'eq' | 'neq' }; // a < b, orthogonal neighbours
type Puzzle = {
  size: number;
  givens: Sym[];            // length size², 0 where not given
  edges: Edge[];            // sorted by (a, b)
  solution: Sym[];          // length size², no zeros
};
type GameState = {
  puzzle: Puzzle;
  cells: Sym[];             // givens copied in, never changed
  history: Move[];          // for undo
  status: 'playing' | 'won';
};
type Move = { cells: number[]; before: Sym[] }; // one tap or one Clear
type Violations = {
  triples: Set<number>;     // cells in any run of ≥ 3 equal symbols
  lines: Set<number>;       // line ids over the balance limit, or full and unbalanced
  edges: Set<number>;       // indices into puzzle.edges whose two cells are filled and break the clue
};
```

**Data flow:** date seed or random seed → `generatePuzzle` → `newGame` → `board` renders → tap → `game.cycle` → `board` re-renders the cell plus violation styling → `app` updates HUD, win card, storage.

## 4. Puzzle generation (`generate`)

**Presets**

| Preset | Size | Edge-clue density | Min givens |
|---|---|---|---|
| `small` | 6×6 | 0.35 | 6 |
| `medium` (default, daily) | 8×8 | 0.35 | 8 |
| `large` | 10×10 | 0.35 | 10 |

Daily seed: `seedFromString('tango-daily:' + isoDate)`, preset `medium`.

**Attempt** (repeat with a fresh draw from the same seeded RNG until accepted):
1. **Solution.** Fill cells in row-major order by randomized backtracking (try ☀/☾ in random order), checking after each placement: no three in a row ending at this cell (horizontal and vertical), and no row or column exceeding `size / 2` of either symbol. Restart the fill after 10 000 backtracks (never hit in practice).
2. **Generous clues.** Every cell is a given. Each internal edge (horizontal and vertical) independently becomes an edge clue with the preset's density; its kind is read from the solution.
3. **Removal.** Shuffle givens and edge clues into one seeded order. For each clue: tentatively remove it; keep the removal if `deduce` still fully solves the board, otherwise restore it. A given is skipped (kept) once the given count is at the preset's minimum. One pass.
4. **Accept** when at least 2 edge clues remain and `deduce` solves the board (always true after step 3). Otherwise next attempt.

`generatePuzzle` tries at most 200 attempts and throws if none is accepted (unreachable in practice; the tests prove every preset generates for 50 seeds). Deterministic per `(size, seed)`, so the daily is identical everywhere. `size` must be even and 4–10.

## 5. Solver (`solver`)

Every constraint lives inside one line: balance and no-three by definition, and each edge clue joins two cells of the same row (horizontal neighbours) or the same column (vertical neighbours). So exhaustive line reasoning captures every local deduction a human makes in one row or column — pairs, gaps, "this line already has its half of suns", and `=` / `×` chains.

- **Patterns.** `linePatterns(n)`: every length-`n` sequence over {☀, ☾} with `n/2` of each and no three equal in a row. Cached per `n` (n=6: 14, n=8: 34, n=10: 84).
- **`deduce(puzzle)`:** start from the givens. Repeat until a full pass changes nothing: for each of the `2·size` lines, keep the patterns consistent with the line's known cells and its edge clues; if none survive, return `null` (contradiction); every cell that has the same symbol in all surviving patterns is set. Returns the filled grid when no cell is empty, else `null` (stalled). Every step is sound, so a full result is the unique solution.
- **`countSolutions(puzzle, limit)`:** plain backtracking over cells with the same constraints, stopping at `limit`. Used only by tests to cross-check `deduce`.

## 6. Game rules (`game`)

- `newGame(puzzle)`: cells = givens, empty history, `playing`.
- `cycle(s, cell)`: on a non-given cell, empty → ☀ → ☾ → empty; pushes a `Move`. Ignored for givens and after a win. Returns whether anything changed.
- `undo(s)`: revert the last `Move`; ignored when history is empty or the game is won.
- `clear(s)`: set every non-given cell to empty as one `Move` (undoable). No-op (nothing pushed) when no non-given cell is filled.
- `violations(s)`: `Violations` (§3). A line is flagged when it holds more than `size/2` of either symbol (even partly filled) — a full line is then necessarily unbalanced, so no separate full-line check is needed. An edge is flagged only when both its cells are filled.
- `isWon(s)`: no empty cell and every violation set empty. Checked after each `cycle` and `undo`; sets `status = 'won'`.
- `encode(s)`: one char per cell, `0`/`1`/`2`. `restore(puzzle, str)`: rejects wrong length, bad characters, or a given cell that differs from the puzzle; else a game with empty history (status `won` if `isWon`).

## 7. Board (`board`)

- **Cells:** square, on the shared board surface (`glass` panel, as Queens and Patches), 1 px hairline grid, 2 px border around the board. Givens get a slightly tinted background and bolder glyphs.
- **Glyphs** (inline SVG, ~70 % of the cell): ☀ amber filled disc with short rays; ☾ slate-blue crescent. Shape and colour both differ, so it works without colour.
- **Edge clues:** a small round badge (~36 % of a cell) centred on the shared border, showing `=` or `×`, above the cells and ignoring pointer events.
- **Violations:** triple cells get a red inset outline; flagged lines a faint red tint across the row/column; broken edges turn their badge red. Red is `#ff5c7a`, as elsewhere.
- **Win:** cells pulse once in reading order (20 ms apart), then the win card slides up. Disabled under `prefers-reduced-motion`.
- **Sizing:** cell size `clamp(30px, fit-to-panel, 56px)`; 10×10 at 30 px plus borders fits 375 px wide with the 16 px page gutter.
- Taps use `click` on the cell element; a cell re-renders only itself, then violation classes are recomputed for the whole board (cheap at ≤ 100 cells).

## 8. Screens

Header (shared): `puzzles · Tango`, Daily / Practice tabs, "?".

1. **Daily (playing):** subtitle `#N · Sun Oct 25 · 8×8`; board; HUD below: filled `F/N²`, timer mm:ss; buttons **Undo** and **Clear**.
2. **Daily (solved):** board stays visible; card "Balanced ☀☾", time, "Next daily in hh:mm:ss", primary **Play practice**.
3. **Practice:** preset switch (Small · Medium · Large) replaces the subtitle; buttons **Undo**, **Clear**, **New board** (primary). Win card offers **New board**.
4. **How-to ("?"):** modal: fill every cell with ☀ or ☾; each row and column has the same number of each; no more than two of a kind next to each other; `=` means same, `×` means different; tap to cycle. A small static solved 4×4 illustration with one `=` and one `×`. Opens automatically on the first visit.
5. **Dashboard card:** name, tagline, `tangoPreview()` SVG (a tiny 6×6 board with suns, moons and two edge badges), daily status: "Not started", "In progress · mm:ss", "Solved · mm:ss".

The timer starts when the board appears and stops on win. Daily number uses `dailyNumber` from `core/daily`.

## 9. Persistence

- **Daily** save under key `tango:daily`: `{ v: 1, date, cells: string /* game.encode */, elapsedMs, solved }`. The puzzle is never stored; it is regenerated from the date seed. Undo history is not stored.
- Written after every change and on `pagehide`. A tab never overwrites a solved save (another tab finished first → reload from storage instead).
- On load: restore if `date` is today and `restore` accepts `cells`; a solved daily reopens solved with its card. Other dates, wrong versions or data that disagrees with the givens → discard silently.
- **Practice:** not persisted. Only the preset (`tango:preset`) and the how-to flag are remembered.
- All storage access wrapped in try/catch; the game works without storage.

## 10. Error handling

- `localStorage` unavailable / quota exceeded: play continues without persistence or first-visit flag.
- Corrupt or stale save: discarded silently.
- `generatePuzzle` throws only when no attempt is accepted (§4) or `size` is odd or outside 4–10.

## 11. Testing

**Unit (Vitest)**
- `lines`: `linePatterns` counts 14 / 34 / 84 for n = 6 / 8 / 10, all balanced and triple-free; `lineCells` for rows and columns; `lineEdges` picks only edges inside the line.
- `solver`: hand-built 4×4 / 6×6 fixtures — a deducible board is solved; a board with two solutions stalls (`null`); a contradictory board returns `null`; edge clues drive deductions (an `=` / `×` chain fills a line). `countSolutions` counts 1 / 2 (stops at limit) / 0 on the same fixtures.
- `generate`: deterministic per `(size, seed)` (snapshot per preset); the solution satisfies every rule; givens and edges agree with the solution; `deduce` returns exactly `solution` and `countSolutions(…, 2) === 1`, seeds 1..50 per preset; at least `size` givens and 2 edge clues; daily for a fixed date is stable; time budget for `large`; throws for sizes 3, 7 and 12.
- `game`: cycle order; givens locked; undo of a tap and of clear; clear on an empty board pushes nothing; each violation kind (triple, over-limit line, broken `=`, broken `×`, edge with an empty cell not flagged); win detection; actions ignored after win; encode/restore round trip and rejection of bad length, bad characters and changed givens.
- `storage`: round trip, date mismatch, corrupt data, bad characters, throwing storage.
- `home/puzzles`: Tango entry and its status labels.

**E2E (Playwright)** — `#/practice?preset=small&seed=<n>`:
- Tapping each non-given cell to its solution symbol reaches the win card "Balanced ☀☾".
- Placing three suns in a row shows the triple as a violation.
- Undo reverts a tap; Clear empties non-given cells and Undo brings them back.
- Reload mid-daily restores the filled cells.
- The dashboard shows the Tango card and its status.

## 12. Delivery notes

- Work goes on a feature branch `feat/tango` cut from `main`. Never pushed.

## 13. Future (not v1)

Hints (show the next deducible cell and the rule behind it), difficulty grading by which deductions are needed, the optional "no two identical lines" rule as a harder variant, stats/streaks + share, keyboard play.
