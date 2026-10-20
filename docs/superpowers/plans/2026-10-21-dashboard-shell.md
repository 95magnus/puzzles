# Puzzles Dashboard & Shared Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard at `index.html` listing every puzzle with today's daily status, and give Flow and Mines one shared header, modal, end card and HUD typography.

**Architecture:** Shared chrome lives in `src/ui/header.ts`, `src/ui/modal.ts` and `src/ui/shell.css`; each game builds its page from those and keeps only board/HUD/game CSS. The dashboard (`src/home/`) renders cards from a `PUZZLES` registry whose entries map each game's existing daily save to a `DailyStatus`. Flow moves from `index.html` to `flow.html`.

**Tech Stack:** TypeScript, Vite 8 (rolldown multi-page), Vitest 5 + jsdom, Playwright. No UI framework.

**Spec:** `docs/superpowers/specs/2026-10-21-dashboard-shell-design.md`

## Global Constraints

- No new dependencies. Plain DOM, matching the file's existing helper style (`h()` in Flow, `el()` in Mines).
- Every colour/spacing comes from `theme.css` tokens; new tokens go in `shell.css` `:root`.
- Pages: `index.html` → `src/home/main.ts` (title `Puzzles`), `flow.html` → `src/main.ts` (title `Flow`), `minesweeper.html` → `src/minesweeper/main.ts` (title `Mines`).
- Header width `min(100%, 960px)`, min-height 56px; wordmark text `puzzles` linking `./index.html`.
- Copy is unchanged unless stated: "How to play", "Got it", "Solved ✦", "Cleared ✦", "Boom.", "Next daily in …", "Play practice", "Next puzzle", "New board", "Try again".
- Status labels exactly: `Not started`, `In progress · <clock>`, `Solved · <clock>`, `Cleared · <clock>`, `Boom · attempt N`, with ` · attempt N` appended to in-progress/cleared Mines labels when N > 1. `<clock>` is the existing `formatClock` from `src/ui/hud.ts` (`mm:ss`, e.g. `00:42`; the spec's `0:42` examples mean this format).
- `prefers-reduced-motion` disables every new animation.
- Commit after each task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Stale or foreign saves** — a `flow:daily`/`mines:daily` save from yesterday, or junk JSON, must show `Not started`, never yesterday's result. (Task 5 tests.)
2. **Dashboard left open across UTC midnight** — daily number, date and every card must roll to the new day without a reload. (Task 6 test.)
3. **Mines in progress on a retry** — a `playing` save with `attempt: 2` must say so: `In progress · 00:42 · attempt 2`. (Task 5 test.)
4. **Phone width 320px** — no horizontal page scroll on any of the three pages; the header stays on one row. (Task 7 e2e.)
5. **Flow keyboard shortcuts while the modal is open** — Ctrl+Z must not undo while any shared modal (Flow's or a future one) is open. (Task 1 test.)

---

### Task 1: Shared modal; Flow how-to uses it

**Files:**
- Create: `src/ui/modal.ts`, `src/ui/shell.css`, `tests/ui/modal.test.ts`
- Modify: `src/ui/howto.ts`, `src/ui/app.ts` (imports, `isHowtoOpen` → `isModalOpen`), `src/ui/app.css` (delete `.modal`, `.modal__*`, `@keyframes modal-*`; keep `.howto-*` and `.switch*`), `src/main.ts` (import `./ui/shell.css` after `theme.css`)
- Test: `tests/ui/howto.test.ts`, `tests/ui/app.test.ts`

**Interfaces:**
- Produces:
  - `openModal(opts: { title: string; body: Node[]; returnFocus: HTMLElement | null; onClose?: () => void }): { close(): void }`
  - `isModalOpen(): boolean`
  - DOM: `div.modal` > `div.modal__panel.glass[role=dialog][aria-modal=true][aria-labelledby]` > `div.modal__head` (`h2.modal__title`, `button.icon-btn.modal__close[aria-label=Close]` "✕"), ...body, `button.btn.btn--primary.modal__done` "Got it".

- [ ] **Step 1: Write failing tests in `tests/ui/modal.test.ts`** (jsdom)
  - `renders title, body nodes and Got it; focuses Got it` — `document.activeElement` is `.modal__done`.
  - `Esc, ✕, Got it and backdrop click each close it and refocus returnFocus` — four cases; after each, `document.querySelector('.modal')` is null, `isModalOpen()` false, opener focused, `onClose` called once.
  - `click inside the panel does not close`.
  - `Tab from last focusable wraps to first; Shift+Tab from first wraps to last`.
  - `opening a second modal closes the first` — exactly one `.modal` in the document; first `onClose` called.
  - `returnFocus null closes without throwing`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/modal.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement `src/ui/modal.ts`** by extracting the shell of `openHowto` (keydown listener in capture phase, `FOCUSABLE` selector, single `current` instance). Title id is unique per open (`modal-title-${n}`).
- [ ] **Step 4: Move styles** — `.modal`, `.modal__panel`, `.modal__head`, `.modal__title`, `.modal__done`, `.modal__close` and their keyframes/reduced-motion rules from `app.css` to `shell.css`.
- [ ] **Step 5: Rewrite `openHowto(opts: HowtoOptions)`** to build only the steps list and colourblind row and call `openModal({ title: 'How to play', body: [list, cb], returnFocus })`. Keep `setFlag('howto-seen', true)` and its existing default for `returnFocus`. Delete `isHowtoOpen`; `app.ts` imports `isModalOpen` from `./modal`.
- [ ] **Step 6: Add test in `tests/ui/app.test.ts`**: `game shortcuts are ignored while the modal is open` — with a path drawn, open the how-to, dispatch `keydown` Ctrl+Z; the path is still there after the modal closes.
- [ ] **Step 7: Run** `npx vitest run tests/ui` — all PASS (existing `howto.test.ts` selectors `.modal`, `.modal__close` still hold).
- [ ] **Step 8: Commit** `refactor(ui): shared modal; Flow how-to built on it`.

### Task 2: Mines how-to uses the shared modal

**Files:**
- Modify: `src/minesweeper/howto.ts`, `src/minesweeper/mines.css` (delete `.mines-howto`, `.mines-howto__dialog*`, `.mines-howto__close`; keep `.mines-howto__body`, `.mines-howto__demo`), `src/minesweeper/main.ts` (import `../ui/shell.css` after theme)
- Test: `tests/minesweeper/howto.test.ts`

**Interfaces:**
- Consumes: `openModal`, `isModalOpen` (Task 1).
- Produces: `openMinesHowto(returnFocusTo: HTMLElement): void` — unchanged signature.

- [ ] **Step 1: Update tests** — replace `.mines-howto` backdrop selector with `.modal`, close button with `.modal__close`; add `body contains the three controls, the chord demo and the touch line` (`.mines-howto__body li` count 3, `svg.mines-howto__demo` present, text contains `Long-press`).
- [ ] **Step 2: Run** `npx vitest run tests/minesweeper/howto.test.ts` — expect FAIL.
- [ ] **Step 3: Rewrite `openMinesHowto`** to build `[intro, body, touch]` and call `openModal({ title: 'How to play', body, returnFocus: returnFocusTo })`.
- [ ] **Step 4: Run** `npx vitest run tests/minesweeper` — PASS.
- [ ] **Step 5: Commit** `refactor(mines): how-to uses the shared modal`.

### Task 3: Shared header in both games

**Files:**
- Create: `src/ui/header.ts`, `tests/ui/header.test.ts`
- Modify: `src/ui/app.ts` (header block), `src/ui/app.css` (delete `.app-header`, `.app-brand`, `.game-link`, `.wordmark*`, `.app-tabs`, `.seg > a.seg__item`, `.icon-btn*` and their ≤400px rules), `src/minesweeper/app.ts` (header block), `src/minesweeper/mines.css` (delete `.mines-header`, `.mines-games*`, `.mines-modes*`, `.mines-help`), `src/ui/shell.css`, `src/minesweeper/board.ts` (`PAGE_CHROME` if needed)
- Test: `tests/ui/app.test.ts`, `tests/minesweeper/howto.test.ts`

**Interfaces:**
- Produces:
  - `createHeader(opts: { game?: string; tabs?: boolean; onHelp?: () => void }): { el: HTMLElement; tabDaily: HTMLAnchorElement | null; tabPractice: HTMLAnchorElement | null; helpBtn: HTMLButtonElement | null }`
  - DOM: `header.shell-header` > `div.shell-brand` (`a.wordmark[href="./index.html"]` "puzzles", then when `game` set: `span.shell-sep[aria-hidden]` "·" and `span.shell-game[aria-current=page]`), `nav.seg.shell-tabs[aria-label=Mode]` with `a.seg__item` Daily `#/` / Practice `#/practice` (when `tabs !== false`), `button.icon-btn.shell-help[data-action=howto][aria-label="How to play"]` "?" (when `onHelp`). Absent parts are omitted but the 3-column grid keeps the brand left.

- [ ] **Step 1: Write failing tests in `tests/ui/header.test.ts`**
  - `game header has wordmark home link, game name, both tabs and help` — `.wordmark` text `puzzles`, href `./index.html`; `.shell-game` text `Mines` with `aria-current=page`; tab hrefs `#/`, `#/practice`; clicking `.shell-help` calls `onHelp` once.
  - `tabs:false and no onHelp render wordmark only` — handles' `tabDaily`, `tabPractice`, `helpBtn` are null; no `nav`, no `button`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/header.test.ts` — FAIL.
- [ ] **Step 3: Implement `createHeader`**; move wordmark, `.seg > a.seg__item`, `.icon-btn` and narrow-screen header rules into `shell.css` under `.shell-*` names.
- [ ] **Step 4: Adopt in both apps** — Flow: `createHeader({ game: 'Flow', onHelp: openHowtoFromButton })`, keep its existing active-state code on the returned tabs. Mines: same with `game: 'Mines'`, `onHelp: () => openMinesHowto(header.helpBtn!)`. Both apps keep owning the Practice href.
- [ ] **Step 5: Update tests** — `tests/ui/app.test.ts` header test expects `.wordmark` text `puzzles` linking `./index.html` and `.shell-game` `Flow` (drop the `./minesweeper.html` link assertion); `tests/minesweeper/howto.test.ts` uses `.shell-help` instead of `.mines-help`.
- [ ] **Step 6: Check Mines fit** — at 1280×720 in the dev server, `header.offsetHeight + sub + hud + gaps` (measure with `getBoundingClientRect`) ≤ `PAGE_CHROME`; if not, set `PAGE_CHROME` to the measured value rounded up to 8 and note it in the comment above the constant and in `mines.css`.
- [ ] **Step 7: Run** `npx vitest run` — PASS.
- [ ] **Step 8: Commit** `feat(ui): shared header for Flow and Mines`.

### Task 4: Shared end card and HUD typography

**Files:**
- Modify: `src/ui/winCard.ts`, `src/ui/app.css` (delete `.win*`, `@keyframes app-win-in`), `src/minesweeper/app.ts` (`showCard`), `src/minesweeper/mines.css` (delete `.mines-card*`, `@keyframes mines-card-in`), `src/ui/shell.css`, `src/ui/hud.ts`, `src/minesweeper/app.ts` (stat spans)
- Test: `tests/ui/app.test.ts`, `tests/minesweeper/app.test.ts`

**Interfaces:**
- Produces:
  - DOM: `section.end-card.glass[role=dialog][aria-labelledby]` > `h2.end-card__title`, `p.end-card__stat.num`, optional `p.end-card__next.text-2.num`, `div.end-card__actions` (buttons). Mines adds `end-card--won|--lost` and keeps `mines-countdown` on its next-line for `renderHud`.
  - CSS: `.end-card` centred (`top/left 50%`, `translate: -50% -50%`), `min-width: 280px`, `max-width: calc(100% - 32px)`, fill `rgba(30,27,48,.88)`, 250 ms rise-in; `.hud-value` 17px/600/`--text`; `.hud-label` 14px/500/`--text-2`.
- `createWinCard` API unchanged.

- [ ] **Step 1: Update tests** — replace `.win` with `.end-card` in `tests/ui/app.test.ts` and `.mines-card` with `.end-card` in `tests/minesweeper/app.test.ts` (including `.mines-stage > .end-card`). Add to Flow: `win card is the shared centred end card` — after solving, `.stage > .end-card` exists with `.end-card__title` `Solved ✦` and one `.btn--primary` inside `.end-card__actions`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/app.test.ts tests/minesweeper/app.test.ts` — FAIL.
- [ ] **Step 3: Restyle** `createWinCard` and Mines `showCard` onto the `.end-card` classes; move the merged styles to `shell.css`. Flow's `.win[hidden]` becomes `.end-card[hidden] { display: none }`.
- [ ] **Step 4: HUD** — Flow `hud.ts`: add `hud-value` to `.hud__value`, `hud-label` to `.hud__label`. Mines: add `hud-value` to `.mines-left`/`.mines-time`, `hud-label` to `.mines-attempt`. Remove now-duplicate font rules from `app.css`/`mines.css`; layouts untouched.
- [ ] **Step 5: Run** `npx vitest run` — PASS.
- [ ] **Step 6: Commit** `feat(ui): shared end card and HUD typography`.

### Task 5: Puzzle registry and daily status

**Files:**
- Create: `src/home/puzzles.ts`, `src/home/previews.ts`, `tests/home/puzzles.test.ts`

**Interfaces:**
- Consumes: `loadDaily`, `loadMinesDaily` (`core/storage`), `formatClock` (`ui/hud`), `PALETTE` (`ui/palette`).
- Produces:
  - `type DailyStatus = { kind: 'new' } | { kind: 'playing'; elapsedMs: number; attempt?: number } | { kind: 'done'; elapsedMs: number; attempt?: number } | { kind: 'lost'; elapsedMs: number; attempt: number }`
  - `type PuzzleEntry = { id: 'flow' | 'mines'; name: string; tagline: string; href: string; doneWord: 'Solved' | 'Cleared'; preview: () => SVGSVGElement; dailyStatus: (date: string) => DailyStatus }`
  - `PUZZLES: readonly PuzzleEntry[]` — order Flow, Mines. Flow: href `./flow.html`, tagline `Connect matching dots. Fill every cell.`; Mines: href `./minesweeper.html`, tagline `Clear the board without hitting a mine.`
  - `statusLabel(entry: PuzzleEntry, s: DailyStatus): string`
  - `flowPreview(): SVGSVGElement`, `minesPreview(): SVGSVGElement` in `previews.ts` (viewBox `0 0 64 64`, `aria-hidden`, class `puzzle-preview`; Flow: 4×4 grid, two `PALETTE` paths with end dots; Mines: 4×4 tiles, revealed 1/2 in `--mines-n1`/`--mines-n2` colours as literals, one flag).

- [ ] **Step 1: Write failing tests in `tests/home/puzzles.test.ts`** (jsdom, `localStorage.clear()` before each; date `2026-10-21`)
  - Flow: no save → `new`/`Not started`; save `{solved:false, elapsedMs: 42_000}` → `In progress · 00:42`; `{solved:true, elapsedMs: 83_000}` → `Solved · 01:23`.
  - Mines: `playing` attempt 1 → `In progress · 00:42`; `playing` attempt 2 → `In progress · 00:42 · attempt 2`; `won` attempt 1 → `Cleared · 01:23`; `won` attempt 2 → `Cleared · 01:23 · attempt 2`; `lost` attempt 2 → `Boom · attempt 2`.
  - Stale/junk: both keys holding saves dated `2026-10-20`, then both holding `"{not json"` → `Not started` for both.
  - Previews: each returns an `svg` with `aria-hidden="true"`.
- [ ] **Step 2: Run** `npx vitest run tests/home/puzzles.test.ts` — FAIL.
- [ ] **Step 3: Implement** `puzzles.ts` and `previews.ts` (Mines save mapping: `won`→`done`, `lost`→`lost`, `playing`→`playing`, attempt passed through; attempt suffix only when > 1 except `lost`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(home): puzzle registry with daily status`.

### Task 6: Dashboard page; Flow moves to flow.html

**Files:**
- Create: `flow.html` (current `index.html` with title `Flow`), `src/home/main.ts`, `src/home/home.ts`, `src/home/home.css`, `tests/home/home.test.ts`
- Modify: `index.html` (title `Puzzles`, script `/src/home/main.ts`), `vite.config.ts` (inputs `home: 'index.html'`, `flow: 'flow.html'`, `mines: 'minesweeper.html'`; update the comment), `tests/e2e/flow.spec.ts` (`/` → `/flow.html`, `/#/practice…` → `/flow.html#/practice…`)

**Interfaces:**
- Consumes: `createHeader` (Task 3), `PUZZLES`, `statusLabel` (Task 5), `utcDateString`, `dailyNumber`, `formatDailyLabel`, `formatCountdown`, `msUntilNextUtcMidnight` (`core/daily`).
- Produces: `mountHome(root: HTMLElement, deps?: { now?: () => Date }): () => void`.
  - DOM: header from `createHeader({ tabs: false })`; `main.home` > `p.home-intro.num` (`Daily #N · Tue Oct 21`) + `p.home-next.text-2.num` (`Next daily in hh:mm:ss`) + `ul.home-grid` > `li.puzzle-card.glass[data-id]` each with preview (inside try/catch; omitted on throw), `h2` name, `p.text-2` tagline, `span.status-pill[data-status=<kind>]` with `statusLabel`, `a.btn.btn--primary` "Play daily" (`href + '#/'`), `a.btn` "Practice" (`href + '#/practice'`).
  - Refresh: 1 s interval updates the countdown and, when `utcDateString(now())` changes, intro + all pills; `storage` event and `visibilitychange` (to visible) re-render pills. Unmount clears the interval and listeners.
  - CSS (`home.css`): grid `repeat(auto-fill, minmax(280px, 1fr))`, `max-width: 960px`, gap 16px, 16px side gutter; pill colours: `new` `--btn-bg`/`--text-2`, `playing` violet `rgba(139,123,255,.2)`/`#b9adff`, `done` `rgba(52,227,160,.18)`/`#34e3a0`, `lost` `rgba(255,92,122,.18)`/`#ff5c7a`.

- [ ] **Step 1: Write failing tests in `tests/home/home.test.ts`** (jsdom, fixed `now` `2026-10-21T10:00:00Z`)
  - `renders one card per PUZZLES entry with links` — 2 `.puzzle-card`; Flow's Play daily href `./flow.html#/`, Practice `./flow.html#/practice`.
  - `intro shows daily number and date` — `Daily #2 · Wed Oct 21`, next line `Next daily in 14:00:00`.
  - `storage event re-renders pills` — write a solved Flow save, dispatch `new StorageEvent('storage')`, Flow pill `data-status="done"`.
  - `rolls over at UTC midnight` (fake timers; `now` advances past `2026-10-22T00:00:00Z`; a solved 2026-10-21 save exists) — after 1 s tick, intro reads `Daily #3`, Flow pill `Not started`.
  - `unmount stops the interval` — `vi.getTimerCount()` is 0 after unmount.
- [ ] **Step 2: Run** `npx vitest run tests/home` — FAIL.
- [ ] **Step 3: Implement** `home.ts`, `home.css`, `main.ts` (imports font, `theme.css`, `shell.css`, `home.css`), move pages, update `vite.config.ts`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build` — PASS; `dist/` contains `index.html`, `flow.html`, `minesweeper.html`.
- [ ] **Step 5: Commit** `feat(home): puzzles dashboard at index.html; Flow moves to flow.html`.

### Task 7: E2E and visual consistency check

**Files:**
- Create: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Write `tests/e2e/home.spec.ts`**
  - `lists puzzles and opens each daily` — `/` shows headings `Flow` and `Mines`; clicking Flow's "Play daily" lands on `/flow.html#/` with the board visible; back; Mines' lands on `/minesweeper.html#/`.
  - `shows saved daily status` — `addInitScript` seeds today's (`new Date().toISOString().slice(0,10)`) `flow:daily` `{v:1,date,paths:[],elapsedMs:83000,solved:true}` and `mines:daily` `{v:1,date,cells:'',elapsedMs:5000,status:'lost',attempt:2}`; Flow pill text `Solved · 01:23`, Mines pill `Boom · attempt 2`.
  - `no horizontal scroll at 320px` — for `/`, `/flow.html`, `/minesweeper.html` at viewport 320×640: `document.documentElement.scrollWidth <= 320`, and `.shell-header` height < 72.
  - `headers match across games` — at 1280×800, `.shell-header` bounding box (x, width, height) on `/flow.html` equals that on `/minesweeper.html` within 1px.
- [ ] **Step 2: Run** `npm run e2e` — all specs PASS (flow, mines, home).
- [ ] **Step 3: Manual check** in the dev server at 1280 and 360 widths: header, how-to modal and end card look identical in both games; screenshot each page.
- [ ] **Step 4: Commit** `test(e2e): dashboard and shared-shell consistency`.
