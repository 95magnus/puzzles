# Patches — Rectangle Partition Puzzle for the Puzzle Site: Design Spec

**Date:** 2026-10-23
**Status:** Draft for review

## 1. Purpose & scope

Add a fifth puzzle, **Patches**, modelled on LinkedIn's Patches (a Shikaku variant). An N×N grid holds clues. Cover the whole grid with non-overlapping rectangles so that every rectangle holds exactly one clue and matches that clue's shape and, when shown, its area. Every board has exactly one solution, so it can always be reasoned out without guessing.

Tagline: *Cut the grid into patches. One clue each.*

**In scope (v1)**
- **Daily mode:** one 8×8 board per UTC day, identical for every player. No lives; a daily is either in progress or solved.
- **Practice mode:** unlimited random boards; presets **Small** 6×6, **Medium** 8×8 (default, same as daily), **Large** 10×10.
- Drag from one corner to the opposite corner to draw a rectangle; a live preview shows its `w×h`. Drawing over existing rectangles replaces every rectangle it overlaps. Tap a placed rectangle to remove it. **Undo** and **Clear** buttons.
- Rule breaks are shown live: an invalid rectangle (no clue, two or more clues, wrong shape or wrong area) is drawn red. It is placed, not rejected.
- Separate page `patches.html`, sharing core modules, the site header, theme and dashboard with Flow, Mines, Tangle and Queens. Static site, no backend.

**Out of scope (v1)** — hints, stats/streaks, share button, keyboard play, a logical-difficulty rating, non-square boards. The design must not block adding these later.

**Success criteria**
- A 10×10 board generates in < 100 ms typically on a laptop, so it appears effectively instantly.
- Every generated board (all presets, daily) has exactly one solution — verified by the solver in tests and at generation time.
- Large (10×10) fits a 375 px-wide phone without scrolling.
- A tap never places a rectangle; a drag never removes one without replacing it.

## 2. Rules

**Board.** `size × size` cells; cells are flat indices `r * size + c`. A rectangle is `{ r, c, w, h }` (top-left row/column, width in columns, height in rows), `w, h ≥ 1`.

**Clues.** Each clue sits on one cell and has:
- a **shape**: `square` (w = h), `wide` (w > h), `tall` (h > w) or `any` (no constraint);
- an optional **area** `w × h`. A clue with no area shows only its shape icon.

Every patch covers at least 2 cells: a single cell is never a patch, so no clue has area 1 and a 1×1 rectangle is never placed.

**Goal.** Cover every cell with non-overlapping rectangles such that each rectangle contains exactly one clue cell and satisfies that clue's shape and area.

**Validity.** A placed rectangle is **invalid** when it contains zero clues, two or more clues, or its one clue's shape or area does not match. Invalid rectangles are shown, not blocked.

**Win.** Every cell covered and no rectangle invalid. Since the solution is unique, this is the solution. After a win, input is ignored.

## 3. Architecture

Stack as before: TypeScript + Vite, no UI framework. The board is a **DOM grid** (like Queens) with placed rectangles drawn as absolutely positioned tiles over it.

**Page structure:** new Vite entry `patches.html` (sixth input in `vite.config.ts`). Hash routes `#/` (daily) and `#/practice?preset=<id>&seed=<n>` (seed optional, used by e2e).

| Module | Responsibility | Depends on |
|---|---|---|
| `patches/types` | `Shape`, `Clue`, `Rect`, `Puzzle`, `GameState`, `PresetId`, `Move` | — |
| `patches/rect` | Pure geometry helpers: `cellsOf`, `contains`, `overlaps`, `shapeOf`, `normalize(a, b)` (two corner cells → `Rect`) | `types` |
| `patches/solver` | `countSolutions(puzzle, limit)`, `solve(puzzle)` — candidate enumeration + exact-cover backtracking | `types`, `rect` |
| `patches/generate` | `generatePuzzle(size, seed): Puzzle` — deterministic; `PRESETS`, `DAILY_PRESET`, `patchesDailySeed(date)` | `core/rng`, `rect`, `solver` |
| `patches/game` | Pure state: place, remove, undo, clear, invalid set, coverage, win, encode/restore. No DOM | `types`, `rect` |
| `patches/input` | Pure pointer state machine: tap vs. drag-to-draw | — |
| `patches/board` | DOM grid renderer, clue glyphs, rectangle tiles, drag preview, invalid and win styling, pointer wiring | `game`, `input`, `rect`, `ui/palette` |
| `patches/app` | Routing, daily number/date, HUD, timer, win card, Undo/Clear/New/Restart, how-to, storage | all above, `core/daily`, `core/storage`, `ui/header`, `ui/modal` |
| `patches/howto` | How-to modal with a small static example | `ui/modal` |
| `patches/main` | Page entry: fonts, `ui/theme.css`, `ui/shell.css`, `patches.css`, `mountPatches` | `app` |
| `core/storage` | Gains `loadPatchesDaily` / `savePatchesDaily`, `getPatchesPreset` / `setPatchesPreset`, flag `patches-howto-seen` | — |
| `home/puzzles`, `home/previews` | New `PUZZLES` entry + `patchesPreview()` SVG | `core/storage` |

