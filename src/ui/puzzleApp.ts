import {
  dailyNumber,
  formatCountdown,
  formatDailyLabel,
  msUntilNextUtcMidnight,
  utcDateString,
} from '../core/daily';
import { createPlayTracker } from '../core/analytics';
import { randomSeed } from '../core/rng';
import { getFlag, setFlag } from '../core/storage';
import { createHeader } from './header';
import { formatClock } from './hud';

export type Status = 'playing' | 'won' | 'lost';
export type PresetRoute<P extends string> = { mode: 'daily' } | { mode: 'practice'; preset: P; seed?: number };
type SaveBase = { v: 1; date: string; elapsedMs: number };
type FlagName = Parameters<typeof getFlag>[0];

/** What the shell hands a game's board and controls. */
export type BoardCtx<G, Spec> = {
  game(): G | null;
  /** The puzzle on screen (today's daily or the practice board). */
  spec(): Spec;
  /**
   * Shared tail of every move; the board has already redrawn. Saves, updates the HUD and ends the
   * game if it finished, then awaits `after` (an animation) and shows the end card.
   */
  changed(g: G, after?: () => Promise<void>): Promise<void>;
  /** Show a different game (Restart, or a board built on the first move). */
  replace(g: G): void;
};

export type Control<G, Spec> = {
  action: string;
  label: string;
  run(g: G, ctx: BoardCtx<G, Spec>): void;
  disabled?(g: G): boolean;
  /** Only shown in practice; the shell adds "New board" after these there. */
  practiceOnly?: boolean;
};

export type BoardAdapter<G, Spec> = {
  setGame(g: G): void;
  setInteractive(on: boolean): void;
  destroy(): void;
  controls?: Control<G, Spec>[];
};

export type Stat<G, Spec> = {
  /** Full class list, e.g. 'queens-count hud-value num'. */
  cls: string;
  label: string;
  role?: string;
  render(g: G, el: HTMLElement, spec: Spec): void;
};

export type PuzzleGame<P extends string, Spec, G extends { status: Status }, Save extends SaveBase> = {
  /** CSS prefix (`${id}-app`, `${id}-panel`, ...) and analytics id. */
  id: string;
  title: string;
  howtoFlag: FlagName;
  howto(anchor: HTMLElement): void;

  presets: Record<P, { label: string }>;
  dailyPreset: P;
  defaultPreset: P;
  dailySpec(date: string): Spec;
  practiceSpec(preset: P, seed: number): Spec;
  /** The end of the daily subtitle, e.g. '8×8'. */
  dailyDetail(spec: Spec): string;
  newGame(spec: Spec): G;

  daily: { load(date: string): Save | null; save(s: Omit<Save, 'v'>): void };
  preset: { get(): P | null; set(id: P): void };
  toSave(g: G, at: { date: string; elapsedMs: number; attempt: number }): Omit<Save, 'v'>;
  fromSave(spec: Spec, s: Save): { game: G; attempt: number } | null;
  /** Another tab moved today's daily on: show the stored one instead of saving over it. */
  supersedes(saved: Save, g: G, attempt: number): boolean;
  /**
   * Leaving the daily (pagehide, route change) saves only after a change here or when the stored
   * board is this one, so the clock keeps running without clobbering another tab's moves.
   * Without it, leaving always saves.
   */
  ownsSave?(saved: Save, g: G): boolean;

  mountBoard(host: HTMLElement, ctx: BoardCtx<G, Spec>): BoardAdapter<G, Spec>;
  /** HUD values before the clock. */
  stats: Stat<G, Spec>[];
  card: {
    title(g: G): string;
    /** Defaults to the clock. */
    stat?(g: G, clock: string, at: { daily: boolean; attempt: number }): string;
    /** Dim the board behind a win card. */
    dimOnWin?: boolean;
  };
  /** Daily attempts: an "Attempt n" HUD label, and a lost daily offers "Try again". */
  attempts?: boolean;
  /** A game whose clock waits for the first move (no play is tracked until then). */
  startsPaused?(g: G): boolean;
};

const TICK_MS = 1000;

