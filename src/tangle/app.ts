import {
  dailyNumber,
  formatCountdown,
  formatDailyLabel,
  msUntilNextUtcMidnight,
  utcDateString,
} from '../core/daily';
import { randomSeed } from '../core/rng';
import { getFlag, getTanglePreset, loadTangleDaily, saveTangleDaily, setFlag, setTanglePreset } from '../core/storage';
import { createHeader } from '../ui/header';
import { formatClock } from '../ui/hud';
import { createTangleBoard } from './board';
import { MAX_LIVES, encode, newGame, restore, tap } from './game';
import { DAILY_PRESET, PRESETS, generateLevel, tangleDailySeed } from './generate';
import { openTangleHowto } from './howto';
import type { GameState, Level, PresetId } from './types';

export type TangleRoute = { mode: 'daily' } | { mode: 'practice'; preset: PresetId; seed?: number };

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const DEFAULT_PRESET: PresetId = 'hard';
const TICK_MS = 1000;

export function parseTangleRoute(hash: string): TangleRoute {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  if (path !== '/practice') return { mode: 'daily' };
  const params = new URLSearchParams(query);
  const asked = params.get('preset') as PresetId | null;
  const preset: PresetId =
    asked !== null ? (PRESET_IDS.includes(asked) ? asked : DEFAULT_PRESET) : (getTanglePreset() ?? DEFAULT_PRESET);
  const seed = Number(params.get('seed'));
  return params.has('seed') && Number.isInteger(seed) ? { mode: 'practice', preset, seed } : { mode: 'practice', preset };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function mountTangle(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  const now = deps.now ?? (() => new Date());

  // ---------- Static shell ----------
  root.textContent = '';
  root.classList.add('tangle-app');
  const shellHeader = createHeader({ game: 'Tangle', onHelp: () => openTangleHowto(helpBtn) });
  const header = shellHeader.el;
  const dailyTab = shellHeader.tabDaily!;
  const practiceTab = shellHeader.tabPractice!;
  const helpBtn = shellHeader.helpBtn!;

  const sub = el('div', 'tangle-sub');
  const stage = el('div', 'tangle-stage');
  const boardEl = el('div', 'tangle-board');
  stage.appendChild(boardEl);
  const hud = el('div', 'tangle-hud');
  const lives = el('span', 'tangle-lives');
  lives.setAttribute('aria-label', 'Lives');
  lives.setAttribute('role', 'img');
  const left = el('span', 'tangle-left hud-value num');
  left.setAttribute('aria-label', 'Arrows left');
  const time = el('span', 'tangle-time hud-value num');
  time.setAttribute('aria-label', 'Time');
  const attemptLabel = el('span', 'tangle-attempt hud-label');
  const stats = el('div', 'tangle-stats');
  stats.append(lives, left, time, attemptLabel);
  const controls = el('div', 'tangle-controls');
  hud.append(stats, controls);
  const main = el('main', 'tangle-main');
  main.append(sub, stage, hud);
  root.append(header, main);

  // ---------- State ----------
  let route: TangleRoute = { mode: 'daily' };
  let dailyDate = '';
  let dailyLevel: Level | null = null;
  /** Daily attempt, 1-based. */
  let attempt = 1;
  let practiceLevel: Level | null = null;
  let game: GameState | null = null;
  let baseElapsed = 0;
  let runningSince: number | null = null;
  let card: HTMLElement | null = null;

  const board = createTangleBoard(boardEl, { onTap });
  // Keep the HUD as wide as the board panel (which shrinks to its content).
  const panel = boardEl.querySelector<HTMLElement>('.tangle-panel')!;
  const hudSizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { hud.style.width = `min(100%, ${panel.offsetWidth}px)`; })
    : null;
  hudSizer?.observe(panel);

  const elapsed = () => baseElapsed + (runningSince === null ? 0 : now().getTime() - runningSince);

  function startTimer(fromMs: number): void {
    baseElapsed = fromMs;
    runningSince = now().getTime();
  }

  function stopTimer(): void {
    baseElapsed = elapsed();
    runningSince = null;
  }

  function renderLives(n: number): void {
    lives.textContent = '';
    for (let k = 0; k < MAX_LIVES; k++) {
      const lost = k >= n;
      const h = el('span', lost ? 'tangle-life is-lost' : 'tangle-life', lost ? '♡' : '♥');
      h.setAttribute('aria-hidden', 'true');
      lives.appendChild(h);
    }
    lives.title = `${n} of ${MAX_LIVES} lives left`;
    lives.setAttribute('aria-label', `${n} of ${MAX_LIVES} lives left`);
  }

  function renderHud(): void {
    if (!game) return;
    renderLives(game.lives);
    left.textContent = String(game.left);
    time.textContent = formatClock(elapsed());
    attemptLabel.textContent = route.mode === 'daily' && attempt > 1 ? `Attempt ${attempt}` : '';
    if (card) {
      const cd = card.querySelector('.tangle-countdown');
      if (cd) cd.textContent = `Next daily in ${formatCountdown(msUntilNextUtcMidnight(now()))}`;
    }
  }

  /** Saves the daily. Returns true if another tab had moved it on and the page reloaded that instead. */
  function persist(): boolean {
    if (route.mode !== 'daily' || !game) return false;
    // Another tab moved today's daily on (finished it, or started a later attempt): show that instead.
    const saved = loadTangleDaily(dailyDate);
    if (
      saved &&
      (saved.attempt > attempt || (saved.attempt === attempt && saved.status !== 'playing' && game.status === 'playing') ||
        (saved.attempt === attempt && saved.status === 'won'))
    ) {
      loadDaily();
      return true;
    }
    saveTangleDaily({
      date: dailyDate,
      removed: encode(game),
      lives: game.lives,
      elapsedMs: elapsed(),
      status: game.status,
      attempt,
    });
    return false;
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

  /** Win or loss dialog, centred over the board. A loss leaves the board undimmed so it can be studied. */
  function showCard(): void {
    if (!game) return;
    hideCard();
    const won = game.status === 'won';
    const daily = route.mode === 'daily';
    card = el('section', `end-card glass ${won ? 'end-card--won' : 'end-card--lost'}`);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-labelledby', 'tangle-card-title');
    const title = el('h2', 'end-card__title', won ? 'Untangled ✦' : 'Out of lives');
    title.id = 'tangle-card-title';
    card.appendChild(title);
    const clock = formatClock(elapsed());
    if (won) {
      const tries = daily ? (attempt > 1 ? ` · attempt ${attempt}` : ' · first try') : '';
      card.appendChild(el('p', 'end-card__stat num', clock + tries));
    } else {
      const total = game.level.arrows.length;
      const pct = total ? Math.round(((total - game.left) / total) * 100) : 0;
      card.appendChild(el('p', 'end-card__stat num', `${pct}% cleared · ${clock}`));
    }
    const actions = el('div', 'end-card__actions');
    const toPractice = () => { location.hash = '#/practice'; };
    let primary: HTMLButtonElement;
    if (daily) {
      card.appendChild(el('p', 'end-card__next tangle-countdown text-2 num'));
      if (won) {
        primary = button('Play practice', true, toPractice);
        actions.append(primary);
      } else {
        const practice = button('Play practice', false, toPractice);
        practice.dataset.action = 'practice';
        primary = button('Try again', true, retryDaily);
        actions.append(practice, primary);
      }
    } else {
      primary = button('New board', true, () => newPractice());
      actions.append(primary);
    }
    card.appendChild(actions);
    stage.classList.toggle('is-dimmed', won);
    stage.appendChild(card);
    renderHud();
    primary.focus({ preventScroll: true });
  }

  function setGame(g: GameState, fromMs: number): void {
    game = g;
    hideCard();
    board.setGame(g);
    if (g.status === 'playing') {
      board.setInteractive(true);
      startTimer(fromMs);
    } else {
      board.setInteractive(false);
      baseElapsed = fromMs;
      runningSince = null;
      showCard();
    }
    renderHud();
  }

  async function onTap(cell: number): Promise<void> {
    const g = game;
    if (!g) return;
    const result = tap(g, cell);
    if (result.kind === 'ignored') return;
    board.setInteractive(false);
    if (g.status !== 'playing') stopTimer();
    // If another tab moved the daily on, the board now shows that game: nothing to animate.
    if (persist()) return;
    renderHud();
    await board.play(result);
    if (game !== g) return; // replaced (restart, new board, route change) while animating
    if (g.status !== 'playing') showCard();
    else board.setInteractive(true);
  }

  // ---------- Modes ----------
  function loadDaily(): void {
    const date = utcDateString(now());
    if (date !== dailyDate || !dailyLevel) {
      dailyDate = date;
      dailyLevel = generateLevel(PRESETS[DAILY_PRESET], tangleDailySeed(dailyDate));
    }
    const spec = PRESETS[DAILY_PRESET];
    const level = dailyLevel;
    sub.textContent =
      `#${dailyNumber(dailyDate)} · ${formatDailyLabel(dailyDate)} · ${spec.cols}×${spec.rows} · ${level.arrows.length} arrows`;
    controls.textContent = '';
    const save = loadTangleDaily(dailyDate);
    const restored = save ? restore(level, save.removed, save.lives) : null;
    attempt = restored ? save!.attempt : 1;
    setGame(restored ?? newGame(level), restored ? save!.elapsedMs : 0);
  }

  function retryDaily(): void {
    attempt++;
    setGame(newGame(dailyLevel!), 0);
    persist();
  }

  function presetSwitch(active: PresetId): HTMLElement {
    const seg = el('div', 'seg tangle-presets');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Board size');
    for (const id of PRESET_IDS) {
      const b = el('button', 'seg__item', PRESETS[id].label);
      b.type = 'button';
      b.dataset.preset = id;
      b.setAttribute('aria-pressed', String(id === active));
      b.addEventListener('click', () => {
        setTanglePreset(id);
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
    controls.textContent = '';
    const restart = button('Restart', false, () => {
      if (practiceLevel) setGame(newGame(practiceLevel), 0);
    });
    restart.dataset.action = 'restart';
    const fresh = button('New board', true, () => newPractice());
    fresh.dataset.action = 'new';
    controls.append(restart, fresh);
    practiceLevel = generateLevel(PRESETS[preset], seed ?? randomSeed());
    setGame(newGame(practiceLevel), 0);
  }

  function newPractice(): void {
    if (route.mode !== 'practice') return;
    if (route.seed !== undefined) history.replaceState(null, '', '#/practice');
    route = { mode: 'practice', preset: route.preset };
    loadPractice(route.preset);
  }

  function render(): void {
    persist(); // leaving the daily must keep its clock
    route = parseTangleRoute(location.hash);
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
    if (JSON.stringify(parseTangleRoute(location.hash)) !== JSON.stringify(route)) render();
  };
  // Time spent away in the back/forward cache does not count.
  const onHide = () => {
    persist();
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
  if (!getFlag('tangle-howto-seen')) {
    setFlag('tangle-howto-seen', true);
    openTangleHowto(helpBtn);
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