The shared header needs no change (`createHeader({ game: 'Patches', onHelp })`).

**Core types**
```ts
type Shape = 'square' | 'wide' | 'tall' | 'any';
type Clue = {
  cell: number;             // flat index
  shape: Shape;             // as shown to the player
  area?: number;            // undefined = hidden
  color: number;            // PALETTE index, fixed at generation
};
type Rect = { r: number; c: number; w: number; h: number };
type Puzzle = {
  size: number;
  clues: Clue[];            // sorted by cell
  solution: Rect[];         // solution[i] is the rectangle of clues[i]
};
type GameState = {
  puzzle: Puzzle;
  rects: Rect[];            // placed rectangles, never overlapping
  history: Move[];          // for undo
  status: 'playing' | 'won';
};
type Move = { added: Rect[]; removed: Rect[] }; // one draw, one tap-remove, or one Clear
```

**Data flow:** date seed or random seed → `generatePuzzle` → `newGame` → `board` renders → drag/tap → `game` action → `board` re-renders tiles → `app` updates HUD, win card, storage.

## 4. Puzzle generation (`generate`)

**Presets**

| Preset | Size | Area range | Target hidden areas | Target `any` shapes |
|---|---|---|---|---|
| `small` | 6×6 | 2–6 | ~20 % | ~10 % |
| `medium` (default, daily) | 8×8 | 2–8 | ~30 % | ~15 % |
| `large` | 10×10 | 2–10 | ~35 % | ~15 % |

Daily seed: `seedFromString('patches-daily:' + isoDate)`, preset `medium`.

**Attempt** (repeat with a fresh draw from the same seeded RNG until accepted):
1. **Partition.** Repeatedly take the first uncovered cell — scanning rows or columns, chosen at random each time (a row scan alone favours tall rectangles, a column scan wide ones, so the mix balances wide and tall) — and pick a random rectangle anchored at it as top-left that fits only uncovered cells, within the preset's area range. Single cells are never offered (an anchor boxed in to one cell rejects the attempt). Integer weights favour areas 3–6; long 1-wide strips (area ≥ 4) get an eighth of their area's weight, keeping them to ≤ 12 % of rectangles. Continue until the grid is covered.
2. **Clues.** For each rectangle, place its clue on a random cell inside it, with the true shape (`shapeOf(rect)`) and the true area.
3. **Uniqueness and repair.** `countSolutions(puzzle, 2)`. When the count is 2, find a rectangle where the second solution differs from the planted one and repair locally: move that rectangle's clue to another cell of it, or (if that does not help) split or merge it with a neighbour into a different valid partition, then recount. Up to 30 repair steps; then reject the attempt. Accept when the count is 1.
4. **Hide information.** Visit clues in seeded random order. For each, try hiding its area; keep the change if the board stays unique. Then, in a second pass, try relaxing shapes to `any` the same way. Stop each pass when its preset target is reached. A clue never loses both its area and its shape (an `any` clue always shows an area).
5. **Colours.** Colour each clue by what it shows: clues with the same shape and area (or the same shape with the area hidden) share a colour. The board's distinct clue types, sorted by area (hidden last) then shape (square, wide, tall, any), take `PALETTE` indices 1–8 in order, cycling when a board has more than eight types. Index 0 (`#ff5c7a`) is reserved for invalid rectangles. Neighbouring patches may share a colour; their borders keep them apart.

