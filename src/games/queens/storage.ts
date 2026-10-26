import { dailyStore, presetStore } from '../../core/storage';
import type { PresetId } from './types';

/** `cells` is one char per cell: 0 empty, 1 cross, 2 queen. The puzzle itself is regenerated from the date. */
export type QueensDailySave = { v: 1; date: string; cells: string; elapsedMs: number; solved: boolean };

/** Shape check only; whether `cells` fits today's puzzle is `restore`'s job. */
export const { load: loadQueensDaily, save: saveQueensDaily } = dailyStore<QueensDailySave>('queens:daily', (o) => {
  if (typeof o.cells !== 'string' || !/^[012]*$/.test(o.cells)) return null;
  if (typeof o.elapsedMs !== 'number' || !(o.elapsedMs >= 0)) return null;
  if (typeof o.solved !== 'boolean') return null;
  return { v: 1, date: o.date, cells: o.cells, elapsedMs: o.elapsedMs, solved: o.solved };
});

export const { get: getQueensPreset, set: setQueensPreset } = presetStore<PresetId>('queens:preset', ['small', 'medium', 'large']);
