import { mountPuzzleApp, parsePresetRoute, type PresetRoute, type PuzzleGame } from '../ui/puzzleApp';
import { CLEAR_CONFIRM } from '../ui/confirm';
import { getBridgesPreset, loadBridgesDaily, saveBridgesDaily, setBridgesPreset, type BridgesDailySave } from './storage';
import { createBridgesBoard } from './board';
import { clear, cycle, encode, newGame, remove, restore, satisfied, undo } from './game';
import { DAILY_PRESET, PRESETS, bridgesDailySeed, generatePuzzle } from './generate';
import { openBridgesHowto } from './howto';
import type { GameState, PresetId, Puzzle } from './types';

export type BridgesRoute = PresetRoute<PresetId>;

const bridges: PuzzleGame<PresetId, Puzzle, GameState, BridgesDailySave> = {
  id: 'bridges',
  title: 'Bridges',
  howtoFlag: 'bridges-howto-seen',
  howto: openBridgesHowto,

  presets: PRESETS,
  dailyPreset: DAILY_PRESET,
  defaultPreset: 'medium',
  dailySpec: (date) => generatePuzzle(PRESETS[DAILY_PRESET].size, bridgesDailySeed(date)),
  practiceSpec: (preset, seed) => generatePuzzle(PRESETS[preset].size, seed),
  dailyDetail: (p) => `${p.size}×${p.size}`,
  newGame,

  daily: { load: loadBridgesDaily, save: saveBridgesDaily },
  preset: { get: getBridgesPreset, set: setBridgesPreset },
  toSave: (g, { date, elapsedMs }) => ({ date, links: encode(g), elapsedMs, solved: g.status === 'won' }),
  fromSave: (puzzle, s) => {
    const game = restore(puzzle, s.links);
    return game ? { game, attempt: 1 } : null;
  },
  // Honour a solved save only if it really restores to a won board; a bad one is overwritten like any other.
  supersedes: (saved, g) => saved.solved && g.status !== 'won' && restore(g.puzzle, saved.links)?.status === 'won',
  ownsSave: (saved, g) => saved.links === encode(g),

  mountBoard(host, ctx) {
    const board = createBridgesBoard(host, {
      onCycle: async (link) => {
        const g = ctx.game();
        if (!g) return;
        const r = cycle(g, link);
        if (r.blockedBy.length > 0) board.flashBlocked(r.blockedBy);
        await changed(g, r.changed);
      },
      onRemove: async (link) => {
        const g = ctx.game();
        if (!g) return;
        await changed(g, remove(g, link));
      },
    });
    async function changed(g: GameState, didChange: boolean): Promise<void> {
      if (!didChange) return;
      board.render(); // also replays the split pulse when the network newly splits
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
          disabled: (g) => !g.bridges.some((v) => v !== 0) || g.status === 'won',
        },
      ],
    };
  },
  stats: [{ cls: 'bridges-done hud-value num', label: 'Islands done', render: (g, el) => { el.textContent = `${satisfied(g)}/${g.puzzle.islands.length}`; } }],
  card: { title: () => 'All connected' },
};

export function parseBridgesRoute(hash: string): BridgesRoute {
  return parsePresetRoute(hash, bridges);
}

export function mountBridges(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  return mountPuzzleApp(root, bridges, deps);
}
