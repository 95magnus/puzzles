# Loop — Slitherlink Puzzle for the Puzzle Site: Design Spec

**Date:** 2026-10-27
**Status:** Draft for review

## 1. Purpose & scope

Add an eighth puzzle, **Loop**, the classic Slitherlink. A grid of dots has numbers in some of its cells; the player draws one closed loop along the dotted lines so that every number equals how many of its cell's four sides the loop uses. Every board has exactly one solution **and can be solved by deduction alone** (§5) — no guessing is ever needed.

Tagline: *Draw one loop. Every number counts its sides.*

**In scope (v1)**
- **Daily mode:** one 7×7 board per UTC day, identical for every player. No lives; a daily is either in progress or solved.
- **Practice mode:** unlimited random boards; presets **Small** 5×5, **Medium** 7×7 (default, same as daily), **Large** 10×10.
- Input: tap an edge to cycle empty → line → ✕ → empty; drag across dots to draw or erase lines; right-click an edge toggles ✕. **Undo** and **Clear** buttons.
- Rule breaks are shown live (over-full clue, branching dot). The board is never compared with the solution.
- Separate page `loop.html`, sharing core modules, the `puzzleApp` shell, header, theme, analytics and dashboard with the other seven puzzles. Static site, no backend.

**Out of scope (v1)** — hints, stats/streaks, share button, keyboard play, automatic ✕ around finished clues, a harder preset that needs inside/outside parity reasoning. The design must not block adding these later.

**Success criteria**
- A 10×10 board generates in < 100 ms typically on a laptop (main thread), so it appears effectively instantly.
- Every generated board (all presets, daily) is fully solved by `deduce` (§5), which implies a unique solution — verified in tests and at generation time.
- Large (10×10) fits a 375 px-wide phone without scrolling.

## 2. Rules

**Board.** `size × size` cells (5–10), `(size + 1)²` dots at the cell corners, and **edges** between orthogonally neighbouring dots. Some cells show a **clue** 0–3.

**Edge states.** Each edge is *unknown* (0), *line* (1) or *✕* (2). ✕ is a player note meaning "no line here"; for every rule it counts the same as unknown.

**Goal.**
1. Every dot touches 0 or 2 lines.
2. The lines form exactly one connected closed loop (at least one line).
3. Every clue equals the number of its cell's sides that are lines.

**Win:** all three hold. After a win all input is ignored.

## 3. Architecture

Stack as before: TypeScript + Vite, no UI framework. Generation runs on the main thread. The board is an **SVG** (lines run between dots, not inside cells), sized to the panel with `ui/fit`. The page runs on the shared `ui/puzzleApp` shell (routing, daily/practice, HUD, timer, win card, Undo/Clear/New board, how-to, storage hooks, analytics), like Bridges.

**Page structure:** new Vite entry `loop.html` and `loop: 'loop.html'` in `src/pages.ts`. Hash routes `#/` (daily) and `#/practice?preset=<id>&seed=<n>` (seed optional, used by e2e).

**Indexing.** Cells `r * size + c`. Dots `r * (size + 1) + c`, `r, c` in `0..size`. Edges: horizontal edges first, `H = (size + 1) * size` of them, edge `(r, c)` (dot `(r, c)` to `(r, c + 1)`) at `r * size + c`; then vertical edges, `(r, c)` (dot `(r, c)` to `(r + 1, c)`) at `H + r * (size + 1) + c`. A cell's sides: top `h(r, c)`, bottom `h(r + 1, c)`, left `v(r, c)`, right `v(r, c + 1)`.

| Module | Responsibility | Depends on |
|---|---|---|
| `loop/types` | `Edge`, `Puzzle`, `GameState`, `Move`, `Violations`, `PresetId` | — |
| `loop/geometry` | `geometry(size)` (cached per size): `cellEdges[cell]` (4), `dotEdges[dot]` (2–4), `edgeDots[edge]` (2), `edgeCells[edge]` (1–2), edge midpoints | `types` |
| `loop/solver` | `deduce(size, clues)` — rule fixpoint plus one-step trials (§5); `countSolutions(size, clues, limit)` — backtracking, for tests only | `geometry` |
| `loop/generate` | `generatePuzzle(size, seed): Puzzle` — deterministic; `PRESETS`, `DAILY_PRESET`, `loopDailySeed(date)` | `core/rng`, `geometry`, `solver` |
| `loop/game` | Pure state: cycle, toggleCross, paint, undo, clear, violations, win, encode/restore. No DOM | `types`, `geometry` |
| `loop/input` | Pointer state machine: tap, drag along dots, right-click | `geometry` |
| `loop/board` | SVG renderer: dots, clues, lines, ✕, violation styling, win glow | `game`, `input` |
| `loop/app` | `PuzzleGame` definition for `mountPuzzleApp`: presets, specs, save hooks, board, HUD stat | all above, `ui/puzzleApp` |
| `loop/howto` | How-to modal with a small static example | `ui/modal` |
| `loop/storage` | `loadLoopDaily` / `saveLoopDaily` via `dailyStore`, `getLoopPreset` / `setLoopPreset` via `presetStore` | `core/storage` |
| `loop/main` | Page entry: `trackErrors('loop')`, fonts, `ui/theme.css`, `ui/shell.css`, `loop.css`, mount | `app` |
| `home/puzzles`, `home/previews` | New `PUZZLES` entry + `loopPreview()` SVG | `loop/storage` |

