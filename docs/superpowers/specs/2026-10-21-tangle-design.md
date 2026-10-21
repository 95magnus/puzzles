# Tangle — Arrow Puzzle for the Puzzle Site: Design Spec

**Date:** 2026-10-21
**Status:** Draft for review

## 1. Purpose & scope

Add a third puzzle, **Tangle**, to the puzzle site. A large square board is packed edge to edge with snake-like arrows ("spaghetti"). Tapping an arrow sends it sliding out of the board head-first; if another arrow is in its way it bumps, and you lose one of 3 lives. Some arrows block others, so they must be removed in a workable order. Clear every arrow to clear the level.

Tagline: *Tap arrows out of the knot. Don't crash.*

**In scope (v1)**
- **Daily mode:** one 40×40 board per UTC day, identical for every player. 3 lives per attempt. Losing all 3 shows "Out of lives"; **Try again** replays the same board from the start with 3 fresh lives as the next attempt (attempts counted, as in Mines; a win is final).
- **Practice mode:** unlimited random boards; presets **Medium** 30×30, **Hard** 40×40 (default, same as daily), **Huge** 50×50. Losing all lives ends that board.
- Boards are always solvable and ~97–99 % of cells are covered by arrows.
- Separate page `tangle.html`, sharing core modules, the site header, theme and dashboard with Flow and Mines. Static site, no backend.

**Out of scope (v1)** — undo, hints, stats/streaks, share button, keyboard play, zoom/pinch. The design must not block adding these later.

**Success criteria**
- A 40×40 board generates in < 150 ms on a laptop (main thread), so it appears instantly.
- Every generated board (all presets, daily) is solvable — verified by the solver in tests and at generation time.
- Hard (40×40) fits a laptop screen (≥ 1280×720) without scrolling.
- No tap during an animation costs a life.

## 2. Rules

**Board.** A `cols × rows` grid. Each arrow is a chain of orthogonally adjacent cells (its body), stored tail → head. The head carries an arrowhead pointing in one of four directions (up, right, down, left). Bodies bend freely, never overlap, and the cell behind the head is always the previous body cell in the straight line opposite the direction (the arrow has a straight "neck").

**Exit line.** The cells in a straight line from the head (exclusive) to the board edge in the head's direction. An arrow is **free** when no other live arrow occupies any cell of its exit line. No arrow's exit line ever crosses its own body (guaranteed by the generator).

**Tap.** Tapping any cell of a live arrow launches it:
- **Free:** it slides out snake-style — the head moves straight along the exit line, the body follows its own path cell by cell — until fully off the board, then it is removed.
- **Blocked:** the head slides along the exit line until it touches the first blocking arrow, bumps (both arrows flash red), you lose a life, and the arrow slides back to its starting position. Nothing else changes.

Input is locked while an arrow animates, so a double-tap never costs a second life.

**Win:** every arrow removed. **Loss:** lives reach 0. After either, all taps are ignored.

Removing a free arrow never makes the board worse, so there are no dead ends; the challenge is reading the tangle and identifying which arrows are free without spending lives.

## 3. Architecture

Stack as Flow/Mines: TypeScript + Vite, no UI framework. The board is rendered as **SVG** (arrows are continuous bent strokes), not a DOM grid.

**Page structure:** new Vite entry `tangle.html` (fourth input in `vite.config.ts`). Inside the page, hash routes `#/` (daily) and `#/practice?preset=<id>&seed=<n>` (seed optional, used by e2e).

