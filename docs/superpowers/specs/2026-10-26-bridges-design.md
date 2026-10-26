# Bridges — Hashi Island Puzzle for the Puzzle Site: Design Spec

**Date:** 2026-10-26
**Status:** Draft for review

## 1. Purpose & scope

Add a seventh puzzle, **Bridges**, the classic Hashiwokakero. Numbered islands sit on a grid; the player connects them with horizontal and vertical bridges so that every island has exactly as many bridges as its number, no bridges cross, and all islands form one connected network. Every board has exactly one solution **and can be solved by deduction alone** — no guessing is ever needed.

Tagline: *Connect every island. Match every number.*

**In scope (v1)**
- **Daily mode:** one 9×9 board per UTC day, identical for every player. No lives; a daily is either in progress or solved.
- **Practice mode:** unlimited random boards; presets **Small** 7×7, **Medium** 9×9 (default, same as daily), **Large** 11×11.
- Input: drag from an island toward a neighbour, or tap the gap between two islands, to cycle that pair 0 → 1 → 2 → 0 bridges. Right-click a gap removes one bridge. **Undo** and **Clear** buttons.
- Rule breaks are shown live (island over its number; split network once every island is satisfied). The board is never compared with the solution.
- Separate page `bridges.html`, sharing core modules, the site header, theme, analytics and dashboard with Flow, Mines, Tangle, Queens, Patches and Balanced. Static site, no backend.

**Out of scope (v1)** — hints, stats/streaks, share button, keyboard play, a "lock satisfied island" toggle, larger or harder presets. The design must not block adding these later.

**Success criteria**
- An 11×11 board generates in < 50 ms typically on a laptop (main thread), so it appears effectively instantly.
- Every generated board (all presets, daily) is fully solved by the deduction solver (§5), which implies a unique solution — verified in tests and at generation time.
- Large (11×11) fits a 375 px-wide phone without scrolling.

## 2. Rules

**Board.** `size × size` cells (7–11); cells are flat indices `r * size + c`. Some cells are **islands**, each with a number `n` in 1–8. No two islands are orthogonally adjacent.

**Links.** A **link** is a possible bridge site: two islands in the same row or column with only empty cells between them (each island has at most one link per direction — to its nearest island that way). A link carries 0, 1 or 2 bridges. Two links **cross** when one is horizontal, the other vertical, and their inner cells intersect.

**Goal.**
1. Each island's bridge total (sum over its links) equals its number.
2. No two crossing links both carry bridges.
3. All islands are connected through links that carry bridges.

**Win:** all three hold. After a win all input is ignored.

## 3. Architecture

Stack as before: TypeScript + Vite, no UI framework. Generation runs on the main thread. The board is an **SVG** (bridges are lines between islands, not cell contents), sized to the panel.

**Page structure:** new Vite entry `bridges.html` (eighth input in `vite.config.ts`). Hash routes `#/` (daily) and `#/practice?preset=<id>&seed=<n>` (seed optional, used by e2e).

| Module | Responsibility | Depends on |
|---|---|---|
| `bridges/types` | `Island`, `Link`, `Puzzle`, `GameState`, `Move`, `Violations`, `PresetId`, `Count` | — |
| `bridges/geometry` | `buildLinks(size, islands)`: nearest neighbour per direction → sorted `Link[]`, per-island link lists, crossing lists | `types` |
| `bridges/solver` | `deduce(puzzle)` — range fixpoint (§5); `countSolutions(puzzle, limit)` — backtracking, for tests only | `types` |
| `bridges/generate` | `generatePuzzle(size, seed): Puzzle` — deterministic; `PRESETS`, `DAILY_PRESET`, `bridgesDailySeed(date)` | `core/rng`, `geometry`, `solver` |
| `bridges/game` | Pure state: cycle, remove, undo, clear, violations, win, encode/restore. No DOM | `types` |
| `bridges/input` | Pointer state machine: tap on a gap, drag from an island (direction snap), right-click | `types` |
| `bridges/board` | SVG renderer: grid dots, islands, single/double bridges, drag preview, satisfied/over styling, crossing flash, win pulse | `game`, `input` |
| `bridges/app` | Routing, daily number/date, HUD, timer, win card, Undo/Clear/New, how-to, storage, analytics | all above, `core/daily`, `core/storage`, `core/analytics`, `ui/header`, `ui/modal` |
| `bridges/howto` | How-to modal with a small static example | `ui/modal` |
| `bridges/main` | Page entry: fonts, `ui/theme.css`, `ui/shell.css`, `bridges.css`, `mountBridges` | `app` |
| `core/storage` | Gains `loadBridgesDaily` / `saveBridgesDaily`, `getBridgesPreset` / `setBridgesPreset`, flag `bridges-howto-seen` | — |
| `home/puzzles`, `home/previews` | New `PUZZLES` entry + `bridgesPreview()` SVG | `core/storage` |

