import {
  DAILY_SIZE,
  dailyNumber,
  formatDailyLabel,
  msUntilNextUtcMidnight,
  utcDateString,
} from '../core/daily';
import { createPlayTracker } from '../core/analytics';
import { isSolved, needsFillHint, newGame, reset, restore, stats, undo, type GameState } from './game';
import { randomSeed, seedFromDate } from '../core/rng';
import { getFlag } from '../core/storage';
import { loadDaily, saveDaily } from './storage';
import type { Puzzle } from './types';
import { latestOnly, requestPuzzle, STALE } from './client';
import { createBoard } from './board';
import { createHeader } from '../ui/header';
import { createHud } from '../ui/hud';
import { openHowto } from './howto';
import { isModalOpen } from '../ui/modal';
import { CLEAR_CONFIRM, confirmDialog } from '../ui/confirm';
import { createWinCard } from './winCard';

export type Route = { mode: 'daily' } | { mode: 'practice'; size: number; seed?: number };

const MIN_SIZE = 5;
const MAX_SIZE = 9;
const DEFAULT_PRACTICE_SIZE = 7;

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '').replace(/^\//, '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  if (path !== 'practice') return { mode: 'daily' };
  const params = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
  const sizeN = Number.parseInt(params.get('size') ?? '', 10);
  const size = Number.isFinite(sizeN) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, sizeN)) : DEFAULT_PRACTICE_SIZE;
  const seedRaw = params.get('seed');
  const route: Route = { mode: 'practice', size };
  if (seedRaw !== null && /^\d+$/.test(seedRaw)) route.seed = Number(seedRaw) >>> 0;
  return route;
}

type Session = { mode: 'daily'; date: string } | { mode: 'practice'; size: number };

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v === undefined) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

/**
 * Mount the whole app into `root`. Returns an unmount function (handy for tests;
 * the production entry point ignores it).
 */