| Module | Responsibility | Depends on |
|---|---|---|
| `tangle/types` | `Arrow`, `Level`, `GameState`, `PresetId`, `LevelSpec` | — |
| `tangle/generate` | `generateLevel(spec, rng): Level` — deterministic; `PRESETS`, `DAILY_PRESET`, `tangleDailySeed(date)` | `core/rng`, `solver` |
| `tangle/solver` | `exitLine`, `blockersOf`, `analyze(level) → { order, initiallyFree, depth } \| null` | `types` |
| `tangle/game` | Pure state + `tap(i)`: exit / bump / ignored, lives, win/loss, encode/restore. No DOM | `solver` |
| `tangle/board` | SVG renderer, hit-testing by cell, slide-out and bump animations, input lock | `game` |
| `tangle/app` | Routing, daily number/date, HUD, timer, end cards, Try again, how-to, storage | all above, `core/daily`, `core/storage`, `ui/header`, `ui/modal` |
| `tangle/howto` | How-to modal with an animated mini example | `ui/howto` |
| `tangle/main` | Page entry: fonts, `ui/theme.css`, `ui/shell.css`, `tangle.css`, `mountTangle` | `app` |
| `core/storage` | Gains `loadTangleDaily` / `saveTangleDaily`, `getTanglePreset` / `setTanglePreset`, flag `tangle-howto-seen` | — |
| `home/puzzles`, `home/previews` | New `PUZZLES` entry + `tanglePreview()` SVG | `core/storage` |

The shared header needs no change (`createHeader({ game: 'Tangle', onHelp })`).

**Core types**
```ts
type Dir = 0 | 1 | 2 | 3;               // up, right, down, left
type Arrow = {
  cells: number[];                       // tail → head; index = r * cols + c
  dir: Dir;
  color: number;                         // index into ui/palette PALETTE
};
type Level = { cols: number; rows: number; arrows: Arrow[] };
type LevelSpec = { cols: number; rows: number; maxLen: number; blockBias: number };
type GameState = {
  level: Level;
  alive: Uint8Array;                     // 1 = still on the board, per arrow
  occ: Int32Array;                       // cell → arrow index, -1 = empty (live arrows only)
  lives: number;                         // 3 → 0
  status: 'playing' | 'won' | 'lost';
  left: number;                          // live arrow count
};
type TapResult =
  | { kind: 'ignored' }
  | { kind: 'exit'; arrow: number; distance: number }               // distance = exit-line length
  | { kind: 'bump'; arrow: number; blocker: number; distance: number }; // cells travelled before contact
```

**Data flow:** date seed or random seed → `generateLevel` → `newGame` → `board` renders → tap → `game.tap` → `board` animates the result → `app` updates HUD, end card, storage.

## 4. Board generation (`generate`)

**Presets**

| Preset | Grid | maxLen | blockBias | Approx. arrows |
|---|---|---|---|---|
| `medium` | 30×30 | 12 | 1 | ~150 |
| `hard` (default, daily) | 40×40 | 14 | 4 | ~325 |
| `huge` | 50×50 | 16 | 4 | ~530 |

Daily seed: `seedFromString('tangle-daily:' + isoDate)`, preset `hard`.

**Phase 1 — reverse construction.** Repeat until K consecutive candidates fail (K ≈ 30·cols):
1. Pick a seeded random empty head cell `h` and direction `d`. Reject if any cell of `h`'s exit line is occupied (by an earlier arrow), or if the neck cell (behind `h`, opposite `d`) is out of bounds or occupied.
2. Grow the body from the neck by a seeded random walk into empty cells, never into the arrow's own exit line, up to a random length in `[3, maxLen]`; straight steps are slightly favoured so arrows read as long strands.
3. **Difficulty bias:** draw `blockBias` candidates (see table) and keep the one whose cells cross the most exit lines of earlier arrows (ties → first drawn). This lengthens blocking chains.
4. Commit the arrow. Colour = seeded pick from the 9-colour palette, re-drawn once if it equals the colour of an adjacent arrow.

Every arrow's exit line was clear of all earlier arrows (and of its own body) when it was placed; only later arrows can block it. So removing arrows in reverse placement order always works.

**Phase 2 — gap fill.** Up to 6 passes over the remaining empty cells, in seeded order. For each empty cell `c`:
- (a) if `c` is orthogonally adjacent to some arrow's **tail**, and `c` is not in that arrow's own exit line, tentatively prepend `c` to that arrow;
- (b) otherwise, with an empty neighbour `n`, tentatively add a 2-cell arrow on `c`+`n` pointing along the pair (either way round);
- keep the change only if `solver.analyze` still returns a solution (blocking graph acyclic); otherwise undo.
Stop when a pass changes nothing. Remaining isolated single cells stay empty.