`generatePuzzle` tries at most 2000 attempts and throws if none is accepted (unreachable in practice; the tests prove every preset generates for 50 seeds). Deterministic per `(size, seed)`, so the daily is identical everywhere. `size` must be 4–10.

## 5. Solver (`solver`)

- **Candidates.** For each clue, list every rectangle that contains the clue cell, contains no other clue cell, fits the board, and matches the clue's shape and area (all areas up to `size²` when hidden).
- **Search.** Exact cover over cells. Track covered cells in a bitset; at each step pick the clue with the fewest candidates still compatible with the covered cells (fail fast at zero), try each, recurse. Prune when an uncovered cell can no longer be reached by any remaining clue's candidates.
- `countSolutions(puzzle, limit)`: number of solutions, stopping at `limit`. Ignores `puzzle.solution`.
- `solve(puzzle)`: the first solution as `Rect[]` aligned with `clues`, or `null`. Used by tests and the e2e helper.

## 6. Game rules (`game`)

- `newGame(puzzle)`: no rectangles, `status 'playing'`, empty history.
- `place(s, rect)`: removes every placed rectangle overlapping `rect`, adds `rect`, pushes one `Move`; then checks for a win. If `rect` equals an already placed rectangle, nothing happens. Returns whether anything changed.
- `removeAt(s, cell)`: removes the rectangle covering `cell` as one `Move`; ignored if none.
- `undo(s)`: revert the last `Move`; ignored when history is empty or the game is won.
- `clear(s)`: remove every rectangle as one `Move` (undoable); ignored when empty.
- `invalid(s): Set<number>`: indices into `s.rects` of invalid rectangles (§2).
- `coverage(s)`: number of covered cells.
- `clueOf(s, rect)`: the single clue inside `rect`, or `null`.
- `encode(s)`: placed rectangles as `"r,c,w,h;…"`. `restore(puzzle, text)`: validates format, bounds and non-overlap; history starts empty; status derived (won if it is a win).
- All actions are ignored once `status === 'won'`.

## 7. Input (`input`)

Pure state machine fed pointer events with the cell under the pointer:
- `down(cell)` → pressed on `cell`.
- `enter(cell)` while pressed, different cell → becomes a **drag**. The preview rectangle is `normalize(start, current)`. Re-entering the start cell keeps the drag (preview 1×1, which is never placed).
- `up` → if still not a drag: **tap** on the start cell → `removeAt` if a rectangle covers it; on an empty cell nothing happens. If a drag: `place(preview)`, ignored when the preview is a single cell.
- Off-board moves during a gesture clamp to the nearest edge cell, so a drag that overshoots an edge row or column keeps going and draws up to that edge. A `down` starts only on a board cell.
- `cancel` (pointer cancel, lost capture, window blur) → drop the gesture; nothing placed.

Pointer capture keeps the drag alive when the finger leaves the start cell; cells are resolved from coordinates via `elementFromPoint` / grid maths, not per-cell events. The board follows only the pointer that started the gesture; other pointers are ignored until it ends.

## 8. Visual design

Reuses the "Dusk" theme (background glows, glass board panel, Inter) from `ui/theme.css`.

- **Grid:** square cells, 1 px hairlines, board edge 3 px.
- **Clue glyph:** centred in its cell — a small outline icon for the shape (square, wide rectangle, tall rectangle, or a dashed square for `any`) with the area number inside it in bold; shape-only clues show the icon alone. Icon and number are drawn in the clue's colour, so equal clues look alike. The icon carries the shape on its own, so colour is not required (colorblind safe).
- **Placed rectangle:** a tile inset 2 px from the cell edges, rounded 8 px, filled with the clue's `PALETTE` colour (indices 1–8; index 0 `#ff5c7a` is reserved for invalid rectangles) at ~35 % over the board background, 2 px border in the full colour. A rectangle without exactly one clue uses neutral grey.
- **Invalid:** border `#ff5c7a`, faint diagonal stripe fill.
- **Drag preview:** dashed outline with a `w×h` label centred above the preview rectangle (below it when the rectangle starts on row 0), not pinned to the pointer; it turns red when the preview would be invalid.
- **Win:** tiles pulse once in reading order (30 ms apart), then the win card slides up. Disabled under `prefers-reduced-motion`.
- **Sizing:** cell size `clamp(30px, fit-to-panel, 56px)`; 10×10 at 30 px plus borders fits 375 px wide with the 16 px page gutter.

