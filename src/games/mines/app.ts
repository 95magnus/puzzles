import { mulberry32 } from '../../core/rng';
import { RESTART_CONFIRM } from '../../ui/confirm';
import { mountPuzzleApp, parsePresetRoute, type BoardCtx, type PresetRoute, type PuzzleGame } from '../../ui/puzzleApp';
import { getMinesPreset, loadMinesDaily, saveMinesDaily, setMinesPreset, type MinesDailySave } from './storage';
import { createMinesBoard } from './board';
import { chord, encodeCells, newGame, restoreGame, reveal, toggleFlag } from './game';
import { DAILY_PRESET, PRESETS, generateBoard, minesDailySeed } from './generate';
import { openMinesHowto } from './howto';
import type { Board, BoardSpec, GameState, PresetId } from './types';

export type MinesRoute = PresetRoute<PresetId>;

/** A practice board is generated on its first reveal, around that cell; until then `board` is null. */
type Spec = { spec: BoardSpec; seed: number; board: Board | null };

function safeCount(board: Board): number {
  return board.mines.length - board.mines.reduce((s, m) => s + m, 0);
}

/** All tiles hidden, nothing generated yet; flags still work. */
function blankGame(spec: BoardSpec): GameState {
  const n = spec.cols * spec.rows;
  const empty: Board = { cols: spec.cols, rows: spec.rows, mines: new Uint8Array(n), adj: new Uint8Array(n), start: -1 };
  return { board: empty, cells: new Uint8Array(n), status: 'playing', revealed: 0, flags: 0, explodedAt: -1 };
}

/** First reveal on a blank practice board: build the board around that cell, keeping earlier flags. */
function generateAround(ctx: BoardCtx<GameState, Spec>, blank: GameState, cell: number): void {
  const s = ctx.spec();
  s.board = generateBoard(s.spec, mulberry32(s.seed), cell);
  const g = newGame(s.board);
  blank.cells.forEach((v, i) => {
    if (v === 2 && g.cells[i] === 0) toggleFlag(g, i);
  });
  ctx.replace(g);
  void ctx.changed(g);
}

const mines: PuzzleGame<PresetId, Spec, GameState, MinesDailySave> = {
  id: 'mines',
  title: 'Mines',
  howtoFlag: 'mines-howto-seen',
  bestOnComputer: true,
  howto: openMinesHowto,

  presets: PRESETS,
  dailyPreset: DAILY_PRESET,
  defaultPreset: 'expert',
  dailySpec: (date) => {
    const spec = PRESETS[DAILY_PRESET];
    const seed = minesDailySeed(date);
    return { spec, seed, board: generateBoard(spec, mulberry32(seed)) };
  },
  practiceSpec: (preset, seed) => ({ spec: PRESETS[preset], seed, board: null }),
  dailyDetail: ({ spec }) => `${spec.cols}×${spec.rows} · ${spec.mines} mines`,
  newGame: (s) => (s.board ? newGame(s.board) : blankGame(s.spec)),

  daily: { load: loadMinesDaily, save: saveMinesDaily },
  preset: { get: getMinesPreset, set: setMinesPreset },
  toSave: (g, { date, elapsedMs, attempt }) => ({ date, cells: encodeCells(g), elapsedMs, status: g.status, attempt }),
  fromSave: (s, save) => {
    const game = restoreGame(s.board!, save.cells, save.status);
    return game ? { game, attempt: save.attempt } : null;
  },
  // Another tab moved today's daily on (finished it, or started a later attempt).
  supersedes: (saved, g, attempt) =>
    saved.attempt > attempt || (saved.attempt === attempt && saved.status !== 'playing' && g.status === 'playing'),

  mountBoard(host, ctx) {
    const board = createMinesBoard(host, {
      onAction: (a) => {
        const g = ctx.game();
        if (!g) return;
        const kind = a.kind === 'tap' ? (g.cells[a.cell] === 1 ? 'chord' : 'reveal') : a.kind;
        if (!ctx.spec().board && kind !== 'flag') {
          if (kind === 'reveal') generateAround(ctx, g, a.cell);
          return;
        }
        const fn = kind === 'flag' ? toggleFlag : kind === 'chord' ? chord : reveal;
        const changed = fn(g, a.cell);
        if (changed.length === 0) return;
        board.update(changed, kind === 'flag' ? undefined : a.cell);
        void ctx.changed(g);
      },
    });
    return {
      setGame: (g) => board.setGame(g),
      setInteractive: (on) => board.setInteractive(on),
      destroy: () => board.destroy(),
      controls: [
        {
          // Restart replays the generated board from its opening; before the first click there is nothing to replay.
          action: 'restart',
          label: 'Restart', confirm: RESTART_CONFIRM,
          practiceOnly: true,
          run: (_g, c) => {
            const b = c.spec().board;
            if (b) c.replace(newGame(b));
          },
          disabled: (g) => g.board.start === -1,
        },
      ],
    };
  },
  stats: [{ cls: 'mines-left hud-value num', label: 'Mines left', render: (g, el, s) => { el.textContent = String(s.spec.mines - g.flags); } }],
  card: {
    title: (g) => (g.status === 'won' ? 'Cleared ✦' : 'Boom.'),
    stat: (g, clock, { daily, attempt }) => {
      if (g.status === 'won') return clock + (daily ? (attempt > 1 ? ` · attempt ${attempt}` : ' · first try') : '');
      return `${Math.round((g.revealed / safeCount(g.board)) * 100)}% cleared · ${clock}`;
    },
    dimOnWin: true,
  },
  attempts: true,
  // A blank practice board is not a game yet: it begins when the first reveal builds it.
  startsPaused: (g) => g.board.start === -1,
};

export function parseMinesRoute(hash: string): MinesRoute {
  return parsePresetRoute(hash, mines);
}

export function mountMines(root: HTMLElement, deps: { now?: () => Date } = {}): () => void {
  return mountPuzzleApp(root, mines, deps);
}