**Quality gate.** After generation, `analyze` must succeed (always, by construction). For `hard`/`huge`: if fill < 95 % or more than 20 % of arrows are free at the start, regenerate with the next sub-seed (`seed + 1`, …, at most 8 tries, then accept the best). Deterministic, so the daily is identical everywhere.

**Performance.** `analyze` builds the blocking graph in O(arrows × exit-line length) and runs Kahn's algorithm; the gap-fill pass may call it a few hundred times. Target < 150 ms for `hard`, < 400 ms for `huge`. If `huge` exceeds the target, it moves to a worker following the existing `gen/client` pattern; `hard`/daily stay on the main thread.

## 5. Solver (`solver`)

- `exitLine(level, i)`: cell indices from the head to the edge.
- `blockersOf(level, occ, i)`: distinct live arrows in `i`'s exit line, nearest first.
- There is no separate `isFree`: callers test `blockersOf(...).length === 0`.
- `analyze(level)`: build edges `blocker → blocked` for every arrow pair; Kahn's algorithm. Returns `null` if a cycle exists, else `{ order, initiallyFree, depth }` where `depth` is the longest chain length. Used by the generator, tests and the e2e helper.

## 6. Game rules (`game`)

- `newGame(level)`: all arrows alive, `lives = 3`, `status = 'playing'`.
- `tap(state, cell)`: `ignored` unless playing and the cell holds a live arrow. Otherwise find the nearest blocker on the exit line:
  - none → remove the arrow (`alive = 0`, clear `occ`, `left--`), `exit`; if `left === 0` → `won`.
  - blocker `j` at distance `k` → `lives--`, `bump`; if `lives === 0` → `lost`.
- `encode(state)`: one char per arrow, `'1'` alive / `'0'` removed. `restore(level, removed, lives)` validates length and characters and rebuilds `occ`.
- The game state changes immediately on tap; the board's animation is presentation only. While it plays, `board` ignores further taps.

## 7. Visual design

Reuses the "Dusk" theme (background glows, glass board panel, Inter) from `ui/theme.css`.

**Arrows — "neon strokes" (approved in prototype).**
- Body: SVG `<path>` through cell centres, `stroke-width = 26 %` of the cell size, round caps and joins, colour from `ui/palette` `PALETTE`.
- Head: a filled triangle centred on the head cell, pointing in `dir`, with size ≈ 42 % of the cell, slightly rounded (stroke-linejoin round), same colour.
- Board background: the existing glass panel; faint grid lines are not drawn (the tangle provides the texture).
- Bump: arrow and blocker turn `#ff5c7a` for ~250 ms.

**Motion** (disabled under `prefers-reduced-motion`, where exits/bumps resolve instantly with a brief red flash on a bump):
- Exit: the arrow slides along its track (its cells + exit line) at ~30 cells/s, capped at 600 ms total; the board clips it at the edge.
- Bump: head slides to contact (0.35 cell overlap), flash, slides back; ≤ 500 ms.
- End card slides up (shared modal).

**Sizing:** cell size `clamp(12px, fit-to-panel, 28px)`, measured from the real page chrome. Hard (40×40) is ~13 px per cell on a 1280×720 screen without scrolling. Huge and all boards on phones may overflow at the 12 px minimum; then the board panel scrolls on its own and the page never scrolls horizontally. Hit-testing works by cell, so the whole body of an arrow is the tap target.

## 8. Screens

Header (shared): `puzzles · Tangle`, Daily / Practice tabs, "?".