The shared header needs no change (`createHeader({ game: 'Bridges', onHelp })`).

**Core types**
```ts
type Count = 0 | 1 | 2;
type Island = { cell: number; n: number };   // n in 1..8
type Link = {
  a: number; b: number;      // island indices, a < b; a is left of / above b
  horizontal: boolean;
  inner: number[];           // cells strictly between the islands (≥ 1)
  crosses: number[];         // indices of links that cross this one
};
type Puzzle = {
  size: number;
  islands: Island[];         // sorted by cell
  links: Link[];             // sorted by (a, b)
  islandLinks: number[][];   // link indices per island
  solution: Count[];         // per link
};
type GameState = {
  puzzle: Puzzle;
  bridges: Count[];          // per link
  history: Move[];
  status: 'playing' | 'won';
};
type Move = { links: number[]; before: Count[] };  // one gesture or one Clear
type Violations = {
  over: Set<number>;         // islands with more bridges than n
  split: Set<number>;        // islands outside the largest component, only when every island is satisfied
};
```

**Data flow:** date seed or random seed → `generatePuzzle` → `newGame` → `board` renders → gesture → `input` resolves a link → `game.cycle` / `game.remove` → `board` re-renders that link and the two islands, plus violation styling → `app` updates HUD, win card, storage.

## 4. Puzzle generation (`generate`)

**Presets**

| Preset | Grid | Islands | Extra-link chance |
|---|---|---|---|
| `small` | 7×7 | 10–13 | 0.4 |
| `medium` (default, daily) | 9×9 | 17–22 | 0.4 |
| `large` | 11×11 | 26–32 | 0.4 |

Daily seed: `seedFromString('bridges-daily:' + isoDate)`, preset `medium`.

**Attempt** (repeat with fresh draws from the same seeded RNG until accepted):
1. **Seed.** Place one island on a random cell. Track laid bridges as `(island, island, count)` and the cells they occupy.
2. **Grow.** Until the island count reaches the preset's maximum or 200 consecutive tries fail: pick a random existing island and a random direction; pick a distance ≥ 2 that keeps the new cell on the board. Reject when the new cell is an island or occupied by a bridge, is orthogonally adjacent to an island, or any cell on the way is an island or a laid bridge. Otherwise place the new island and lay 1 bridge (60 %) or 2 (40 %) between them.
3. **Extra links.** After placing a new island, with the preset's chance, also join it to one other island it sees directly in another direction (nearest island that way, path free of bridges), with 1 or 2 bridges. This adds cycles; a pure tree makes boards too easy.
4. **Numbers.** Each island's number is its bridge total; an island whose total would exceed 8 never receives more (checked before laying).
5. **Accept** when the island count is within the preset's range and `deduce` returns exactly the generated bridges. Otherwise next attempt.

`buildLinks` is run on the final islands, so `links` includes every visible pair, not only the ones the generator used; `solution` is 0 on unused links. `generatePuzzle` tries at most 300 attempts and throws if none is accepted (unreachable in practice; the tests prove every preset generates for 50 seeds). Deterministic per `(size, seed)`. `size` must be 7–11.

## 5. Solver (`solver`)

Each link has a range `[min, max]`, initially `[0, min(2, nA, nB)]`. Repeat until a full pass changes nothing:

