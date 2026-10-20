import {
  DAILY_SIZE,
  dailyNumber,
  formatDailyLabel,
  msUntilNextUtcMidnight,
  utcDateString,
} from '../core/daily';
import { isSolved, needsFillHint, newGame, reset, restore, stats, undo, type GameState } from '../core/game';
import { randomSeed, seedFromDate } from '../core/rng';
import { getFlag, loadDaily, saveDaily } from '../core/storage';
import type { Puzzle } from '../core/types';
import { latestOnly, requestPuzzle, STALE } from '../gen/client';
import { createBoard } from './board';
import { createHud } from './hud';
import { isHowtoOpen, openHowto } from './howto';
import { createWinCard } from './winCard';

export type Route = { mode: 'daily' } | { mode: 'practice'; size: number; seed?: number };

const MIN_SIZE = 5;
const MAX_SIZE = 9;
const DEFAULT_PRACTICE_SIZE = 7;
const RESET_CONFIRM_MOVES = 3;

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
  const tabDaily = h('a', { class: 'seg__item', href: '#/', text: 'Daily' });
  const tabPractice = h('a', { class: 'seg__item', href: '#/practice', text: 'Practice' });
  const header = h(
    'header',
    { class: 'app-header' },
    h('a', { class: 'wordmark', href: '#/', 'aria-label': 'flow — daily puzzle', text: 'flow' }),
    h('nav', { class: 'seg app-tabs', 'aria-label': 'Mode' }, tabDaily, tabPractice),
    h('button', { class: 'icon-btn', type: 'button', 'data-action': 'howto', 'aria-label': 'How to play', text: '?' }),
  );

  const sub = h('div', { class: 'app-sub' });
  const subtitle = h('p', { class: 'subtitle num', 'data-role': 'subtitle' });
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
  const resetBtn = h('button', { class: 'btn', type: 'button', 'data-action': 'reset', text: 'Reset' });
  const newBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-action': 'new', text: 'New puzzle' });
  const actions = h('div', { class: 'actions' }, undoBtn, resetBtn);

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
  let loadToken = 0;
  let practiceSize = route.mode === 'practice' ? route.size : DEFAULT_PRACTICE_SIZE;
  // Clock: accumulated ms + running segment.
  let baseMs = 0;
  let startedAt: number | null = null;

  const nowMs = () => now().getTime();
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
    resetBtn.disabled = idle || game!.paths.every(p => p.length === 0);
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
      sub.replaceChildren(subtitle);
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
    // Mark loading BEFORE locking the board: locking may end an in-flight drag, whose
    // gesture-end is then saved against the old session but can never trigger win UI.
    loading = true;
    board.setInteractive(false);
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
      practiceSize = size;
      seed = r.seed ?? randomSeed();
    }

    let puzzle: Puzzle;
    try {
      const res = await generate(size, seed);
      if (res === STALE || token !== loadToken) return;
      puzzle = res;
    } catch (err) {
      if (token !== loadToken) return;
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
      refresh();
    }
  }

  async function win(animate: boolean) {
    solved = true;
    stopClock();
    board.setInteractive(false);
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
      countdownMs: daily ? msUntilNextUtcMidnight(now()) : undefined,
      onPrimary: daily ? () => (location.hash = '#/practice') : () => newPractice(practiceSize),
    });
  }

  function onChange(s: GameState, kind: 'move' | 'gesture-end') {
    if (!game || s.puzzle !== game.puzzle || solved) return;
    game = s;
    if (!loading) startClock();
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
    board.setState(next);
    persist();
    refresh();
  }

  function doUndo() {
    if (!game || loading || solved) return;
    apply(undo(game));
  }

  function doReset() {
    if (!game || loading || solved || game.active !== null) return;
    if (game.moves > RESET_CONFIRM_MOVES && !confirm('Reset this puzzle? Your paths will be cleared.')) return;
    apply(reset(game));
  }

  function newPractice(size: number) {
    practiceSize = size;
    route = { mode: 'practice', size };
    try {
      history.replaceState(history.state, '', `#/practice?size=${size}`);
    } catch {
      /* history unavailable */
    }
    void load(route);
  }

  function onHashChange() {
    route = parseRoute(location.hash);
    void load(route);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'z') return;
    if (isHowtoOpen()) return; // the modal owns the keyboard while open
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    doUndo();
  }

  function tick() {
    if (route.mode === 'daily' && requestedDate !== null && utcDateString(now()) !== requestedDate) {
      void load(route);
      return;
    }
    if (game && !loading) refresh();
    if (solved && session?.mode === 'daily') winCard.setCountdown(msUntilNextUtcMidnight(now()));
  }

  const howtoBtn = header.querySelector<HTMLButtonElement>('[data-action="howto"]')!;
  function showHowto() {
    openHowto({
      colorblind: getFlag('colorblind'),
      onColorblindChange: on => board.setColorblind(on),
      returnFocus: howtoBtn,
    });
  }
  howtoBtn.addEventListener('click', showHowto);
  if (!getFlag('howto-seen')) showHowto();

  undoBtn.addEventListener('click', doUndo);
  resetBtn.addEventListener('click', doReset);
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
