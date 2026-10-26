import {
  dailyNumber,
  formatCountdown,
  formatDailyLabel,
  msUntilNextUtcMidnight,
  utcDateString,
} from '../core/daily';
import { createPlayTracker } from '../core/analytics';
import { randomSeed } from '../core/rng';
import { getBridgesPreset, loadBridgesDaily, saveBridgesDaily, setBridgesPreset } from './storage';
import { getFlag, setFlag } from '../core/storage';
import { createHeader } from '../ui/header';
import { formatClock } from '../ui/hud';
import { createBridgesBoard } from './board';
import { clear, cycle, encode, newGame, remove, restore, satisfied, undo } from './game';
import { DAILY_PRESET, PRESETS, bridgesDailySeed, generatePuzzle } from './generate';
import { openBridgesHowto } from './howto';
import type { GameState, PresetId, Puzzle } from './types';

export type BridgesRoute = { mode: 'daily' } | { mode: 'practice'; preset: PresetId; seed?: number };

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const DEFAULT_PRESET: PresetId = 'medium';
const TICK_MS = 1000;

export function parseBridgesRoute(hash: string): BridgesRoute {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  if (path !== '/practice') return { mode: 'daily' };
  const params = new URLSearchParams(query);
  const asked = params.get('preset') as PresetId | null;
  const preset: PresetId =
    asked !== null ? (PRESET_IDS.includes(asked) ? asked : DEFAULT_PRESET) : (getBridgesPreset() ?? DEFAULT_PRESET);
  const seed = Number(params.get('seed'));
  return params.has('seed') && Number.isInteger(seed) ? { mode: 'practice', preset, seed } : { mode: 'practice', preset };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function mountBridges(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  const now = deps.now ?? (() => new Date());

  // ---------- Static shell ----------
  root.textContent = '';
  root.classList.add('bridges-app');
  const shellHeader = createHeader({ game: 'Bridges', onHelp: () => openBridgesHowto(helpBtn) });
  const header = shellHeader.el;
  const dailyTab = shellHeader.tabDaily!;
  const practiceTab = shellHeader.tabPractice!;
  const helpBtn = shellHeader.helpBtn!;

  const sub = el('div', 'bridges-sub');
  const stage = el('div', 'bridges-stage');
  const boardEl = el('div', 'bridges-board');
  stage.appendChild(boardEl);
  const hud = el('div', 'bridges-hud');
  const doneEl = el('span', 'bridges-done hud-value num');
  doneEl.setAttribute('aria-label', 'Islands done');
  const time = el('span', 'bridges-time hud-value num');
  time.setAttribute('aria-label', 'Time');
  const stats = el('div', 'bridges-stats');
  stats.append(doneEl, time);
  const controls = el('div', 'bridges-controls');
  hud.append(stats, controls);
  const main = el('main', 'bridges-main');
  main.append(sub, stage, hud);
  root.append(header, main);

  // ---------- State ----------
  let route: BridgesRoute = { mode: 'daily' };
  let dailyDate = '';
  let dailyPuzzle: Puzzle | null = null;
  let game: GameState | null = null;
  let baseElapsed = 0;
  let runningSince: number | null = null;
  let card: HTMLElement | null = null;
  /** True when this tab changed the daily since it last loaded or saved it; pagehide/route-leave only write then. */
  let dirty = false;

  const board = createBridgesBoard(boardEl, { onCycle, onRemove });
  // Keep the HUD as wide as the board panel (which shrinks to its content).
  const panel = boardEl.querySelector<HTMLElement>('.bridges-panel')!;
  const hudSizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { hud.style.width = `min(100%, ${panel.offsetWidth}px)`; })
    : null;
  hudSizer?.observe(panel);

  const play = createPlayTracker('bridges');
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
    const g = game;
    doneEl.textContent = `${satisfied(g)}/${g.puzzle.islands.length}`;
    time.textContent = formatClock(elapsed());
    const anyBridge = g.bridges.some((v) => v !== 0);
    for (const b of controls.querySelectorAll<HTMLButtonElement>('button')) {
      if (b.dataset.action === 'undo') b.disabled = g.history.length === 0 || g.status === 'won';
      else if (b.dataset.action === 'clear') b.disabled = !anyBridge || g.status === 'won';
    }
    if (card) {
      const cd = card.querySelector('.bridges-countdown');
      if (cd) cd.textContent = `Next daily in ${formatCountdown(msUntilNextUtcMidnight(now()))}`;
    }
  }

  /** Saves the daily. Returns true if another tab had already solved it and the page reloaded that instead. */
  function persist(): boolean {
    if (route.mode !== 'daily' || !game) return false;
    const saved = loadBridgesDaily(dailyDate);
    // Honour a solved save only if it really restores to a won board; a bad one is overwritten like any other.
    const done = saved?.solved && game.status !== 'won' && restore(game.puzzle, saved.links)?.status === 'won';
    if (done) {
      loadDaily();
      return true;
    }
    saveBridgesDaily({ date: dailyDate, links: encode(game), elapsedMs: elapsed(), solved: game.status === 'won' });
    dirty = false;
    return false;
  }

  /** Save on pagehide / leaving the daily: always after a change, else only when the stored board is ours, so the clock keeps running without clobbering another tab's moves. */
  function persistOnLeave(): void {
    if (route.mode !== 'daily' || !game) return;
    const saved = loadBridgesDaily(dailyDate);
    if (dirty || !saved || saved.links === encode(game)) persist();
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
    card.setAttribute('aria-labelledby', 'bridges-card-title');
    const title = el('h2', 'end-card__title', 'All connected');
    title.id = 'bridges-card-title';
    card.appendChild(title);
    card.appendChild(el('p', 'end-card__stat num', formatClock(elapsed())));
    const actions = el('div', 'end-card__actions');
    let primary: HTMLButtonElement;
    if (daily) {
      card.appendChild(el('p', 'end-card__next bridges-countdown text-2 num'));
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
    board.render(); // also replays the split pulse when the network newly splits
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

  async function onCycle(link: number): Promise<void> {
    const g = game;
    if (!g) return;
    const r = cycle(g, link);
    if (r.blockedBy.length > 0) board.flashBlocked(r.blockedBy);
    await changed(g, r.changed);
  }

  async function onRemove(link: number): Promise<void> {
    const g = game;
    if (!g) return;
    await changed(g, remove(g, link));
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
      dailyPuzzle = generatePuzzle(PRESETS[DAILY_PRESET].size, bridgesDailySeed(dailyDate));
    }
    const puzzle = dailyPuzzle;
    sub.textContent = `#${dailyNumber(dailyDate)} · ${formatDailyLabel(dailyDate)} · ${puzzle.size}×${puzzle.size}`;
    baseControls();
    const save = loadBridgesDaily(dailyDate);
    const restored = save ? restore(puzzle, save.links) : null;
    setGame(restored ?? newGame(puzzle), restored ? save!.elapsedMs : 0);
  }

  function presetSwitch(active: PresetId): HTMLElement {
    const seg = el('div', 'seg bridges-presets');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Board size');
    for (const id of PRESET_IDS) {
      const b = el('button', 'seg__item', PRESETS[id].label);
      b.type = 'button';
      b.dataset.preset = id;
      b.setAttribute('aria-pressed', String(id === active));
      b.addEventListener('click', () => {
        setBridgesPreset(id);
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
    route = parseBridgesRoute(location.hash);
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
    if (JSON.stringify(parseBridgesRoute(location.hash)) !== JSON.stringify(route)) render();
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
  if (!getFlag('bridges-howto-seen')) {
    setFlag('bridges-howto-seen', true);
    openBridgesHowto(helpBtn);
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
