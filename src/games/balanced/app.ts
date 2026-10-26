import { mountPuzzleApp, parsePresetRoute, type PresetRoute, type PuzzleGame } from '../../ui/puzzleApp';
import { CLEAR_CONFIRM } from '../../ui/confirm';
import { getBalancedPreset, loadBalancedDaily, saveBalancedDaily, setBalancedPreset, type BalancedDailySave } from './storage';
import { createBalancedBoard } from './board';
import { clear, cycle, encode, filled, isGiven, newGame, restore, toggle, undo } from './game';
import { DAILY_PRESET, PRESETS, generatePuzzle, balancedDailySeed } from './generate';
import { openBalancedHowto } from './howto';
import type { GameState, PresetId, Puzzle } from './types';

export type BalancedRoute = PresetRoute<PresetId>;

const balanced: PuzzleGame<PresetId, Puzzle, GameState, BalancedDailySave> = {
  id: 'balanced',
  title: 'Balanced',
  howtoFlag: 'balanced-howto-seen',
  howto: openBalancedHowto,

  presets: PRESETS,
  dailyPreset: DAILY_PRESET,
  defaultPreset: 'medium',
  dailySpec: (date) => generatePuzzle(PRESETS[DAILY_PRESET].size, balancedDailySeed(date)),
  practiceSpec: (preset, seed) => generatePuzzle(PRESETS[preset].size, seed),
  dailyDetail: (p) => `${p.size}×${p.size}`,
  newGame,

  daily: { load: loadBalancedDaily, save: saveBalancedDaily },
  preset: { get: getBalancedPreset, set: setBalancedPreset },
  toSave: (g, { date, elapsedMs }) => ({ date, cells: encode(g), elapsedMs, solved: g.status === 'won' }),
  fromSave: (puzzle, s) => {
    const game = restore(puzzle, s.cells);
    return game ? { game, attempt: 1 } : null;
  },
  // Honour a solved save only if it really restores to a won board; a bad one is overwritten like any other.
  supersedes: (saved, g) => saved.solved && g.status !== 'won' && restore(g.puzzle, saved.cells)?.status === 'won',
  ownsSave: (saved, g) => saved.cells === encode(g),

  mountBoard(host, ctx) {
    const board = createBalancedBoard(host, {
      onTap: async (cell) => {
        const g = ctx.game();
        if (!g) return;
        await changed(g, cycle(g, cell));
      },
      onRing: async (cell) => {
        const g = ctx.game();
        if (!g) return;
        await changed(g, toggle(g, cell, 2));
      },
    });
    async function changed(g: GameState, didChange: boolean): Promise<void> {
      if (!didChange) return;
      board.render();
      await ctx.changed(g, g.status === 'won' ? () => board.celebrate() : undefined);
    }
    return {
      setGame: (g) => board.setGame(g),
      setInteractive: (on) => board.setInteractive(on),
      destroy: () => board.destroy(),
      controls: [
        { action: 'undo', label: 'Undo', run: (g) => void changed(g, undo(g)), disabled: (g) => g.history.length === 0 || g.status === 'won' },
        {
          action: 'clear',
          label: 'Clear', confirm: CLEAR_CONFIRM,
          run: (g) => void changed(g, clear(g)),
          disabled: (g) => !g.cells.some((v, i) => v !== 0 && !isGiven(g, i)) || g.status === 'won',
        },
      ],
    };
  },
  stats: [{ cls: 'balanced-filled hud-value num', label: 'Cells filled', render: (g, el) => { el.textContent = `${filled(g)}/${g.puzzle.size * g.puzzle.size}`; } }],
  card: { title: () => 'Balanced ●○' },
};

export function parseBalancedRoute(hash: string): BalancedRoute {
  return parsePresetRoute(hash, balanced);
}

export function mountBalanced(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  return mountPuzzleApp(root, balanced, deps);
}
