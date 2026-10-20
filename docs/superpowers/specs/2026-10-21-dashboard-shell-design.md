# Puzzles Dashboard & Shared Shell: Design Spec

**Date:** 2026-10-21
**Status:** Draft for review

## 1. Purpose & scope

The site now has two puzzles (Flow, Mines) built at different times, and their chrome has drifted apart: different headers, different how-to dialogs, different end cards. Add a **dashboard** that lists every puzzle with today's daily status, and give both games **one shared shell** so they feel like the same site.

**In scope**
- New dashboard page at `index.html`; Flow moves to `flow.html`.
- Shared header, modal and end-card components/styles used by both games.
- Matching HUD typography (layouts stay game-specific).
- A puzzle registry so a third puzzle is one entry on the dashboard.

**Out of scope** — streaks/history stats, a single-page app, light theme, changes to board rendering or game rules, redirect from old `index.html#/practice` links (they land on the dashboard).

**Success criteria**
- From the dashboard, every puzzle's daily is one click away, and its card says correctly whether today's daily is not started, in progress, solved/cleared or lost.
- Flow and Mines headers are pixel-identical apart from the game name and active tab.
- Both how-to dialogs and both end cards share one stylesheet and one behaviour (focus trap, Esc, backdrop, focus return).
- Existing unit and e2e tests pass (updated for new paths/markup).

## 2. Pages & build

| Page | Entry | Contents |
|---|---|---|
| `index.html` | `src/home/main.ts` | Dashboard |
| `flow.html` | `src/main.ts` (unchanged) | Flow, hash routes `#/`, `#/practice` as today |
| `minesweeper.html` | `src/minesweeper/main.ts` | Mines, unchanged routes |

`vite.config.ts` gets three `rolldownOptions.input` entries (`home`, `flow`, `mines`). The `<title>`s become `Puzzles`, `Flow` and `Mines`.

## 3. Shared shell

New file `src/ui/shell.css` holds every shared chrome style; both games import it after `theme.css`. Game CSS keeps only board/HUD-specific rules.

### 3.1 Header — `src/ui/header.ts`

```ts
type HeaderOptions = { game?: string; tabs?: boolean /* default true */; onHelp?: () => void };
type HeaderHandle = { el: HTMLElement; tabDaily: HTMLAnchorElement | null; tabPractice: HTMLAnchorElement | null; helpBtn: HTMLButtonElement | null };
createHeader(opts: HeaderOptions): HeaderHandle
```

Layout (`.shell-header`, grid `1fr auto 1fr`, width `min(100%, 960px)`, min-height 56px, centred):
- **Left:** `.wordmark` "puzzles" (gradient dot kept) linking `./index.html`, then `.shell-game` with the game name (`aria-current="page"`).
- **Centre:** `nav.seg.shell-tabs` with Daily (`#/`) and Practice (`#/practice`) links. Apps keep owning the active state and the Practice href (Flow remembers size, Mines its preset).
- **Right:** round `.icon-btn` "?" (`aria-label="How to play"`), omitted when `onHelp` is absent (dashboard).

Narrow-screen rules (≤ 400px) are the current Flow ones, moved over. Flow's `.app-header`/`.app-brand`/`.game-link` and Mines' `.mines-header`/`.mines-games`/`.mines-help` are deleted. Mines' `PAGE_CHROME` budget in `board.ts` is rechecked against the new header height.

### 3.2 Modal — `src/ui/modal.ts`

```ts
type ModalOptions = { title: string; body: Node[]; returnFocus: HTMLElement | null; onClose?: () => void };
openModal(opts): { close(): void }
isModalOpen(): boolean
```

Renders `.modal` backdrop → `.modal__panel.glass` with head (title + ✕), body, full-width primary "Got it". Owns: single instance (opening closes any current one), focus trap, Esc, backdrop click, focus on "Got it" at open, focus return on close. Styles are Flow's current `.modal*` rules moved to `shell.css`.

- Flow `howto.ts` keeps its demo SVGs and colourblind switch and passes them as `body`; `isHowtoOpen` becomes `isModalOpen`.
- Mines `howto.ts` keeps its controls list, chord SVG and touch line as `body`. `.mines-howto*` CSS is deleted except the body layout (`.mines-howto__body`, `__demo`).
- First-visit auto-open (`howto-seen`, `mines-howto-seen`) is unchanged.