1. **Daily (playing):** subtitle `#N · Wed Oct 21 · 40×40 · 325 arrows`; board; HUD below: lives `♥♥♥` (lost lives as outlines), arrows left, timer mm:ss, and `Attempt N` from attempt 2.
2. **Daily (won):** board dims; card "Untangled ✦", time, `first try` / `attempt N`, "Next daily in hh:mm:ss", primary **Play practice**.
3. **Daily (out of lives):** board stays visible; dialog centred over it: "Out of lives", % of arrows cleared, time, next-daily countdown, **Try again** (primary) and **Play practice**.
4. **Practice:** preset switch (Medium · Hard · Huge) replaces the subtitle; buttons **New board** (primary) and **Restart** (same board, 3 lives). End cards offer **New board**.
5. **How-to ("?"):** modal: tap an arrow to slide it out; it can't turn; if something is in the way it bumps and you lose a life; 3 lives; clear every arrow. A small looping animated example shows one free exit and one bump. Opens automatically on the first visit to the page.
6. **Dashboard card:** name, tagline, `tanglePreview()` SVG (a small static tangle), daily status. Status labels: "Not started", "In progress · mm:ss", "Cleared · mm:ss", and for an out-of-lives daily "Out of lives · attempt N" (the dashboard's `lost` label becomes per-puzzle via a new optional `lostWord` on `PuzzleEntry`; Mines keeps "Boom").

The timer starts when the board appears and stops on win or loss. Daily number uses `dailyNumber` from `core/daily`.

## 9. Persistence

- **Daily** save under key `tangle:daily`: `{ v: 1, date, removed: string /* one char per arrow: 1 = still on the board, 0 = removed */, lives, elapsedMs, status, attempt }`. The level is never stored; it is regenerated from the date seed.
- Written after every tap that changes state and on `pagehide`. A tab never overwrites a won save or a later attempt (same rule as Mines).
- On load: restore if `date` is today and `removed.length` equals today's arrow count; a won or lost daily reopens in its end state (lost offers Try again). Other dates, wrong versions, wrong lengths, invalid characters or `lives` outside 0–3 → discard silently.
- **Practice:** not persisted. Only the preset (`tangle:preset`) and the how-to flag are remembered.
- All storage access wrapped in try/catch; the game works without storage.

## 10. Error handling

- `localStorage` unavailable / quota exceeded: play continues without persistence or first-visit flag.
- Corrupt or stale save: discarded silently.
- Generator quality gate exhausted: the best attempt is used (still solvable by construction). `generateLevel` throws only for an impossible spec (grid < 4×4), unreachable with the fixed presets.

## 11. Testing

**Unit (Vitest)**
- `generate`: same `(spec, seed)` → identical level (snapshot of a hash per preset); no overlapping cells; every arrow has length ≥ 2, a straight neck, and an exit line that misses its own body; `analyze` succeeds; fill ≥ 95 % (hard/huge, over 20 seeds); initially-free ≤ 20 % for hard; daily level for a fixed date is stable; time budget for hard.
- `solver`: hand-built fixtures — single free arrow, two-arrow chain, nearest-blocker ordering, a constructed cycle returns `null`, `depth` / `initiallyFree` values.
- `game`: exit removes and decrements; bump costs a life and changes nothing else; win on last arrow; loss on third bump; taps on empty cells and after the end are ignored; encode/restore round trip and rejection of bad input.
- `storage`: round trip, date mismatch, corrupt data, throwing storage.
- `home/puzzles`: Tangle entry status labels including "Out of lives · attempt N"; Mines still shows "Boom".

**E2E (Playwright)** — `#/practice?preset=medium&seed=<n>`:
- Tapping arrows in the solver's order (exposed by a test helper computing it from the same seed) reaches the win card.
- Tapping a known blocked arrow costs one heart; three bumps show the out-of-lives card, and Try again on the daily restores 3 lives and shows `Attempt 2`.
- Reload mid-daily restores removed arrows, lives and attempt.
- The dashboard shows the Tangle card and its status.

## 12. Delivery notes

- Work goes on a feature branch `feat/tangle` cut from `main`.
- The prototype shown during brainstorming (reverse construction + gap fill + snake animation) is throwaway; it validated packing density and the visual style, not code to keep.

## 13. Future (not v1)

Hints (flash one free arrow at a cost), undo, stats/streaks + share, pinch-zoom on phones, keyboard play.
