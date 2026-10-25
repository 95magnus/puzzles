import {
  dailyNumber,
  formatCountdown,
  formatDailyLabel,
  msUntilNextUtcMidnight,
  utcDateString,
} from '../core/daily';
import { createPlayTracker } from '../core/analytics';
import { randomSeed } from '../core/rng';
import { getFlag, getBalancedPreset, loadBalancedDaily, saveBalancedDaily, setFlag, setBalancedPreset } from '../core/storage';
import { createHeader } from '../ui/header';
import { formatClock } from '../ui/hud';
import { createBalancedBoard } from './board';
import { clear, cycle, encode, filled, isGiven, newGame, restore, toggle, undo } from './game';
import { DAILY_PRESET, PRESETS, generatePuzzle, balancedDailySeed } from './generate';
import { openBalancedHowto } from './howto';
import type { GameState, PresetId, Puzzle } from './types';

export type BalancedRoute = { mode: 'daily' } | { mode: 'practice'; preset: PresetId; seed?: number };

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const DEFAULT_PRESET: PresetId = 'medium';
const TICK_MS = 1000;

export function parseBalancedRoute(hash: string): BalancedRoute {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  if (path !== '/practice') return { mode: 'daily' };
  const params = new URLSearchParams(query);
  const asked = params.get('preset') as PresetId | null;
  const preset: PresetId =
    asked !== null ? (PRESET_IDS.includes(asked) ? asked : DEFAULT_PRESET) : (getBalancedPreset() ?? DEFAULT_PRESET);
  const seed = Number(params.get('seed'));
  return params.has('seed') && Number.isInteger(seed) ? { mode: 'practice', preset, seed } : { mode: 'practice', preset };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function mountBalanced(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  const now = deps.now ?? (() => new Date());

  // ---------- Static shell ----------
  root.textContent = '';
  root.classList.add('balanced-app');
  const shellHeader = createHeader({ game: 'Balanced', onHelp: () => openBalancedHowto(helpBtn) });
  const header = shellHeader.el;
  const dailyTab = shellHeader.tabDaily!;
  const practiceTab = shellHeader.tabPractice!;
  const helpBtn = shellHeader.helpBtn!;

  const sub = el('div', 'balanced-sub');
  const stage = el('div', 'balanced-stage');
  const boardEl = el('div', 'balanced-board');
  stage.appendChild(boardEl);
  const hud = el('div', 'balanced-hud');
  const filledEl = el('span', 'balanced-filled hud-value num');
  filledEl.setAttribute('aria-label', 'Cells filled');
  const time = el('span', 'balanced-time hud-value num');
  time.setAttribute('aria-label', 'Time');
  const stats = el('div', 'balanced-stats');
  stats.append(filledEl, time);
  const controls = el('div', 'balanced-controls');
  hud.append(stats, controls);
  const main = el('main', 'balanced-main');
  main.append(sub, stage, hud);
  root.append(header, main);

  // ---------- State ----------
  let route: BalancedRoute = { mode: 'daily' };
  let dailyDate = '';
  let dailyPuzzle: Puzzle | null = null;
  let game: GameState | null = null;
  let baseElapsed = 0;
  let runningSince: number | null = null;
  let card: HTMLElement | null = null;
  /** True when this tab changed the daily since it last loaded or saved it; pagehide/route-leave only write then. */
  let dirty = false;

  const board = createBalancedBoard(boardEl, { onTap, onRing });
  // Keep the HUD as wide as the board panel (which shrinks to its content).
  const panel = boardEl.querySelector<HTMLElement>('.balanced-panel')!;
  const hudSizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { hud.style.width = `min(100%, ${panel.offsetWidth}px)`; })
    : null;
  hudSizer?.observe(panel);

  const play = createPlayTracker('balanced');
  const elapsed = () => baseElapsed + (runningSince === null ? 0 : now().getTime() - runningSince);

  function startTimer(fromMs: number): void {
    baseElapsed = fromMs;
    runningSince = now().getTime();
  }

  function stopTimer(): void {
    baseElapsed = elapsed();
    runningSince = null;
  }

  function renderHud(): void {
    if (!game) return;
    const n = game.puzzle.size;
    filledEl.textContent = `${filled(game)}/${n * n}`;
    time.textContent = formatClock(elapsed());
    const g = game;
    const anyFilled = g.cells.some((v, i) => v !== 0 && !isGiven(g, i));
    for (const b of controls.querySelectorAll<HTMLButtonElement>('button')) {
      if (b.dataset.action === 'undo') b.disabled = g.history.length === 0 || g.status === 'won';
      else if (b.dataset.action === 'clear') b.disabled = !anyFilled || g.status === 'won';
    }
    if (card) {
      const cd = card.querySelector('.balanced-countdown');
      if (cd) cd.textContent = `Next daily in ${formatCountdown(msUntilNextUtcMidnight(now()))}`;
    }
  }

  /** Saves the daily. Returns true if another tab had already solved it and the page reloaded that instead. */
  function persist(): boolean {
    if (route.mode !== 'daily' || !game) return false;
    const saved = loadBalancedDaily(dailyDate);
    // Honour a solved save only if it really restores to a won board; a bad one is overwritten like any other.
    const done = saved?.solved && game.status !== 'won' && restore(game.puzzle, saved.cells)?.status === 'won';
    if (done) {
      loadDaily();
      return true;
    }
    saveBalancedDaily({ date: dailyDate, cells: encode(game), elapsedMs: elapsed(), solved: game.status === 'won' });
    dirty = false;
    return false;
  }

  /** Save on pagehide / leaving the daily: always after a change, else only when the stored board is ours, so the clock keeps running without clobbering another tab's moves. */
  function persistOnLeave(): void {
    if (route.mode !== 'daily' || !game) return;
    const saved = loadBalancedDaily(dailyDate);
    if (dirty || !saved || saved.cells === encode(game)) persist();
  }

  function hideCard(): void {
    card?.remove();
    card = null;
    stage.classList.remove('is-dimmed');
  }

  function button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const b = el('button', primary ? 'btn btn--primary' : 'btn', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  /** Win card, centred over the board. The board stays undimmed so the solution can be studied. */
  function showCard(): void {
    if (!game) return;
    hideCard();
    const daily = route.mode === 'daily';
    card = el('section', 'end-card glass end-card--won');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-labelledby', 'balanced-card-title');
    const title = el('h2', 'end-card__title', 'Balanced ●○');
    title.id = 'balanced-card-title';
    card.appendChild(title);
    card.appendChild(el('p', 'end-card__stat num', formatClock(elapsed())));
    const actions = el('div', 'end-card__actions');
    let primary: HTMLButtonElement;
    if (daily) {
      card.appendChild(el('p', 'end-card__next balanced-countdown text-2 num'));
      primary = button('Play practice', true, () => { location.hash = '#/practice'; });
    } else {
      primary = button('New board', true, () => newPractice());
    }
    actions.append(primary);
    card.appendChild(actions);
    stage.appendChild(card);
    renderHud();
    primary.focus({ preventScroll: true });
  }

  function setGame(g: GameState, fromMs: number): void {
    game = g;
    dirty = false;
    hideCard();
    board.setGame(g);
    if (g.status === 'playing') {
      board.setInteractive(true);
      startTimer(fromMs);
      play.begin(route.mode === 'daily' ? { mode: 'daily' } : { mode: 'practice', preset: route.preset });
    } else {
      board.setInteractive(false);
      baseElapsed = fromMs;
      runningSince = null;
      showCard();
    }
    renderHud();
  }

  /** Shared tail of every board change: redraw, save, then handle a win. */
  async function changed(g: GameState, didChange: boolean): Promise<void> {
    if (!didChange) return;
    dirty = true;
    board.render();
    const won = g.status === 'won';
    play.move();
    if (won) {
      stopTimer();
      board.setInteractive(false);
      play.end('won', elapsed());
    }
    // If another tab already solved the daily, the board now shows that game.
    if (persist()) return;
    renderHud();
    if (!won) return;
    await board.celebrate();
    if (game !== g) return; // replaced (new board, route change) while celebrating
    if (!card) showCard();
  }

  async function onTap(cell: number): Promise<void> {
    const g = game;
    if (!g) return;
    await changed(g, cycle(g, cell));
  }

  async function onRing(cell: number): Promise<void> {
    const g = game;
    if (!g) return;
    await changed(g, toggle(g, cell, 2));
  }

  // ---------- Modes ----------
  function baseControls(): void {
    controls.textContent = '';
    const undoBtn = button('Undo', false, () => { if (game) void changed(game, undo(game)); });
    undoBtn.dataset.action = 'undo';
    const clr = button('Clear', false, () => { if (game) void changed(game, clear(game)); });
    clr.dataset.action = 'clear';
    controls.append(undoBtn, clr);
  }

  function loadDaily(): void {
    const date = utcDateString(now());
    if (date !== dailyDate || !dailyPuzzle) {
      dailyDate = date;
      dailyPuzzle = generatePuzzle(PRESETS[DAILY_PRESET].size, balancedDailySeed(dailyDate));
    }
    const puzzle = dailyPuzzle;
    sub.textContent = `#${dailyNumber(dailyDate)} · ${formatDailyLabel(dailyDate)} · ${puzzle.size}×${puzzle.size}`;
    baseControls();
    const save = loadBalancedDaily(dailyDate);
    const restored = save ? restore(puzzle, save.cells) : null;
    setGame(restored ?? newGame(puzzle), restored ? save!.elapsedMs : 0);
  }

  function presetSwitch(active: PresetId): HTMLElement {
    const seg = el('div', 'seg balanced-presets');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Board size');
    for (const id of PRESET_IDS) {
      const b = el('button', 'seg__item', PRESETS[id].label);
      b.type = 'button';
      b.dataset.preset = id;
      b.setAttribute('aria-pressed', String(id === active));
      b.addEventListener('click', () => {
        setBalancedPreset(id);
        history.replaceState(null, '', '#/practice');
        route = { mode: 'practice', preset: id };
        loadPractice(id);
      });
      seg.appendChild(b);
    }
    return seg;
  }

  function loadPractice(preset: PresetId, seed?: number): void {
    sub.textContent = '';
    sub.appendChild(presetSwitch(preset));
    baseControls();
    const fresh = button('New board', true, () => newPractice());
    fresh.dataset.action = 'new';
    controls.append(fresh);
    setGame(newGame(generatePuzzle(PRESETS[preset].size, seed ?? randomSeed())), 0);
  }

  function newPractice(): void {
    if (route.mode !== 'practice') return;
    if (route.seed !== undefined) history.replaceState(null, '', '#/practice');
    route = { mode: 'practice', preset: route.preset };
    loadPractice(route.preset);
  }

  function render(): void {
    persistOnLeave(); // leaving the daily must keep its clock
    route = parseBalancedRoute(location.hash);
    const daily = route.mode === 'daily';
    dailyTab.classList.toggle('is-active', daily);
    practiceTab.classList.toggle('is-active', !daily);
    dailyTab.toggleAttribute('aria-current', daily);
    practiceTab.toggleAttribute('aria-current', !daily);
    if (route.mode === 'daily') loadDaily();
    else loadPractice(route.preset, route.seed);
  }

  function tick(): void {
    if (route.mode === 'daily' && utcDateString(now()) !== dailyDate) {
      loadDaily();
      return;
    }
    renderHud();
  }

  // A hashchange to the route already shown (e.g. a late event for the initial hash) must not reset the game.
  const onHash = () => {
    if (JSON.stringify(parseBalancedRoute(location.hash)) !== JSON.stringify(route)) render();
  };
  // Time spent away in the back/forward cache does not count.
  const onHide = () => {
    persistOnLeave();
    if (runningSince !== null) stopTimer();
  };
  const onShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    if (route.mode === 'daily' && utcDateString(now()) !== dailyDate) loadDaily();
    else if (game?.status === 'playing') startTimer(baseElapsed);
  };
  window.addEventListener('hashchange', onHash);
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);
  const interval = setInterval(tick, TICK_MS);
  render();
  if (!getFlag('balanced-howto-seen')) {
    setFlag('balanced-howto-seen', true);
    openBalancedHowto(helpBtn);
  }

  return () => {
    clearInterval(interval);
    hudSizer?.disconnect();
    window.removeEventListener('hashchange', onHash);
    window.removeEventListener('pagehide', onHide);
    window.removeEventListener('pageshow', onShow);
    board.destroy();
  };
}
