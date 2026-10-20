# Flow — Daily Puzzle Website: Design Spec

**Date:** 2026-10-20
**Status:** Draft for review

## 1. Purpose & scope

A hobby website with a daily logic puzzle. It should be simple, free to host, fun to play, and look sleek and modern.

**In scope (v1)**
- Puzzle type: **Flow** (connect matching colored dots with paths; every cell must be filled).
- **Daily mode:** one 7×7 puzzle per day, identical for every player worldwide.
- **Practice mode:** unlimited random puzzles, sizes 5×5–9×9.
- Mouse-first play (drag); touch works through the same input code.
- Static site, no backend.

**Out of scope (v1)** — accounts, leaderboards, streaks/stats, share button, light theme, sound, other puzzle types. The design must not block adding these later.

**Success criteria**
- Today's puzzle loads in < 1 s and always has exactly one solution.
- Dragging feels immediate (no visible lag at 60 fps).
- A friend can open the link and solve a puzzle without reading instructions beyond the 3-step how-to.

## 2. Architecture

**Stack:** TypeScript + Vite, no UI framework. Board rendered as **SVG**. Output is static files deployed to GitHub Pages / Netlify / Cloudflare Pages.

| Module | Responsibility | Depends on |
|---|---|---|
| `rng` | Seeded PRNG (mulberry32); `seedFromDate(isoDate)`, `randomSeed()` | — |
| `solver` | `countSolutions(puzzle, limit = 2): number` | — |
| `generator` | `generate(size, rng): Puzzle` — always unique-solution | `rng`, `solver` |
| `generator.worker` | Runs `generate` in a Web Worker; message API `{size, seed} → Puzzle` | `generator` |
| `game` | Pure state: paths, drag actions, undo stack, win detection. No DOM | — |
| `board` | Renders `game` state to SVG; maps pointer events to `game` actions | `game` |
| `storage` | Read/write today's daily progress in `localStorage`, versioned, fail-safe | — |
| `app` | Hash routing (`#/`, `#/practice`), daily number/date, HUD, win card, how-to | all above |

**Core types**
```ts
type Cell = { r: number; c: number };
type Puzzle = { size: number; pairs: { color: number; a: Cell; b: Cell }[] };
type GameState = { puzzle: Puzzle; paths: Cell[][] /* index = color */; undo: Cell[][][] };
```

**Data flow:** date (UTC) or random seed → `rng` → worker `generator` (verified by `solver`) → `Puzzle` → `game` → `board` renders → pointer input → `game` actions → win check → `app` shows win card.

**Daily identity:** "today" is the **UTC date**. Daily number = days since launch date + 1 (launch date is a constant in config).

## 3. Puzzle generator

Goal: full-coverage Flow puzzle with **exactly one solution**, generated in < 500 ms for sizes ≤ 9.

1. **Random fill:** start with each cell as a 1-cell path; repeatedly merge adjacent path endpoints in seeded-random order until path count reaches target (`size + 1`, clamped to the palette size of 9) and every path has length ≥ 3.
2. **Extract endpoints** → dot pairs; discard interior cells.
3. **Verify:** `countSolutions(puzzle, 2)` — backtracking with forced-move propagation, dead-cell detection, and connectivity/reachability pruning; stops at 2.
4. **Retry** with the continuing RNG stream if not unique (deterministic per seed).
5. **Safety valve:** after 200 failed attempts, raise the target path count by 1 (if still ≤ 9), otherwise lower the minimum path length from 3 to 2, and continue. Generation must always terminate; a test asserts this for all sizes across 1000 seeds.

Determinism is a hard requirement: same `(size, seed)` → same puzzle on every browser.

## 4. Interaction

Implemented with Pointer Events (mouse, pen, touch share one path).

- **Press a dot:** start that color's path from it (clears that color's existing path).
- **Press a path end:** continue from there. **Press mid-path:** truncate to that cell and continue.
- **Drag:** extend orthogonally cell by cell. Fast pointer jumps are filled in along a straight line between cells so no cells are skipped.
- **Drag back over own path:** backtrack (removes those cells).
- **Drag into another color's path:** that path is cut at the crossing cell. **Another color's dot is blocked.**
- **Reach matching dot:** pair completes; further dragging is ignored; one-shot pulse.
- **Release:** path stays as drawn.
- **Right-click a path:** clears it (context menu suppressed on the board).
- **Undo** button + Ctrl/Cmd+Z: one undo step per drag gesture. **Reset** button: clears board (confirm only if > 3 moves made).
- **Win:** all pairs connected **and** all cells filled. If all connected but not full, show hint: "All connected — fill every cell!"
- **HUD:** `Flows x/y`, `Fill n%`, timer (starts on first move, mm:ss).
- **Daily persistence:** `storage` saves daily paths + elapsed time on each gesture end, keyed by UTC date and schema version. On load, restore if the key matches today; otherwise discard. A solved daily reopens in the solved state.

