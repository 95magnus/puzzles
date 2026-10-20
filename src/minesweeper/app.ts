import {
  dailyNumber,
  formatCountdown,
  formatDailyLabel,
  msUntilNextUtcMidnight,
  utcDateString,
} from '../core/daily';
import { mulberry32, randomSeed } from '../core/rng';
import { getFlag, getMinesPreset, loadMinesDaily, saveMinesDaily, setFlag, setMinesPreset } from '../core/storage';
import { createHeader } from '../ui/header';
import { createBoard } from './board';
import { chord, encodeCells, newGame, restoreGame, reveal, toggleFlag } from './game';
import { DAILY_PRESET, PRESETS, generateBoard, minesDailySeed } from './generate';
import { openMinesHowto } from './howto';
import type { InputAction } from './input';
import type { Board, BoardSpec, GameState, PresetId } from './types';

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
  const shellHeader = createHeader({ game: 'Mines', onHelp: () => openMinesHowto(helpBtn) });
  const header = shellHeader.el;
  const dailyTab = shellHeader.tabDaily!;
  const practiceTab = shellHeader.tabPractice!;
  const helpBtn = shellHeader.helpBtn!;

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
  const attemptLabel = el('span', 'mines-attempt text-2');
  stats.append(left, time, attemptLabel);
  const controls = el('div', 'mines-controls');
  hud.append(stats, controls);
  const main = el('main', 'mines-main');
  main.append(sub, stage, hud);
  root.append(header, main);

  // ---------- State ----------
  let route: MinesRoute = { mode: 'daily' };
  let dailyDate = '';
  let dailyBoard: Board | null = null;
  /** Daily attempt, 1-based. */
  let attempt = 1;
  let practiceBoard: Board | null = null;
  /** A blank practice board waiting for its first click to be generated. */
  let pending: { spec: BoardSpec; seed: number } | null = null;
  let mineTotal = 0;
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
    left.textContent = String(mineTotal - game.flags);
    time.textContent = formatClock(elapsed());
    attemptLabel.textContent = route.mode === 'daily' && attempt > 1 ? `Attempt ${attempt}` : '';
    if (card) {
      const cd = card.querySelector('.mines-countdown');
      if (cd) cd.textContent = `Next daily in ${formatCountdown(msUntilNextUtcMidnight(now()))}`;
    }
  }

  function persist(): void {
    if (route.mode !== 'daily') return;
    // Another tab moved today's daily on (finished it, or started a later attempt): show that instead.
    const saved = loadMinesDaily(dailyDate);
    if (
      saved &&
      (saved.attempt > attempt || (saved.attempt === attempt && saved.status !== 'playing' && game.status === 'playing'))
    ) {
      loadDaily();
      return;
    }
    saveMinesDaily({ date: dailyDate, cells: encodeCells(game), elapsedMs: elapsed(), status: game.status, attempt });
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
    hideCard();
    const won = game.status === 'won';
    const daily = route.mode === 'daily';
    card = el('section', `mines-card glass ${won ? 'mines-card--won' : 'mines-card--lost'}`);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-labelledby', 'mines-card-title');
    const title = el('h2', '', won ? 'Cleared ✦' : 'Boom.');
    title.id = 'mines-card-title';
    card.appendChild(title);
    const clock = formatClock(elapsed());
    if (won) {
      const tries = daily ? (attempt > 1 ? ` · attempt ${attempt}` : ' · first try') : '';
      card.appendChild(el('p', 'mines-card__time num', clock + tries));
    } else {
      const pct = Math.round((game.revealed / safeCount(game.board)) * 100);
      card.appendChild(el('p', 'mines-card__time num', `${pct}% cleared · ${clock}`));
    }
    const actions = el('div', 'mines-card__actions');
    const toPractice = () => { location.hash = '#/practice'; };
    let primary: HTMLButtonElement;
    if (daily) {
      card.appendChild(el('p', 'mines-countdown text-2 num'));
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

  function setGame(g: GameState, fromMs: number, run = true): void {
    game = g;
    hideCard();
    board.setGame(g);
    if (g.status === 'playing') {
      board.setInteractive(true);
      if (run) startTimer(fromMs);
      else {
        baseElapsed = fromMs;
        runningSince = null;
      }
    } else {
      board.setInteractive(false);
      baseElapsed = fromMs;
      runningSince = null;
      showCard();
    }
    renderHud();
  }

  /** First reveal on a blank practice board: build the board around that cell, keeping earlier flags. */
  function generateAround(cell: number): void {
    const { spec, seed } = pending!;
    pending = null;
    const blank = game;
    practiceBoard = generateBoard(spec, mulberry32(seed), cell);
    const g = newGame(practiceBoard);
    blank.cells.forEach((v, i) => {
      if (v === 2 && g.cells[i] === 0) toggleFlag(g, i);
    });
    setGame(g, 0);
  }

  function onAction(a: InputAction): void {
    const kind = a.kind === 'tap' ? (game.cells[a.cell] === 1 ? 'chord' : 'reveal') : a.kind;
    if (pending && kind !== 'flag') {
      if (kind === 'reveal') generateAround(a.cell);
      return;
    }
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
    pending = null;
    mineTotal = spec.mines;
    const b = generateBoard(spec, mulberry32(minesDailySeed(dailyDate)));
    dailyBoard = b;
    const save = loadMinesDaily(dailyDate);
    const restored = save ? restoreGame(b, save.cells, save.status) : null;
    attempt = restored ? save!.attempt : 1;
    setGame(restored ?? newGame(b), restored ? save!.elapsedMs : 0);
  }

  function retryDaily(): void {
    attempt++;
    setGame(newGame(dailyBoard!), 0);
    persist();
  }

  /** All tiles hidden, nothing generated yet; flags still work. */
  function blankGame(spec: BoardSpec): GameState {
    const n = spec.cols * spec.rows;
    const empty: Board = { cols: spec.cols, rows: spec.rows, mines: new Uint8Array(n), adj: new Uint8Array(n), start: -1 };
    return { board: empty, cells: new Uint8Array(n), status: 'playing', revealed: 0, flags: 0, explodedAt: -1 };
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
    // Restart replays the generated board from its opening; before the first click there is nothing to replay.
    const restart = button('Restart', false, () => {
      if (practiceBoard) setGame(newGame(practiceBoard), 0);
    });
    restart.dataset.action = 'restart';
    const fresh = button('New board', true, () => newPractice());
    fresh.dataset.action = 'new';
    controls.append(restart, fresh);
    const spec = PRESETS[preset];
    mineTotal = spec.mines;
    practiceBoard = null;
    pending = { spec, seed: seed ?? randomSeed() };
    setGame(blankGame(spec), 0, false);
  }

  function newPractice(): void {
    if (route.mode !== 'practice') return;
    if (route.seed !== undefined) history.replaceState(null, '', '#/practice');
    route = { mode: 'practice', preset: route.preset };
    loadPractice(route.preset);
  }

  function render(): void {
    if (game) persist(); // leaving the daily must keep its clock
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
  // Time spent away in the back/forward cache does not count.
  const onHide = () => {
    persist();
    if (runningSince !== null) stopTimer();
  };
  const onShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    if (route.mode === 'daily' && utcDateString(now()) !== dailyDate) loadDaily();
    else if (game.status === 'playing') startTimer(baseElapsed);
  };
  window.addEventListener('hashchange', onHash);
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);
  const interval = setInterval(tick, TICK_MS);
  render();
  if (!getFlag('mines-howto-seen')) {
    setFlag('mines-howto-seen', true);
    openMinesHowto(helpBtn);
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
