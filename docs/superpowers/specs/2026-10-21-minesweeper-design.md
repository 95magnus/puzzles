# Mines — Minesweeper for the Puzzle Site: Design Spec

**Date:** 2026-10-21
**Status:** Draft for review

## 1. Purpose & scope

Add a second puzzle, **Minesweeper ("Mines")**, to the Flow daily-puzzle site. Boards are big and hard; controls are classic desktop Minesweeper.

**In scope (v1)**
- **Daily mode:** one 30×20 board with 130 mines (~22%) per UTC day, identical for every player. **One shot:** hitting a mine ends today's daily.
- **Practice mode:** unlimited random boards; presets **Classic** 30×16/99, **Expert+** 30×20/130 (default), **Huge** 50×30/320. Hitting a mine ends that board.
- **Classic random mine placement** (not no-guess). Guessing is part of the game.
- Controls: left = reveal, right = flag, left + right = chord. Minimal touch fallback.
- Separate page `minesweeper.html` sharing the core modules and visual theme with Flow. Static site, no backend.

**Out of scope (v1)** — no-guess generation, "?" marks, stats/streaks, share button, keyboard play, a shared single-page shell with Flow. The design must not block adding these later.

**Success criteria**
- Board appears instantly (< 50 ms generation, no worker).
- Chording feels exactly like desktop Minesweeper: no stray reveal or flag after a chord, either button order works.
- Expert+ fits a laptop screen (≥ 1280×720) without scrolling.

## 2. Architecture

Stack as Flow: TypeScript + Vite, no UI framework. Board rendered as a **DOM CSS grid** (≤ 1,500 cells), not SVG.

**Page structure:** Vite multi-page build. `index.html` (Flow) and `minesweeper.html` (Mines) are separate entries; each page header links to the other. Inside the Mines page, hash routes `#/` (daily) and `#/practice`.

| Module | Responsibility | Depends on |
|---|---|---|
| `minesweeper/generate` | `generateBoard(spec, rng): Board` — deterministic | `core/rng` |
| `minesweeper/game` | Pure state + actions: reveal, flag, chord, win/loss. No DOM | — |
| `minesweeper/input` | Pure mouse/touch state machine → actions. No DOM | — |
| `minesweeper/board` | DOM grid renderer; feeds DOM events to `input`, applies actions to `game` | `game`, `input` |
| `minesweeper/app` | Routing, daily number/date, HUD, timer, end cards, how-to | all above, `core/daily`, `core/storage` |
| `core/storage` | Gains `loadMinesDaily` / `saveMinesDaily` | — |
| `styles/tokens.css` | "Dusk" design tokens shared by both pages | — |

Other changes to existing files: `vite.config.ts` adds `build.rollupOptions.input` for both pages. `core/daily.ts` is reused as-is. `core/rng.ts` is reused as-is; the Mines daily seed is `seedFromString('mines-daily:' + isoDate)`.

**Core types**
```ts
type BoardSpec = { cols: number; rows: number; mines: number };
type Board = {
  cols: number; rows: number;
  mines: Uint8Array;  // 1 = mine, index = r * cols + c
  adj: Uint8Array;    // 0–8 adjacent mine count
  start: number;      // pre-revealed start cell index
};
type CellState = 0 /* hidden */ | 1 /* revealed */ | 2 /* flagged */;
type GameState = {
  board: Board; cells: Uint8Array /* CellState */;
  status: 'playing' | 'won' | 'lost';
  revealed: number; flags: number; explodedAt?: number;
};
```

**Data flow:** date seed or random seed → `generateBoard` → `game` (start revealed) → `board` renders → DOM events → `input` → action → `game` → `board` diff-updates → `app` updates HUD / end card / storage.

## 3. Board generation

1. Seeded RNG picks the start cell uniformly from all cells.
2. The start cell and its in-bounds neighbours (up to 3×3) are excluded from mine placement, so the start is always a zero and opens an area.
3. Seeded Fisher–Yates over the remaining cells; the first `mines` become mines.
4. Compute `adj`.

Deterministic: the same `(spec, seed)` gives the same board on every browser. If `mines` exceeds the number of placeable cells, `generateBoard` throws (the fixed presets never do).

The start cell is pre-revealed in both daily and practice; there is no separate "first click is safe" rule.

## 4. Game rules (`game`)

- `reveal(i)`: no-op unless hidden. Mine → `lost`, `explodedAt = i`. Otherwise reveal; zeros flood-fill iteratively (explicit stack, no recursion). Flood never reveals flagged cells.
- `toggleFlag(i)`: hidden ↔ flagged; no-op on revealed cells. `flags` updates.
- `chord(i)`: only on a revealed number whose adjacent flag count equals its number; then `reveal` every hidden, unflagged neighbour. A wrong flag can make a chord hit a mine (→ `lost`). Otherwise a no-op.
- **Win:** all non-mine cells revealed → `won`; remaining mines are auto-flagged.
- **Lost:** all actions become no-ops. The renderer shows all mines, the exploded one in red, and wrong flags crossed out.
- Actions return the list of changed cell indices so the renderer can diff-update.

## 5. Interaction (`input` + `board`)

Classic Windows Minesweeper behaviour.

**Mouse**
- **Left:** press shows the cell pressed in; dragging while held moves the preview; **release reveals**. Releasing off the board cancels.
- **Right:** acts **on press**: hidden ↔ flagged. Context menu suppressed on the board.
- **Left + right (chord):** once both buttons are down (either order), the cell and its hidden, unflagged neighbours show pressed in. When **either** button is released, `chord(i)` fires. All further button activity is ignored until every button is up, so a chord never also reveals or flags.
- **Implementation note (verified in the prototype):** a second button pressed while one is held arrives as a *move*, not a new down event, and releasing one of two buttons may not arrive as an up. `input` therefore reads the full set of held buttons (`buttons` bitmask: 1 = left, 2 = right) on **every** down/move/up event and derives transitions from changes in that set.
- `input` is a pure state machine: `step(state, { type, buttons, cell }) → { state, action? }`, with action ∈ `reveal | flag | chord | preview(cells)`. States: `idle → left | right → chord → waitAllUp → idle`.