- **Crossing.** A link with `min ≥ 1` sets `max = 0` on every link in its `crosses`.
- **Capacity.** For island `i` with number `n`: `sumMax` = Σ max over its links, `sumMin` = Σ min. For each link `l`: `min_l ≥ n − (sumMax − max_l)` and `max_l ≤ n − (sumMin − min_l)`. If `sumMax < n` or `sumMin > n` → contradiction.
- **Isolation.** Components are the island groups joined by links with `min ≥ 1`. For each link `l` with `max_l > min_l`, and each `k` from `max_l` down to `min_l + 1`: tentatively set `l = k` with every other link at its `min`; if the component containing `l` then has every island saturated (total = number) and is not every island, `k` is impossible — set `max_l = k − 1` and try the next `k`. This covers "1–1", "2=2" and their general form.
- **Reachability.** If a component is not every island and every link leaving it has `max = 0` → contradiction.

A range with `min > max` is a contradiction → return `null`. Returns the bridge counts when every range is fixed, the counts satisfy §2, and the network is connected; otherwise `null` (stalled). Every step is sound, so a full result is the unique solution.

**`countSolutions(puzzle, limit)`:** plain backtracking over links (0/1/2) with crossing and capacity pruning, checking connectivity at the leaves, stopping at `limit`. Used only by tests to cross-check `deduce`.

## 6. Game rules (`game`)

- `newGame(puzzle)`: all links 0, empty history, `playing`.
- `cycle(s, link)`: 0 → 1 → 2 → 0. Refused (returns `{ blockedBy }`, nothing pushed) when going 0 → 1 while a crossing link carries bridges; `blockedBy` lists those links for the flash. Otherwise pushes a `Move`. Ignored after a win.
- `remove(s, link)`: 2 → 1, 1 → 0; no-op at 0. Pushes a `Move`. Ignored after a win.
- `undo(s)`: revert the last `Move`; ignored when history is empty or the game is won.
- `clear(s)`: set every link to 0 as one `Move` (undoable). No-op (nothing pushed) when no link carries bridges.
- `violations(s)`: `over` = islands whose total exceeds `n`. `split` is computed only when every island's total equals its `n`: the islands outside the largest connected component (ties broken by lowest island index).
- `isWon(s)`: every island total equals `n` and the network is connected (crossings are impossible by construction). Checked after each `cycle`, `remove` and `undo`; sets `status = 'won'`.
- `encode(s)`: one char per link, `0`/`1`/`2`. `restore(puzzle, str)`: rejects wrong length, bad characters, or two crossing links both non-zero; else a game with empty history (status `won` if `isWon`).

## 7. Input (`input`) and board (`board`)

**Gestures** (pointer events, one active pointer):
- **Tap** (pointer up before it has moved 0.4 cell, not started on an island): the link whose inner segment is nearest the point, within 0.5 cell of the segment's centre line → `cycle`.
- **Drag from an island:** once the pointer moves ≥ 0.4 cell, snap to the dominant axis direction; if the island has a link that way, show a dashed preview to the neighbour. Releasing with the preview shown → `cycle` that link. Releasing back on the island or where there is no link → nothing.
- **Tap on an island:** nothing.
- **Right-click** (`contextmenu`, default prevented) on a gap → `remove`.

**Visuals**
- Board surface: shared `glass` panel; faint dots at cell centres for alignment.
- Islands: circles ~70 % of a cell, number centred. Satisfied (total = `n`): filled accent (`#4fd6c3`) with dark number. Over (`over`): red (`#ff5c7a`) ring and number. `split` islands pulse red once each time `split` becomes non-empty.
- Bridges: 2 px lines island edge to island edge; a double bridge is two parallel lines 6 px apart.
- Refused crossing: the blocking bridges flash red for 300 ms.
- Win: bridges pulse once in breadth-first order from island 0 (40 ms per step), then the win card slides up. Disabled under `prefers-reduced-motion`.
- Sizing: cell size `clamp(28px, fit-to-panel, 56px)`; 11×11 at 28 px fits 375 px wide with the 16 px page gutter.

## 8. Screens

Header (shared): `puzzles · Bridges`, Daily / Practice tabs, "?".

