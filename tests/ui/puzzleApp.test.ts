// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CLEAR_CONFIRM } from '../../src/ui/confirm';
import { mountPuzzleApp, parsePresetRoute, type PuzzleGame, type Status } from '../../src/ui/puzzleApp';

/** A minimal game: a move counter that can be won or lost from its controls. */
type P = 'small' | 'large';
type Spec = { key: string };
/** `rev` counts changes, so a save with a higher one came from another tab. */
type G = { status: Status; moves: number; rev: number; key: string };
type Save = { v: 1; date: string; elapsedMs: number; moves: number; rev: number; status: Status; attempt: number };

const DATE = '2026-10-26';
let root: HTMLElement;
let nowMs: number;
let unmount: (() => void) | undefined;
let saves: Map<string, Save>;
let storedPreset: P | null;
let howto: ReturnType<typeof vi.fn<(anchor: HTMLElement) => void>>;
let dailySpec: ReturnType<typeof vi.fn<(date: string) => Spec>>;

const text = (sel: string) => root.querySelector(sel)?.textContent?.trim() ?? '';
const click = (action: string) => root.querySelector<HTMLButtonElement>(`.queens-controls [data-action="${action}"]`)!.click();
const modalButton = (action: string) => document.querySelector<HTMLButtonElement>(`.modal [data-action="${action}"]`)!;

function makeGame(): PuzzleGame<P, Spec, G, Save> {
  const act = (fn: (g: G) => void) => (g: G, ctx: { changed(g: G): Promise<void> }) => {
    fn(g);
    g.rev++;
    void ctx.changed(g);
  };
  return {
    id: 'queens',
    title: 'Counter',
    howtoFlag: 'queens-howto-seen',
    howto,
    presets: { small: { label: 'Small' }, large: { label: 'Large' } },
    dailyPreset: 'small',
    defaultPreset: 'small',
    dailySpec,
    practiceSpec: (preset, seed) => ({ key: `${preset}:${seed}` }),
    dailyDetail: () => '5×5',
    newGame: (spec) => ({ status: 'playing', moves: 0, rev: 0, key: spec.key }),
    daily: {
      load: (date) => saves.get(date) ?? null,
      save: (s) => void saves.set(s.date, { v: 1, ...s }),
    },
    preset: { get: () => storedPreset, set: (p) => void (storedPreset = p) },
    toSave: (g, at) => ({ date: at.date, elapsedMs: at.elapsedMs, moves: g.moves, rev: g.rev, status: g.status, attempt: at.attempt }),
    fromSave: (spec, s) => ({ game: { status: s.status, moves: s.moves, rev: s.rev, key: spec.key }, attempt: s.attempt }),
    supersedes: (saved, g, attempt) => saved.attempt > attempt || (saved.attempt === attempt && saved.rev > g.rev),
    mountBoard(host) {
      const panel = document.createElement('div');
      panel.className = 'queens-panel';
      host.append(panel);
      return {
        setGame: (g) => void (panel.textContent = `${g.key}:${g.moves}`),
        setInteractive: (on) => panel.toggleAttribute('data-interactive', on),
        destroy: () => panel.remove(),
        controls: [
          { action: 'move', label: 'Move', run: act((g) => g.moves++) },
          { action: 'clear', label: 'Clear', confirm: CLEAR_CONFIRM, disabled: (g) => g.moves === 0, run: act((g) => (g.moves = 0)) },
          { action: 'win', label: 'Win', run: act((g) => (g.status = 'won')) },
          { action: 'lose', label: 'Lose', run: act((g) => (g.status = 'lost')) },
          { action: 'peek', label: 'Peek', practiceOnly: true, run: () => {} },
        ],
      };
    },
    stats: [{ cls: 'queens-moves hud-value num', label: 'Moves', render: (g, el) => void (el.textContent = String(g.moves)) }],
    card: { title: (g) => (g.status === 'won' ? 'Solved' : 'Out of moves') },
    attempts: true,
  };
}

function mount(hash = '#/') {
  location.hash = hash;
  unmount = mountPuzzleApp(root, makeGame(), { now: () => new Date(nowMs) });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  localStorage.clear();
  localStorage.setItem('flow:flag:queens-howto-seen', '1');
  nowMs = Date.parse(`${DATE}T12:00:00Z`);
  saves = new Map();
  storedPreset = null;
  howto = vi.fn<(anchor: HTMLElement) => void>();
  dailySpec = vi.fn((date: string) => ({ key: `daily:${date}` }));
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  document.body.textContent = '';
  vi.useRealTimers();
});

test('parsePresetRoute: anything but #/practice is the daily', () => {
  const game = { presets: { small: 1, large: 1 }, defaultPreset: 'small' as P, preset: { get: () => null } };
  expect(parsePresetRoute('', game)).toEqual({ mode: 'daily' });
  expect(parsePresetRoute('#/nope', game)).toEqual({ mode: 'daily' });
});

test('parsePresetRoute: practice takes the asked, stored or default preset', () => {
  const game = (stored: P | null) => ({ presets: { small: 1, large: 1 }, defaultPreset: 'small' as P, preset: { get: () => stored } });
  expect(parsePresetRoute('#/practice?preset=large', game(null))).toEqual({ mode: 'practice', preset: 'large' });
  expect(parsePresetRoute('#/practice?preset=huge', game('large'))).toEqual({ mode: 'practice', preset: 'small' });
  expect(parsePresetRoute('#/practice', game('large'))).toEqual({ mode: 'practice', preset: 'large' });
  expect(parsePresetRoute('#/practice', game(null))).toEqual({ mode: 'practice', preset: 'small' });
});

