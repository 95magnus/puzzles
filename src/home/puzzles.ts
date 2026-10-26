import { loadDaily } from '../flow/storage';
import { loadMinesDaily } from '../mines/storage';
import { loadPatchesDaily } from '../patches/storage';
import { loadQueensDaily } from '../queens/storage';
import { loadTangleDaily } from '../tangle/storage';
import { loadBalancedDaily } from '../balanced/storage';
import { loadBridgesDaily } from '../bridges/storage';
import { PAGES, type GameId } from '../pages';
import { formatClock } from '../ui/hud';
import { flowPreview, minesPreview, patchesPreview, queensPreview, tanglePreview, balancedPreview, bridgesPreview } from './previews';

/** Today's daily for one puzzle, as read from that puzzle's own save. */
export type DailyStatus =
  | { kind: 'new' }
  | { kind: 'playing'; elapsedMs: number; attempt?: number }
  | { kind: 'done'; elapsedMs: number; attempt?: number }
  | { kind: 'lost'; elapsedMs: number; attempt: number };

export type PuzzleEntry = {
  id: GameId;
  name: string;
  tagline: string;
  href: string;
  /** Word for a finished daily: "Solved" / "Cleared". */
  doneWord: 'Solved' | 'Cleared';
  /** Word for a lost daily; defaults to "Boom". */
  lostWord?: string;
  preview: () => SVGSVGElement;
  dailyStatus: (date: string) => DailyStatus;
};

/** Every puzzle on the site, in dashboard order. Adding a puzzle = a page in src/pages.ts plus an entry here. */
export const PUZZLES: readonly PuzzleEntry[] = ([
  {
    id: 'flow',
    name: 'Flow',
    tagline: 'Connect matching dots. Fill every cell.',
    doneWord: 'Solved',
    preview: flowPreview,
    dailyStatus(date) {
      const save = loadDaily(date);
      if (!save) return { kind: 'new' };
      return { kind: save.solved ? 'done' : 'playing', elapsedMs: save.elapsedMs };
    },
  },
  {
    id: 'mines',
    name: 'Mines',
    tagline: 'Clear the board without hitting a mine.',
    doneWord: 'Cleared',
    preview: minesPreview,
    dailyStatus(date) {
      const save = loadMinesDaily(date);
      if (!save) return { kind: 'new' };
      const { elapsedMs, attempt } = save;
      if (save.status === 'won') return { kind: 'done', elapsedMs, attempt };
      if (save.status === 'lost') return { kind: 'lost', elapsedMs, attempt };
      return { kind: 'playing', elapsedMs, attempt };
    },
  },
  {
    id: 'tangle',
    name: 'Tangle',
    tagline: "Tap arrows out of the knot. Don't crash.",
    doneWord: 'Cleared',
    lostWord: 'Out of lives',
    preview: tanglePreview,
    dailyStatus(date) {
      const save = loadTangleDaily(date);
      if (!save) return { kind: 'new' };
      const { elapsedMs, attempt } = save;
      if (save.status === 'won') return { kind: 'done', elapsedMs, attempt };
      if (save.status === 'lost') return { kind: 'lost', elapsedMs, attempt };
      return { kind: 'playing', elapsedMs, attempt };
    },
  },
  {
    id: 'queens',
    name: 'Queens',
    tagline: 'One queen per row, column and colour.',
    doneWord: 'Solved',
    preview: queensPreview,
    dailyStatus(date) {
      const save = loadQueensDaily(date);
      if (!save) return { kind: 'new' };
      return { kind: save.solved ? 'done' : 'playing', elapsedMs: save.elapsedMs };
    },
  },
  {
    id: 'patches',
    name: 'Patches',
    tagline: 'Cut the grid into patches. One clue each.',
    doneWord: 'Solved',
    preview: patchesPreview,
    dailyStatus(date) {
      const save = loadPatchesDaily(date);
      if (!save) return { kind: 'new' };
      return { kind: save.solved ? 'done' : 'playing', elapsedMs: save.elapsedMs };
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    tagline: 'Fill the grid with dots and rings.',
    doneWord: 'Solved',
    preview: balancedPreview,
    dailyStatus(date) {
      const save = loadBalancedDaily(date);
      if (!save) return { kind: 'new' };
      return { kind: save.solved ? 'done' : 'playing', elapsedMs: save.elapsedMs };
    },
  },
  {
    id: 'bridges',
    name: 'Bridges',
    tagline: 'Connect every island. Match every number.',
    doneWord: 'Solved',
    preview: bridgesPreview,
    dailyStatus(date) {
      const save = loadBridgesDaily(date);
      if (!save) return { kind: 'new' };
      return { kind: save.solved ? 'done' : 'playing', elapsedMs: save.elapsedMs };
    },
  },
] satisfies Omit<PuzzleEntry, 'href'>[]).map((e) => ({ ...e, href: `./${PAGES[e.id]}` }));

export function statusLabel(entry: PuzzleEntry, s: DailyStatus): string {
  const tries = 'attempt' in s && s.attempt !== undefined && s.attempt > 1 ? ` · attempt ${s.attempt}` : '';
  switch (s.kind) {
    case 'new':
      return 'Not started';
    case 'playing':
      return `In progress · ${formatClock(s.elapsedMs)}${tries}`;
    case 'done':
      return `${entry.doneWord} · ${formatClock(s.elapsedMs)}${tries}`;
    case 'lost':
      return `${entry.lostWord ?? 'Boom'} · attempt ${s.attempt}`;
  }
}
