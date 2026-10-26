import { mountPuzzleApp, parsePresetRoute, type PresetRoute, type PuzzleGame } from '../../ui/puzzleApp';
import { CLEAR_CONFIRM } from '../../ui/confirm';
import { getQueensPreset, loadQueensDaily, saveQueensDaily, setQueensPreset, type QueensDailySave } from './storage';
import { createQueensBoard } from './board';
import { clear, cycle, encode, newGame, paint, queenCount, restore, undo } from './game';
import { DAILY_PRESET, PRESETS, generatePuzzle, queensDailySeed } from './generate';
import { openQueensHowto } from './howto';
import type { GameState, PresetId, Puzzle } from './types';

export type QueensRoute = PresetRoute<PresetId>;

const queens: PuzzleGame<PresetId, Puzzle, GameState, QueensDailySave> = {
  id: 'queens',
  title: 'Queens',
  howtoFlag: 'queens-howto-seen',
  howto: openQueensHowto,

  presets: PRESETS,
  dailyPreset: DAILY_PRESET,
  defaultPreset: 'medium',
  dailySpec: (date) => generatePuzzle(PRESETS[DAILY_PRESET].size, queensDailySeed(date)),
  practiceSpec: (preset, seed) => generatePuzzle(PRESETS[preset].size, seed),
  dailyDetail: (p) => `${p.size}×${p.size}`,
  newGame,

  daily: { load: loadQueensDaily, save: saveQueensDaily },
  preset: { get: getQueensPreset, set: setQueensPreset },
  toSave: (g, { date, elapsedMs }) => ({ date, cells: encode(g), elapsedMs, solved: g.status === 'won' }),
  fromSave: (puzzle, s) => {
    const game = restore(puzzle, s.cells);
    return game ? { game, attempt: 1 } : null;
  },
  supersedes: (saved, g) => saved.solved && g.status !== 'won',
  ownsSave: (saved, g) => saved.cells === encode(g),

  mountBoard(host, ctx) {
    const board = createQueensBoard(host, {
      onAction: async (a) => {
        const g = ctx.game();
        if (!g) return;
        await changed(g, a.kind === 'tap' ? cycle(g, a.cell) : paint(g, a.cells, a.to, a.gesture));
      },
    });
    async function changed(g: GameState, cells: number[]): Promise<void> {
      if (cells.length === 0) return;
      board.update(cells);
      await ctx.changed(g, g.status === 'won' ? () => board.celebrate() : undefined);
    }
    return {
      setGame: (g) => board.setGame(g),
      setInteractive: (on) => board.setInteractive(on),
      destroy: () => board.destroy(),
      controls: [
        { action: 'undo', label: 'Undo', run: (g) => void changed(g, undo(g)), disabled: (g) => g.history.length === 0 || g.status === 'won' },
        { action: 'clear', label: 'Clear', confirm: CLEAR_CONFIRM, run: (g) => void changed(g, clear(g)), disabled: (g) => g.cells.every((c) => c === 0) || g.status === 'won' },
      ],
    };
  },
  stats: [{ cls: 'queens-count hud-value num', label: 'Queens placed', render: (g, el) => { el.textContent = `${queenCount(g)}/${g.puzzle.size} ♛`; } }],
  card: { title: () => 'Crowned ♛' },
};

export function parseQueensRoute(hash: string): QueensRoute {
  return parsePresetRoute(hash, queens);
}

export function mountQueens(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  return mountPuzzleApp(root, queens, deps);
}