**Core types**
```ts
type Edge = 0 | 1 | 2;                 // 0 unknown, 1 line, 2 ✕
type Puzzle = {
  size: number;                        // cells per side, 5..10
  clues: (number | null)[];            // per cell: 0..3, or null when hidden
  solution: (0 | 1)[];                 // per edge; ✕ is never part of a solution
};
type GameState = {
  puzzle: Puzzle;
  edges: Edge[];                       // per edge
  history: Move[];
  status: 'playing' | 'won';
};
type Move = { edges: number[]; before: Edge[] };  // one tap, one right-click, one drag, or one Clear
type Violations = {
  clues: Set<number>;                  // cells whose clue can no longer be met
  dots: Set<number>;                   // dots with 3 or 4 lines
};
```

**Data flow:** date seed or random seed → `generatePuzzle` → `newGame` → `board` renders → gesture → `input` resolves edges → `game.cycle` / `toggleCross` / `paint` → `board` redraws the changed edges, their dots and cells → `ctx.changed` (shell saves, updates HUD, ends the game on a win).

## 4. Puzzle generation (`generate`)

**Presets**

| Preset | Grid | Label |
|---|---|---|
| `small` | 5×5 | Small |
| `medium` (default, daily) | 7×7 | Medium |
| `large` | 10×10 | Large |

Daily seed: `loopDailySeed(date) = seedFromString('loop-daily:' + isoDate)`, preset `medium`.

**Attempt** (repeat with fresh draws from the same seeded RNG until accepted):
1. **Region.** Draw a target area `A` uniformly in 35–60 % of the cells. Start the inside region with one random cell. Until it has `A` cells or 200 consecutive tries fail: pick a random outside cell orthogonally next to the region and add it if afterwards
   - the outside cells plus the off-board exterior still form one connected area (orthogonal steps; every border cell touches the exterior), so the region has no holes, and
   - no 2×2 block of cells (counting off-board as outside) is inside on one diagonal and outside on the other, so no dot would have 4 lines.

   The inside grows by orthogonal steps, so it is connected. Together these make the region's boundary exactly one closed loop.
2. **Solution.** An edge is a line when exactly one of its two neighbouring cells is inside (off-board counts as outside).
3. **Full clues.** Every cell's clue is its number of line sides. If `deduce` does not return the solution with every clue shown, discard the attempt.
4. **Strip clues.** Visit cells in random order; hide each clue, and put it back if `deduce` then no longer returns the solution.
5. **Accept.** The remaining clues form the puzzle.

`generatePuzzle` tries at most 100 attempts and throws if none is accepted (unreachable in practice; the tests prove every preset generates for 30 seeds). Deterministic per `(size, seed)`. `size` must be 5–10.

## 5. Solver (`solver`)

