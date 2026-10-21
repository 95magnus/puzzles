import { loadDaily, loadMinesDaily, loadTangleDaily } from '../core/storage';
import { formatClock } from '../ui/hud';
import { flowPreview, minesPreview, tanglePreview } from './previews';

/** Today's daily for one puzzle, as read from that puzzle's own save. */
export type DailyStatus =
  | { kind: 'new' }
  | { kind: 'playing'; elapsedMs: number; attempt?: number }
  | { kind: 'done'; elapsedMs: number; attempt?: number }
  | { kind: 'lost'; elapsedMs: number; attempt: number };

export type PuzzleEntry = {
  id: 'flow' | 'mines' | 'tangle';
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

/** Every puzzle on the site, in dashboard order. Adding a puzzle = adding an entry. */
export const PUZZLES: readonly PuzzleEntry[] = [
  {
    id: 'flow',
    name: 'Flow',
    tagline: 'Connect matching dots. Fill every cell.',
    href: './flow.html',
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
    href: './minesweeper.html',
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
    href: './tangle.html',
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
];

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
