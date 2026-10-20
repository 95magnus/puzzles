import {
  dailyNumber,
  formatCountdown,
  formatDailyLabel,
  msUntilNextUtcMidnight,
  utcDateString,
} from '../core/daily';
import { mulberry32, randomSeed } from '../core/rng';
import { getMinesPreset, loadMinesDaily, saveMinesDaily, setMinesPreset } from '../core/storage';
import { createBoard } from './board';
import { chord, encodeCells, newGame, restoreGame, reveal, toggleFlag } from './game';
import { DAILY_PRESET, PRESETS, generateBoard, minesDailySeed } from './generate';
import type { InputAction } from './input';
import type { Board, GameState, PresetId } from './types';

export type MinesRoute = { mode: 'daily' } | { mode: 'practice'; preset: PresetId; seed?: number };

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const TICK_MS = 1000;

export function parseMinesRoute(hash: string): MinesRoute {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  if (path !== '/practice') return { mode: 'daily' };
  const params = new URLSearchParams(query);
  const asked = params.get('preset') as PresetId | null;
  const preset: PresetId =
    asked !== null ? (PRESET_IDS.includes(asked) ? asked : 'expert') : (getMinesPreset() ?? 'expert');
  const seed = Number(params.get('seed'));
  return params.has('seed') && Number.isInteger(seed) ? { mode: 'practice', preset, seed } : { mode: 'practice', preset };
}