`deduce(size, clues)` works on a state per edge: unknown, line or cross (the solver's own ✕). Apply the rules until a full pass changes nothing:

- **Cell.** For a clue `n` with `L` line sides and `U` unknown sides: if `L = n`, its unknown sides become crosses; if `L + U = n`, its unknown sides become lines. `L > n` or `L + U < n` → contradiction.
- **Dot.** With `L` lines and `U` unknowns at a dot: `L = 2` → unknowns become crosses; `L = 1, U = 1` → that unknown becomes a line; `L = 0, U = 1` → it becomes a cross. `L > 2`, or `L = 1, U = 0` → contradiction.
- **No early loop.** An unknown edge whose two dots are the two ends of the same line path would close a loop. Closing it is allowed only if the closed loop would then contain every line and every clue would be met; otherwise the edge becomes a cross. (Paths are tracked with a union-find over dots, rebuilt each pass.) When a closing line forms a valid complete loop, every remaining unknown becomes a cross.

When a pass changes nothing and unknowns remain, **one-step trial**: for each unknown edge, copy the state, set the edge to line and run the rules above to their fixpoint; on a contradiction, set the edge to cross in the real state. Then the same with cross (contradiction → line). After the first edge that changes this way, go back to the plain rules. Trials never nest. Stop when neither the rules nor a full trial sweep change anything.

Returns the edges as `(0 | 1)[]` when no unknowns remain and the lines satisfy §2; otherwise `null` (stalled or contradictory). Every step is sound, so a full result is the unique solution. Covers 0s, the classic corner-3, adjacent 3-3 and 0-beside-3 patterns without coding them separately. No inside/outside parity reasoning — that is the "harder preset" left for later.

**`countSolutions(size, clues, limit)`:** plain backtracking over edges with dot and clue pruning, checking single loop at the leaves, stopping at `limit`. Used only by tests, on boards up to 5×5, to cross-check `deduce`.

## 6. Game rules (`game`)

- `newGame(puzzle)`: all edges unknown, empty history, `playing`.
- `cycle(s, edge)`: unknown → line → ✕ → unknown. Pushes a `Move`.
- `toggleCross(s, edge)`: line or unknown → ✕; ✕ → unknown. Pushes a `Move`.
- `paint(s, edges, mode)`: `mode` `'draw'` sets each edge to line (overwriting ✕); `'erase'` sets each line to unknown and leaves ✕ alone. One `Move` for the whole drag; nothing pushed if no edge changed.
- `undo(s)`: revert the last `Move`; ignored when history is empty.
- `clear(s)`: set every edge to unknown as one `Move` (undoable). No-op (nothing pushed) when every edge is already unknown.
- All of the above are ignored after a win.
- `violations(s)`: `clues` = clue cells with more line sides than the clue, or more ✕ sides than `4 − clue`; `dots` = dots with 3 or 4 lines. A closed loop that is not yet the full answer is **not** a violation.
- `matched(s)`: number of clue cells whose line sides equal the clue (HUD `S/N`).
- `isWon(s)`: §2 holds. Checked after each change; sets `status = 'won'`.
- `encode(s)`: one char per edge, `0`/`1`/`2` (✕ included). `restore(puzzle, str)`: rejects wrong length or bad characters; else a game with empty history, `won` if `isWon`.

## 7. Input (`input`) and board (`board`)

**Gestures** (pointer events, one active pointer). Positions are converted to cell units.
- **On a dot:** the pointer is within 0.35 cell of that dot.
- **Tap** (pointer up without having crossed an edge): the edge whose midpoint is nearest the up point, strictly within 0.5 cell → `cycle`. A point exactly 0.5 from several midpoints (a cell centre or a dot) picks no edge.
- **Drag:** starts on the dot nearest the down point, but only once the pointer has moved more than 0.25 cell from it; until then a release is still a tap. After that, whenever the pointer is on a dot orthogonally next to the current one, the edge between them is crossed and that dot becomes current. A pointer that lands on a dot further away (fast move) walks there dot by dot, row first then column, crossing each edge on the way. The first crossed edge sets the mode: line → `'erase'`, otherwise `'draw'`; it applies to every edge in the drag. Edges are applied live while dragging (board shows them) and committed as one `paint` on pointer up. Crossing the same edge twice in one drag is applied once.
- **Right-click** (`contextmenu`, default prevented) on an edge (same nearest-midpoint test) → `toggleCross`.

**Visuals**
- Board surface: shared `glass` panel. Dots: small circles at every corner. Clues: centred numbers; a matched clue dims; a violating clue is red (`#ff5c7a`).
- Lines: thick accent (`#4fd6c3`) strokes with round caps, dot centre to dot centre. ✕: small grey cross at the edge midpoint. Unknown edges are invisible but hit-testable.
- A violating dot shows a red ring.
- Win: a glow travels once around the loop (about 600 ms in total), then the win card slides up. Under `prefers-reduced-motion` the card appears at once.
- Sizing: cell size `clamp(28px, fit-to-panel, 60px)`, with a 0.4 cell margin around the dots (viewBox `-0.4 -0.4 size+0.8 size+0.8`). 10×10 fits 375 px wide at about 29 px per cell, so no `bestOnComputer`. Narrower than about 330 px, Large scrolls sideways, the same limit Bridges' 11×11 has.

## 8. Screens

Header (shared): `puzzles · Loop`, Daily / Practice tabs, "?".

1. **Daily (playing):** subtitle `#N · Oct 27 · 7×7`; board; HUD: matched clues `S/N`, timer mm:ss; buttons **Undo** and **Clear** (Clear asks first, `CLEAR_CONFIRM`).
2. **Daily (solved):** board stays visible; card "Loop closed", time, "Next daily in hh:mm:ss", primary **Play practice**.
3. **Practice:** preset switch (Small · Medium · Large) replaces the subtitle; buttons **Undo**, **Clear**, **New board**. Win card offers **New board**.
4. **How-to ("?"):** modal: draw one closed loop along the dotted lines; each number says how many of its cell's sides the loop uses; the loop never branches or crosses itself; tap an edge to cycle line → ✕ → empty, drag across dots to draw or erase, right-click for ✕. A small static solved 3×3 example. Opens automatically on the first visit (flag `loop-howto-seen`).
5. **Dashboard card:** name "Loop", tagline, `loopPreview()` SVG (a 4×4 loop with a few clues), daily status "Not started", "In progress · mm:ss", "Solved · mm:ss" (`doneWord: 'Solved'`).

`loop.html` copies the whole `<head>` of an existing page (description and `og:description` repeat the tagline, Open Graph/Twitter tags, icons, manifest, Umami). Play events and counted actions go through the shell's play tracker as in the other puzzles.

## 9. Persistence

- **Daily** save via `dailyStore('loop:daily')` (stored under `flow:loop:daily`): `{ v: 1, date, edges: string /* game.encode */, elapsedMs, solved }`. The puzzle is never stored; it is regenerated from the date seed. Undo history is not stored; ✕ marks are.
- Saving, `pagehide`, "a solved save wins over an unsolved tab" (`supersedes` / `ownsSave`), and discarding other dates, wrong versions or data `restore` rejects are the shell's existing behaviour, wired as in Bridges.
- **Practice:** not persisted. Only the preset (`loop:preset`) and the how-to flag are remembered.
- All storage access is wrapped by `core/storage`; the game works without storage.

## 10. Error handling

- `localStorage` unavailable / quota exceeded: play continues without persistence or first-visit flag.
- Corrupt or stale save: discarded silently.
- `generatePuzzle` throws only when no attempt is accepted (§4) or `size` is outside 5–10; uncaught errors reach Umami through `trackErrors`.

## 11. Testing

**Unit (Vitest)**
- `geometry`: edge counts (`2 * size * (size + 1)`); `cellEdges`, `dotEdges`, `edgeDots`, `edgeCells` for 1×1 and 3×3 fixtures; corner dots have 2 edges, border dots 3, inner dots 4.
- `solver`: hand-built fixtures — a 0 crosses its four sides; a corner 3 forces its two outer sides; adjacent 3-3 forces the three parallel edges; the no-early-loop rule crosses a closing edge; a board needing a trial is solved; a board with two solutions stalls (`null`); a contradictory board returns `null`. `countSolutions` counts 1 / 2 (stops at limit) / 0 on the same fixtures.
- `generate`: deterministic per `(size, seed)` (snapshot per preset); solution is one loop with every dot at 0 or 2 lines; shown clues equal the solution's side counts; `deduce` returns exactly `solution` for seeds 1..30 per preset; the brute-force `countSolutions(…, 2) === 1` check on Small boards runs only under `SLOW=1` (`npm run test:slow`), seeds 1..10; daily for a fixed date is stable; time budget for `large`; throws for sizes 4 and 11.
- `game`: cycle order; toggleCross; paint draw and erase as one undo step, erase leaves ✕; clear and its undo; clear on an empty board pushes nothing; clue and dot violations; a closed loop that misses a clue, and a correct loop plus a stray second loop, do not win; win detection; actions ignored after win; encode/restore round trip with ✕, rejection of bad length and characters.
- `input`: tap resolves the nearest edge; a drag's mode comes from its first edge; a jump across dots fills the edges between; an edge crossed twice is applied once.
- `storage`: round trip, date mismatch, corrupt data, bad characters, throwing storage.
- `home/puzzles`: Loop entry and its status labels.

**E2E (Playwright)** — `#/practice?preset=small&seed=<n>`:
- Tapping every solution edge reaches the win card "Loop closed".
- A drag across three dots draws two lines; dragging back over them erases them.
- Right-click places ✕.
- Undo reverts a gesture; Clear removes everything and Undo brings it back.
- Reload mid-daily restores lines and ✕.
- `home.spec.ts`: `loop-howto-seen` added to the `beforeEach`; `/loop.html` added to its page lists; the dashboard shows the Loop card and its status.

## 12. Delivery notes

- Work goes on a feature branch `feat/loop` cut from `main`. Conventional commits scoped `loop` (`feat(loop): …`). Never pushed.
- README's puzzle table gains a Loop row.

## 13. Future (not v1)

- Hints (reveal one forced edge), stats/streaks, share button.
- Keyboard play.
- Auto-✕ the remaining sides of a finished clue.
- A harder preset whose solver also uses inside/outside parity.
