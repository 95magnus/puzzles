import { dailyStore, presetStore } from '../core/storage';
import type { PresetId, Status } from './types';

/** `cells` is one char per cell: h(idden) / r(evealed) / f(lagged). The board itself is regenerated from the date. */
export type MinesDailySave = {
  v: 1;
  date: string;
  cells: string;
  elapsedMs: number;
  status: Status;
  /** 1-based; saves from before retries existed read as 1. */
  attempt: number;
};

const STATUSES: readonly string[] = ['playing', 'won', 'lost'];

/** Shape check only; whether the cells fit today's board is `restoreGame`'s job. */
export const { load: loadMinesDaily, save: saveMinesDaily } = dailyStore<MinesDailySave>('mines:daily', (o) => {
  if (typeof o.cells !== 'string' || !/^[hrf]*$/.test(o.cells)) return null;
  if (typeof o.elapsedMs !== 'number' || !(o.elapsedMs >= 0)) return null;
  if (!STATUSES.includes(o.status)) return null;
  const attempt = o.attempt ?? 1;
  if (!Number.isInteger(attempt) || attempt < 1) return null;
  return { v: 1, date: o.date, cells: o.cells, elapsedMs: o.elapsedMs, status: o.status, attempt };
});

export const { get: getMinesPreset, set: setMinesPreset } = presetStore<PresetId>('mines:preset', ['classic', 'expert', 'huge']);
