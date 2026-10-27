import { mountPuzzleApp, parsePresetRoute, type PresetRoute, type PuzzleGame } from '../../ui/puzzleApp';
import { CLEAR_CONFIRM } from '../../ui/confirm';
import { getLoopPreset, loadLoopDaily, saveLoopDaily, setLoopPreset, type LoopDailySave } from './storage';
import { createLoopBoard } from './board';
import { clear, clueCount, cycle, encode, matched, newGame, paint, restore, toggleCross, undo } from './game';
import { DAILY_PRESET, PRESETS, generatePuzzle, loopDailySeed } from './generate';
import { openLoopHowto } from './howto';
import type { GameState, PresetId, Puzzle } from './types';

export type LoopRoute = PresetRoute<PresetId>;

const loop: PuzzleGame<PresetId, Puzzle, GameState, LoopDailySave> = {
  id: 'loop',
  title: 'Loop',
  howtoFlag: 'loop-howto-seen',
  howto: openLoopHowto,

  presets: PRESETS,
  dailyPreset: DAILY_PRESET,
  defaultPreset: 'medium',
  dailySpec: (date) => generatePuzzle(PRESETS[DAILY_PRESET].size, loopDailySeed(date)),
  practiceSpec: (preset, seed) => generatePuzzle(PRESETS[preset].size, seed),
  dailyDetail: (p) => `${p.size}×${p.size}`,
  newGame,

  daily: { load: loadLoopDaily, save: saveLoopDaily },
  preset: { get: getLoopPreset, set: setLoopPreset },
  toSave: (g, { date, elapsedMs }) => ({ date, edges: encode(g), elapsedMs, solved: g.status === 'won' }),
  fromSave: (puzzle, s) => {
    const game = restore(puzzle, s.edges);
    return game ? { game, attempt: 1 } : null;
  },
  // Honour a solved save only if it really restores to a won board; a bad one is overwritten like any other.
  supersedes: (saved, g) => saved.solved && g.status !== 'won' && restore(g.puzzle, saved.edges)?.status === 'won',
  ownsSave: (saved, g) => saved.edges === encode(g),

  mountBoard(host, ctx) {
    const board = createLoopBoard(host, {
      onCycle: (edge) => {
        const g = ctx.game();
        if (g) void changed(g, cycle(g, edge));
      },
      onCross: (edge) => {
        const g = ctx.game();
        if (g) void changed(g, toggleCross(g, edge));
      },
      onPaint: (edges, mode) => {
        const g = ctx.game();
        if (g) void changed(g, paint(g, edges, mode));
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
          disabled: (g) => g.edges.every((v) => v === 0) || g.status === 'won',
        },
      ],
    };
  },
  stats: [{ cls: 'loop-done hud-value num', label: 'Clues matched', render: (g, el) => { el.textContent = `${matched(g)}/${clueCount(g.puzzle)}`; } }],
  card: { title: () => 'Loop closed' },
};

export function parseLoopRoute(hash: string): LoopRoute {
  return parsePresetRoute(hash, loop);
}

export function mountLoop(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  return mountPuzzleApp(root, loop, deps);
}