export function parsePresetRoute<P extends string>(
  hash: string,
  game: { presets: Record<P, unknown>; defaultPreset: P; preset: { get(): P | null } },
): PresetRoute<P> {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  if (path !== '/practice') return { mode: 'daily' };
  const params = new URLSearchParams(query);
  const ids = Object.keys(game.presets) as P[];
  const asked = params.get('preset') as P | null;
  const preset: P =
    asked !== null ? (ids.includes(asked) ? asked : game.defaultPreset) : (game.preset.get() ?? game.defaultPreset);
  const seed = Number(params.get('seed'));
  return params.has('seed') && Number.isInteger(seed) ? { mode: 'practice', preset, seed } : { mode: 'practice', preset };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function mountPuzzleApp<P extends string, Spec, G extends { status: Status }, Save extends SaveBase>(
  root: HTMLElement,
  def: PuzzleGame<P, Spec, G, Save>,
  deps: { now?: () => Date } = {},
): () => void {
  const now = deps.now ?? (() => new Date());
  const id = def.id;
  const presetIds = Object.keys(def.presets) as P[];

  // ---------- Static shell ----------
  root.textContent = '';
  root.classList.add(`${id}-app`);
  const shellHeader = createHeader({ game: def.title, onHelp: () => def.howto(helpBtn) });
  const header = shellHeader.el;
  const dailyTab = shellHeader.tabDaily!;
  const practiceTab = shellHeader.tabPractice!;
  const helpBtn = shellHeader.helpBtn!;

  const sub = el('div', `${id}-sub`);
  const stage = el('div', `${id}-stage`);
  const boardEl = el('div', `${id}-board`);
  stage.appendChild(boardEl);
  const hud = el('div', `${id}-hud`);
  const statEls = def.stats.map((s) => {
    const e = el('span', s.cls);
    e.setAttribute('aria-label', s.label);
    if (s.role) e.setAttribute('role', s.role);
    return e;
  });
  const time = el('span', `${id}-time hud-value num`);
  time.setAttribute('aria-label', 'Time');
  const attemptLabel = def.attempts ? el('span', `${id}-attempt hud-label`) : null;
  const stats = el('div', `${id}-stats`);
  stats.append(...statEls, time);
  if (attemptLabel) stats.append(attemptLabel);
  const controls = el('div', `${id}-controls`);
  hud.append(stats, controls);
  const main = el('main', `${id}-main`);
  main.append(sub, stage, hud);
  root.append(header, main);

  // ---------- State ----------
  let route: PresetRoute<P> = { mode: 'daily' };
  let dailyDate = '';
  let dailySpec: Spec | null = null;
  let spec: Spec | null = null;
  /** Daily attempt, 1-based. */
  let attempt = 1;
  let game: G | null = null;
  let baseElapsed = 0;
  let runningSince: number | null = null;
  let card: HTMLElement | null = null;
  /** True when this tab changed the daily since it last loaded or saved it; leaving only writes then (see `ownsSave`). */
  let dirty = false;

  const ctx: BoardCtx<G, Spec> = {
    game: () => game,
    spec: () => spec!,
    changed,
    replace: (g) => setGame(g, 0),
  };
  const board = def.mountBoard(boardEl, ctx);
  // Keep the HUD as wide as the board panel (which shrinks to its content).
  const panel = boardEl.querySelector<HTMLElement>(`.${id}-panel`)!;
  const hudSizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { hud.style.width = `min(100%, ${panel.offsetWidth}px)`; })
    : null;
  hudSizer?.observe(panel);

  const play = createPlayTracker(id);
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
    def.stats.forEach((s, i) => s.render(g, statEls[i], spec!));
    time.textContent = formatClock(elapsed());
    if (attemptLabel) attemptLabel.textContent = route.mode === 'daily' && attempt > 1 ? `Attempt ${attempt}` : '';
    for (const b of controls.querySelectorAll<HTMLButtonElement>('button')) {
      const c = board.controls?.find((x) => x.action === b.dataset.action);
      if (c?.disabled) b.disabled = c.disabled(g);
    }
    if (card) {
      const cd = card.querySelector(`.${id}-countdown`);
      if (cd) cd.textContent = `Next daily in ${formatCountdown(msUntilNextUtcMidnight(now()))}`;
    }
  }

  /** Saves the daily. Returns true if another tab had moved it on and the page reloaded that instead. */
  function persist(): boolean {
    if (route.mode !== 'daily' || !game) return false;
    const saved = def.daily.load(dailyDate);
    if (saved && def.supersedes(saved, game, attempt)) {
      loadDaily();
      return true;
    }
    def.daily.save(def.toSave(game, { date: dailyDate, elapsedMs: elapsed(), attempt }));
    dirty = false;
    return false;
  }

  function persistOnLeave(): void {
    if (route.mode !== 'daily' || !game) return;
    if (!def.ownsSave) {
      persist();
      return;
    }
    const saved = def.daily.load(dailyDate);
    if (dirty || !saved || def.ownsSave(saved, game)) persist();
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
    card.setAttribute('aria-labelledby', `${id}-card-title`);
    const title = el('h2', 'end-card__title', def.card.title(game));
    title.id = `${id}-card-title`;
    card.appendChild(title);
    const clock = formatClock(elapsed());
    card.appendChild(el('p', 'end-card__stat num', def.card.stat ? def.card.stat(game, clock, { daily, attempt }) : clock));
    const actions = el('div', 'end-card__actions');
    const toPractice = () => { location.hash = '#/practice'; };
    let primary: HTMLButtonElement;
    if (daily) {
      card.appendChild(el('p', `end-card__next ${id}-countdown text-2 num`));
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
    if (def.card.dimOnWin) stage.classList.toggle('is-dimmed', won);
    stage.appendChild(card);
    renderHud();
    primary.focus({ preventScroll: true });
  }

  function setGame(g: G, fromMs: number): void {
    game = g;
    dirty = false;
    hideCard();
    board.setGame(g);
    if (g.status === 'playing') {
      board.setInteractive(true);
      if (def.startsPaused?.(g)) {
        baseElapsed = fromMs;
        runningSince = null;
      } else {
        startTimer(fromMs);
        play.begin(route.mode === 'daily' ? { mode: 'daily' } : { mode: 'practice', preset: route.preset });
      }
    } else {
      board.setInteractive(false);
      baseElapsed = fromMs;
      runningSince = null;
      showCard();
    }
    renderHud();
  }

  async function changed(g: G, after?: () => Promise<void>): Promise<void> {
    dirty = true;
    play.move();
    const ended = g.status !== 'playing';
    if (ended) {
      stopTimer();
      board.setInteractive(false);
      play.end(g.status as 'won' | 'lost', elapsed());
    }
    // If another tab moved the daily on, the board now shows that game.
    if (persist()) return;
    renderHud();
    if (after) {
      await after();
      if (game !== g) return; // replaced (restart, new board, route change) while animating
    }
    if (ended && !card) showCard();
  }

  // ---------- Modes ----------
  function renderControls(mode: 'daily' | 'practice'): void {
    controls.textContent = '';
    for (const c of board.controls ?? []) {
      if (c.practiceOnly && mode !== 'practice') continue;
      const b = button(c.label, false, () => { if (game) c.run(game, ctx); });
      b.dataset.action = c.action;
      controls.append(b);
    }
    if (mode === 'practice') {
      const fresh = button('New board', true, () => newPractice());
      fresh.dataset.action = 'new';
      controls.append(fresh);
    }
  }

  function loadDaily(): void {
    const date = utcDateString(now());
    if (date !== dailyDate || dailySpec === null) {
      dailyDate = date;
      dailySpec = def.dailySpec(dailyDate);
    }
    spec = dailySpec;
    sub.textContent = `#${dailyNumber(dailyDate)} · ${formatDailyLabel(dailyDate)} · ${def.dailyDetail(spec)}`;
    renderControls('daily');
    const save = def.daily.load(dailyDate);
    const restored = save ? def.fromSave(spec, save) : null;
    attempt = restored ? restored.attempt : 1;
    setGame(restored ? restored.game : def.newGame(spec), restored ? save!.elapsedMs : 0);
  }

  function retryDaily(): void {
    attempt++;
    setGame(def.newGame(dailySpec!), 0);
    persist();
  }

  function presetSwitch(active: P): HTMLElement {
    const seg = el('div', `seg ${id}-presets`);
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Board size');
    for (const p of presetIds) {
      const b = el('button', 'seg__item', def.presets[p].label);
      b.type = 'button';
      b.dataset.preset = p;
      b.setAttribute('aria-pressed', String(p === active));
      b.addEventListener('click', () => {
        def.preset.set(p);
        history.replaceState(null, '', '#/practice');
        route = { mode: 'practice', preset: p };
        loadPractice(p);
      });
      seg.appendChild(b);
    }
    return seg;
  }

  function loadPractice(preset: P, seed?: number): void {
    sub.textContent = '';
    sub.appendChild(presetSwitch(preset));
    renderControls('practice');
    spec = def.practiceSpec(preset, seed ?? randomSeed());
    setGame(def.newGame(spec), 0);
  }

  function newPractice(): void {
    if (route.mode !== 'practice') return;
    if (route.seed !== undefined) history.replaceState(null, '', '#/practice');
    route = { mode: 'practice', preset: route.preset };
    loadPractice(route.preset);
  }

  function render(): void {
    persistOnLeave(); // leaving the daily must keep its clock
    route = parsePresetRoute(location.hash, def);
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
    if (JSON.stringify(parsePresetRoute(location.hash, def)) !== JSON.stringify(route)) render();
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
  if (!getFlag(def.howtoFlag)) {
    setFlag(def.howtoFlag, true);
    def.howto(helpBtn);
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
