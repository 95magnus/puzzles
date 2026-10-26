import { mountPuzzleApp, parsePresetRoute, type PresetRoute, type PuzzleGame } from '../ui/puzzleApp';
import { getPatchesPreset, loadPatchesDaily, savePatchesDaily, setPatchesPreset, type PatchesDailySave } from './storage';
import { createPatchesBoard } from './board';
import { clear, coverage, encode, newGame, place, restore, tap, undo } from './game';
import { DAILY_PRESET, PRESETS, generatePuzzle, patchesDailySeed } from './generate';
import { openPatchesHowto } from './howto';
import type { GameState, PresetId, Puzzle } from './types';

export type PatchesRoute = PresetRoute<PresetId>;

const patches: PuzzleGame<PresetId, Puzzle, GameState, PatchesDailySave> = {
  id: 'patches',
  title: 'Patches',
  howtoFlag: 'patches-howto-seen',
  howto: openPatchesHowto,

  presets: PRESETS,
  dailyPreset: DAILY_PRESET,
  defaultPreset: 'medium',
  dailySpec: (date) => generatePuzzle(PRESETS[DAILY_PRESET].size, patchesDailySeed(date)),
  practiceSpec: (preset, seed) => generatePuzzle(PRESETS[preset].size, seed),
  dailyDetail: (p) => `${p.size}×${p.size}`,
  newGame,

  daily: { load: loadPatchesDaily, save: savePatchesDaily },
  preset: { get: getPatchesPreset, set: setPatchesPreset },
  toSave: (g, { date, elapsedMs }) => ({ date, rects: encode(g), elapsedMs, solved: g.status === 'won' }),
  fromSave: (puzzle, s) => {
    const game = restore(puzzle, s.rects);
    return game ? { game, attempt: 1 } : null;
  },
  // Honour a solved save only if it really restores to a won board; a bad one is overwritten like any other.
  supersedes: (saved, g) => saved.solved && g.status !== 'won' && restore(g.puzzle, saved.rects)?.status === 'won',
  ownsSave: (saved, g) => saved.rects === encode(g),

  mountBoard(host, ctx) {
    const board = createPatchesBoard(host, {
      onAction: async (a) => {
        const g = ctx.game();
        if (!g) return;
        await changed(g, a.kind === 'tap' ? tap(g, a.cell) : place(g, a.rect));
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
        { action: 'clear', label: 'Clear', run: (g) => void changed(g, clear(g)), disabled: (g) => g.rects.length === 0 || g.status === 'won' },
      ],
    };
  },
  stats: [{ cls: 'patches-cover hud-value num', label: 'Cells covered', render: (g, el) => { el.textContent = `${coverage(g)}/${g.puzzle.size * g.puzzle.size}`; } }],
  card: { title: () => 'Patched up' },
};

export function parsePatchesRoute(hash: string): PatchesRoute {
  return parsePresetRoute(hash, patches);
}

export function mountPatches(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  return mountPuzzleApp(root, patches, deps);
}