1. **Daily (playing):** subtitle `#N · Oct 26 · 9×9`; board; HUD below: satisfied islands `S/N`, timer mm:ss; buttons **Undo** and **Clear**.
2. **Daily (solved):** board stays visible; card "All connected", time, "Next daily in hh:mm:ss", primary **Play practice**.
3. **Practice:** preset switch (Small · Medium · Large) replaces the subtitle; buttons **Undo**, **Clear**, **New board** (primary). Win card offers **New board**.
4. **How-to ("?"):** modal: connect the islands with bridges; each number says how many bridges touch that island; bridges run straight, at most two between a pair, never cross; all islands must join into one network; drag from an island or tap a gap to add, right-click to remove. A small static solved example with 5 islands, one single and one double bridge. Opens automatically on the first visit.
5. **Dashboard card:** name, tagline, `bridgesPreview()` SVG (4 islands, one single and one double bridge), daily status: "Not started", "In progress · mm:ss", "Solved · mm:ss".

The timer starts when the board appears and stops on win. Daily number uses `dailyNumber` from `core/daily`. Play start/end events go through `createPlayTracker('bridges')` as in the other puzzles.

## 9. Persistence

- **Daily** save under key `bridges:daily`: `{ v: 1, date, links: string /* game.encode */, elapsedMs, solved }`. The puzzle is never stored; it is regenerated from the date seed. Undo history is not stored.
- Written after every change and on `pagehide`. A tab never overwrites a solved save (another tab finished first → reload from storage instead).
- On load: restore if `date` is today and `restore` accepts `links`; a solved daily reopens solved with its card. Other dates, wrong versions or data `restore` rejects → discard silently.
- **Practice:** not persisted. Only the preset (`bridges:preset`) and the how-to flag are remembered.
- All storage access wrapped in try/catch; the game works without storage.

## 10. Error handling

- `localStorage` unavailable / quota exceeded: play continues without persistence or first-visit flag.
- Corrupt or stale save: discarded silently.
- `generatePuzzle` throws only when no attempt is accepted (§4) or `size` is outside 7–11.

## 11. Testing

**Unit (Vitest)**
- `geometry`: nearest-neighbour links (an intermediate island blocks the farther one, so only the nearer pair is linked); at most one link per island per direction; `crosses` symmetric and correct for a plus-shaped fixture.
- `solver`: hand-built fixtures — a corner 4 forces 2+2; two 1s are never joined to each other (unless they are the only islands); a placed bridge removes a crossing option; a deducible board is solved; a board with two solutions stalls (`null`); a contradictory board returns `null`. `countSolutions` counts 1 / 2 (stops at limit) / 0 on the same fixtures.
- `generate`: deterministic per `(size, seed)` (snapshot per preset); island count within range; no two islands adjacent; numbers 1–8 and equal to the solution totals; solution crossing-free and connected; `deduce` returns exactly `solution` and `countSolutions(…, 2) === 1`, seeds 1..50 per preset; daily for a fixed date is stable; time budget for `large`; throws for sizes 6 and 12.
- `game`: cycle order; crossing refused with `blockedBy`; remove; undo of a gesture and of clear; clear on an empty board pushes nothing; `over`; satisfied-but-split gives `split` and no win; win detection; actions ignored after win; encode/restore round trip and rejection of bad length, bad characters and crossing pairs.
- `input`: tap resolves the nearest link; drag snaps direction; short drag and drag with no link do nothing.
- `storage`: round trip, date mismatch, corrupt data, bad characters, throwing storage.
- `home/puzzles`: Bridges entry and its status labels.

**E2E (Playwright)** — `#/practice?preset=small&seed=<n>`:
- Tapping each link's gap to its solution count reaches the win card "All connected".
- A drag from an island to its neighbour adds a bridge.
- Putting too many bridges on an island shows it red.
- Undo reverts a gesture; Clear removes all bridges and Undo brings them back.
- Reload mid-daily restores the bridges.
- The dashboard shows the Bridges card and its status.

## 12. Delivery notes

- Work goes on a feature branch `feat/bridges` cut from `main`. Never pushed.

## 13. Future (not v1)

- Hints (reveal one forced bridge), stats/streaks, share button.
- Keyboard play.
- Tap an island to lock it once satisfied, greying its remaining links.
- A harder preset whose solver needs pair/subset reasoning.