export function mountApp(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  const now = deps.now ?? (() => new Date());
  const generate = latestOnly(requestPuzzle);

  // ---------- DOM ----------
  const shellHeader = createHeader({ game: 'Flow', onHelp: () => showHowto() });
  const header = shellHeader.el;
  const tabDaily = shellHeader.tabDaily!;
  const tabPractice = shellHeader.tabPractice!;

  const sub = h('div', { class: 'app-sub' });
  const subtitle = h('p', { class: 'subtitle num', 'data-role': 'subtitle' });
  // Shown when the UTC day rolls over while the player is mid-way through a daily.
  const newDailyBtn = h('button', {
    class: 'btn new-daily',
    type: 'button',
    'data-action': 'new-daily',
    text: 'New daily available',
  });
  newDailyBtn.hidden = true;
  const sizes = h('div', { class: 'seg sizes', role: 'group', 'aria-label': 'Board size' });
  const sizeButtons: HTMLButtonElement[] = [];
  for (let n = MIN_SIZE; n <= MAX_SIZE; n++) {
    const b = h('button', { type: 'button', 'data-size': String(n), 'aria-pressed': 'false', text: `${n}×${n}` });
    b.addEventListener('click', () => newPractice(n));
    sizeButtons.push(b);
    sizes.append(b);
  }

  const boardEl = h('div', { class: 'board-host' });
  const stage = h('div', { class: 'stage' }, boardEl);
  const hudEl = h('div', { class: 'hud-host' });

  const undoBtn = h('button', { class: 'btn', type: 'button', 'data-action': 'undo', text: 'Undo' });
  const clearBtn = h('button', { class: 'btn', type: 'button', 'data-action': 'clear', text: 'Clear' });
  const newBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-action': 'new', text: 'New puzzle' });
  const actions = h('div', { class: 'actions' }, undoBtn, clearBtn);

  const main = h('main', { class: 'app-main' }, sub, stage, hudEl, actions);
  const app = h('div', { class: 'app' }, header, main);
  root.replaceChildren(app);

  const hud = createHud(hudEl);
  const winCard = createWinCard(stage);
  const board = createBoard(boardEl, { onChange });
  board.setColorblind(getFlag('colorblind'));

  // ---------- State ----------
  let route: Route = parseRoute(location.hash);
  let session: Session | null = null;
  let game: GameState | null = null;
  let loading = false;
  let solved = false;
  let requestedDate: string | null = null;
  /** The UTC day rolled over mid-puzzle: keep this daily, offer the new one. */
  let staleDaily = false;
  let loadToken = 0;
  let practiceSize = DEFAULT_PRACTICE_SIZE;
  /** The route most recently passed to load() (what the player is looking at). */
  let current: Route | null = null;
  const practiceHash = () => `#/practice?size=${practiceSize}`;
  function setPracticeSize(n: number) {
    practiceSize = n;
    // The tab (and "Play practice") return to the last size, so re-selecting it is a no-op.
    tabPractice.setAttribute('href', practiceHash());
  }
  setPracticeSize(route.mode === 'practice' ? route.size : DEFAULT_PRACTICE_SIZE);
  // Clock: accumulated ms + running segment.
  let baseMs = 0;
  let startedAt: number | null = null;

  const nowMs = () => now().getTime();
  const play = createPlayTracker('flow');
  const elapsed = () => baseMs + (startedAt === null ? 0 : Math.max(0, nowMs() - startedAt));
  const startClock = () => {
    if (startedAt === null) startedAt = nowMs();
  };
  const stopClock = () => {
    baseMs = elapsed();
    startedAt = null;
  };

  function refresh() {
    if (game) hud.update(stats(game), elapsed(), !solved && needsFillHint(game));
    else hud.update({ flowsDone: 0, flowsTotal: 0, fillPct: 0 }, 0, false);
    const idle = !game || loading || solved;
    undoBtn.disabled = idle || game!.undo.length === 0;
    clearBtn.disabled = idle || game!.paths.every(p => p.length === 0);
    newBtn.disabled = loading;
  }

  function persist() {
    if (!game || session?.mode !== 'daily') return;
    saveDaily({ date: session.date, paths: game.paths, elapsedMs: Math.round(elapsed()), solved });
  }

  function renderChrome(r: Route) {
    const daily = r.mode === 'daily';
    tabDaily.classList.toggle('is-active', daily);
    tabPractice.classList.toggle('is-active', !daily);
    if (daily) {
      tabDaily.setAttribute('aria-current', 'page');
      tabPractice.removeAttribute('aria-current');
      sub.replaceChildren(subtitle, newDailyBtn);
      newBtn.remove();
    } else {
      tabPractice.setAttribute('aria-current', 'page');
      tabDaily.removeAttribute('aria-current');
      sub.replaceChildren(sizes);
      sizeButtons.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === r.size)));
      actions.append(newBtn);
    }
  }

  // ---------- Flow ----------
  async function load(r: Route) {
    const token = ++loadToken;
    current = r;
    // Mark loading BEFORE locking the board: locking may end an in-flight drag, whose
    // gesture-end is then saved against the old session but can never trigger win UI.
    loading = true;
    board.setInteractive(false);
    staleDaily = false;
    newDailyBtn.hidden = true;
    solved = false;
    game = null;
    session = null;
    baseMs = 0;
    startedAt = null;
    winCard.hide();
    boardEl.classList.remove('board--dim');
    boardEl.classList.add('board--loading');
    boardEl.setAttribute('aria-busy', 'true');
    renderChrome(r);
    refresh();

    let size: number;
    let seed: number;
    let date: string | null = null;
    if (r.mode === 'daily') {
      date = utcDateString(now());
      requestedDate = date;
      size = DAILY_SIZE;
      seed = seedFromDate(date);
      subtitle.textContent = `#${dailyNumber(date)} · ${formatDailyLabel(date)} · ${size}×${size}`;
    } else {
      requestedDate = null;
      size = r.size;
      setPracticeSize(size);
      seed = r.seed ?? randomSeed();
    }

    let puzzle: Puzzle;
    try {
      const res = await generate(size, seed);
      if (res === STALE || token !== loadToken) return;
      puzzle = res;
    } catch (err) {
      if (token !== loadToken) return;
      current = null; // let navigating to the same route retry
      loading = false;
      boardEl.classList.remove('board--loading');
      boardEl.removeAttribute('aria-busy');
      console.error('flow: puzzle generation failed', err);
      refresh();
      return;
    }

    let s = newGame(puzzle);
    if (date !== null) {
      const save = loadDaily(date);
      const restored = save ? restore(puzzle, save.paths) : null;
      if (save && restored) {
        s = restored;
        baseMs = Math.max(0, save.elapsedMs);
      }
      session = { mode: 'daily', date };
    } else {
      session = { mode: 'practice', size };
    }

    loading = false;
    game = s;
    boardEl.classList.remove('board--loading');
    boardEl.removeAttribute('aria-busy');
    board.setState(s);
    if (isSolved(s)) {
      void win(false);
    } else {
      board.setInteractive(true);
      play.begin(session.mode === 'daily' ? { mode: 'daily' } : { mode: 'practice', size: session.size });
      refresh();
    }
  }

  /** Time until the next daily; 0 once a newer daily already exists (rollover mid-puzzle). */
  function dailyCountdown() {
    return staleDaily ? 0 : Math.max(0, msUntilNextUtcMidnight(now()));
  }

  async function win(animate: boolean) {
    solved = true;
    stopClock();
    board.setInteractive(false);
    if (animate) play.end('won', elapsed()); // not a board restored already solved
    persist();
    refresh();
    const token = loadToken;
    if (animate) await board.celebrate();
    if (token !== loadToken || !session) return;
    boardEl.classList.add('board--dim');
    const daily = session.mode === 'daily';
    winCard.show({
      timeMs: elapsed(),
      mode: session.mode,
      countdownMs: daily ? dailyCountdown() : undefined,
      onPrimary: daily ? () => (location.hash = practiceHash()) : () => newPractice(practiceSize),
    });
  }

  function onChange(s: GameState, kind: 'move' | 'gesture-end') {
    if (!game || s.puzzle !== game.puzzle || solved) return;
    game = s;
    if (!loading) {
      startClock();
      play.move();
    }
    if (kind === 'gesture-end' && !loading && isSolved(s)) {
      void win(true);
      return;
    }
    if (kind === 'gesture-end') persist();
    refresh();
  }

  function apply(next: GameState) {
    if (!game || next === game) return;
    game = next;
    play.move();
    board.setState(next);
    persist();
    refresh();
  }

  function doUndo() {
    if (!game || loading || solved) return;
    apply(undo(game));
  }

  function canClear(): boolean {
    return !!game && !loading && !solved && game.active === null;
  }

  function doClear() {
    if (!canClear()) return;
    const g = game;
    confirmDialog({
      ...CLEAR_CONFIRM,
      confirmLabel: 'Clear',
      returnFocus: clearBtn,
      // The puzzle may have changed under the dialog (new daily, route change): only clear the one it asked about.
      onConfirm: () => { if (game === g && canClear()) apply(reset(g!)); },
    });
  }

  function newPractice(size: number) {
    setPracticeSize(size);
    route = { mode: 'practice', size };
    try {
      history.replaceState(history.state, '', `#/practice?size=${size}`);
    } catch {
      /* history unavailable */
    }
    void load(route);
  }

  /** Would loading `r` just regenerate what is already on screen (or loading)? */
  function isCurrent(r: Route): boolean {
    if (!current || r.mode !== current.mode) return false;
    if (r.mode === 'daily') return true;
    return current.mode === 'practice' && r.size === current.size && r.seed === undefined;
  }

  function onHashChange() {
    const next = parseRoute(location.hash);
    if (isCurrent(next)) return;
    route = next;
    void load(route);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'z') return;
    if (isModalOpen()) return; // the modal owns the keyboard while open
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    doUndo();
  }

  function tick() {
    if (route.mode === 'daily' && requestedDate !== null && !staleDaily && utcDateString(now()) !== requestedDate) {
      // Only replace the daily when nothing would be lost: solved, untouched, or not loaded yet.
      if (!game || loading || solved || game.paths.every(p => p.length === 0)) {
        void load(route);
        return;
      }
      staleDaily = true;
      newDailyBtn.hidden = false;
    }
    if (game && !loading) refresh();
    if (solved && session?.mode === 'daily') winCard.setCountdown(dailyCountdown());
  }

  const howtoBtn = shellHeader.helpBtn!;
  function showHowto() {
    openHowto({
      colorblind: getFlag('colorblind'),
      onColorblindChange: on => board.setColorblind(on),
      returnFocus: howtoBtn,
    });
  }
  if (!getFlag('howto-seen')) showHowto();

  newDailyBtn.addEventListener('click', () => {
    route = { mode: 'daily' };
    void load(route);
  });
  undoBtn.addEventListener('click', doUndo);
  clearBtn.addEventListener('click', doClear);
  newBtn.addEventListener('click', () => newPractice(practiceSize));
  window.addEventListener('hashchange', onHashChange);
  document.addEventListener('keydown', onKeyDown);
  const interval = setInterval(tick, 1000);

  void load(route);

  return () => {
    loadToken++;
    clearInterval(interval);
    window.removeEventListener('hashchange', onHashChange);
    document.removeEventListener('keydown', onKeyDown);
    board.destroy();
    root.replaceChildren();
  };
}
