import { dailyStore, presetStore } from '../../core/storage';
import type { PresetId, Status } from './types';

/** `removed` is one char per arrow: 1 (still on the board, alive) / 0 (removed). The level itself is regenerated from the date. */
export type TangleDailySave = {
  v: 1;
  date: string;
  removed: string;
  lives: number;
  elapsedMs: number;
  status: Status;
  /** 1-based. */
  attempt: number;
};

const STATUSES: readonly string[] = ['playing', 'won', 'lost'];

/** Shape check only; whether `removed` fits today's level is `restore`'s job. */
export const { load: loadTangleDaily, save: saveTangleDaily } = dailyStore<TangleDailySave>('tangle:daily', (o) => {
  if (typeof o.removed !== 'string' || !/^[01]*$/.test(o.removed)) return null;
  if (!Number.isInteger(o.lives) || o.lives < 0 || o.lives > 3) return null;
  if (typeof o.elapsedMs !== 'number' || !(o.elapsedMs >= 0)) return null;
  if (!STATUSES.includes(o.status)) return null;
  if (!Number.isInteger(o.attempt) || o.attempt < 1) return null;
  return { v: 1, date: o.date, removed: o.removed, lives: o.lives, elapsedMs: o.elapsedMs, status: o.status, attempt: o.attempt };
});

export const { get: getTanglePreset, set: setTanglePreset } = presetStore<PresetId>('tangle:preset', ['medium', 'hard', 'huge']);
