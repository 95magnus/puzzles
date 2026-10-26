# Better Analytics: Design Spec

**Date:** 2026-10-27
**Status:** Draft for review

## 1. Purpose & scope

Umami gets page views plus `puzzle_start` (first move on a board) and `puzzle_end` (`game`, `mode`, `preset`/`size`, `result`, `seconds`). That shows plays, win rate and solve time, but not which daily was hard, whether a start is a returning player resuming a save, how players solve, or what breaks in production. Add the missing properties and one new event.

**In scope**
- `day` and `restored` on `puzzle_start` / `puzzle_end`.
- `moves`, `undo` and `clear` counts on `puzzle_end`.
- An `error` event for uncaught errors and unhandled rejections, on every page.

**Out of scope**: queuing events made offline, counting Restart / New board, returning-player buckets, how-to or home-tile events, installed-app (standalone) tagging, persisting counts in saves, any change to save shapes or localStorage keys.

**Success criteria**
- A daily's `puzzle_end` can be filtered by `day` in Umami.
- A resumed daily is distinguishable from a fresh one (`restored: 1`).
- Every `puzzle_end` from all 7 games carries `moves`, and `undo` / `clear` for the games that have those controls, zeros included.
- An uncaught error on any page sends at most one `error` per distinct message and at most 3 per page load.
- No personal data, no new dependencies; analytics still never throws into a game.

## 2. Events

| Event | Properties |
|---|---|
| `puzzle_start` | `game`, `mode`, `preset` or `size` (practice), **`day`** (daily only), **`restored`** |
| `puzzle_end` | the above + `result`, `seconds`, **`moves`**, **`undo`**, **`clear`** (each only if the game has that control) |
| **`error`** | `page`, `message`, `where` |

- `day`: the UTC date string of the daily (`YYYY-MM-DD`), the same date the save is keyed by.
- `restored`: `1` when the board was loaded from a daily save with its moves; `0` otherwise (new daily, practice, Retry, Restart, New board, Mines' first-click board). Finished boards restored from a save still send nothing.
- `moves`: board changes since `begin()`, counting undos and clears. In Flow, one completed drag gesture is one move.
- `undo` / `clear`: times the control ran since `begin()`. A confirmed control counts only when confirmed.
- Restart and New board replace the board and call `begin()` again; they show as a `puzzle_start` without a `puzzle_end`, so they are not counted.
- All counts reset on `begin()`. A restored board counts from the restore.

## 3. `src/core/analytics.ts`

```ts
export const COUNTED_ACTIONS = ['undo', 'clear'] as const;

createPlayTracker(game: string, counted?: readonly string[]): PlayTracker

type PlayTracker = {
  begin(props: Props): void;      // resets moves and counts
  move(): void;                   // first call after begin() reports puzzle_start; every call counts a move
  action(name: string): void;     // counts `name` if it is in `counted`; ignored otherwise
  end(result: 'won' | 'lost', elapsedMs: number): void; // adds moves + one property per counted name
};

trackErrors(page: string): void
```

`createPlayTracker` with no `counted` reports only `moves`. `move()` and `action()` before `begin()` or after `end()` do nothing.

**`trackErrors(page)`** adds `error` and `unhandledrejection` listeners on `window`, once per page (a second call is a no-op).
- Message: `ErrorEvent.message`, or for a rejection `reason.message` when `reason` is an `Error`, else `String(reason)`. Trimmed and cut to 120 characters.
- `where`: for `ErrorEvent`, the last path segment of `filename` plus `:lineno` (e.g. `app-3fa1.js:42`); `''` for rejections or when there is no filename.
- Skipped: an empty message, and `Script error.` (cross-origin, no detail).
- Each distinct message is sent once; after 3 sends the listeners stop sending.
- Sends through `track`, so it is a no-op off the deployed domain and never throws.

## 4. Shell: `src/ui/puzzleApp.ts`

- The tracker is created with the counted names the board's controls have: `COUNTED_ACTIONS.filter((a) => board.controls?.some((c) => c.action === a))`. `createPlayTracker` therefore moves after `mountBoard`.
- `setGame(g, fromMs, restored = false)`. `loadDaily` passes `true` when `fromSave` returned a game; `ctx.replace`, `retryDaily`, practice and new boards pass `false`.
- `play.begin` props: daily `{ mode: 'daily', day: dailyDate, restored: 0|1 }`; practice `{ mode: 'practice', preset, restored: 0 }`.
- `renderControls` calls `play.action(c.action)` just before `c.run(...)`, in both the direct and the confirmed path.

## 5. Flow: `src/games/flow/app.ts`

- `createPlayTracker('flow', COUNTED_ACTIONS)`.
- `play.begin` props gain `day: session.date` (daily) and `restored: 0|1` (1 when the daily save's state was loaded).
- `onChange` calls `play.move()` only on `'gesture-end'`, so a drag is one move; `apply()` keeps calling it. The clock still starts on the first cell.
- The Undo and Clear handlers call `play.action('undo')` / `play.action('clear')` when they change the board.

## 6. Pages

Every `src/**/main.ts` (home and the 7 games) calls `trackErrors('<page id>')` first, with the id from `src/pages.ts`. `CLAUDE.md`'s "Adding a puzzle" list gains that step. `src/sw/` is untouched.

## 7. Testing

- `tests/core/analytics.test.ts`: `moves` counting; `undo`/`clear` counted, zero-filled and reset on `begin()`; unknown actions ignored; `trackErrors` sends `{ page, message, where }`, skips `Script error.`, dedupes, caps at 3, handles non-`Error` rejections, and installs once.
- `tests/ui/puzzleApp.test.ts`: daily `puzzle_start` carries `day` and `restored: 0`; reloading a saved daily gives `restored: 1`; a control run increments its count on `puzzle_end`; a cancelled confirm does not.
- `tests/games/balanced/app.test.ts`, `tests/games/bridges/app.test.ts`: update the expected props.
- `tests/games/flow/app.test.ts`: a multi-cell drag reports one move; daily props carry `day` and `restored`.
- No e2e changes: tracking is a no-op off the deployed domain.
