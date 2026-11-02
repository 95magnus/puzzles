import { dailyStore, presetStore } from '../../core/storage';
import type { PresetId, Status } from './types';

/** `cells` is one char per cell: 0 open, 1 struck, 2 marked, 3 locked. The puzzle itself is regenerated from the date. */
export type SumsDailySave = {
  v: 1;
  date: string;
  cells: string;
  lives: number;
  elapsedMs: number;
  status: Status;
  /** 1-based. */
  attempt: number;
};

const STATUSES: readonly string[] = ['playing', 'won', 'lost'];

/** Shape check only; whether `cells` fits today's puzzle is `restore`'s job. */
export const { load: loadSumsDaily, save: saveSumsDaily } = dailyStore<SumsDailySave>('sums:daily', (o) => {
  if (typeof o.cells !== 'string' || !/^[0-3]*$/.test(o.cells)) return null;
  if (!Number.isInteger(o.lives) || o.lives < 0 || o.lives > 3) return null;
  if (typeof o.elapsedMs !== 'number' || !(o.elapsedMs >= 0)) return null;
  if (!STATUSES.includes(o.status)) return null;
  if (!Number.isInteger(o.attempt) || o.attempt < 1) return null;
  return { v: 1, date: o.date, cells: o.cells, lives: o.lives, elapsedMs: o.elapsedMs, status: o.status, attempt: o.attempt };
});

export const { get: getSumsPreset, set: setSumsPreset } = presetStore<PresetId>('sums:preset', ['easy', 'medium', 'hard']);