## 5. Visual design — "Dusk"

Dark-only in v1; all colors are CSS custom properties so a light "Dawn" theme can be added later.

**Color tokens**
- `--bg`: `#0e0c1a` with two fixed radial glows: violet `rgba(109,93,252,.45)` top-left, pink `rgba(255,106,168,.30)` bottom-right.
- `--board`: `rgba(255,255,255,.06)`, `backdrop-filter: blur(14px)`, inset 1px `rgba(255,255,255,.12)` border, shadow `0 12px 40px rgba(0,0,0,.4)`.
- `--grid-line`: `rgba(255,255,255,.08)`.
- `--text`: `#eef0f7`; secondary text at 65% opacity.
- Path palette (9): `#ff5c7a` `#4cb0ff` `#34e3a0` `#ffd447` `#b48cff` `#ff9f45` `#3fe0e6` `#ff7ad9` `#c9f05a`. Each must meet ≥ 3:1 contrast against the board.
- Path glow: Gaussian halo, stdDeviation ≈ 3 (scaled to cell size), alpha 0.45 — a halo, never bloom. Completed paths tint their cells at 12%.
- **Colorblind mode** (toggle in "?" panel, persisted locally): each dot shows a small distinct glyph.

**Typography:** Inter (variable). Wordmark 800, UI 500–600, tabular numerals for HUD.

**Shape & spacing:** 8 px grid; board radius 18 px; pill buttons; secondary buttons translucent with 1px `rgba(255,255,255,.12)` border, primary button solid `--text` on dark text.

**Motion** (150–250 ms, ease-out; all disabled under `prefers-reduced-motion`):
- Path growth follows the pointer smoothly.
- Pair completion: single dot pulse + cell tint fade-in.
- Win: ripple across paths from last move → board dims → glass win card slides up.

## 6. Screens & layout

Single page; header: wordmark (left), Daily/Practice segmented switch (center), "?" button (right).

1. **Daily (playing)** — subtitle `#N · Tue Oct 20 · 7×7` above board; HUD and Undo/Reset below.
2. **Daily (solved)** — board dimmed; glass card: "Solved ✦", time, "Next daily in hh:mm:ss" (to next UTC midnight), primary button "Play practice".
3. **Practice** — size segmented control (5×5–9×9, default 7×7) replaces subtitle; buttons Undo / Reset / **New puzzle** (primary). Win card offers "Next puzzle".
4. **How-to** ("?") — 3-step modal with tiny animated examples; auto-opens on first visit (flag in `localStorage`).

Responsive: same vertical stack; board width = `min(90vw, 520px)`; header stays on one row at ≥ 320 px.

## 7. Error handling

- **Generation in progress:** board shows shimmer skeleton. Safety valve guarantees termination.
- **Worker unavailable:** fall back to generating on the main thread.
- **Corrupt / old-version saved state:** discard silently, start fresh.
- **`localStorage` unavailable** (private mode, quota): game works; persistence and first-visit flag are skipped. All storage access wrapped in try/catch.

## 8. Testing

- **Unit (Vitest):**
  - `rng`: same seed → same sequence; `seedFromDate` stable.
  - `generator`: snapshot puzzles for fixed seeds per size; every generated puzzle covers the grid and has `countSolutions === 1`; across 1000 seeds per size, p95 generation time < 500 ms (≤ 9×9).
  - `solver`: known puzzles with 0, 1, and ≥ 2 solutions.
  - `game`: start/extend/backtrack/cut/block/complete/undo/win rules, including fast-jump interpolation.
  - `storage`: round-trip, date mismatch, corrupt data, throwing storage.
- **E2E (Playwright):** load a fixed-seed puzzle, drag its known solution with the mouse, assert the win card appears; reload mid-daily and assert progress is restored.

## 9. Future (not v1)

Local streaks/stats + share button; light "Dawn" theme; leaderboards (needs backend); more puzzle types reusing `rng` + `app` shell.