## 9. Screens

Header (shared): `puzzles · Patches`, Daily / Practice tabs, "?".

1. **Daily (playing):** subtitle `#N · Fri Oct 23 · 8×8`; board; HUD below: coverage `covered/total`, timer mm:ss; buttons **Undo** and **Clear**.
2. **Daily (solved):** board stays visible; card "Patched up", time, "Next daily in hh:mm:ss", primary **Play practice**.
3. **Practice:** preset switch (Small · Medium · Large) replaces the subtitle; buttons **Undo**, **Clear**, **New board** (primary). Win card offers **New board**.
4. **How-to ("?"):** modal: split the grid into rectangles; each holds exactly one clue; the icon is the shape (square, wide, tall, any); the number is its area; drag to draw, tap to remove. A small static solved 4×4 illustration. Opens automatically on the first visit.
5. **Dashboard card:** name, tagline, `patchesPreview()` SVG (a tiny 5×5 board split into coloured rectangles), daily status: "Not started", "In progress · mm:ss", "Solved · mm:ss".

The timer starts when the board appears and stops on win. Daily number uses `dailyNumber` from `core/daily`.

## 10. Persistence

- **Daily** save under key `patches:daily`: `{ v: 1, date, rects: string /* game.encode */, elapsedMs, solved }`. The puzzle is never stored; it is regenerated from the date seed. Undo history is not stored.
- Written after every change and on `pagehide`. A tab never overwrites a solved save (another tab finished first → reload from storage instead).
- On load: restore if `date` is today and `restore` accepts `rects`; a solved daily reopens solved with its card. Other dates, wrong versions or invalid rectangle data → discard silently.
- **Practice:** not persisted. Only the preset (`patches:preset`) and the how-to flag are remembered.
- All storage access wrapped in try/catch; the game works without storage.

## 11. Error handling

- `localStorage` unavailable / quota exceeded: play continues without persistence or first-visit flag.
- Corrupt or stale save: discarded silently.
- `generatePuzzle` throws only when no attempt is accepted (§4) or `size` is outside 4–10.

## 12. Testing

**Unit (Vitest)**
- `rect`: `normalize` for all four drag directions; `overlaps`, `contains`, `shapeOf`.
- `solver`: hand-built 4×4 / 5×5 fixtures — a unique board counts 1, a board with two solutions counts 2 (stops at the limit), an impossible board counts 0; hidden areas and `any` shapes widen candidates correctly; `solve` returns a valid cover aligned with `clues`.
- `generate`: deterministic per `(size, seed)` (snapshot per preset); solution rectangles tile the grid exactly; each holds exactly its clue; `countSolutions === 1` and `solution` is that solution, seeds 1..50 per preset; no clue has both hidden area and `any`; equal clues share a colour, all in `PALETTE` 1–8; no rectangle is a single cell; 1-wide strips of area ≥ 4 are ≤ 12 % of rectangles per preset; daily for a fixed date is stable; time budget for `large`; throws for size 3 and 11.
- `game`: place replaces overlapped rectangles and one undo restores them; tap-remove; undo of clear; invalidity for no clue, two clues, wrong area, wrong shape; win detection; actions ignored after win; encode/restore round trip and rejection of overlapping or out-of-bounds data.
- `input`: tap on empty does nothing; a single-cell drag places nothing; tap on a rectangle removes it; drag in each direction; re-entering the start cell keeps the drag; a drag past an edge clamps to the edge cell and places the edge rectangle; cancel places nothing; a second pointer is ignored.
- `storage`: round trip, date mismatch, corrupt data, throwing storage.
- `home/puzzles`: Patches entry and its status labels.

**E2E (Playwright)** — `#/practice?preset=small&seed=<n>`:
- Drawing each solution rectangle reaches the win card "Patched up".
- Drawing a rectangle over two clues shows it as invalid.
- Drawing over an existing rectangle replaces it; Undo restores the old one.
- Reload mid-daily restores the placed rectangles.
- The dashboard shows the Patches card and its status.

## 13. Delivery notes

- Work goes on a feature branch `feat/patches` cut from `main`. Never pushed.

## 14. Future (not v1)

Hints, logic-only difficulty grading, stats/streaks + share, keyboard play (cursor + shift-arrows to size a rectangle), non-square boards.
