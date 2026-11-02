import { mountPuzzleApp, parsePresetRoute, type PresetRoute, type PuzzleGame } from '../../ui/puzzleApp';
import { renderLives } from '../../ui/hud';
import { getSumsPreset, loadSumsDaily, saveSumsDaily, setSumsPreset, type SumsDailySave } from './storage';
import { createSumsBoard } from './board';
import { MAX_LIVES, encode, newGame, restore, strike, toggleMark } from './game';
import { DAILY_PRESET, PRESETS, generatePuzzle, sumsDailySeed } from './generate';
import { openSumsHowto } from './howto';
import type { GameState, PresetId, Puzzle } from './types';

export type SumsRoute = PresetRoute<PresetId>;

const sums: PuzzleGame<PresetId, Puzzle, GameState, SumsDailySave> = {
  id: 'sums',
  title: 'Sums',
  howtoFlag: 'sums-howto-seen',
  howto: openSumsHowto,

  presets: PRESETS,
  dailyPreset: DAILY_PRESET,
  defaultPreset: 'medium',
  dailySpec: (date) => generatePuzzle(PRESETS[DAILY_PRESET].size, sumsDailySeed(date)),
  practiceSpec: (preset, seed) => generatePuzzle(PRESETS[preset].size, seed),
  dailyDetail: (p) => `${p.size}×${p.size}`,
  newGame,

  daily: { load: loadSumsDaily, save: saveSumsDaily },
  preset: { get: getSumsPreset, set: setSumsPreset },
  toSave: (g, { date, elapsedMs, attempt }) => ({ date, cells: encode(g), lives: g.lives, elapsedMs, status: g.status, attempt }),
  fromSave: (puzzle, s) => {
    const game = restore(puzzle, s.cells, s.lives);
    return game ? { game, attempt: s.attempt } : null;
  },
  // Another tab moved today's daily on (finished it, or started a later attempt).
  supersedes: (saved, g, attempt) =>
    saved.attempt > attempt || (saved.attempt === attempt && saved.status !== 'playing' && g.status === 'playing') ||
    (saved.attempt === attempt && saved.status === 'won'),

  mountBoard(host, ctx) {
    const board = createSumsBoard(host, {
      onStrike: (cell) => {
        const g = ctx.game();
        if (!g) return;
        const result = strike(g, cell);
        if (result === 'ignored') return;
        board.render(); // the shell expects the board already redrawn when `changed` runs
        if (result === 'mistake') void ctx.changed(g, () => board.mistake(cell));
        else void ctx.changed(g, g.status === 'won' ? () => board.celebrate() : undefined);
      },
      onMark: (cell) => {
        const g = ctx.game();
        if (!g || !toggleMark(g, cell)) return;
        board.render();
        void ctx.changed(g);
      },
    });
    return {
      setGame: (g) => board.setGame(g),
      setInteractive: (on) => board.setInteractive(on),
      destroy: () => board.destroy(),
    };
  },
  stats: [
    { cls: 'sums-lives hud-lives', label: 'Lives', role: 'img', render: (g, el) => renderLives(el, g.lives, MAX_LIVES) },
    { cls: 'sums-left hud-value num', label: 'To strike', render: (g, el) => { el.textContent = String(g.left); } },
  ],
  card: {
    title: (g) => (g.status === 'won' ? 'All lines add up' : 'Out of lives'),
    stat: (g, clock, { daily, attempt }) => {
      if (g.status === 'won') return clock + (daily ? (attempt > 1 ? ` · attempt ${attempt}` : ' · first try') : '');
      const total = g.puzzle.solution.reduce<number>((n, k) => n + (k ? 0 : 1), 0);
      const pct = total ? Math.round(((total - g.left) / total) * 100) : 0;
      return `${pct}% struck · ${clock}`;
    },
    dimOnWin: true,
  },
  attempts: true,
};

export function parseSumsRoute(hash: string): SumsRoute {
  return parsePresetRoute(hash, sums);
}

export function mountSums(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  return mountPuzzleApp(root, sums, deps);
}