**Touch (minimal):** tap reveals; long-press (~350 ms) flags; tapping a revealed number chords. The board container scrolls horizontally when needed.

**Timer & HUD:** mines left (`mines − flags`, may go negative) and a timer in mm:ss. The timer starts when the board appears (the opening is already revealed) and stops on win or loss.

## 6. Visual design

Reuses Flow's "Dusk" theme (background glows, glass board panel, Inter). Dusk tokens move to `src/styles/tokens.css`, imported by both pages.

**Cells** (2px gap, 4px radius)
- **Hidden:** raised glass, `rgba(255,255,255,.10)` with a 1px top inset highlight; brightens slightly on hover.
- **Pressed preview:** flat (no highlight, dimmer).
- **Revealed:** recessed `rgba(0,0,0,.25)`; zeros blank.
- **Numbers 1–8:** weight 700, colours from Flow's path palette: 1 `#4cb0ff`, 2 `#34e3a0`, 3 `#ff5c7a`, 4 `#b48cff`, 5 `#ff9f45`, 6 `#3fe0e6`, 7 `#ff7ad9`, 8 `#c9f05a`. Each ≥ 3:1 against revealed cells.
- **Flag:** inline-SVG pennant, `#ffd447`.
- **Mine:** dark disc with a light outline. Exploded mine: red cell `#ff5c7a` + one glow pulse. Wrong flag: flag with a red ✕.

**Sizing:** cell size `clamp(20px, fit-to-width, 32px)`. Expert+ is ~28px (fits ≥ 1280×720). If a board still overflows at 20px (Huge), the board panel scrolls on its own; the page never scrolls horizontally.

**Motion** (150–250 ms ease-out; disabled under `prefers-reduced-motion`): flood reveals ripple outward by distance from the clicked cell (total ≤ 300 ms); exploded-mine pulse; end card slides up.

## 7. Screens

Header (shared with Flow): wordmark + game links **Flow · Mines** (current highlighted) on the left; Daily/Practice switch in the centre; "?" on the right.

1. **Daily (playing):** subtitle `#N · Wed Oct 21 · 30×20 · 130 mines`; board; HUD below.
2. **Daily (won):** board dims; glass card "Cleared ✦", time, "Next daily in hh:mm:ss", primary **Play practice**.
3. **Daily (lost):** board stays undimmed for study; smaller card below: "Boom.", % cleared, time, next-daily countdown, **Play practice**.
4. **Practice:** preset switch (Classic · Expert+ · Huge) replaces the subtitle; buttons **New board** (primary) and **Restart** (same board). End cards offer **New board**.
5. **How-to ("?"):** modal listing the three mouse controls and the touch equivalents, with a small chord diagram. Auto-opens on the first visit to the Mines page.

Daily number uses `dailyNumber` from `core/daily` (shared launch date).

## 8. Persistence

- **Daily** save under key `mines:daily`: `{ v: 1, date, cells: string /* one char per cell: h | r | f */, elapsedMs, status }`. The board is never stored; it is regenerated from the date seed.
- Written after every action that changes state, and on `pagehide`.
- On load: restore if `date` is today; a won or lost daily reopens in its end state (no second attempt). Other dates, wrong versions, wrong lengths or invalid characters → discard silently.
- **Practice:** not persisted. Only the chosen preset (`mines:preset`) and the how-to flag are remembered.
- All storage access wrapped in try/catch; the game works without storage.

## 9. Error handling

- `localStorage` unavailable / quota exceeded: play continues without persistence or first-visit flag.
- Corrupt or old-version save: discarded silently.
- Impossible board spec: `generateBoard` throws (covered by tests; unreachable with the fixed presets).

## 10. Testing

**Unit (Vitest)**
- `generate`: same `(spec, seed)` → identical board (snapshot per preset); exact mine count; start 3×3 mine-free and `adj[start] === 0`; `adj` correct; throws on an impossible spec.
- `game`: flood reveal, including a near-empty Huge board with no stack overflow; flood skips flags; flag toggle + counter; clicks on revealed and flagged cells ignored; chord fires on a matching count; chord no-op on a mismatch or on hidden or zero cells; wrong-flag chord loses; win detection + auto-flag; all actions no-op after the end.
- `input`: left press/release → reveal; drag moves the preview; release off-board cancels; right acts on press; left-then-right and right-then-left both → chord; after a chord no stray reveal or flag until all buttons are up; touch tap / long-press / number-tap.
- `storage`: round trip, date mismatch, corrupt data, throwing storage.

**E2E (Playwright)**
- A test hook (`?seed=` in dev builds only) loads a fixed-seed board. Real mouse input reveals, flags and chords (both buttons held via `mouse.down({ button })`) through to the win card.
- Hitting a mine shows the loss card with mines revealed.
- Reload mid-daily restores progress; reload after a loss reopens the end card.

## 11. Delivery notes

- Shared core (`rng`, `daily`, `storage`) currently exists only on `feat/flow-v1`. Mines work goes on `feat/mines-v1`, cut from `feat/flow-v1` once its core is committed, or from `main` after Flow merges.
- Moving the Dusk tokens to `src/styles/tokens.css` must be coordinated with Flow's UI work.

## 12. Future (not v1)

No-guess generation option; stats/streaks + share; keyboard play; merging both pages into a shared single-page shell with a `Game` interface.
