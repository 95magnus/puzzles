import { mountPuzzleApp, parsePresetRoute, type PresetRoute, type PuzzleGame } from '../../ui/puzzleApp';
import { RESTART_CONFIRM } from '../../ui/confirm';
import { getTanglePreset, loadTangleDaily, saveTangleDaily, setTanglePreset, type TangleDailySave } from './storage';
import { createTangleBoard } from './board';
import { MAX_LIVES, encode, newGame, restore, tap } from './game';
import { DAILY_PRESET, PRESETS, generateLevel, tangleDailySeed } from './generate';
import { openTangleHowto } from './howto';
import type { GameState, Level, PresetId } from './types';

export type TangleRoute = PresetRoute<PresetId>;

function renderLives(lives: HTMLElement, n: number): void {
  lives.textContent = '';
  for (let k = 0; k < MAX_LIVES; k++) {
    const lost = k >= n;
    const h = document.createElement('span');
    h.className = lost ? 'tangle-life is-lost' : 'tangle-life';
    h.textContent = lost ? '♡' : '♥';
    h.setAttribute('aria-hidden', 'true');
    lives.appendChild(h);
  }
  lives.title = `${n} of ${MAX_LIVES} lives left`;
  lives.setAttribute('aria-label', `${n} of ${MAX_LIVES} lives left`);
}

const tangle: PuzzleGame<PresetId, Level, GameState, TangleDailySave> = {
  id: 'tangle',
  title: 'Tangle',
  howtoFlag: 'tangle-howto-seen',
  bestOnComputer: true,
  howto: openTangleHowto,

  presets: PRESETS,
  dailyPreset: DAILY_PRESET,
  defaultPreset: 'hard',
  dailySpec: (date) => generateLevel(PRESETS[DAILY_PRESET], tangleDailySeed(date)),
  practiceSpec: (preset, seed) => generateLevel(PRESETS[preset], seed),
  dailyDetail: (level) => `${PRESETS[DAILY_PRESET].cols}×${PRESETS[DAILY_PRESET].rows} · ${level.arrows.length} arrows`,
  newGame,

  daily: { load: loadTangleDaily, save: saveTangleDaily },
  preset: { get: getTanglePreset, set: setTanglePreset },
  toSave: (g, { date, elapsedMs, attempt }) => ({ date, removed: encode(g), lives: g.lives, elapsedMs, status: g.status, attempt }),
  fromSave: (level, s) => {
    const game = restore(level, s.removed, s.lives);
    return game ? { game, attempt: s.attempt } : null;
  },
  // Another tab moved today's daily on (finished it, or started a later attempt).
  supersedes: (saved, g, attempt) =>
    saved.attempt > attempt || (saved.attempt === attempt && saved.status !== 'playing' && g.status === 'playing') ||
    (saved.attempt === attempt && saved.status === 'won'),

  mountBoard(host, ctx) {
    const board = createTangleBoard(host, {
      onTap: async (cell) => {
        const g = ctx.game();
        if (!g) return;
        const result = tap(g, cell);
        if (result.kind === 'ignored') return;
        // Other arrows stay tappable while this one animates; the board ignores taps on moving arrows.
        await ctx.changed(g, () => board.play(result));
      },
    });
    return {
      setGame: (g) => board.setGame(g),
      setInteractive: (on) => board.setInteractive(on),
      destroy: () => board.destroy(),
      controls: [{ action: 'restart', label: 'Restart', confirm: RESTART_CONFIRM, practiceOnly: true, run: (_g, c) => c.replace(newGame(c.spec())) }],
    };
  },
  stats: [
    { cls: 'tangle-lives', label: 'Lives', role: 'img', render: (g, el) => renderLives(el, g.lives) },
    { cls: 'tangle-left hud-value num', label: 'Arrows left', render: (g, el) => { el.textContent = String(g.left); } },
  ],
  card: {
    title: (g) => (g.status === 'won' ? 'Untangled ✦' : 'Out of lives'),
    stat: (g, clock, { daily, attempt }) => {
      if (g.status === 'won') return clock + (daily ? (attempt > 1 ? ` · attempt ${attempt}` : ' · first try') : '');
      const total = g.level.arrows.length;
      const pct = total ? Math.round(((total - g.left) / total) * 100) : 0;
      return `${pct}% cleared · ${clock}`;
    },
    dimOnWin: true,
  },
  attempts: true,
};

export function parseTangleRoute(hash: string): TangleRoute {
  return parsePresetRoute(hash, tangle);
}

export function mountTangle(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  return mountPuzzleApp(root, tangle, deps);
}