/** mm:ss; minutes keep counting past 59. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function safeCount(board: Board): number {
  return board.mines.length - board.mines.reduce((s, m) => s + m, 0);
}

export function mountMines(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  const now = deps.now ?? (() => new Date());

  // ---------- Static shell ----------
  root.textContent = '';
  root.classList.add('mines-app');
  const header = el('header', 'mines-header');
  const games = el('nav', 'mines-games');
  games.setAttribute('aria-label', 'Games');
  const flowLink = el('a', '', 'Flow');
  flowLink.href = './index.html';
  const minesLink = el('a', '', 'Mines');
  minesLink.href = './minesweeper.html';
  minesLink.setAttribute('aria-current', 'page');
  games.append(flowLink, minesLink);
  const modes = el('nav', 'seg mines-modes');
  modes.setAttribute('aria-label', 'Mode');
  const dailyTab = el('a', 'seg__item', 'Daily');
  dailyTab.href = '#/';
  const practiceTab = el('a', 'seg__item', 'Practice');
  practiceTab.href = '#/practice';
  modes.append(dailyTab, practiceTab);
  const helpBtn = el('button', 'btn mines-help', '?');
  helpBtn.type = 'button';
  helpBtn.setAttribute('aria-label', 'How to play');
  header.append(games, modes, helpBtn);

  const sub = el('div', 'mines-sub');
  const stage = el('div', 'mines-stage');
  const boardEl = el('div', 'mines-board');
  stage.appendChild(boardEl);
  const hud = el('div', 'mines-hud');
  const left = el('span', 'mines-left num');
  left.setAttribute('aria-label', 'Mines left');
  const time = el('span', 'mines-time num');
  time.setAttribute('aria-label', 'Time');
  const stats = el('div', 'mines-stats');
  stats.append(left, time);
  const controls = el('div', 'mines-controls');
  hud.append(stats, controls);
  const main = el('main', 'mines-main');
  main.append(sub, stage, hud);
  root.append(header, main);

  // ---------- State ----------
  let route: MinesRoute = { mode: 'daily' };
  let dailyDate = '';
  let practiceBoard: Board | null = null;
  let game: GameState;
  let baseElapsed = 0;
  let runningSince: number | null = null;
  let card: HTMLElement | null = null;

  const board = createBoard(boardEl, { onAction });
  // Keep the HUD as wide as the board panel (which shrinks to its content).
  const panel = boardEl.querySelector<HTMLElement>('.mines-panel')!;
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

  function renderHud(): void {
    left.textContent = String(minesLeft());
    time.textContent = formatClock(elapsed());
    if (card) {
      const cd = card.querySelector('.mines-countdown');
      if (cd) cd.textContent = `Next daily in ${formatCountdown(msUntilNextUtcMidnight(now()))}`;
    }
  }

  function minesLeft(): number {
    return game.board.mines.reduce((s, m) => s + m, 0) - game.flags;
  }

  function persist(): void {
    if (route.mode !== 'daily') return;
    saveMinesDaily({ date: dailyDate, cells: encodeCells(game), elapsedMs: elapsed(), status: game.status });
  }

  function hideCard(): void {
    card?.remove();
    card = null;
    stage.classList.remove('is-dimmed');
  }

  function showCard(): void {
    hideCard();
    const won = game.status === 'won';
    card = el('section', `mines-card glass ${won ? 'mines-card--won' : 'mines-card--lost'}`);
    card.setAttribute('role', 'status');
    card.appendChild(el('h2', '', won ? 'Cleared ✦' : 'Boom.'));
    const clock = formatClock(elapsed());
    if (won) {
      card.appendChild(el('p', 'mines-card__time num', clock));
    } else {
      const pct = Math.round((game.revealed / safeCount(game.board)) * 100);
      card.appendChild(el('p', 'mines-card__time num', `${pct}% cleared · ${clock}`));
    }
    const primary = el('button', 'btn btn--primary');
    primary.type = 'button';
    if (route.mode === 'daily') {
      card.appendChild(el('p', 'mines-countdown text-2 num'));
      primary.textContent = 'Play practice';
      primary.addEventListener('click', () => { location.hash = '#/practice'; });
    } else {
      primary.textContent = 'New board';
      primary.addEventListener('click', () => newPractice());
    }
    card.appendChild(primary);
    if (won) {
      stage.classList.add('is-dimmed');
      stage.appendChild(card);
    } else {
      main.insertBefore(card, hud.nextSibling);
    }
    renderHud();
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

  function onAction(a: InputAction): void {
    const kind = a.kind === 'tap' ? (game.cells[a.cell] === 1 ? 'chord' : 'reveal') : a.kind;
    const fn = kind === 'flag' ? toggleFlag : kind === 'chord' ? chord : reveal;
    const changed = fn(game, a.cell);
    if (changed.length === 0) return;
    board.update(changed, kind === 'flag' ? undefined : a.cell);
    if (game.status !== 'playing') {
      stopTimer();
      board.setInteractive(false);
      showCard();
    }
    renderHud();
    persist();
  }

  // ---------- Modes ----------
  function loadDaily(): void {
    dailyDate = utcDateString(now());
    const spec = PRESETS[DAILY_PRESET];
    sub.textContent = `#${dailyNumber(dailyDate)} · ${formatDailyLabel(dailyDate)} · ${spec.cols}×${spec.rows} · ${spec.mines} mines`;
    controls.textContent = '';
    const b = generateBoard(spec, mulberry32(minesDailySeed(dailyDate)));
    const save = loadMinesDaily(dailyDate);
    const restored = save ? restoreGame(b, save.cells, save.status) : null;
    setGame(restored ?? newGame(b), restored ? save!.elapsedMs : 0);
  }

  function presetSwitch(active: PresetId): HTMLElement {
    const seg = el('div', 'seg mines-presets');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Board size');
    for (const id of PRESET_IDS) {
      const b = el('button', 'seg__item', PRESETS[id].label);
      b.type = 'button';
      b.dataset.preset = id;
      b.setAttribute('aria-pressed', String(id === active));
      b.addEventListener('click', () => {
        setMinesPreset(id);
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
    const restart = el('button', 'btn', 'Restart');
    restart.type = 'button';
    restart.dataset.action = 'restart';
    restart.addEventListener('click', () => setGame(newGame(practiceBoard!), 0));
    const fresh = el('button', 'btn btn--primary', 'New board');
    fresh.type = 'button';
    fresh.dataset.action = 'new';
    fresh.addEventListener('click', () => newPractice());
    controls.append(restart, fresh);
    practiceBoard = generateBoard(PRESETS[preset], mulberry32(seed ?? randomSeed()));
    setGame(newGame(practiceBoard), 0);
  }

  function newPractice(): void {
    if (route.mode !== 'practice') return;
    if (route.seed !== undefined) history.replaceState(null, '', '#/practice');
    route = { mode: 'practice', preset: route.preset };
    loadPractice(route.preset);
  }

  function render(): void {
    route = parseMinesRoute(location.hash);
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
    if (JSON.stringify(parseMinesRoute(location.hash)) !== JSON.stringify(route)) render();
  };
  const onHide = () => persist();
  window.addEventListener('hashchange', onHash);
  window.addEventListener('pagehide', onHide);
  const interval = setInterval(tick, TICK_MS);
  render();

  return () => {
    clearInterval(interval);
    hudSizer?.disconnect();
    window.removeEventListener('hashchange', onHash);
    window.removeEventListener('pagehide', onHide);
    board.destroy();
  };
}