test('parsePresetRoute: keeps an integer seed and drops anything else', () => {
  const game = { presets: { small: 1, large: 1 }, defaultPreset: 'small' as P, preset: { get: () => null } };
  expect(parsePresetRoute('#/practice?seed=42', game)).toEqual({ mode: 'practice', preset: 'small', seed: 42 });
  expect(parsePresetRoute('#/practice?seed=4.2', game)).toEqual({ mode: 'practice', preset: 'small' });
  expect(parsePresetRoute('#/practice?seed=abc', game)).toEqual({ mode: 'practice', preset: 'small' });
});

test("shows today's daily with its subtitle and a running clock", () => {
  mount();
  expect(dailySpec).toHaveBeenCalledWith(DATE);
  expect(text('.queens-sub')).toMatch(/^#\d+ · .+ · 5×5$/);
  expect(text('.queens-panel')).toBe(`daily:${DATE}:0`);
  expect(root.querySelector('[data-action="peek"]')).toBeNull();
  nowMs += 3000;
  vi.advanceTimersByTime(1000);
  expect(text('.queens-time')).toBe('00:03');
});

test('restores a saved daily with its moves and clock', () => {
  saves.set(DATE, { v: 1, date: DATE, elapsedMs: 65_000, moves: 3, rev: 3, status: 'playing', attempt: 1 });
  mount();
  expect(text('.queens-panel')).toBe(`daily:${DATE}:3`);
  expect(text('.queens-moves')).toBe('3');
  expect(text('.queens-time')).toBe('01:05');
});

test('every move saves the daily', () => {
  mount();
  click('move');
  click('move');
  expect(saves.get(DATE)).toMatchObject({ moves: 2, status: 'playing', attempt: 1 });
  expect(text('.queens-moves')).toBe('2');
});

test('a control with a confirm only runs from the dialog', () => {
  mount();
  click('move');
  click('clear');
  modalButton('cancel').click();
  expect(saves.get(DATE)?.moves).toBe(1);
  click('clear');
  modalButton('confirm').click();
  expect(saves.get(DATE)?.moves).toBe(0);
});

test('a disabled control reflects the game', () => {
  mount();
  const clear = root.querySelector<HTMLButtonElement>('[data-action="clear"]')!;
  expect(clear.disabled).toBe(true);
  click('move');
  expect(clear.disabled).toBe(false);
});

test('winning the daily stops play and offers practice', async () => {
  mount();
  click('win');
  await vi.advanceTimersByTimeAsync(0);
  expect(text('.end-card__title')).toBe('Solved');
  expect([...root.querySelectorAll('.end-card__actions button')].map((b) => b.textContent)).toEqual(['Play practice']);
  expect(root.querySelector('.queens-panel')!.hasAttribute('data-interactive')).toBe(false);
  expect(saves.get(DATE)?.status).toBe('won');
});

test('losing the daily offers another attempt', async () => {
  mount();
  click('lose');
  await vi.advanceTimersByTimeAsync(0);
  expect(text('.end-card__title')).toBe('Out of moves');
  root.querySelector<HTMLButtonElement>('.end-card__actions .btn--primary')!.click();
  expect(root.querySelector('.end-card')).toBeNull();
  expect(text('.queens-attempt')).toBe('Attempt 2');
  expect(saves.get(DATE)).toMatchObject({ status: 'playing', attempt: 2, moves: 0 });
});

test("shows another tab's newer daily instead of saving over it", () => {
  mount();
  saves.set(DATE, { v: 1, date: DATE, elapsedMs: 9000, moves: 5, rev: 5, status: 'playing', attempt: 1 });
  click('move');
  expect(saves.get(DATE)?.moves).toBe(5);
  expect(text('.queens-moves')).toBe('5');
});

test('leaving the page saves the daily clock', () => {
  mount();
  click('move');
  nowMs += 42_000;
  window.dispatchEvent(new Event('pagehide'));
  expect(saves.get(DATE)?.elapsedMs).toBe(42_000);
});

test('the daily rolls over at UTC midnight', () => {
  mount();
  nowMs = Date.parse('2026-10-27T00:00:01Z');
  vi.advanceTimersByTime(1000);
  expect(dailySpec).toHaveBeenLastCalledWith('2026-10-27');
  expect(text('.queens-panel')).toBe('daily:2026-10-27:0');
});

test('practice shows the preset switch and New board', () => {
  storedPreset = 'large';
  mount('#/practice?seed=7');
  expect(text('.queens-panel')).toBe('large:7:0');
  expect(root.querySelector('[data-preset="large"]')?.getAttribute('aria-pressed')).toBe('true');
  root.querySelector<HTMLButtonElement>('[data-preset="small"]')!.click();
  expect(storedPreset).toBe('small');
  expect(text('.queens-panel')).toMatch(/^small:\d+:0$/);
  expect(root.querySelector('[data-action="new"]')).not.toBeNull();
  expect(root.querySelector('[data-action="peek"]')).not.toBeNull();
});

test('opens the how-to on the first visit only', () => {
  localStorage.removeItem('flow:flag:queens-howto-seen');
  mount();
  expect(howto).toHaveBeenCalledTimes(1);
  unmount!();
  root.textContent = '';
  mount();
  expect(howto).toHaveBeenCalledTimes(1);
});