### 3.3 End card — `.end-card`

One style, absolutely centred over the board stage, glass, `rgba(30,27,48,.88)` fill, 250 ms rise-in:
`h2.end-card__title` · `p.end-card__stat.num` · optional `p.end-card__next.text-2.num` ("Next daily in …") · `div.end-card__actions`.

- Flow `winCard.ts` keeps its API but renders with these classes, and moves from the bottom of the board to the centre. Text unchanged ("Solved ✦", time, "Play practice"/"Next puzzle").
- Mines `showCard` uses the same classes; text and buttons unchanged ("Cleared ✦"/"Boom.", Try again, etc.).
- Both dim the board only on a win, as Mines does today (Flow already dims on solve).

### 3.4 HUD typography

Shared tokens in `shell.css`: `.hud-value` 17px / 600 / `--text`, `.hud-label` 14px / 500 / `--text-2`. Flow's `.hud__value` and Mines' `.mines-stats` adopt them. Layouts are not changed.

## 4. Dashboard

### 4.1 Registry — `src/home/puzzles.ts`

```ts
type DailyStatus =
  | { kind: 'new' }
  | { kind: 'playing'; elapsedMs: number; attempt?: number }
  | { kind: 'done'; elapsedMs: number; attempt?: number }   // solved / cleared
  | { kind: 'lost'; elapsedMs: number; attempt: number };    // Mines only
type PuzzleEntry = { id: string; name: string; tagline: string; href: string; preview: () => SVGSVGElement; dailyStatus: (date: string) => DailyStatus };
export const PUZZLES: PuzzleEntry[];
export function statusLabel(s: DailyStatus): string;
```

- Flow: `loadDaily(date)` → none ⇒ `new`; `solved` ⇒ `done`; else `playing` (an in-progress save with `elapsedMs === 0` and no paths still counts as `playing`).
- Mines: `loadMinesDaily(date)` → none ⇒ `new`; `won` ⇒ `done`; `lost` ⇒ `lost`; `playing` ⇒ `playing`. `attempt` passed through.
- Labels: `Not started` · `In progress · 0:42` · `Solved · 1:23` (Flow) / `Cleared · 1:23` (Mines; `· attempt N` appended when N > 1) · `Boom · attempt N`.
- Previews are small static inline SVGs (Flow: 4×4 grid with two coloured paths; Mines: 4×4 tiles with a few numbers and a flag), using the existing palettes.

### 4.2 Page — `src/home/home.ts`, `home.css`

- Header: `createHeader({ tabs: false })` — wordmark only, no game name, tabs or "?".
- Intro line under the header: `Daily #N · Tue Oct 21` (`dailyNumber`, `formatDailyLabel` from `core/daily`), plus `Next daily in hh:mm:ss` updating each second.
- Grid of cards, `repeat(auto-fill, minmax(280px, 1fr))`, max width 960px, 16px gutters on phones. Each card is `.glass`: preview, name, tagline, status pill (`data-status` = kind, colour-coded: neutral / violet / green / pink), **Play daily** (`btn--primary`, `href + '#/'`) and **Practice** (`btn`, `href + '#/practice'`) links.
- Statuses re-render on `visibilitychange` (becoming visible), on `storage` events, and when the UTC date rolls over.

## 5. Error handling

All storage reads already swallow errors and return `null` ⇒ cards show `Not started`. No network. A broken preview function must not break the page: each card renders inside a try/catch that falls back to no preview.

## 6. Testing

- **Unit:** `puzzles.ts` status mapping and labels for every save shape; `header.ts` structure/ARIA and no-help variant; `modal.ts` focus trap, Esc, backdrop, focus return, single instance; `home.ts` renders one card per registry entry and refreshes on `storage`.
- **Updated:** Flow and Mines app/howto tests for new markup classes; e2e `flow.spec.ts` paths move to `/flow.html…`.
- **New e2e** `home.spec.ts`: dashboard lists Flow and Mines; "Play daily" opens each game; with `flow:daily` and `mines:daily` saves for today seeded into localStorage (solved / lost, attempt 2), the cards read `Solved · …` and `Boom · attempt 2`.
- Manual: header identical across games at 1280px and 360px widths.
